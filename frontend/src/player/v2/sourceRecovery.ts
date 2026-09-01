import * as Crypto from "expo-crypto";

export type HttpRecoveryClass = "not_found" | "session_or_link_expired" | "upstream" | "auth" | "other";
export type SourceProvenance = {
  fingerprint: string; createdAt: number; ageMs: number; origin: "stalker_create_link" | "xtream" | "m3u" | "external" | "unknown";
  candidateIndex: number; playlistId: string; channelId: string;
};

export function classifyHttpRecovery(status: number): HttpRecoveryClass {
  if (status === 404) return "not_found";
  if (status === 444 || status === 456) return "session_or_link_expired";
  if (status === 401 || status === 403) return "auth";
  if (status === 520) return "upstream";
  return "other";
}

export async function fingerprintPlaybackUrl(url: string): Promise<string> {
  if (!url) return "";
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, url);
}

export function extractHttpStatus(text: string): number | null {
  const value = String(text || "");
  const explicit = value.match(/(?:response\s+code|http(?:\s+status)?|status)[^0-9]{0,8}(\d{3})\b/i);
  if (explicit) return Number(explicit[1]);
  // Some native engines surface only the status code (for example "444").
  // Restrict the fallback to recovery-relevant codes so arbitrary three-digit
  // media metadata cannot be mistaken for an HTTP response.
  const recoveryCode = value.match(/(?:^|\D)(401|403|404|444|456|520)(?:\D|$)/);
  return recoveryCode ? Number(recoveryCode[1]) : null;
}

export function shouldRenewResolvedSource(status: number | null, origin: SourceProvenance["origin"]): boolean {
  if (origin !== "stalker_create_link") return false;
  return status === 401 || status === 403 || status === 444 || status === 456 || status === 520;
}
