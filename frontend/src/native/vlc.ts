/**
 * KIZILKAN PLAYER — VLC platform facade (TypeScript + non-Metro fallback)
 * v15.0.2 BUILD FIX
 *
 * Metro Android/iOS'ta vlc.native.ts, web'de vlc.web.ts dosyasını seçer.
 * TypeScript `tsc --noEmit` ise platform suffix'lerini Metro gibi otomatik
 * çözmediği için bu suffix'siz facade tip çözümleme hedefidir. Native bağımlılığı
 * doğrudan require etmez; web bundle'a libVLC sızdırmaz.
 */
export { VlcPlayerView as VLCPlayer, DEFAULT_VLC_OPTIONS } from "@/src/components/VlcPlayerView";
export type {
  VlcPlayerHandle,
  VlcTracks,
  VlcTrack,
  VlcFirstPlayInfo,
} from "@/src/components/VlcPlayerView";

/** Runtime'da Metro native/web varyantını seçer; bu değer yalnız suffix'siz fallback içindir. */
export const VLC_AVAILABLE = false as const;
