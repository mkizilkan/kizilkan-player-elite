import { storage } from "@/src/utils/storage";

const KEY = "kizilkan.appSession.v1";
const RECENT_RESUME_MS = 15 * 60 * 1000;

export type PersistedAppSession = {
  path: string;
  updatedAt: number;
  backgroundAt?: number;
};

const SAFE_PATHS = new Set([
  "/tv-home",
  "/playlist-select",
  "/add-playlist",
  "/search",
  "/favorites",
  "/settings",
  "/(tabs)",
  "/",
]);

function normalizePath(path: string): string {
  const p = String(path || "/").split("?")[0] || "/";
  return SAFE_PATHS.has(p) ? p : "/";
}

async function readSession(): Promise<PersistedAppSession | null> {
  const raw = await storage.getItem<string>(KEY, "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.path !== "string") return null;
    return parsed as PersistedAppSession;
  } catch {
    return null;
  }
}

async function writeSession(value: PersistedAppSession): Promise<void> {
  await storage.setItem(KEY, JSON.stringify(value));
}

export async function persistAppPath(path: string): Promise<void> {
  const prev = await readSession();
  const normalized = normalizePath(path);
  await writeSession({
    // Root loader route'u cold/recreate sırasında son gerçek ekranı ezmesin.
    path: normalized === "/" && prev?.path && prev.path !== "/" ? prev.path : normalized,
    updatedAt: Date.now(),
    backgroundAt: prev?.backgroundAt,
  });
}

export async function markAppBackground(path: string): Promise<void> {
  const prev = await readSession();
  const normalized = normalizePath(path);
  await writeSession({
    path: normalized === "/" && prev?.path && prev.path !== "/" ? prev.path : normalized,
    updatedAt: Date.now(),
    backgroundAt: Date.now(),
  });
}

export async function markAppForeground(path: string): Promise<void> {
  const prev = await readSession();
  const normalized = normalizePath(path || prev?.path || "/");
  await writeSession({
    path: normalized === "/" && prev?.path && prev.path !== "/" ? prev.path : normalized,
    updatedAt: Date.now(),
    backgroundAt: prev?.backgroundAt,
  });
}

export async function getRecentResumePath(): Promise<string | null> {
  const snap = await readSession();
  if (!snap?.path || !snap.backgroundAt) return null;
  if (Date.now() - snap.backgroundAt > RECENT_RESUME_MS) return null;
  const p = normalizePath(snap.path);
  return p === "/" ? null : p;
}
