/**
 * KIZILKAN PLAYER — VLC Motoru (expo-libvlc-player sarmalayıcı)
 * Dosya   : frontend/src/components/VlcPlayerView.tsx
 * Sürüm   : v1.0.0
 * Faz     : Player Motoru ADIM 2a
 *
 * ===========================================================================
 * NE İŞE YARIYOR?
 * ===========================================================================
 * expo-libvlc-player'ın LibVlcPlayerView'ını, player.tsx'in kolayca
 * kullanabileceği temiz bir arayüzle sarar. Asıl güç burada:
 *
 * 1) GÜÇLÜ libVLC OPTIONS (codec + ağ): "diğer player'ların açamadığını açma"
 *    - --network-caching: ağ tamponu (donmayı azaltır)
 *    - --http-reconnect / --http-continuous: kopan yayını yeniden kurar
 *    - Geniş codec desteği (VLC her formatı açar: HEVC, AV1, VP9, exotic audio)
 *
 * 2) GERÇEK HATA MESAJI (onEncounteredError): eski motordaki "[object Object]"
 *    yerine anlamlı mesaj.
 *
 * 3) BUFFER GÖSTERGESİ (onBuffering): gerçek yüklenme yüzdesi.
 *
 * Track seçimi UI + DVR kaydı (record) ADIM 2b'de eklenecek — bu bileşen
 * onESAdded ile parça listesini şimdiden dışarı veriyor (hazır olsun diye).
 * ===========================================================================
 */

import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
// Yeni motor. Adım 1'de paketin derlendiği doğrulandı.
import { LibVlcPlayerView, type LibVlcPlayerViewRef, type MediaTracks } from "expo-libvlc-player";

export interface VlcTrack {
  id: number;
  name: string;
}
export interface VlcTracks {
  audio: VlcTrack[];
  video: VlcTrack[];
  subtitle: VlcTrack[];
}

export interface VlcPlayerHandle {
  play: () => void;
  pause: () => void;
  stop: () => void;
  /** Zaman (ms) veya konum (0..1) ile sar. */
  seek: (value: number, type?: "time" | "position") => void;
  /** DVR kaydı başlat/durdur (ADIM 2b'de UI'ya bağlanacak). */
  record: (dir?: string) => Promise<void>;
  /** Ekran görüntüsü al (dosya yolu). */
  snapshot: (path: string) => Promise<void>;
}

interface Props {
  uri: string;
  /** Ek libVLC options (üstüne eklenir). */
  extraOptions?: string[];
  /** Ağ tamponu (ms) — kullanıcı ayarı. */
  bufferMs?: number;
  /** Donanım hızlandırma — kullanıcı ayarı. */
  hardwareAccel?: boolean;
  /** Ses gecikmesi (ms). Pozitif = ses geç gelsin. */
  audioDelayMs?: number;
  /** İstemci kimliği — bazı sağlayıcılar belirli bir UA istiyor. */
  userAgent?: string;
  paused?: boolean;
  rate?: number;
  volume?: number;
  contentFit?: "contain" | "cover" | "fill";
  /** Seçili parçalar. ÜÇÜ DE gerekli (native taraf eksik alanı 0 yapar). */
  tracks?: { audio: number; video: number; subtitle: number };
  onBuffering?: (progress: number) => void;
  onPlaying?: () => void;
  onPaused?: () => void;
  onError?: (message: string) => void;
  /** Kayıt durumu/dosya yolu değişince (v7.8.0). */
  onRecordChanged?: (e: { path: string | null; isRecording: boolean }) => void;
  onTimeChanged?: (ms: number) => void;
  onTracks?: (tracks: VlcTracks) => void;
  /** Snapshot gerçekten oluşturulduğunda native dosya yolu. */
  onSnapshotTaken?: (e: { path: string }) => void;
  /** İlk oynatmada medya bilgisi (boyut, süre). */
  onFirstPlay?: (info: { width: number; height: number; length: number; seekable: boolean }) => void;
}

