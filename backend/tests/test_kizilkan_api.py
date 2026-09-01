"""
KIZILKAN PLAYER backend regression + FAZ 2 tests.
Covers:
  - Health / root
  - M3U parse (url & content)
  - Xtream login (invalid) + new VOD/Series/vod-info/series-info error paths
  - Stalker (MAG) login/load error paths (invalid MAC + unreachable portal)
  - EPG endpoints
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://python-app-builder-13.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

DEMO_M3U = "https://iptv-org.github.io/iptv/countries/tr.m3u"
# NOTE: iptv-org.github.io/epg/guides/tr.xml is 404 as of Jan 2026.
DEMO_EPG = "https://epgshare01.online/epgshare01/epg_ripper_TR1.xml.gz"

TEST_PLAYLIST_ID = "TEST_kizilkan_pl_1"
FAKE_XT = {"server": "http://this-xtream-does-not-exist-9999.example",
           "username": "TEST_bad", "password": "TEST_bad"}


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------- HEALTH ----------------
class TestHealth:
    def test_root(self, api_client):
        r = api_client.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("app") == "KIZILKAN PLAYER"

    def test_health_db_connected(self, api_client):
        r = api_client.get(f"{API}/health")
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"
        assert data.get("db") == "connected"


# ---------------- M3U ----------------
class TestM3U:
    def test_parse_m3u_from_url(self, api_client):
        r = api_client.post(f"{API}/m3u/parse-url", json={"url": DEMO_M3U}, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        assert data.get("count", 0) > 100
        ch = data["channels"][0]
        for key in ["id", "name", "url", "group", "stream_type"]:
            assert key in ch

    def test_parse_m3u_from_content(self, api_client):
        content = (
            "#EXTM3U\n"
            "#EXTINF:-1 tvg-id=\"trt1.tr\" tvg-logo=\"http://l/trt.png\" group-title=\"Ulusal\",TRT 1\n"
            "http://example.com/trt1.m3u8\n"
        )
        r = api_client.post(f"{API}/m3u/parse-content", json={"content": content})
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 1
        assert data["channels"][0]["name"] == "TRT 1"
        assert data["channels"][0]["container_ext"] == "m3u8"

    def test_parse_m3u_invalid_url(self, api_client):
        r = api_client.post(f"{API}/m3u/parse-url", json={"url": "http://this-domain-does-not-exist-xyz-1234567.example/list.m3u"}, timeout=60)
        assert r.status_code in (400, 500)


# ---------------- XTREAM ----------------
class TestXtream:
    def test_xtream_login_invalid_returns_error(self, api_client):
        r = api_client.post(f"{API}/xtream/login", json=FAKE_XT, timeout=45)
        assert r.status_code in (400, 401), r.text
        assert "detail" in r.json()

    def test_xtream_vod_invalid_returns_error(self, api_client):
        r = api_client.post(f"{API}/xtream/vod", json=FAKE_XT, timeout=45)
        assert r.status_code == 400, r.text
        assert "Filmler yüklenemedi" in r.json().get("detail", "") or "detail" in r.json()

    def test_xtream_series_invalid_returns_error(self, api_client):
        r = api_client.post(f"{API}/xtream/series", json=FAKE_XT, timeout=45)
        assert r.status_code == 400, r.text

    def test_xtream_vod_info_invalid(self, api_client):
        r = api_client.post(f"{API}/xtream/vod-info",
                            json={**FAKE_XT, "vod_id": "1"}, timeout=45)
        assert r.status_code == 400, r.text

    def test_xtream_series_info_invalid(self, api_client):
        r = api_client.post(f"{API}/xtream/series-info",
                            json={**FAKE_XT, "series_id": "1"}, timeout=45)
        assert r.status_code == 400, r.text

    def test_xtream_catchup_epg_invalid(self, api_client):
        r = api_client.post(f"{API}/xtream/catchup-epg",
                            json={**FAKE_XT, "stream_id": "1", "limit": 10}, timeout=45)
        # Should surface a 400 (network unreachable), not 500
        assert r.status_code == 400, r.text
        assert "detail" in r.json()


# ---------------- STALKER (MAG) ----------------
class TestStalker:
    def test_stalker_login_invalid_mac_format(self, api_client):
        r = api_client.post(f"{API}/stalker/login",
                            json={"portal": "http://any.example", "mac": "ZZ:ZZ"}, timeout=30)
        assert r.status_code == 400, r.text
        assert "Geçersiz MAC" in r.json().get("detail", "")

    def test_stalker_load_invalid_mac_format(self, api_client):
        r = api_client.post(f"{API}/stalker/load",
                            json={"portal": "http://any.example", "mac": "AA:BB"}, timeout=30)
        assert r.status_code == 400, r.text
        assert "Geçersiz MAC" in r.json().get("detail", "")

    def test_stalker_login_unreachable_portal(self, api_client):
        r = api_client.post(f"{API}/stalker/login", json={
            "portal": "http://this-mag-portal-does-not-exist-99887.example",
            "mac": "00:1A:79:AA:BB:CC",
        }, timeout=45)
        # 400 (unreachable) or 401 (handshake failed) both acceptable, but not 500 or 200
        assert r.status_code in (400, 401), r.text
        assert "detail" in r.json()

    def test_stalker_load_unreachable_portal(self, api_client):
        r = api_client.post(f"{API}/stalker/load", json={
            "portal": "http://this-mag-portal-does-not-exist-99887.example",
            "mac": "00:1A:79:AA:BB:CC",
        }, timeout=45)
        assert r.status_code in (400, 401), r.text


# ---------------- EPG ----------------
class TestEPG:
    def test_epg_fetch(self, api_client):
        r = api_client.post(f"{API}/epg/fetch", json={
            "url": DEMO_EPG, "playlist_id": TEST_PLAYLIST_ID,
        }, timeout=180)
        assert r.status_code == 200, r.text
        assert r.json().get("programs", 0) > 0

    def test_epg_now_next_empty(self, api_client):
        r = api_client.get(f"{API}/epg/now-next",
                           params={"playlist_id": TEST_PLAYLIST_ID, "channels": ""})
        assert r.status_code == 200
        assert r.json() == {"success": True, "data": {}}

    def test_epg_now_next_structure(self, api_client):
        r = api_client.get(f"{API}/epg/now-next", params={
            "playlist_id": TEST_PLAYLIST_ID,
            "channels": "TRT1.tr,ShowTV.tr,KanalD.tr",
        })
        assert r.status_code == 200
        assert isinstance(r.json().get("data"), dict)

    def test_epg_for_channel(self, api_client):
        r = api_client.get(f"{API}/epg/channel", params={
            "playlist_id": TEST_PLAYLIST_ID, "channel": "TRT1.tr", "limit": 5,
        })
        assert r.status_code == 200
        assert isinstance(r.json().get("programs"), list)


# ---------------- DVR (FAZ 5) ----------------
DVR_PLAYLIST_ID = "TEST_kizilkan_dvr_pl_1"


class TestDVR:
    """FAZ 5 DVR schedule CRUD - metadata store, no actual recording."""

    _created_ids: list = []

    def test_dvr_schedule_create(self, api_client):
        payload = {
            "playlist_id": DVR_PLAYLIST_ID,
            "channel_id": "st-101",
            "channel_name": "TEST_TRT1",
            "start_iso": "2026-01-15T20:00:00+00:00",
            "stop_iso": "2026-01-15T21:00:00+00:00",
            "title": "TEST_Haberler",
        }
        r = api_client.post(f"{API}/dvr/schedule", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        rec = data.get("recording") or {}
        assert rec.get("id"), "recording.id missing"
        assert rec.get("playlist_id") == DVR_PLAYLIST_ID
        assert rec.get("channel_name") == "TEST_TRT1"
        assert rec.get("status") == "scheduled"
        # CRITICAL: MongoDB _id must NOT be in the response
        assert "_id" not in rec, "MongoDB _id leaked in response"
        TestDVR._created_ids.append(rec["id"])

    def test_dvr_schedules_list(self, api_client):
        # Ensure at least one record exists
        if not TestDVR._created_ids:
            pytest.skip("no created DVR record")
        r = api_client.get(f"{API}/dvr/schedules",
                           params={"playlist_id": DVR_PLAYLIST_ID}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        recs = data.get("recordings") or []
        assert isinstance(recs, list) and len(recs) >= 1
        # No _id leakage
        for rec in recs:
            assert "_id" not in rec
        # Our created record should be there
        ids = [r.get("id") for r in recs]
        assert TestDVR._created_ids[0] in ids

    def test_dvr_schedule_delete(self, api_client):
        if not TestDVR._created_ids:
            pytest.skip("no created DVR record")
        rec_id = TestDVR._created_ids[0]
        r = api_client.delete(f"{API}/dvr/schedule/{rec_id}", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        assert data.get("deleted") == 1
        # Confirm gone
        r2 = api_client.get(f"{API}/dvr/schedules",
                            params={"playlist_id": DVR_PLAYLIST_ID}, timeout=30)
        assert r2.status_code == 200
        ids_after = [x.get("id") for x in r2.json().get("recordings", [])]
        assert rec_id not in ids_after
