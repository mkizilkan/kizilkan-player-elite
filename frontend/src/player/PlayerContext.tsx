/**
 * KIZILKAN PLAYER — Kalıcı Player Durumu (YOL B / FAZ 1)
 *
 * Amaç: player'ı navigasyon yığınından çıkarıp KÖK seviyede her zaman mount
 * edilen bir katman yapmak. Böylece kanal açmak "yeni ekran mount" değil,
 * sadece bu context'teki kaynağı değiştirmek olur (zap gibi). Video yüzeyi
 * hiç yeniden-attach olmadığı için arkadaki temalı ekran sızamaz → şerit/tint
 * kökten biter.
 *
 * source === null  → player gizli/boşta (yüzey bağlı kalır ama görünmez).
 * source !== null  → player görünür, o kanalı oynatır.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type PlayerSessionKind = "live" | "vod" | "series" | "catchup" | "external";

/** v17.0.0 — Player navigation/focus scope. Büyük katalog taşınmaz; yalnız sorgu bağlamı. */
export type PlayerNavigationContext = {
  origin?: "library" | "search" | "favorites" | "tv-home" | "detail" | "epg" | "unknown";
  group?: string;
  search?: string;
  wrap?: boolean;
  focusKey?: string;
  /** Favori/özel grup gibi provider groupName ile ifade edilemeyen sıralar için hafif ID-scope anahtarı. */
  scopeKey?: string;
  /** Series episode navigation için Detail ekranının ürettiği küçük komşu sözleşmesi. */
  syntheticPreviousId?: string;
  syntheticNextId?: string;
};

export type PlayerSource = {
  id: string;
  ext?: string;
  kind: PlayerSessionKind;
  /** VOD/series için kullanıcının seçtiği başlangıç konumu (saniye). */
  resumeAt?: number;
  nav?: PlayerNavigationContext;
} | null;

function inferSessionKind(id: string, ext?: string): PlayerSessionKind {
  if (ext !== "true") return "live";
  if (id.startsWith("vodplay-")) return "vod";
  if (id.startsWith("epplay-")) return "series";
  if (id.startsWith("catchup-")) return "catchup";
  return "external";
}

type PlayerContextValue = {
  source: PlayerSource;
  visible: boolean;
  openPlayer: (s: { id: string; ext?: string; kind?: PlayerSessionKind; resumeAt?: number; nav?: PlayerNavigationContext }) => void;
  closePlayer: () => void;
  switchChannel: (id: string, nav?: PlayerNavigationContext) => void;
  switchContent: (s: { id: string; ext?: string; kind: PlayerSessionKind; nav?: PlayerNavigationContext }) => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [source, setSource] = useState<PlayerSource>(null);

  const openPlayer = useCallback((s: { id: string; ext?: string; kind?: PlayerSessionKind; resumeAt?: number; nav?: PlayerNavigationContext }) => {
    const kind = s.kind ?? inferSessionKind(s.id, s.ext);
    const resumeAt = Number.isFinite(Number(s.resumeAt)) ? Math.max(0, Number(s.resumeAt)) : undefined;
    setSource({ id: s.id, ext: s.ext, kind, ...(resumeAt ? { resumeAt } : {}), ...(s.nav ? { nav: s.nav } : {}) });
  }, []);

  const closePlayer = useCallback(() => {
    setSource(null);
  }, []);

  // Zap: katmanı yeniden mount ETME, sadece kanal id'sini değiştir.
  const switchChannel = useCallback((id: string, nav?: PlayerNavigationContext) => {
    // Zap yalnız canlı kanallarda kullanılır. Önceki VOD/ext bayrağını
    // taşımak eski synthetic oturumu yeni kanala sızdırıyordu. Navigation scope korunur.
    setSource(prev => ({ id, ext: undefined, kind: "live", ...(nav || prev?.nav ? { nav: nav || prev?.nav } : {}) }));
  }, []);

  const switchContent = useCallback((s: { id: string; ext?: string; kind: PlayerSessionKind; nav?: PlayerNavigationContext }) => {
    setSource(prev => ({ id: s.id, ext: s.ext, kind: s.kind, ...(s.nav || prev?.nav ? { nav: s.nav || prev?.nav } : {}) }));
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({ source, visible: source !== null, openPlayer, closePlayer, switchChannel, switchContent }),
    [source, openPlayer, closePlayer, switchChannel, switchContent]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer, PlayerProvider içinde kullanılmalı");
  return ctx;
}
