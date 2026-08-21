/**
 * CastButton — Chromecast entegrasyonu
 * Sürüm : v2.0.0 (v4.9.0)
 *
 * ===========================================================================
 * v4.9.0'DA DÜZELTİLEN İKİ GERÇEK HATA
 * ===========================================================================
 * 1) CİHAZ LİSTESİ AÇILMIYORDU:
 *    Eski kod kendi butonundan `showCastDialog?.()` çağırıyordu. Bu çağrı bazı
 *    cihazlarda sessizce başarısız oluyordu (opsiyonel zincirleme yüzünden hata
 *    da görünmüyordu) -> kullanıcı titreşim hissediyor ama liste gelmiyordu.
 *    ÇÖZÜM: Google'ın resmi NATIVE CastButton bileşenini kullanıyoruz; cihaz
 *    seçiciyi işletim sistemi açıyor.
 *
 * 2) BAĞLANINCA İÇERİK GİTMİYORDU:
 *    Eski kod diyaloğu açtıktan HEMEN SONRA oturumu kontrol ediyordu. Kullanıcı
 *    cihazı seçene kadar oturum kurulmadığı için yükleme atlanıyordu.
 *    ÇÖZÜM: onSessionStarted dinleyicisi — oturum kurulunca medya yükleniyor.
 * ===========================================================================
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { FONT } from "@/src/theme/themes";
import { haptic } from "@/src/utils/haptic";
import { GoogleCast, NativeCastButton } from "@/src/native/cast";

interface CastSource {
  url: string;
  name: string;
  poster?: string | null;
  contentType?: string;
  /**
   * CANLI YAYIN MI? (v8.1.0 — KRİTİK)
   * Chromecast'e streamType bildirilmezse cihaz içeriği KAYITLI (buffered)
   * sanar, süre/konum bilgisi arar, bulamayınca oynatmayı hemen bırakır.
   * Kullanıcının gördüğü "kanal ismi gelip gidiyor" davranışının sebebi budur.
   */
  isLive?: boolean;
  /**
   * KALDIĞI YERDEN DEVAM (v8.2.0)
   * Film/dizi yayınlanırken telefondaki konumdan başlasın; kullanıcı
   * baştan izlemek zorunda kalmasın. Canlı yayında anlamsızdır.
   */
  startTimeSec?: number;
}

interface CastButtonProps {
  /**
   * Yayın bağlantısı kurulduğunda/koptuğunda bildirilir (v7.4.0).
   * Player bunu kullanarak oynatma kontrollerini TV'ye yönlendirir;
   * aksi halde telefonda sarma yapılıyor ama TV'de değişmiyordu.
   */
  onConnectionChange?: (connected: boolean, session: any) => void;
  source?: CastSource;
  size?: number;
  color?: string;
  testID?: string;
}

/** Uzantıdan MIME türü tahmin eder (Chromecast contentType ister). */
/**
 * CHROMECAST FORMAT UYUMU (v6.4.0) — KRİTİK DÜZELTME
 * ===========================================================================
 * SORUN: Televizyona yayın gönderilince sadece Chromecast logosu geliyor,
 *        görüntü/ses gelmiyordu; telefonda "Medya seçilmedi" yazıyordu.
 *
 * SEBEP: Chromecast SINIRLI format destekler:
 *   DESTEKLER    : MP4 (H.264/AAC), WebM, HLS (.m3u8), MPEG-DASH (.mpd)
 *   DESTEKLEMEZ  : ham MPEG-TS (.ts), MKV, AVI
 * Kod .ts için "video/mp2t", .mkv için "video/x-matroska" gönderiyordu.
 * Cihaz bu medyayı REDDEDİYOR -> "Medya seçilmedi".
 *
 * ÇÖZÜM:
 *   • CANLI KANALLAR: Xtream sunucuları aynı yayını .m3u8 (HLS) olarak da
 *     verir. Adresi .ts -> .m3u8 çevirip gönderiyoruz; Chromecast oynatır.
 *   • MP4 filmler: zaten destekli, dokunmuyoruz.
 *   • MKV filmler: Chromecast DONANIMSAL olarak oynatamaz. Sessizce
 *     başarısız olmak yerine kullanıcıya net mesaj veriyoruz.
 * ===========================================================================
 */

/** Chromecast'in oynatabileceği bir adrese çevirir. */
export function toCastableUrl(url: string): string {
  const clean = (url || "").split("?")[0];
  // Xtream canlı yayın: .ts -> .m3u8 (HLS). Chromecast HLS destekler.
  if (/\.ts$/i.test(clean)) {
    return url.replace(/\.ts(\?|$)/i, ".m3u8$1");
  }
  return url;
}

