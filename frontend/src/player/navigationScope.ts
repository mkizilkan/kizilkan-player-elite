import { storage } from "@/src/utils/storage";

const PLAYER_NAV_SCOPE_KEY = "kizilkan.player.scope.";
const PLAYER_NAV_SCOPE_VERSION = 1;
const PLAYER_NAV_SCOPE_TTL_MS = 30 * 60 * 1000;
const PLAYER_NAV_SCOPE_MAX_IDS = 100_000;

export type PlayerNavigationScopeKind = "live" | "vod" | "series";

type StoredPlayerNavigationScope = {
  version: number;
  playlistId: string;
  kind: PlayerNavigationScopeKind;
  ids: string[];
  createdAt: number;
};

function stableScopeKey(playlistId: string, origin: string, kind: PlayerNavigationScopeKind, scopeId: string) {
  const raw = `${playlistId}|${origin}|${kind}|${scopeId}`;
  // Storage anahtarını URL/özel-karakter etkilerinden arındır. İçerik kimliği değil,
  // yalnız runtime navigation scope slotudur; aynı slot yeni listeyle overwrite edilir.
  let h = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${PLAYER_NAV_SCOPE_KEY}${(h >>> 0).toString(16)}`;
}

/**
 * v17.0.0 — Favori/özel grup gibi Room'un provider groupName alanıyla ifade
 * edilemeyen sıralar için yalnız ID dizisini saklar. Büyük medya nesneleri veya
 * URL/EPG payload'ları taşınmaz; v16.14.8 RAM hot-path kazanımı korunur.
 */
export async function savePlayerNavigationScope(input: {
  playlistId: string;
  origin: string;
  kind: PlayerNavigationScopeKind;
  scopeId: string;
  ids: Array<string | number | null | undefined>;
}): Promise<string | undefined> {
  const ids = Array.from(new Set(input.ids.map(x => String(x ?? "").trim()).filter(Boolean))).slice(0, PLAYER_NAV_SCOPE_MAX_IDS);
  if (!input.playlistId || ids.length === 0) return undefined;
  const key = stableScopeKey(input.playlistId, input.origin, input.kind, input.scopeId);
  const payload: StoredPlayerNavigationScope = {
    version: PLAYER_NAV_SCOPE_VERSION,
    playlistId: input.playlistId,
    kind: input.kind,
    ids,
    createdAt: Date.now(),
  };
  const ok = await storage.setItem(key, JSON.stringify(payload));
  return ok ? key : undefined;
}

export async function loadPlayerNavigationScope(scopeKey: string | undefined, expected: {
  playlistId: string;
  kind: PlayerNavigationScopeKind;
}): Promise<string[] | null> {
  if (!scopeKey || !scopeKey.startsWith(PLAYER_NAV_SCOPE_KEY)) return null;
  const raw = await storage.getItem(scopeKey, "");
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPlayerNavigationScope>;
    if (parsed.version !== PLAYER_NAV_SCOPE_VERSION || parsed.playlistId !== expected.playlistId || parsed.kind !== expected.kind) return null;
    if (!Number.isFinite(parsed.createdAt) || Date.now() - Number(parsed.createdAt) > PLAYER_NAV_SCOPE_TTL_MS) {
      void storage.removeItem(scopeKey);
      return null;
    }
    if (!Array.isArray(parsed.ids)) return null;
    return parsed.ids.map(String).filter(Boolean).slice(0, PLAYER_NAV_SCOPE_MAX_IDS);
  } catch {
    return null;
  }
}
