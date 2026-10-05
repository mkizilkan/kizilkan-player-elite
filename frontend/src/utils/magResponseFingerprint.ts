export type MagResponseFingerprint = { status: number; contentType: string; length: number; bodyHash: string };
/** Kimlik veya gövdeyi saklamadan ara sunucunun tekrarlanan yanıtını karşılaştırır. */
export function magResponseFingerprint(status: number, headers: Record<string, string>, body: string): MagResponseFingerprint {
  const text = body.slice(0, 65536).trim().replace(/\s+/g, ' ');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return { status, contentType: String(headers['content-type'] || '').split(';')[0].toLowerCase(), length: text.length, bodyHash: (hash >>> 0).toString(16) };
}
export const MAG_SAFE_RESPONSE_HEADERS = ['content-type', 'server', 'cf-ray', 'cf-cache-status', 'cf-mitigated', 'retry-after', 'via'] as const;
