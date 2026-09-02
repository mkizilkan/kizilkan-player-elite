/**
 * KIZILKAN PLAYER — TV Kumanda Medya Tuşları (JS tarafı)
 * Dosya  : frontend/src/hooks/useRemoteKeys.ts
 * Sürüm  : v1.0.0 (v6.4.0)
 *
 * plugins/withTvRemoteKeys.js tarafından MainActivity'ye enjekte edilen
 * native kod, yakaladığı tuşları "KizilkanRemoteKey" olayı olarak gönderir.
 * Bu hook o olayları dinler.
 *
 * GÜVENLİ: Eklenti çalışmasa veya cihazda o tuşlar olmasa bile hiçbir hata
 * oluşmaz — sadece olay hiç gelmez.
 */

import { useEffect, useRef } from "react";
import { DeviceEventEmitter, Platform } from "react-native";

export type RemoteKey =
  | "channelUp"
  | "channelDown"
  /** MEDIA_NEXT/PREVIOUS, CH+/- ile aynı değildir: VOD/Series context-aware gezinir. */
  | "contentNext"
  | "contentPrevious"
  | "playPause"
  | "play"
  | "pause"
  | "stop"
  | "forward"
  | "rewind"
  | "info"
  | "guide"
  /** D-pad sol/sağ — liste içinden menülere çıkış için (v7.4.0). */
  | "dpadLeft"
  | "dpadRight"
  | "dpadUp"
  | "dpadDown"
  /** OK / Enter / D-pad center — player kontrollerini açma/seçme. */
  | "select"
  /** Geri tuşu BASILI TUTULDU — kanal listesine dön (v7.6.0). */
  | "backLongPress"
  | "digit0" | "digit1" | "digit2" | "digit3" | "digit4"
  | "digit5" | "digit6" | "digit7" | "digit8" | "digit9";

export type RemoteKeyHandlers = Partial<Record<RemoteKey, () => void>>;

/**
 * Kumanda medya tuşlarını dinler.
 * @param handlers Tuş adı -> yapılacak iş
 * @param enabled  false ise dinleme yapılmaz (ör. ekran odakta değilken)
 */
export function useRemoteKeys(handlers: RemoteKeyHandlers, enabled = true) {
  // Handler'ları ref'te tutuyoruz: her render'da dinleyiciyi yeniden
  // kurmaya gerek kalmasın, ama her zaman GÜNCEL fonksiyon çağrılsın.
  const ref = useRef<RemoteKeyHandlers>(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled || Platform.OS !== "android") return;

    const sub = DeviceEventEmitter.addListener(
      "KizilkanRemoteKey",
      (e: { key?: string }) => {
        const key = e?.key as RemoteKey | undefined;
        if (!key) return;
        const fn = ref.current[key];
        if (fn) {
          try { fn(); } catch { /* tek bir tuş hatası uygulamayı bozmasın */ }
        }
      }
    );

    return () => sub.remove();
  }, [enabled]);
}
