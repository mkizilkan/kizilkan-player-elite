/**
 * KIZILKAN PLAYER — Liste Yenileme
 * Dosya  : frontend/src/utils/refreshPlaylist.ts
 * Sürüm  : v1.0.0 (v4.9.0)
 *
 * Bir listenin içeriğini kaynağından yeniden çeker (kanallar, filmler, diziler).
 * TAMAMEN CİHAZ-İÇİ — backend kullanmaz. Xtream'de üç istek paralel gider.
 *
 * v9.6.0: Stalker/MAC de artık cihaz-içi yenileniyor (src/utils/stalker.ts).
 */

import {
  fetchAndParseM3U,
  xtreamLogin,
  xtreamLiveStreams,
  xtreamVod,
  xtreamSeries,
} from "./iptv";
import type { Playlist } from "@/src/types";
import { resolveBoundPanel } from "@/src/utils/serverCode";

export type RefreshPhase = "dns" | "login" | "content" | "save" | "done" | "error";
export type RefreshProgress = {
  phase: RefreshPhase;
  message: string;
  live?: "waiting" | "done" | "error";
  vod?: "waiting" | "done" | "error";
  series?: "waiting" | "done" | "error";
  liveCount?: number; vodCount?: number; seriesCount?: number;
};

export interface RefreshResult {
  ok: boolean;
  /** updatePlaylist'e verilecek alanlar. */
  patch?: Partial<Playlist>;
  /** Kullanıcıya gösterilecek özet. */
  message: string;
}