/**
 * IPTV için optimize edilmiş varsayılan libVLC parametreleri.
 * "Diğer player'ların açamadığını açma" + AKICI oynatma hedefinin kalbi.
 *
 * v4.8.3 — TAKILMA DÜZELTMESİ:
 * Paket native tarafta media.setHWDecoderEnabled() ÇAĞIRMIYOR, yani donanım
 * hızlandırma kendiliğinden açılmıyordu; 1080p yayınlar CPU ile çözülünce
 * görüntü ve ses kesik kesik oluyordu. Donanım çözücüyü ve IPTV/TS akışları
 * için gereken saat ayarlarını media option olarak veriyoruz.
 */
/**
 * libVLC parametrelerini kullanıcı ayarlarına göre üretir.
 *
 * @param bufferMs      Ağ tamponu (ms). Yüksek = daha az takılma, geç açılış.
 * @param hardwareAccel Donanım hızlandırma. Kapalıysa yazılım çözücü kullanılır
 *                      (bazı eski/uyumsuz cihazlarda görüntü sorunu çözer).
 */
export function buildVlcOptions(
  bufferMs = 1500,
  hardwareAccel = true,
  audioDelayMs = 0,
  userAgent = "VLC/3.0.20 LibVLC/3.0.20",
): string[] {
  const opts: string[] = [
    // --- Ağ tamponu ---
    `--network-caching=${bufferMs}`,
    `--live-caching=${bufferMs}`,
    `--file-caching=${bufferMs}`,
    "--http-reconnect",
    "--http-continuous",
    // İSTEMCİ KİMLİĞİ (v5.4.0): Birçok IPTV sağlayıcısı isteği User-Agent'a
    // göre süzüyor; kimliksiz istekleri reddedebiliyor. Xtream API
    // çağrılarımızda bunu zaten gönderiyorduk, oynatmada GÖNDERMİYORDUK.
    `--http-user-agent=${userAgent}`,

    // --- IPTV/MPEG-TS akıcılığı ---
    // Canlı TS akışlarında sunucu saati ile oynatıcı saati oynaşır; VLC'nin
    // sürekli saat düzeltmesi mikro-donmalara sebep olur.
    "--clock-jitter=0",
    "--clock-synchro=0",

    // --- Görsel ---
    "--no-video-title-show",
  ];

  if (hardwareAccel) {
    // DONANIM HIZLANDIRMA (varsayılan): Android donanım çözücüleri.
    // Sonuna "none" KOYMUYORUZ ki desteklenmeyen codec'te yazılıma düşebilsin.
    opts.push(
      "--codec=mediacodec_ndk,mediacodec_jni",
      "--avcodec-hw=any",
      "--avcodec-fast",
      "--avcodec-skiploopfilter=4",
    );
  } else {
    // YAZILIM ÇÖZÜCÜ: donanım çözücüde bozuk görüntü/yeşil ekran yaşayan
    // cihazlar için. Daha çok CPU kullanır ama uyumluluğu en yüksektir.
    opts.push(
      "--codec=avcodec",
      "--avcodec-hw=none",
    );
  }
  // Yazılım çözümlemede tüm çekirdekleri kullan.
  opts.push("--avcodec-threads=0");

  // SES GECİKMESİ (A/V senkron) — bazı IPTV yayınlarında ses görüntüden
  // önce/sonra gelir. libVLC'de bu media option ile düzeltilir (milisaniye).
  // NOT: Media oluşturulurken uygulanır; değişince kanal yeniden açılmalıdır.
  if (audioDelayMs && Number.isFinite(audioDelayMs) && audioDelayMs !== 0) {
    opts.push(`--audio-desync=${Math.round(audioDelayMs)}`);
  }

  return opts;
}

/** Geriye dönük uyumluluk: varsayılan ayarlarla parametre listesi. */
export const DEFAULT_VLC_OPTIONS: string[] = buildVlcOptions();

