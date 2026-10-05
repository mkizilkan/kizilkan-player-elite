import { magInstallation } from '@/src/utils/magEndpointRegistry';

/** Yalnız literal metin çözümlemesi. Uzak JavaScript hiçbir zaman çalıştırılmaz. */
function literalSafe(raw: string): boolean {
  let text = raw;
  for (let i = 0; i < 4; i++) {
    if (/[\\\x00-\x20]/.test(text) || /(?:^|[\/])\.\.(?:[\/?#]|$)/.test(text)) return false;
    try { const decoded = decodeURIComponent(text); if (decoded === text) return true; text = decoded; } catch { return false; }
  }
  return false; // aşırı katmanlı kodlama kabul edilmez.
}
export function resolveMagLocalReference(raw: string, parent: string, base = magInstallation(parent).base): string | null {
  if (!raw || !literalSafe(raw)) return null;
  try {
    const from = new URL(parent), u = new URL(raw, parent);
    if (!/^https?:$/.test(u.protocol) || u.origin !== from.origin || u.username || u.password) return null;
    const path = decodeURIComponent(u.pathname);
    if (base && path !== base && !path.startsWith(base + '/')) return null;
    u.search = ''; u.hash = '';
    return u.toString();
  } catch { return null; }
}
function scriptLike(body: string, contentType: string): boolean {
  if (/^\s*<(?:!doctype|html|head|body)\b/i.test(body) || /text\/html/i.test(contentType)) return false;
  return /javascript|ecmascript|text\/plain/i.test(contentType) || /\b(?:var|let|const|this\.)\s*/.test(body);
}
export function isMagVersionScript(body: string, contentType = ''): boolean {
  return scriptLike(body, contentType) && /\b(?:ver|version|stb_version|image_version)\b\s*[:=]\s*["'\d]/i.test(body)
    && /\b(?:stalker|ministra|infomir|stb|ver|version)\b/i.test(body);
}
export function resolveMagClientJs(body: string, sourceUrl: string, contentType = ''): { endpoints: string[]; evidence: string[] } {
  if (body.length > 65536 || !scriptLike(body, contentType)) return { endpoints: [], evidence: [] };
  const base = magInstallation(sourceUrl).base;
  const literals = [...body.matchAll(/(?:\b(?:var|let|const)\s+|\bthis\.)?(portal_path|portal_ip)\s*[:=]\s*(["'])([^"'\r\n]{1,300})\2/g)];
  const paths = literals.filter(match => match[1] === 'portal_path').map(match => match[3]);
  const ips = literals.filter(match => match[1] === 'portal_ip').map(match => match[3]);
  // portal_ip değerinin yabancı host'a kimlik yönlendirmesine izin verilmez.
  for (const ip of ips) {
    try {
      const u = new URL(/^https?:\/\//i.test(ip) ? ip : `http://${ip}`);
      if (u.hostname.toLowerCase() !== new URL(sourceUrl).hostname.toLowerCase()) return { endpoints: [], evidence: ['xpcom-foreign-host-rejected'] };
    } catch { return { endpoints: [], evidence: ['xpcom-invalid-host-rejected'] }; }
  }
  const endpoints = new Set<string>();
  const add = (raw: string) => {
    const resolved = resolveMagLocalReference(raw, sourceUrl, base);
    if (resolved && /\/(?:portal|load)\.php$/i.test(new URL(resolved).pathname)) endpoints.add(resolved);
  };
  for (const path of paths) {
    add(path);
    if (!/\.php(?:[?#]|$)/i.test(path)) {
      // portal_path bazen yalnız kurulum dizinidir; ipucu gerçek API isteğiyle doğrulanır.
      const directory = resolveMagLocalReference(path.replace(/\/?$/, '/'), sourceUrl, base);
      if (directory) { add(directory + 'portal.php'); add(directory + 'server/load.php'); }
    }
  }
  for (const match of body.matchAll(/["']([^"'\s<>]{1,300}(?:portal|load)\.php(?:\?[^"'\s<>]*)?)["']/gi)) add(match[1]);
  return { endpoints: [...endpoints].slice(0, 8), evidence: endpoints.size ? ['xpcom-explicit-api-path'] : [] };
}
