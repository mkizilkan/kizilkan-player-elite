import type { ClassifiedPlaybackError, EngineProfile } from "./types";
import { fallbackFromError } from "./controller";

export function engineProfileKey(profile: EngineProfile): string {
  return profile.engine === "media3"
    ? `media3:${profile.surface}`
    : profile.engine === "vlc"
      ? `vlc:${profile.decoder}`
      : "mpv:auto";
}

export function playbackAttemptKey(url: string, profile: EngineProfile): string {
  return `${String(url || "")}\u0000${engineProfileKey(profile)}`;
}

/**
 * v17.10.0 — Aynı URL + engine + gerçek profil kombinasyonunu bir session
 * ailesinde ikinci kez otomatik olarak deneme. Farklı Media3 yüzeyi ve VLC
 * HW/SW ayrı profillerdir; dolayısıyla meşru recovery zinciri korunur.
 */
export function nextUntriedProfile(
  initial: EngineProfile | null,
  failed: ReadonlySet<string>,
  url: string,
  reason: ClassifiedPlaybackError,
): EngineProfile | null {
  let next = initial;
  const guard = new Set<string>();
  for (let i = 0; next && i < 8; i += 1) {
    const key = playbackAttemptKey(url, next);
    if (!failed.has(key)) return next;
    const pk = engineProfileKey(next);
    if (guard.has(pk)) return null;
    guard.add(pk);
    next = fallbackFromError(next, reason).next;
  }
  return null;
}