export const VlcPlayerView = forwardRef<VlcPlayerHandle, Props>(function VlcPlayerView(
  {
    uri, extraOptions, bufferMs = 1500, hardwareAccel = true, audioDelayMs = 0, userAgent, paused, rate = 1, volume = 100, contentFit = "contain",
    tracks, onBuffering, onPlaying, onPaused, onError, onRecordChanged, onTimeChanged, onTracks, onSnapshotTaken, onFirstPlay,
  },
  ref
) {
  const innerRef = useRef<LibVlcPlayerViewRef>(null);

  useImperativeHandle(ref, () => ({
    play: () => { innerRef.current?.play().catch(() => {}); },
    pause: () => { innerRef.current?.pause().catch(() => {}); },
    stop: () => { innerRef.current?.stop().catch(() => {}); },
    seek: (value, type = "time") => { innerRef.current?.seek(value, type).catch(() => {}); },
    /**
     * v7.7.0: Hatalar artık YUTULMUYOR — çağıran tarafa iletiliyor.
     * Eskiden .catch(() => {}) ile sessizce yutuluyordu; bu yüzden kayıt
     * başarısız olduğunda kullanıcı sebebini HİÇ göremiyordu.
     */
    record: (dir) => innerRef.current?.record(dir) ?? Promise.resolve(),
    snapshot: (path) => innerRef.current?.snapshot(path) ?? Promise.resolve(),
  }), []);

  const options = React.useMemo(() => {
    const base = buildVlcOptions(bufferMs, hardwareAccel, audioDelayMs, userAgent);
    return extraOptions ? [...base, ...extraOptions] : base;
  }, [bufferMs, hardwareAccel, audioDelayMs, userAgent, extraOptions]);

  /**
   * KRİTİK GÜVENLİK (v4.8.2 düzeltmesi):
   * Native taraftaki Tracks kaydı eksik alanları 0'a düşürüyor
   * (Kotlin: audio: Int = 0, video: Int = 0, subtitle: Int = 0) ve ardından
   * setAudioTrack(0) / setVideoTrack(0) çağırıyor. libVLC'de 0 diye bir track
   * ID'si YOKTUR -> ses kapanır, video kapanır, oynatma hata verir.
   *
   * Bu yüzden tracks'i SADECE kullanıcı gerçekten bir parça seçtiyse ve
   * DEĞERLER TAM ise gönderiyoruz. Aksi halde prop hiç verilmez.
   */
  const safeTracks = React.useMemo(() =>
    tracks &&
    typeof tracks.audio === "number" &&
    typeof tracks.video === "number" &&
    typeof tracks.subtitle === "number"
      ? { audio: tracks.audio, video: tracks.video, subtitle: tracks.subtitle }
      : undefined,
    [tracks?.audio, tracks?.video, tracks?.subtitle],
  );

  return (
    <View style={styles.container}>
      <LibVlcPlayerView
        ref={innerRef}
        source={uri}
        options={options}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        rate={rate}
        volume={volume}
        autoplay={!paused}
        tracks={safeTracks}
        onBuffering={(e) => onBuffering?.(e.progress)}
        onPlaying={() => onPlaying?.()}
        onPaused={() => onPaused?.()}
        onRecordChanged={(e: any) => {
          // Paket olayı { path, isRecording } döndürür.
          onRecordChanged?.({
            path: e?.path ?? e?.nativeEvent?.path ?? null,
            isRecording: !!(e?.isRecording ?? e?.nativeEvent?.isRecording),
          });
        }}
        onSnapshotTaken={(e: any) => {
          const path = String(e?.path ?? e?.nativeEvent?.path ?? "");
          if (path) onSnapshotTaken?.({ path });
        }}
        onEncounteredError={(e) => {
          // GERÇEK hata mesajı — "[object Object]" değil.
          const msg = e?.message || "Bilinmeyen oynatma hatası";
          onError?.(String(msg));
        }}
        onTimeChanged={(e) => onTimeChanged?.(e.value)}
        onESAdded={(e: MediaTracks) => {
          // Parça listesi hazır — ADIM 2b'de seçim UI'sına verilecek.
          onTracks?.({
            audio: e.audio || [],
            video: e.video || [],
            subtitle: e.subtitle || [],
          });
        }}
        onFirstPlay={(e) => onFirstPlay?.({ width: e.width, height: e.height, length: e.length, seekable: !!e.seekable })}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
});

export default VlcPlayerView;
