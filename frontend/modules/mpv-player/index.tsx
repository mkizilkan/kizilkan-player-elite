import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { Platform, type ViewProps } from "react-native";
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core"; // v15.0.1 BUILD FIX: Expo native view API doğru paketten alınır.

export type KizilkanMpvSource = {
  url: string;
  headers?: Record<string, string>;
  bufferMs?: number;
};

export type KizilkanMpvHandle = {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  reload: () => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  seekBy: (seconds: number) => Promise<void>;
  setAudioTrack: (id: number) => Promise<void>;
  setSubtitleTrack: (id: number) => Promise<void>;
  getTracks: () => Promise<{ audio: any[]; subtitle: any[] }>;
};

export type KizilkanMpvProps = ViewProps & {
  source: KizilkanMpvSource | null;
  volume?: number;
  rate?: number;
  fit?: "contain" | "cover" | "fill";
  audioDelayMs?: number;
  onLoad?: (event: any) => void;
  onPlayingChange?: (event: any) => void;
  onBufferingChange?: (event: any) => void;
  onProgress?: (event: any) => void;
  onVideoReady?: (event: any) => void;
  onTracks?: (event: any) => void;
  onError?: (event: any) => void;
  onDiagnostic?: (event: any) => void;
};

let NativeMpvView: any = null;
let NativeMpvModule: any = null;
if (Platform.OS === "android") {
  try { NativeMpvView = requireNativeViewManager("KizilkanMpv"); } catch { NativeMpvView = null; }
  try { NativeMpvModule = requireOptionalNativeModule("KizilkanMpv"); } catch { NativeMpvModule = null; }
}

export const KIZILKAN_MPV_AVAILABLE = Platform.OS === "android" && !!NativeMpvView;
export const getKizilkanMpvRuntimeStatus = (): Record<string, any> => {
  try { return NativeMpvModule?.getRuntimeStatus?.() || { classLoaded: false, reason: "module-unavailable" }; }
  catch (e: any) { return { classLoaded: false, reason: String(e?.message || e) }; }
};

/**
 * Expo Modules View AsyncFunction'ları native view ref üzerinde çağrılır.
 * v15 öncesi taslakta yanlışlıkla module-level fonksiyon gibi çağrılmamalı.
 */
export const KizilkanMpvView = forwardRef<KizilkanMpvHandle, KizilkanMpvProps>(
  function KizilkanMpvView(props, ref) {
    const nativeRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      play: async () => { await nativeRef.current?.play?.(); },
      pause: async () => { await nativeRef.current?.pause?.(); },
      stop: async () => { await nativeRef.current?.stop?.(); },
      reload: async () => { await nativeRef.current?.reload?.(); },
      seekTo: async (seconds: number) => { await nativeRef.current?.seekTo?.(seconds); },
      seekBy: async (seconds: number) => { await nativeRef.current?.seekBy?.(seconds); },
      setAudioTrack: async (id: number) => { await nativeRef.current?.setAudioTrack?.(id); },
      setSubtitleTrack: async (id: number) => { await nativeRef.current?.setSubtitleTrack?.(id); },
      getTracks: async () =>
        (await nativeRef.current?.getTracks?.()) ?? { audio: [], subtitle: [] },
    }), []);

    if (!NativeMpvView) return null;
    return <NativeMpvView ref={nativeRef} {...props} />;
  }
);