export async function refreshPlaylistContent(pl: Playlist, onProgress?: (p: RefreshProgress) => void): Promise<RefreshResult> {
  try {
    if (pl.source === "xtream") {
      if (!pl.xtreamServer || !pl.xtreamUsername || !pl.xtreamPassword) {
        return { ok: false, message: "Xtream bilgileri eksik." };
      }
      let resolvedServer = pl.xtreamServer;
      let bindingPatch = pl.serverCodeBinding;
      onProgress?.({ phase: "dns", message: "DNS kontrol ediliyor..." });

      /**
       * GPT v10.5.1 — SELF-HEALING DNS
       * Sunucu Kodu/Panel Rehberi üzerinden eklenen playlist, kullanıcı seçtiği
       * panel kimliğine kalıcı bağlıysa her yenilemede Firebase'deki o panelin
       * güncel hostlarını çözer. Aynı kullanıcı/şifre başka panelde çalışsa bile
       * oraya geçmez.
       *
       * Rehber geçici erişilemezse çalışan mevcut DNS'i bozmayız; normal Xtream
       * login aşağıda mevcut server ile devam eder.
       */
      if (pl.serverCodeBinding?.autoResolve) {
        try {
          const bound = await resolveBoundPanel(
            pl.serverCodeBinding.codeSource,
            {
              code: pl.serverCodeBinding.code,
              panelName: pl.serverCodeBinding.panelName,
              preferredServer: pl.serverCodeBinding.preferredServer || pl.xtreamServer,
              validatedHosts: pl.serverCodeBinding.validatedHosts,
            },
            pl.xtreamUsername,
            pl.xtreamPassword,
          );
          resolvedServer = bound.server;
          bindingPatch = {
            ...pl.serverCodeBinding,
            // Gerçekte çalışan güncel DNS artık yeni preferredServer olur.
            preferredServer: bound.server,
            validatedHosts: Array.from(new Set([bound.server, ...bound.hosts])),
            lastResolvedServer: bound.server,
            lastResolvedAt: new Date().toISOString(),
          };
        } catch {
          // Firebase/rehber hatası playlist'i kullanılmaz hale getirmesin.
          // Mevcut kayıtlı DNS aşağıdaki gerçek login'de sınanır.
        }
      }

      const cred = {
        server: resolvedServer,
        username: pl.xtreamUsername,
        password: pl.xtreamPassword,
      };

      onProgress?.({ phase: "login", message: "Hesap doğrulanıyor..." });
      const login = await xtreamLogin(cred);

      // Üç içerik isteği PARALEL. Her biri bittiğinde ilerleme ayrı raporlanır.
      const state: RefreshProgress = {
        phase: "content", message: "İçerikler paralel yükleniyor...",
        live: "waiting", vod: "waiting", series: "waiting",
      };
      const emit = () => onProgress?.({ ...state });
      emit();
      const livePromise = xtreamLiveStreams(cred).then((value) => {
        state.live = "done"; state.liveCount = value.length; emit(); return value;
      }).catch((e) => { state.live = "error"; emit(); throw e; });
      const vodPromise = xtreamVod(cred).then((value) => {
        state.vod = "done"; state.vodCount = value.length; emit(); return value;
      }).catch((e) => { state.vod = "error"; emit(); throw e; });
      const seriesPromise = xtreamSeries(cred).then((value) => {
        state.series = "done"; state.seriesCount = value.length; emit(); return value;
      }).catch((e) => { state.series = "error"; emit(); throw e; });
      const [chRes, vodRes, serRes] = await Promise.allSettled([livePromise, vodPromise, seriesPromise]);
      const channels = chRes.status === "fulfilled" ? chRes.value : [];
      const vod = vodRes.status === "fulfilled" ? vodRes.value : [];
      const series = serRes.status === "fulfilled" ? serRes.value : [];

      if (chRes.status === "rejected" && vod.length === 0 && series.length === 0) {
        return { ok: false, message: "Sunucuya ulaşılamadı veya içerik alınamadı." };
      }

      onProgress?.({ phase: "save", message: "İndirilen içerik kayda hazırlanıyor...", live: chRes.status === "fulfilled" ? "done" : "error", vod: vodRes.status === "fulfilled" ? "done" : "error", series: serRes.status === "fulfilled" ? "done" : "error", liveCount: channels.length, vodCount: vod.length, seriesCount: series.length });
      return {
        ok: true,
        patch: {
          channels,
          vod,
          series,
          accountInfo: login.user_info as any,
          serverInfo: (login.server_info || null) as any,
          ...(resolvedServer !== pl.xtreamServer ? { xtreamServer: resolvedServer } : {}),
          ...(bindingPatch ? { serverCodeBinding: bindingPatch } : {}),
        },
        message: `${channels.length} kanal • ${vod.length} film • ${series.length} dizi güncellendi${resolvedServer !== pl.xtreamServer ? " • DNS otomatik güncellendi" : ""}`,
      };
    }

    if (pl.source === "m3u_url") {
      if (!pl.m3uUrl) return { ok: false, message: "M3U adresi yok." };
      onProgress?.({ phase: "content", message: "M3U içeriği indiriliyor..." });
      const res = await fetchAndParseM3U(pl.m3uUrl);
      const total = res.channels.length + (res.vod?.length || 0) + (res.series?.length || 0);
      if (total === 0) return { ok: false, message: "Listede içerik bulunamadı." };
      return {
        ok: true,
        patch: { channels: res.channels, vod: res.vod, series: res.series },
        message: `${res.channels.length} kanal • ${res.vod?.length || 0} film • ${res.series?.length || 0} dizi güncellendi`,
      };
    }

    if (pl.source === "m3u_file") {
      return { ok: false, message: "Dosyadan eklenen listeler yenilenemez. Dosyayı tekrar ekleyin." };
    }

    if (pl.source === "stalker") {
      /**
       * STALKER / MAG YENİLEME — ARTIK CİHAZ İÇİ (v9.6.0)
       * Eskiden "yakında" deyip hiç yenilemiyordu. Protokol zaten
       * src/utils/stalker.ts içinde cihazda çalışıyor.
       */
      if (!pl.stalkerPortal || !pl.stalkerMac) {
        return { ok: false, message: "Portal/MAC bilgisi eksik." };
      }
      const { stalkerLogin, stalkerChannels, normalizeMac } = await import("@/src/utils/stalker");
      const cred = {
        portal: pl.stalkerPortal,
        mac: normalizeMac(pl.stalkerMac),
        serial: pl.stalkerSerial || undefined,
      };
      onProgress?.({ phase: "login", message: "Portal doğrulanıyor..." });
      const { session } = await stalkerLogin(cred);
      onProgress?.({ phase: "content", message: "Kanallar yükleniyor..." });
      const channels = await stalkerChannels(cred, session);
      if (channels.length === 0) {
        return { ok: false, message: "Portal bağlandı ama kanal listesi boş." };
      }
      return {
        ok: true,
        patch: { channels },
        message: `${channels.length} kanal güncellendi`,
      };
    }

    return { ok: false, message: "Bu liste türü yenilenemiyor." };
  } catch (e: any) {
    const message = e?.message || "Yenileme başarısız.";
    onProgress?.({ phase: "error", message });
    return { ok: false, message };
  }
}