/**
 * MKV NOTU (v7.0.0 — düzeltme)
 * Önceki sürümde MKV'yi PEŞİNEN engelliyordum. Bu YANLIŞTI:
 * Chromecast'in klasik "Default Media Receiver"ı MKV desteklemez, ANCAK
 * Android TV tabanlı alıcılar (Homatics, Chromecast with Google TV, Shield…)
 * ExoPlayer kullanır ve MKV'yi ÇOĞU ZAMAN oynatabilir.
 *
 * Bu yüzden artık engellemiyoruz: DENİYORUZ. Cihaz reddederse hata olayı
 * yakalanıp kullanıcıya sebebi anlatılıyor. Karar cihazın.
 */
export function mkvWarning(url: string): string | null {
  const u = (url || "").toLowerCase().split("?")[0];
  if (/\.(mkv|avi|flv|wmv)$/i.test(u)) {
    return (
      "Bu içerik MKV/AVI gibi bir kapsayıcıda. Bazı yayın alıcıları bu " +
      "formatı oynatamaz.\n\nGörüntü gelmezse telefondan izlemeye devam edebilirsiniz."
    );
  }
  return null;
}

function guessMime(url: string): string {
  const u = (url || "").toLowerCase().split("?")[0];
  if (u.endsWith(".m3u8")) return "application/x-mpegURL";
  if (u.endsWith(".mpd")) return "application/dash+xml";
  if (u.endsWith(".webm")) return "video/webm";
  // .ts adresleri toCastableUrl ile .m3u8'e çevrildiği için buraya düşmez.
  return "video/mp4";
}

