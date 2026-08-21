"""
KIZILKAN PLAYER - Backend
FastAPI backend for M3U playlist parsing, Xtream Codes API integration, and XMLTV EPG.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import logging
import hashlib
import gzip
import io
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import httpx
from lxml import etree

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="KIZILKAN PLAYER API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------------- MODELS ----------------

class Channel(BaseModel):
    id: str
    name: str
    logo: Optional[str] = None
    group: Optional[str] = None
    url: str
    tvg_id: Optional[str] = None
    tvg_name: Optional[str] = None
    epg_channel_id: Optional[str] = None
    stream_type: str = "live"  # live | movie | series
    container_ext: Optional[str] = None


class M3UParseRequest(BaseModel):
    url: str


class M3UFileParseRequest(BaseModel):
    content: str


class XtreamLoginRequest(BaseModel):
    server: str
    username: str
    password: str


class EPGFetchRequest(BaseModel):
    url: str
    playlist_id: str


class EPGProgram(BaseModel):
    channel: str
    start: str
    stop: str
    title: str
    desc: Optional[str] = None


# ---------------- M3U PARSER ----------------

def parse_m3u(content: str) -> List[Dict[str, Any]]:
    """Parse M3U/M3U8 playlist content into structured channels."""
    channels: List[Dict[str, Any]] = []
    lines = content.splitlines()
    current: Optional[Dict[str, Any]] = None

    attr_re = re.compile(r'([a-zA-Z0-9\-_]+)="([^"]*)"')

    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#EXTM3U"):
            continue
        if line.startswith("#EXTINF"):
            attrs = dict(attr_re.findall(line))
            # Name after last comma
            name = line.rsplit(",", 1)[-1].strip() if "," in line else attrs.get("tvg-name", "Bilinmeyen")
            current = {
                "id": str(uuid.uuid4()),
                "name": name or attrs.get("tvg-name", "Bilinmeyen"),
                "logo": attrs.get("tvg-logo"),
                "group": attrs.get("group-title") or "Diğer",
                "tvg_id": attrs.get("tvg-id"),
                "tvg_name": attrs.get("tvg-name"),
                "epg_channel_id": attrs.get("tvg-id"),
                "stream_type": "live",
            }
        elif line.startswith("#"):
            # skip other directives (#EXTVLCOPT etc.)
            continue
        else:
            if current is not None:
                current["url"] = line
                # Deduce container ext
                m = re.search(r'\.(m3u8|ts|mp4|mkv|mpd)(\?.*)?$', line, re.IGNORECASE)
                if m:
                    current["container_ext"] = m.group(1).lower()
                channels.append(current)
                current = None
    return channels


@api_router.post("/m3u/parse-url")
async def parse_m3u_from_url(req: M3UParseRequest):
    try:
        async with httpx.AsyncClient(timeout=45.0, follow_redirects=True) as hc:
            r = await hc.get(req.url)
            r.raise_for_status()
            text = r.text
        channels = parse_m3u(text)
        return {"success": True, "count": len(channels), "channels": channels}
    except httpx.HTTPError as e:
        logger.exception("M3U fetch failed")
        raise HTTPException(status_code=400, detail=f"M3U alınamadı: {str(e)}")
    except Exception as e:
        logger.exception("M3U parse failed")
        raise HTTPException(status_code=500, detail=f"M3U ayrıştırılamadı: {str(e)}")


@api_router.post("/m3u/parse-content")
async def parse_m3u_from_content(req: M3UFileParseRequest):
    try:
        channels = parse_m3u(req.content)
        return {"success": True, "count": len(channels), "channels": channels}
    except Exception as e:
        logger.exception("M3U content parse failed")
        raise HTTPException(status_code=500, detail=f"M3U ayrıştırılamadı: {str(e)}")


# ---------------- XTREAM CODES API ----------------

def _normalize_server(server: str) -> str:
    s = server.strip().rstrip("/")
    if not s.startswith("http://") and not s.startswith("https://"):
        s = "http://" + s
    return s


@api_router.post("/xtream/login")
async def xtream_login(req: XtreamLoginRequest):
    server = _normalize_server(req.server)
    url = f"{server}/player_api.php"
    params = {"username": req.username, "password": req.password}
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as hc:
            r = await hc.get(url, params=params)
            r.raise_for_status()
            data = r.json()
        user_info = data.get("user_info") or {}
        server_info = data.get("server_info") or {}
        auth = user_info.get("auth")
        if auth != 1 and str(auth) != "1":
            raise HTTPException(status_code=401, detail="Kimlik doğrulama başarısız. Kullanıcı adı/şifre yanlış olabilir.")
        return {"success": True, "user_info": user_info, "server_info": server_info}
    except HTTPException:
        raise
    except httpx.HTTPError as e:
        logger.exception("Xtream login failed")
        raise HTTPException(status_code=400, detail=f"Sunucuya bağlanılamadı: {str(e)}")
    except Exception as e:
        logger.exception("Xtream login error")
        raise HTTPException(status_code=500, detail=f"Bilinmeyen hata: {str(e)}")


@api_router.post("/xtream/load")
async def xtream_load_channels(req: XtreamLoginRequest):
    """Load live categories + streams from Xtream API and convert to Channel format."""
    server = _normalize_server(req.server)
    base_params = {"username": req.username, "password": req.password}
    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as hc:
            # Get categories
            cat_url = f"{server}/player_api.php"
            cat_r = await hc.get(cat_url, params={**base_params, "action": "get_live_categories"})
            cat_r.raise_for_status()
            categories = cat_r.json() or []
            cat_map = {str(c.get("category_id")): c.get("category_name", "Diğer") for c in categories}

            # Get streams
            st_r = await hc.get(cat_url, params={**base_params, "action": "get_live_streams"})
            st_r.raise_for_status()
            streams = st_r.json() or []

        channels: List[Dict[str, Any]] = []
        for s in streams:
            stream_id = s.get("stream_id")
            if stream_id is None:
                continue
            ext = s.get("container_extension") or "ts"
            stream_url = f"{server}/live/{req.username}/{req.password}/{stream_id}.{ext}"
            channels.append({
                "id": f"xt-{stream_id}",
                "name": s.get("name") or "Bilinmeyen",
                "logo": s.get("stream_icon"),
                "group": cat_map.get(str(s.get("category_id")), "Diğer"),
                "url": stream_url,
                "tvg_id": s.get("epg_channel_id"),
                "tvg_name": s.get("name"),
                "epg_channel_id": s.get("epg_channel_id"),
                "stream_type": "live",
                "container_ext": ext,
                "stream_id": stream_id,
                "tv_archive": int(s.get("tv_archive") or 0),
                "tv_archive_duration": int(s.get("tv_archive_duration") or 0),
            })
        return {"success": True, "count": len(channels), "channels": channels}
    except httpx.HTTPError as e:
        logger.exception("Xtream load failed")
        raise HTTPException(status_code=400, detail=f"Kanallar yüklenemedi: {str(e)}")
    except Exception as e:
        logger.exception("Xtream load error")
        raise HTTPException(status_code=500, detail=f"Hata: {str(e)}")


# ---------------- XTREAM VOD (MOVIES) ----------------

@api_router.post("/xtream/vod")
async def xtream_load_vod(req: XtreamLoginRequest):
    server = _normalize_server(req.server)
    base = {"username": req.username, "password": req.password}
    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as hc:
            url = f"{server}/player_api.php"
            cat_r = await hc.get(url, params={**base, "action": "get_vod_categories"})
            cat_r.raise_for_status()
            cats = cat_r.json() or []
            cat_map = {str(c.get("category_id")): c.get("category_name", "Diğer") for c in cats}
            st_r = await hc.get(url, params={**base, "action": "get_vod_streams"})
            st_r.raise_for_status()
            streams = st_r.json() or []
        items: List[Dict[str, Any]] = []
        for s in streams:
            stream_id = s.get("stream_id")
            if stream_id is None:
                continue
            ext = s.get("container_extension") or "mp4"
            stream_url = f"{server}/movie/{req.username}/{req.password}/{stream_id}.{ext}"
            items.append({
                "id": f"vod-{stream_id}",
                "stream_id": stream_id,
                "name": s.get("name") or "Bilinmeyen",
                "poster": s.get("stream_icon"),
                "rating": s.get("rating"),
                "rating_5based": s.get("rating_5based"),
                "year": s.get("year"),
                "group": cat_map.get(str(s.get("category_id")), "Diğer"),
                "url": stream_url,
                "container_ext": ext,
                "added": s.get("added"),
            })
        return {"success": True, "count": len(items), "items": items}
    except httpx.HTTPError as e:
        logger.exception("Xtream VOD load failed")
        raise HTTPException(status_code=400, detail=f"Filmler yüklenemedi: {str(e)}")
    except Exception as e:
        logger.exception("Xtream VOD error")
        raise HTTPException(status_code=500, detail=f"Hata: {str(e)}")


class VodInfoRequest(BaseModel):
    server: str
    username: str
    password: str
    vod_id: str


@api_router.post("/xtream/vod-info")
async def xtream_vod_info(req: VodInfoRequest):
    server = _normalize_server(req.server)
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as hc:
            r = await hc.get(
                f"{server}/player_api.php",
                params={"username": req.username, "password": req.password,
                        "action": "get_vod_info", "vod_id": req.vod_id},
            )
            r.raise_for_status()
            data = r.json() or {}
        return {"success": True, "info": data.get("info") or {}, "movie_data": data.get("movie_data") or {}}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"Film bilgisi alınamadı: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hata: {str(e)}")


# ---------------- XTREAM SERIES ----------------

@api_router.post("/xtream/series")
async def xtream_load_series(req: XtreamLoginRequest):
    server = _normalize_server(req.server)
    base = {"username": req.username, "password": req.password}
    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as hc:
            url = f"{server}/player_api.php"
            cat_r = await hc.get(url, params={**base, "action": "get_series_categories"})
            cat_r.raise_for_status()
            cats = cat_r.json() or []
            cat_map = {str(c.get("category_id")): c.get("category_name", "Diğer") for c in cats}
            st_r = await hc.get(url, params={**base, "action": "get_series"})
            st_r.raise_for_status()
            series = st_r.json() or []
        items: List[Dict[str, Any]] = []
        for s in series:
            series_id = s.get("series_id")
            if series_id is None:
                continue
            items.append({
                "id": f"ser-{series_id}",
                "series_id": series_id,
                "name": s.get("name") or "Bilinmeyen",
                "poster": s.get("cover"),
                "plot": s.get("plot"),
                "cast": s.get("cast"),
                "director": s.get("director"),
                "genre": s.get("genre"),
                "release_date": s.get("releaseDate") or s.get("release_date"),
                "rating": s.get("rating"),
                "rating_5based": s.get("rating_5based"),
                "group": cat_map.get(str(s.get("category_id")), "Diğer"),
            })
        return {"success": True, "count": len(items), "items": items}
    except httpx.HTTPError as e:
        logger.exception("Xtream Series load failed")
        raise HTTPException(status_code=400, detail=f"Diziler yüklenemedi: {str(e)}")
    except Exception as e:
        logger.exception("Xtream Series error")
        raise HTTPException(status_code=500, detail=f"Hata: {str(e)}")


class SeriesInfoRequest(BaseModel):
    server: str
    username: str
    password: str
    series_id: str


class CatchupEpgRequest(BaseModel):
    server: str
    username: str
    password: str
    stream_id: str
    limit: int = 100


@api_router.post("/xtream/catchup-epg")
async def xtream_catchup_epg(req: CatchupEpgRequest):
    """Return short EPG for a stream. Programs with has_archive=1 are catch-up available."""
    server = _normalize_server(req.server)
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as hc:
            r = await hc.get(
                f"{server}/player_api.php",
                params={"username": req.username, "password": req.password,
                        "action": "get_short_epg", "stream_id": req.stream_id, "limit": str(req.limit)},
            )
            r.raise_for_status()
            data = r.json() or {}
        listing = data.get("epg_listings") if isinstance(data, dict) else data
        programs: List[Dict[str, Any]] = []
        for p in (listing or []):
            title = p.get("title") or ""
            desc = p.get("description") or ""
            # Decode base64 if needed
            import base64 as _b64
            try:
                if title and isinstance(title, str):
                    dec = _b64.b64decode(title).decode("utf-8", errors="ignore")
                    if dec and dec.isprintable():
                        title = dec
            except Exception:
                pass
            try:
                if desc and isinstance(desc, str):
                    dec = _b64.b64decode(desc).decode("utf-8", errors="ignore")
                    if dec and dec.isprintable():
                        desc = dec
            except Exception:
                pass
            programs.append({
                "title": title,
                "description": desc,
                "start": p.get("start"),
                "stop": p.get("end") or p.get("stop"),
                "start_timestamp": p.get("start_timestamp"),
                "stop_timestamp": p.get("stop_timestamp"),
                "has_archive": p.get("has_archive", 0),
                "now_playing": p.get("now_playing", 0),
                "epg_id": p.get("id") or p.get("epg_id"),
            })
        return {"success": True, "programs": programs}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"Catch-up rehberi alınamadı: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hata: {str(e)}")


@api_router.post("/xtream/series-info")
async def xtream_series_info(req: SeriesInfoRequest):
    server = _normalize_server(req.server)
    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as hc:
            r = await hc.get(
                f"{server}/player_api.php",
                params={"username": req.username, "password": req.password,
                        "action": "get_series_info", "series_id": req.series_id},
            )
            r.raise_for_status()
            data = r.json() or {}
        # Build episode stream URLs
        episodes_raw = data.get("episodes") or {}
        seasons_out: List[Dict[str, Any]] = []
        for season_num in sorted(episodes_raw.keys(), key=lambda x: int(x) if str(x).isdigit() else 0):
            eps = episodes_raw.get(season_num) or []
            out_eps = []
            for e in eps:
                eid = e.get("id")
                ext = e.get("container_extension") or "mp4"
                url = f"{server}/series/{req.username}/{req.password}/{eid}.{ext}"
                out_eps.append({
                    "id": str(eid),
                    "episode_num": e.get("episode_num"),
                    "title": e.get("title") or f"Bölüm {e.get('episode_num')}",
                    "plot": (e.get("info") or {}).get("plot"),
                    "duration": (e.get("info") or {}).get("duration"),
                    "image": (e.get("info") or {}).get("movie_image"),
                    "url": url,
                    "container_ext": ext,
                })
            seasons_out.append({"season": str(season_num), "episodes": out_eps})
        return {
            "success": True,
            "info": data.get("info") or {},
            "seasons": seasons_out,
        }
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"Dizi bilgisi alınamadı: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hata: {str(e)}")


# ---------------- STALKER (MAG) PORTAL ----------------
#
# LEGITIMATE USE ONLY: This is for users to connect their OWN MAG254/MAG box
# hardware that they legally own to a provider they subscribe to.
# We support single-MAC login only. No MAC lists, no scanning, no brute-force.

class StalkerLoginRequest(BaseModel):
    portal: str  # e.g. http://provider.com or http://provider.com/c/
    mac: str  # AA:BB:CC:DD:EE:FF
    serial: Optional[str] = None
    device_id: Optional[str] = None


def _normalize_portal(portal: str) -> str:
    p = portal.strip().rstrip("/")
    if not p.startswith("http://") and not p.startswith("https://"):
        p = "http://" + p
    # If user passes root URL, we discover portal.php path
    return p


def _stalker_headers(portal: str, mac: str, token: str = "") -> Dict[str, str]:
    return {
        "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 250 Safari/533.3",
        "X-User-Agent": "Model: MAG254; Link: WiFi",
        "Cookie": f"mac={mac}; stb_lang=en; timezone=Europe/Amsterdam",
        "Referer": f"{portal}/c/",
        "Authorization": f"Bearer {token}" if token else "",
    }


async def _stalker_get(hc: httpx.AsyncClient, portal: str, mac: str, token: str, params: Dict[str, Any]) -> Dict[str, Any]:
    # Try portal.php variants
    urls = [f"{portal}/portal.php", f"{portal}/stalker_portal/server/load.php", f"{portal}/c/portal.php"]
    last_exc = None
    for u in urls:
        try:
            r = await hc.get(u, params=params, headers=_stalker_headers(portal, mac, token))
            if r.status_code < 400 and r.text.strip().startswith("{"):
                return r.json()
        except Exception as e:
            last_exc = e
            continue
    if last_exc:
        raise last_exc
    raise HTTPException(status_code=400, detail="Portal URL doğrulanamadı")


@api_router.post("/stalker/login")
async def stalker_login(req: StalkerLoginRequest):
    portal = _normalize_portal(req.portal)
    mac = req.mac.strip().upper()
    if not re.match(r"^([0-9A-F]{2}:){5}[0-9A-F]{2}$", mac):
        raise HTTPException(status_code=400, detail="Geçersiz MAC formatı. Örnek: 00:1A:79:AA:BB:CC")
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as hc:
            # 1. Handshake
            hs = await _stalker_get(hc, portal, mac, "", {
                "type": "stb", "action": "handshake", "token": "", "JsHttpRequest": "1-xml"
            })
            token = ((hs.get("js") or {}).get("token")) or ""
            if not token:
                raise HTTPException(status_code=401, detail="Handshake başarısız. Portal veya MAC yanlış olabilir.")
            # 2. Profile
            prof = await _stalker_get(hc, portal, mac, token, {
                "type": "stb", "action": "get_profile", "hd": "1",
                "ver": "ImageDescription: 0.2.18-r14-250; ImageDate: Fri Jan 15 15:20:44 EET 2016; PORTAL version: 5.6.1; API Version: JS API version: 343; STB API version: 146; Player Engine version: 0x58c",
                "num_banks": "2", "sn": req.serial or "062015N001999",
                "stb_type": "MAG254", "client_type": "STB", "image_version": "218",
                "video_out": "hdmi", "device_id": req.device_id or "", "device_id2": req.device_id or "",
                "hw_version": "1.7-BD-00", "not_valid_token": "0", "metrics": '{"mac":"' + mac + '"}',
                "hw_version_2": "1.7-BD-00", "timestamp": str(int(datetime.now().timestamp())),
                "api_signature": "262", "prehash": "",
                "JsHttpRequest": "1-xml",
            })
            profile = prof.get("js") or {}
            # 3. Account info
            acct = await _stalker_get(hc, portal, mac, token, {
                "type": "account_info", "action": "get_main_info", "JsHttpRequest": "1-xml"
            })
            account = acct.get("js") or {}
        return {
            "success": True,
            "token": token,
            "profile": {
                "mac": profile.get("mac") or mac,
                "id": profile.get("id"),
                "login": profile.get("login"),
                "status": profile.get("status"),
                "phone": account.get("phone"),
                "exp_billing_date": account.get("exp_billing_date") or account.get("end_date"),
                "tariff_plan": account.get("tariff_plan"),
                "tariff_expired_date": account.get("tariff_expired_date"),
            },
        }
    except HTTPException:
        raise
    except httpx.HTTPError as e:
        logger.exception("Stalker login failed")
        raise HTTPException(status_code=400, detail=f"Portala bağlanılamadı: {str(e)}")
    except Exception as e:
        logger.exception("Stalker login error")
        raise HTTPException(status_code=500, detail=f"Hata: {str(e)}")


@api_router.post("/stalker/load")
async def stalker_load(req: StalkerLoginRequest):
    """Handshake + fetch all channels via Stalker Portal API."""
    portal = _normalize_portal(req.portal)
    mac = req.mac.strip().upper()
    if not re.match(r"^([0-9A-F]{2}:){5}[0-9A-F]{2}$", mac):
        raise HTTPException(status_code=400, detail="Geçersiz MAC formatı")
    try:
        async with httpx.AsyncClient(timeout=90.0, follow_redirects=True) as hc:
            hs = await _stalker_get(hc, portal, mac, "", {
                "type": "stb", "action": "handshake", "token": "", "JsHttpRequest": "1-xml"
            })
            token = ((hs.get("js") or {}).get("token")) or ""
            if not token:
                raise HTTPException(status_code=401, detail="Handshake başarısız")
            # Get genres (categories)
            gr = await _stalker_get(hc, portal, mac, token, {
                "type": "itv", "action": "get_genres", "JsHttpRequest": "1-xml"
            })
            genres = (gr.get("js") or []) if isinstance(gr.get("js"), list) else []
            genre_map = {str(g.get("id")): g.get("title", "Diğer") for g in genres}
            # Get all channels
            allch = await _stalker_get(hc, portal, mac, token, {
                "type": "itv", "action": "get_all_channels", "JsHttpRequest": "1-xml"
            })
            js = allch.get("js") or {}
            data = js.get("data") if isinstance(js, dict) else js
            channels_raw = data if isinstance(data, list) else []
        channels: List[Dict[str, Any]] = []
        for c in channels_raw:
            cid = str(c.get("id"))
            cmd = c.get("cmd") or ""
            # cmd looks like: "ffmpeg http://server/ch/12345_" or "auto http://..."
            m = re.search(r'(https?://\S+)', cmd)
            stream_url = m.group(1) if m else ""
            channels.append({
                "id": f"st-{cid}",
                "name": c.get("name") or "Bilinmeyen",
                "logo": (portal + "/misc/logos/320/" + c.get("logo")) if c.get("logo") else None,
                "group": genre_map.get(str(c.get("tv_genre_id")), "Diğer"),
                "url": stream_url,
                "tvg_id": c.get("xmltv_id"),
                "tvg_name": c.get("name"),
                "epg_channel_id": c.get("xmltv_id"),
                "stream_type": "live",
                "container_ext": "ts",
            })
        return {"success": True, "count": len(channels), "channels": channels, "token": token}
    except HTTPException:
        raise
    except httpx.HTTPError as e:
        logger.exception("Stalker load failed")
        raise HTTPException(status_code=400, detail=f"Kanallar yüklenemedi: {str(e)}")
    except Exception as e:
        logger.exception("Stalker load error")
        raise HTTPException(status_code=500, detail=f"Hata: {str(e)}")


# ---------------- EPG (XMLTV) ----------------

def _parse_xmltv_time(t: str) -> Optional[str]:
    """Convert XMLTV time (e.g. '20240101120000 +0000') to ISO string."""
    if not t:
        return None
    try:
        # Handle with or without timezone
        parts = t.strip().split()
        base = parts[0]
        tz_part = parts[1] if len(parts) > 1 else "+0000"
        dt = datetime.strptime(base, "%Y%m%d%H%M%S")
        # apply tz offset
        sign = 1 if tz_part[0] == "+" else -1
        hh = int(tz_part[1:3])
        mm = int(tz_part[3:5])
        offset = timedelta(hours=hh, minutes=mm) * sign
        dt = dt.replace(tzinfo=timezone.utc) - offset
        return dt.isoformat()
    except Exception:
        return None


async def _fetch_bytes(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as hc:
        r = await hc.get(url)
        r.raise_for_status()
        content = r.content
        # If gzipped
        if url.endswith(".gz") or content[:2] == b"\x1f\x8b":
            try:
                content = gzip.decompress(content)
            except Exception:
                pass
        return content


@api_router.post("/epg/fetch")
async def fetch_epg(req: EPGFetchRequest):
    """Fetch XMLTV EPG, extract programs, store in Mongo, return summary."""
    try:
        content = await _fetch_bytes(req.url)
        # Parse XML
        parser = etree.XMLParser(recover=True, huge_tree=True)
        root = etree.fromstring(content, parser=parser)
        if root is None:
            raise HTTPException(status_code=400, detail="EPG XML ayrıştırılamadı")

        # Clear old programs for this playlist
        await db.epg_programs.delete_many({"playlist_id": req.playlist_id})

        programs: List[Dict[str, Any]] = []
        BATCH = 5000
        for prog in root.iterfind("programme"):
            channel = prog.get("channel")
            start = _parse_xmltv_time(prog.get("start", ""))
            stop = _parse_xmltv_time(prog.get("stop", ""))
            title_el = prog.find("title")
            desc_el = prog.find("desc")
            if not channel or not start or not stop:
                continue
            programs.append({
                "playlist_id": req.playlist_id,
                "channel": channel,
                "start": start,
                "stop": stop,
                "title": (title_el.text or "").strip() if title_el is not None else "",
                "desc": (desc_el.text or "").strip() if desc_el is not None else "",
            })
            if len(programs) >= BATCH:
                await db.epg_programs.insert_many(programs)
                programs = []
        if programs:
            await db.epg_programs.insert_many(programs)

        # Meta
        await db.epg_meta.update_one(
            {"playlist_id": req.playlist_id},
            {"$set": {
                "playlist_id": req.playlist_id,
                "url": req.url,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
        total = await db.epg_programs.count_documents({"playlist_id": req.playlist_id})
        return {"success": True, "programs": total}
    except HTTPException:
        raise
    except httpx.HTTPError as e:
        logger.exception("EPG fetch failed")
        raise HTTPException(status_code=400, detail=f"EPG alınamadı: {str(e)}")
    except Exception as e:
        logger.exception("EPG parse failed")
        raise HTTPException(status_code=500, detail=f"EPG işlenemedi: {str(e)}")


@api_router.get("/epg/now-next")
async def epg_now_next(
    playlist_id: str = Query(...),
    channels: str = Query("", description="Comma-separated tvg-id list"),
):
    """Return now + next program for given channel tvg-ids."""
    ids = [c.strip() for c in channels.split(",") if c.strip()]
    if not ids:
        return {"success": True, "data": {}}
    now_iso = datetime.now(timezone.utc).isoformat()

    result: Dict[str, Dict[str, Any]] = {}
    # Fetch programs currently airing or upcoming, limited window
    cursor = db.epg_programs.find(
        {
            "playlist_id": playlist_id,
            "channel": {"$in": ids},
            "stop": {"$gte": now_iso},
        },
        {"_id": 0},
    ).sort([("channel", 1), ("start", 1)])

    async for p in cursor:
        ch = p["channel"]
        if ch not in result:
            result[ch] = {"now": None, "next": None}
        if result[ch]["now"] is None and p["start"] <= now_iso <= p["stop"]:
            result[ch]["now"] = p
        elif result[ch]["next"] is None and p["start"] > now_iso:
            result[ch]["next"] = p
    return {"success": True, "data": result}


@api_router.get("/epg/channel")
async def epg_for_channel(
    playlist_id: str = Query(...),
    channel: str = Query(...),
    limit: int = Query(50),
):
    """Return upcoming programs for a specific channel."""
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor = db.epg_programs.find(
        {"playlist_id": playlist_id, "channel": channel, "stop": {"$gte": now_iso}},
        {"_id": 0},
    ).sort("start", 1).limit(limit)
    programs = [p async for p in cursor]
    return {"success": True, "programs": programs}


# ---------------- DVR (Recording Schedules — metadata store) ----------------

class DvrSchedule(BaseModel):
    id: Optional[str] = None
    playlist_id: str
    channel_id: str
    channel_name: str
    start_iso: str
    stop_iso: str
    title: Optional[str] = None
    status: str = "scheduled"  # scheduled | recording | completed | failed


@api_router.post("/dvr/schedule")
async def dvr_schedule(req: DvrSchedule):
    """Store a recording schedule. Actual video recording requires a native build with FFmpeg."""
    doc = req.model_dump()
    if not doc.get("id"):
        doc["id"] = f"rec-{uuid.uuid4().hex[:12]}"
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.dvr_schedules.insert_one(doc)
    return {"success": True, "recording": {k: v for k, v in doc.items() if k != "_id"}}


@api_router.get("/dvr/schedules")
async def dvr_list(playlist_id: str = Query(...)):
    cursor = db.dvr_schedules.find({"playlist_id": playlist_id}, {"_id": 0}).sort("start_iso", -1).limit(100)
    items = [d async for d in cursor]
    return {"success": True, "recordings": items}


@api_router.delete("/dvr/schedule/{rec_id}")
async def dvr_delete(rec_id: str):
    res = await db.dvr_schedules.delete_one({"id": rec_id})
    return {"success": True, "deleted": res.deleted_count}


# ---------------- HEALTH ----------------

@api_router.get("/")
async def root():
    return {"app": "KIZILKAN PLAYER", "status": "ok", "version": "1.0.0"}


@api_router.get("/health")
async def health():
    try:
        await db.command("ping")
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        return {"status": "degraded", "db": str(e)}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
