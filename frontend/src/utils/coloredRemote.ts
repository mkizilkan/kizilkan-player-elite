import { storage } from "@/src/utils/storage";

export type ColoredKey = "red" | "green" | "yellow" | "blue";
export type ColoredRemoteAction = "favorite" | "guide" | "lastChannel" | "controls" | "stats" | "none";
export type ColoredRemoteMap = Record<ColoredKey, ColoredRemoteAction>;

export const DEFAULT_COLORED_REMOTE_MAP: ColoredRemoteMap = {
  red: "favorite",
  green: "guide",
  yellow: "lastChannel",
  blue: "controls",
};

export const COLORED_ACTION_LABELS: Record<ColoredRemoteAction, string> = {
  favorite: "Favori",
  guide: "EPG / Rehber",
  lastChannel: "Son Kanal",
  controls: "Kontroller",
  stats: "Yayın Bilgisi",
  none: "Atanmamış",
};

export const COLORED_ACTION_ORDER: ColoredRemoteAction[] = ["favorite", "guide", "lastChannel", "controls", "stats", "none"];
const KEY_PREFIX = "kizilkan.remote.colored.";

export async function loadColoredRemoteMap(profileId: string): Promise<ColoredRemoteMap> {
  const raw = await storage.getItem<string>(KEY_PREFIX + profileId, "");
  if (!raw) return { ...DEFAULT_COLORED_REMOTE_MAP };
  try {
    const parsed = JSON.parse(raw) || {};
    return {
      red: COLORED_ACTION_ORDER.includes(parsed.red) ? parsed.red : DEFAULT_COLORED_REMOTE_MAP.red,
      green: COLORED_ACTION_ORDER.includes(parsed.green) ? parsed.green : DEFAULT_COLORED_REMOTE_MAP.green,
      yellow: COLORED_ACTION_ORDER.includes(parsed.yellow) ? parsed.yellow : DEFAULT_COLORED_REMOTE_MAP.yellow,
      blue: COLORED_ACTION_ORDER.includes(parsed.blue) ? parsed.blue : DEFAULT_COLORED_REMOTE_MAP.blue,
    };
  } catch { return { ...DEFAULT_COLORED_REMOTE_MAP }; }
}

export async function saveColoredRemoteMap(profileId: string, map: ColoredRemoteMap): Promise<void> {
  await storage.setItem(KEY_PREFIX + profileId, JSON.stringify(map));
}
