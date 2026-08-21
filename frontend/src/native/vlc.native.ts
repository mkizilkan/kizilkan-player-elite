/**
 * KIZILKAN PLAYER — VLC Native Binding (ADIM 2a)
 *
 * Yeni motor bağlandı: expo-libvlc-player.
 * player.tsx artık VlcPlayerView bileşenini kullanıyor (güçlü options,
 * gerçek hata, buffer). Bu dosya geriye dönük uyumluluk için VlcPlayerView'ı
 * yeniden export eder.
 */
export { VlcPlayerView, DEFAULT_VLC_OPTIONS } from "@/src/components/VlcPlayerView";
export type { VlcPlayerHandle, VlcTracks, VlcTrack } from "@/src/components/VlcPlayerView";

// Geriye dönük ad (eski import'lar kırılmasın): artık gerçek bileşen var.
export { VlcPlayerView as VLCPlayer } from "@/src/components/VlcPlayerView";

/** v15.0.1 BUILD FIX: native platform capability flag; avoids truthy component checks. */
export const VLC_AVAILABLE = true as const;
