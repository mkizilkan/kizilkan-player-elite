/**
 * KIZILKAN PLAYER v18.4.0 — Arka planda oynatmaya devam et (Media3) tercihi.
 * Açıkken Media3 motorunda canlı/film/dizi de arka planda sürer ve Android bildirim
 * panelinde oynat/duraklat kontrolü görünür (expo-video showNowPlayingNotification).
 * VLC/MPV motorlarında bu kontrol YOK (motor desteklemiyor). Varsayılan KAPALI.
 */
import { storage } from "@/src/utils/storage";

export const PLAYER_BG_PLAYBACK_KEY = "kizilkan.player.bgPlayback.v1";

export async function loadBackgroundPlayback(): Promise<boolean> {
  try { return !!(await storage.getItem<boolean>(PLAYER_BG_PLAYBACK_KEY, false)); } catch { return false; }
}

export async function saveBackgroundPlayback(on: boolean): Promise<void> {
  try { await storage.setItem(PLAYER_BG_PLAYBACK_KEY, on); } catch { /* yoksay */ }
}
