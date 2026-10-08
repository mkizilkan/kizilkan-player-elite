/** A renderer probe and the persistent player must never share an upstream slot. */
let releaseMain: (() => Promise<void>) | null = null;
let owner: symbol | null = null;
export function registerPlaybackRelease(release: () => Promise<void>): () => void {
  releaseMain = release;
  return () => { if (releaseMain === release) releaseMain = null; };
}
export function playbackProbeActive(): boolean { return owner !== null; }
export async function acquirePlaybackProbe(): Promise<() => void> {
  if (owner) throw new Error('Başka bir görüntü testi çalışıyor.');
  const token = Symbol('renderer-probe'); owner = token;
  try {
    if (!releaseMain) throw new Error('Oynatıcı henüz hazır değil; tekrar deneyin.');
    await releaseMain();
    return () => { if (owner === token) owner = null; };
  } catch (e) { if (owner === token) owner = null; throw e; }
}
