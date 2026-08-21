import type { ClassifiedPlaybackError, PlaybackErrorKind } from "./types";

function httpCode(raw: string): number | undefined {
  const m = raw.match(/(?:response code:|http[_\s-]*(?:proxy[_\s-]*auth)?\s*\(?)(401|403|404|407)\b/i)
    || raw.match(/\b(401|403|404|407)\b/);
  return m ? Number(m[1]) : undefined;
}

export function classifyPlaybackError(input: unknown): ClassifiedPlaybackError {
  const raw = String((input as any)?.message ?? input ?? "Bilinmeyen oynatma hatası");
  const low = raw.toLowerCase();
  const code = httpCode(raw);

  let kind: PlaybackErrorKind = "unknown";
  let userMessage = "Yayın açılamadı.";
  let immediateFallback = false;
  let trySurfaceRecovery = false;
  let retryNetwork = false;

  if (code === 401) {
    kind = "http_auth";
    userMessage = "Sunucu oynatma isteğini yetkilendirmedi (401).";
    retryNetwork = true;
  } else if (code === 407 || /http_proxy_auth|proxy authentication/i.test(raw)) {
    kind = "http_proxy";
    userMessage = "Sunucu/HTTP ara katmanı proxy yetkilendirme hatası döndürdü (407).";
    retryNetwork = true;
  } else if (code === 403) {
    kind = "http_forbidden";
    userMessage = "Sunucu yayına erişimi reddetti (403).";
    retryNetwork = true;
  } else if (code === 404) {
    kind = "http_not_found";
    userMessage = "Yayın adresi bulunamadı (404).";
  } else if (/none of the available extractors|extractor.*could read|unrecognizedinputformat/i.test(low)) {
    kind = "extractor";
    userMessage = "Media3 bu yayın biçimini okuyamadı. MPV / FFmpeg deneniyor…";
    immediateFallback = true;
  } else if (/unsupported[_\s-]*type|no_unsupported_type|audio\/mpeg-l2|unsupported.*codec/i.test(low)) {
    kind = "unsupported_codec";
    userMessage = "Media3 bu codec'i cihazda çözemedi. MPV / FFmpeg deneniyor…";
    immediateFallback = true;
  } else if (/decoder init failed|mediacodec.*error|renderer error|codec exception|c2\.android/i.test(low)) {
    kind = "decoder";
    userMessage = "Media3 kod çözücüsü yayını başlatamadı. MPV / FFmpeg deneniyor…";
    immediateFallback = true;
  } else if (/surface|render.*frame|video output/i.test(low)) {
    kind = "surface";
    userMessage = "Video yüzeyi görüntü üretemedi. Alternatif yüzey deneniyor…";
    trySurfaceRecovery = true;
  } else if (/timeout|timed out/i.test(low)) {
    kind = "timeout";
    userMessage = "Sunucu zamanında yanıt vermedi.";
    retryNetwork = true;
  } else if (/network|connect|connection|socket|dns|host/i.test(low)) {
    kind = "network";
    userMessage = "Yayın bağlantısı kurulamadı.";
    retryNetwork = true;
  } else if (/source error|source/i.test(low)) {
    kind = "source";
    userMessage = "Yayın kaynağı Media3 tarafından açılamadı. MPV / FFmpeg deneniyor…";
    immediateFallback = true;
  }

  return { kind, technical: raw, userMessage, httpCode: code, immediateFallback, trySurfaceRecovery, retryNetwork };
}
