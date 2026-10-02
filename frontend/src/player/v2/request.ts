import { DEFAULT_USER_AGENT } from "@/src/utils/streamTest";
import type { PlaybackRequest } from "./types";

export function normalizePlaybackHeaders(source: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!source || typeof source !== "object") return out;
  for (const [k,v] of Object.entries(source)) {
    if (v === undefined || v === null) continue;
    const rawKey = String(k).trim();
    const lower = rawKey.toLowerCase();
    const aliases: Record<string, string> = {
      "http-user-agent": "User-Agent", "user-agent": "User-Agent",
      "http-referrer": "Referer", "http-referer": "Referer", referer: "Referer", referrer: "Referer",
      "http-origin": "Origin", origin: "Origin", cookie: "Cookie", authorization: "Authorization",
    };
    if (lower === "inputstream.adaptive.stream_headers" || lower === "inputstream.adaptive.manifest_headers") {
      for (const pair of String(v).split("&")) {
        const split = pair.indexOf("=");
        if (split < 1) continue;
        const decode = (s: string) => { try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch { return s; } };
        Object.assign(out, normalizePlaybackHeaders({ [decode(pair.slice(0, split))]: decode(pair.slice(split + 1)) }));
      }
      continue;
    }
    // Kodi player/DRM configuration remains item metadata, not HTTP headers.
    if (lower.startsWith("inputstream.") || lower === "inputstream") continue;
    const key = aliases[lower] || rawKey;
    const val = String(v).trim();
    if (key && val && !/[\r\n]/.test(key + val)) out[key] = val;
  }
  return out;
}

const cleanHeaders = normalizePlaybackHeaders;

/** URL alone is insufficient: an account may change UA/Referer without changing media. */
export function playbackSourceIdentity(request: { url: string; headers?: Record<string, string>; contentType?: string } | null): string {
  if (!request) return "";
  const headers = Object.entries(normalizePlaybackHeaders(request.headers)).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([request.url, request.contentType || "auto", headers]);
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
  // v17.0.2 header inheritance:
  // provider/item source headers < runtime protocol headers < item arbitrary overrides.
  // Named UA/Referer/Origin below use the stricter user-facing priority:
  // item override > playlist/account default > provider/protocol > engine default.
  const providerHeaders = cleanHeaders(channel?.headers);
  const protocolHeaders = cleanHeaders(runtimeHeaders);
  const itemHeaderOverrides = cleanHeaders(override?.headers);
  const headers = {
    ...providerHeaders,
    // Keep the direct bridge explicit: historical MAG regression gate verifies
    // runtime headers enter the PlaybackRequest at this exact boundary.
    ...cleanHeaders(runtimeHeaders),
    ...itemHeaderOverrides,
  };
  const playlistHeaders = playlist?.playbackHeaders || {};

  const userAgent =
    override?.userAgent ||
    itemHeaderOverrides["User-Agent"] || itemHeaderOverrides["user-agent"] ||
    playlistHeaders?.userAgent ||
    protocolHeaders["User-Agent"] || protocolHeaders["user-agent"] ||
    providerHeaders["User-Agent"] || providerHeaders["user-agent"] ||
    DEFAULT_USER_AGENT;
  headers["User-Agent"] = String(userAgent);
  delete headers["user-agent"];

  const referer =
    override?.referer || override?.referrer ||
    itemHeaderOverrides["Referer"] || itemHeaderOverrides["referer"] || itemHeaderOverrides["Referrer"] ||
    playlistHeaders?.referer ||
    protocolHeaders["Referer"] || protocolHeaders["referer"] || protocolHeaders["Referrer"] ||
    providerHeaders["Referer"] || providerHeaders["referer"] || providerHeaders["Referrer"];
  if (referer) headers["Referer"] = String(referer);
  else delete headers["Referer"];
  delete headers["referer"]; delete headers["Referrer"];

  const origin =
    override?.origin ||
    itemHeaderOverrides["Origin"] || itemHeaderOverrides["origin"] ||
    playlistHeaders?.origin ||
    protocolHeaders["Origin"] || protocolHeaders["origin"] ||
    providerHeaders["Origin"] || providerHeaders["origin"];
  if (origin) headers["Origin"] = String(origin);
  else delete headers["Origin"];
  delete headers["origin"];

  const ext = String(channel?.container_ext || "").toLowerCase();
  const streamType = String(channel?.stream_type || "").toLowerCase();
  const group = String(channel?.group || "").toLowerCase();
  const name = String(channel?.name || "").toLowerCase();
  const lower = url.toLowerCase();
  const expectsVideo = !(
    streamType === "radio" ||
    // v18.1.0: yerel müzik için ses uzantıları genişletildi (opus/oga/wma/amr/mka/alac/aiff).
    ["mp3","aac","m4a","flac","ogg","oga","opus","wav","wma","amr","mka","alac","aiff","aif"].includes(ext) ||
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
    requiresHttpHeaders: Boolean(override?.userAgent || itemHeaderOverrides["User-Agent"] || playlistHeaders?.userAgent ||
      protocolHeaders["User-Agent"] || providerHeaders["User-Agent"] ||
      headers["User-Agent"] !== DEFAULT_USER_AGENT || Object.keys(headers).some(k => k.toLowerCase() !== "user-agent")),
  };
}
