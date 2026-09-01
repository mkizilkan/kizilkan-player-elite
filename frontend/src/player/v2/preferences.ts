export const PLAYER_BUFFER_KEY = "kizilkan.player.buffer";
export const PLAYER_BUFFER_V2_MIGRATION_KEY = "kizilkan.player.v2.bufferMigrated";
export const PLAYER_BUFFER_V15_MIGRATION_KEY = "kizilkan.player.v15.bufferMigrated";

/** Gelişmiş elle seçimler — geriye dönük tüm seçenekler korunur. */
export const PLAYER_BUFFER_OPTIONS = [0, 300, 450, 1000, 1500, 2500, 4000, 6000] as const;

/** v15 adlandırılmış canlı profil seçenekleri. */
export const PLAYER_BUFFER_PRESETS = [
  { id: "fast", label: "Hızlı", ms: 450, detail: "En hızlı kanal geçişi; zayıf ağda takılabilir." },
  { id: "balanced", label: "Dengeli", ms: 1500, detail: "Önerilen — hız ve kararlılık dengesi." },
  { id: "stable", label: "Stabil", ms: 4000, detail: "Oynak/zayıf bağlantıda daha az takılma." },
] as const;

export const PLAYER_BUFFER_DEFAULT_MS = 1500;

export function bufferPresetId(ms: number): "fast" | "balanced" | "stable" | "custom" {
  if (ms === 450) return "fast";
  if (ms === 1500) return "balanced";
  if (ms === 4000) return "stable";
  return "custom";
}

export function bufferLabel(ms: number): string {
  if (ms === 0) return "En düşük — en az gecikme (takılma riski)";
  if (ms === 300) return "0.3 saniye — ultra hızlı";
  if (ms === 450) return "Hızlı · 0.45 saniye";
  if (ms === 1500) return "Dengeli · 1.5 saniye (önerilen)";
  if (ms === 4000) return "Stabil · 4 saniye";
  const seconds = (ms / 1000).toFixed(ms % 1000 ? 1 : 0);
  return `${seconds} saniye${ms >= 4000 ? " — zayıf bağlantı" : ""}`;
}