export function CastButton({ source, size = 24, color, testID = "cast-btn", onConnectionChange }: CastButtonProps) {
  const { colors } = useTheme();
  const [connected, setConnected] = useState(false);
  // Son kaynağı ref'te tutuyoruz: oturum kurulduğunda güncel kaynağı yükleyelim.
  const sourceRef = useRef<CastSource | undefined>(source);
  const notifyRef = useRef(onConnectionChange);
  notifyRef.current = onConnectionChange;
  const sessionRef = useRef<any>(null);
  useEffect(() => { sourceRef.current = source; }, [source]);

  /** Bağlı oturuma medyayı yükler. */
  const loadInto = async (session: any) => {
    const src = sourceRef.current;
    if (!session || !src?.url) return;

    // Canlı yayınlarda .ts -> .m3u8 (HLS) çevirimi; Chromecast HLS oynatır.
    const castUrl = toCastableUrl(src.url);

    try {
      const client = session.client || session.getClient?.();
      if (!client) {
        // Teşhis edilebilirlik (v7.2.0): eskiden burada SESSİZCE çıkılıyordu,
        // bu yüzden sorunun nerede olduğu hiç anlaşılamıyordu.
        console.warn("[Cast] oturumda medya istemcisi yok");
        Alert.alert(
          "Yayınlanamadı",
          "Yayın cihazıyla bağlantı kuruldu ama medya istemcisi alınamadı.\n\n" +
            "Cihazı kapatıp açmayı veya yeniden bağlanmayı deneyin."
        );
        return;
      }
      await client.loadMedia({
        mediaInfo: {
          contentUrl: castUrl,
          contentType: src.contentType || guessMime(castUrl),
          /**
           * STREAM TÜRÜ (v8.1.0) — CANLI YAYINLARIN OYNAMAMASININ KÖK SEBEBİ
           * Paket tipinden doğrulandı: MediaStreamType = "live" | "buffered" | "other"
           * Bildirilmezse Chromecast varsayılan olarak KAYITLI içerik sanar ve
           * canlı HLS akışını hemen bırakır.
           */
          streamType: src.isLive ? "live" : "buffered",
          metadata: {
            type: "generic",
            title: src.name,
            images: src.poster ? [{ url: src.poster }] : [],
          },
        },
        autoplay: true,
        // Film/dizide telefondaki konumdan devam et (v8.2.0)
        ...(!src.isLive && src.startTimeSec && src.startTimeSec > 5
          ? { startTime: Math.floor(src.startTimeSec) }
          : {}),
      });
      haptic.success();

      // MKV/AVI ise kullanıcıyı bilgilendir (engellemiyoruz, sadece uyarıyoruz).
      const warn = mkvWarning(src.url);
      if (warn) setTimeout(() => Alert.alert("Yayınlanıyor", warn), 800);
    } catch (e: any) {
      Alert.alert(
        "Chromecast",
        `İçerik cihaza gönderilemedi.\n\n${String(e?.message || e)}\n\n` +
          "Not: Chromecast cihazları ham .ts canlı yayınları çoğu zaman oynatamaz; " +
          "film/dizi (mp4) ve m3u8 yayınlar daha uyumludur."
      );
    }
  };

  // Oturum olaylarını dinle: bağlanınca YÜKLE (eski kodun atladığı adım).
  useEffect(() => {
    if (!GoogleCast || Platform.OS === "web") return;
    let subStart: any = null;
    let subEnd: any = null;
    let subState: any = null;
    try {
      const sm = GoogleCast.getSessionManager?.();
      subStart = sm?.onSessionStarted?.((session: any) => {
        setConnected(true);
        sessionRef.current = session;
        notifyRef.current?.(true, session);
        loadInto(session);
      });
      subEnd = sm?.onSessionEnded?.(() => { setConnected(false); sessionRef.current = null; notifyRef.current?.(false, null); });
      subState = GoogleCast.onCastStateChanged?.((state: any) => {
        setConnected(String(state || "").toLowerCase().includes("connected"));
      });
      /**
       * KÖK SEBEP DÜZELTMESİ (v7.2.0) — Chromecast'in hiç çalışmamasının sebebi
       * ---------------------------------------------------------------------
       * getCurrentCastSession() bir PROMISE döndürür (paket tipinde doğrulandı:
       *   getCurrentCastSession(): Promise<CastSession | null>)
       * Eski kod bunu doğrudan oturum sanıyordu. Promise nesnesi her zaman
       * "truthy" olduğu için if bloğu giriyor, ama session.client UNDEFINED
       * kalıyor ve loadInto sessizce return ediyordu.
       * SONUÇ: hiçbir zaman medya yüklenmiyordu -> TV'de sadece logo,
       * telefonda "Medya seçilmedi".
       * ÇÖZÜM: await ile gerçek oturumu al.
       */
      (async () => {
        try {
          const current = await sm?.getCurrentCastSession?.();
          if (current) { setConnected(true); sessionRef.current = current; notifyRef.current?.(true, current); await loadInto(current); }
        } catch (e) {
          console.warn("[Cast] mevcut oturum alınamadı:", e);
        }
      })();
    } catch (e) {
      console.warn("[Cast] oturum dinleyicileri kurulamadı:", e);
    }
    return () => {
      try { subStart?.remove?.(); subEnd?.remove?.(); subState?.remove?.(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iconColor = color || (connected ? colors.brandPrimary : "#fff");

  // NATIVE BUTON (tercih edilen): cihaz seçiciyi işletim sistemi açar.
  if (NativeCastButton && Platform.OS !== "web") {
    return (
      <View style={styles.wrap} testID={testID}>
        <NativeCastButton style={{ width: size + 6, height: size + 6, tintColor: iconColor }} tintColor={iconColor} />
        {connected && (
          <View style={[styles.badge, { backgroundColor: colors.brandPrimary }]}>
            <Text style={styles.badgeText}>ON</Text>
          </View>
        )}
      </View>
    );
  }

  // YEDEK: native bileşen yoksa kendi butonumuz + açık geri bildirim.
  const fallbackPress = async () => {
    haptic.medium();
    if (!GoogleCast || Platform.OS === "web") {
      Alert.alert("Chromecast", "Bu özellik yalnızca APK/IPA (native) sürümde çalışır.");
      return;
    }
    try {
      const shown = await GoogleCast.showCastDialog?.();
      if (shown === false || shown === undefined) {
        Alert.alert(
          "Chromecast",
          "Cihaz bulunamadı.\n\n• Telefon ve Chromecast AYNI Wi-Fi ağında olmalı\n" +
            "• Chromecast açık ve TV'de görünür olmalı\n" +
            "• VPN kullanıyorsanız kapatın"
        );
      }
    } catch (e: any) {
      Alert.alert("Chromecast Hatası", String(e?.message || e));
    }
  };

  return (
    <TouchableOpacity testID={testID} onPress={fallbackPress} hitSlop={10} style={styles.wrap}>
      <Ionicons name={connected ? "wifi" : "tv-outline"} size={size} color={iconColor} />
      {connected && (
        <View style={[styles.badge, { backgroundColor: colors.brandPrimary }]}>
          <Text style={styles.badgeText}>ON</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute", top: -4, right: -8,
    paddingHorizontal: 4, borderRadius: 6,
  },
  badgeText: { fontSize: 8, color: "#fff", fontWeight: FONT.weight.bold },
});

export default CastButton;
