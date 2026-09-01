import { DEFAULT_USER_AGENT } from "@/src/utils/streamTest";
import type { PlaybackRequest } from "./types";

function cleanHeaders(source: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!source || typeof source !== "object") return out;
  for (const [k,v] of Object.entries(source)) {
    if (v === undefined || v === null) continue;
    const key = String(k).trim();
    const val = String(v).trim();
    if (key && val) out[key] = val;
  }
  return out;
}

export function buildPlaybackRequest(args: {
  url: string;
  channel: any;
  override?: any;
  playlist?: any;
  isLive: boolean;
  runtimeHeaders?: Record<string, string>;
}): PlaybackRequest {
  const { url, channel, override, playlist, isLive, runtimeHeaders } = args;
  const headers = {
    ...cleanHeaders(channel?.headers),
    ...cleanHeaders(override?.headers),
    // Runtime-resolved MAG context is authoritative for the temporary create_link URL.
    ...cleanHeaders(runtimeHeaders),
  };

  const userAgent =
    override?.userAgent ||
    headers["User-Agent"] ||
    headers["user-agent"] ||
    DEFAULT_USER_AGENT;
  headers["User-Agent"] = userAgent;
  delete headers["user-agent"];

  const referer = override?.referer || override?.referrer || headers["Referer"] || headers["referer"];
  if (referer) headers["Referer"] = String(referer);
  delete headers["referer"];

  const origin = override?.origin || headers["Origin"] || headers["origin"];
  if (origin) headers["Origin"] = String(origin);
  delete headers["origin"];

  const ext = String(channel?.container_ext || "").toLowerCase();
  const streamType = String(channel?.stream_type || "").toLowerCase();
  const group = String(channel?.group || "").toLowerCase();
  const name = String(channel?.name || "").toLowerCase();
  const lower = url.toLowerCase();
  const expectsVideo = !(
    streamType === "radio" ||
    ["mp3","aac","m4a","flac","ogg","wav"].includes(ext) ||
    ((group.includes("radio") || name.startsWith("radio ")) && !["ts","m3u8","mp4","mkv"].includes(ext))
  );
  const contentType: PlaybackRequest["contentType"] =
    lower.includes(".m3u8") || ext === "m3u8" ? "hls"
    : lower.includes(".mpd") || ext === "mpd" ? "dash"
    : "auto";

  const fallbackUrls: string[] = [];
  if (
    isLive &&
    playlist?.source === "xtream" &&
    playlist?.xtreamServer && playlist?.xtreamUsername && playlist?.xtreamPassword &&
    channel?.stream_id != null
  ) {
    const base = String(playlist.xtreamServer).replace(/\/+$/, "");
    const user = encodeURIComponent(String(playlist.xtreamUsername));
    const pass = encodeURIComponent(String(playlist.xtreamPassword));
    const id = encodeURIComponent(String(channel.stream_id));
    const candidates = [
      `${base}/live/${user}/${pass}/${id}.ts`,
      `${base}/live/${user}/${pass}/${id}.m3u8`,
    ];
    for (const candidate of candidates) {
      if (candidate !== url && !fallbackUrls.includes(candidate)) fallbackUrls.push(candidate);
    }
  }

  return {
    url,
    headers,
    contentType,
    channelId: String(channel?.id || ""),
    channelName: String(channel?.name || ""),
    container: ext || undefined,
    isLive,
    expectsVideo,
    fallbackUrls,
  };
}
