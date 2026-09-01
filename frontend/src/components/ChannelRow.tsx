import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { useTVFocus, rowFocusStyle } from "@/src/hooks/useTVFocus";
import { useTv } from "@/src/store/TvContext";
import { haptic } from "@/src/utils/haptic";
import type { Channel, NowNext } from "@/src/types";

interface Props {
  channel: Channel;
  onPress: () => void;
  onToggleFavorite?: () => void;
  onLongPress?: () => void;
  /** TV: bu satır odaklandığında (listeyi kaydırmak için). */
  onFocusItem?: () => void;
  /** TV: SOL tuşuna basılınca (listeden çıkış — kategori paneli). */
  onExitLeft?: () => void;
  /** TV: SAĞ tuşuna basılınca (listeden çıkış — üst araç çubuğu). */
  onExitRight?: () => void;
  isFavorite?: boolean;
  epg?: NowNext | null;
}

function timeRange(start?: string, stop?: string) {
  if (!start || !stop) return "";
  try {
    const s = new Date(start);
    const e = new Date(stop);
    const fmt = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${fmt(s)} - ${fmt(e)}`;
  } catch { return ""; }
}

function progress(start?: string, stop?: string) {
  if (!start || !stop) return 0;
  try {
    const s = new Date(start).getTime();
    const e = new Date(stop).getTime();
    const n = Date.now();
    if (n <= s) return 0;
    if (n >= e) return 1;
    return (n - s) / (e - s);
  } catch { return 0; }
}

function ChannelRowBase({ channel, onPress, onToggleFavorite, onLongPress, onFocusItem, onExitLeft, onExitRight, isFavorite, epg }: Props) {
  const { colors } = useTheme();
  const { isFocused, onFocus, onBlur } = useTVFocus();
  const { isTv: isTvLayout } = useTv();
  const longPressedRef = React.useRef(0);
  /**
   * EPG GÖSTERİMİ (v8.9.1 — kullanıcı uyarısı üzerine düzeltildi)
   *
   * v8.9.0'da TV'de EPG'yi TAMAMEN GİZLEMİŞTİM. Bu yanlıştı: özellik kaybı,
   * sözleşmenin 1. maddesine aykırı.
   *
   * ASIL SORUN: satır yüksekliği 52 px'e SABİTLENMİŞTİ ve içerik sığmıyordu.
   * DOĞRU ÇÖZÜM: satırı içeriğe göre YÜKSELTMEK.
   *   • "ŞİMDİ" + ilerleme çubuğu TV'de de GÖRÜNÜR (en değerli bilgi)
   *   • "SIRADAKİ" satırı yalnızca telefonda (TV'de yer kazandırır)
   * Böylece hem isim hem yayın bilgisi tam görünür.
   */
  const now = epg?.now;
  const next = isTvLayout ? null : epg?.next;
  const pct = progress(now?.start, now?.stop);

  return (
    <TouchableOpacity
      onPress={() => {
        // Uzun bastan sonraki 800 ms içindeki basışı yok say
        /**
         * v8.9.0: Koruma süresi 800 -> 1500 ms.
         * TV kumandalarında tuş bırakma olayı gecikmeli gelebiliyor;
         * 800 ms yetmiyordu ve uzun bastan sonra kanal yine açılıyordu.
         */
        if (Date.now() - longPressedRef.current < 1500) return;
        onPress();
      }}
      /**
       * UZUN BAS SONRASI KANAL AÇILMASI (v8.8.0 — kullanıcı bildirimi)
       * SORUN: OK'u basılı tutunca menü çıkıyor, ELİ ÇEKİNCE kanal da
       * açılıyordu. Android TV'de tuş bırakılınca onPress de tetikleniyor.
       * ÇÖZÜM: Uzun bas gerçekleştiyse işaretlenir; hemen ardından gelen
       * onPress yok sayılır.
       */
      onLongPress={onLongPress ? () => { longPressedRef.current = Date.now(); haptic.medium(); onLongPress(); } : undefined}
      delayLongPress={400}
      onFocus={() => { onFocus(); onFocusItem?.(); }}
      onBlur={onBlur}
      focusable
      activeOpacity={0.7}
      testID={`channel-row-${channel.id}`}
      style={[
        styles.row,
        { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
        // TV'de daha kompakt: ekrana daha çok kanal sığsın (v7.4.0)
        /**
         * TV KOMPAKT SATIR (v7.8.0)
         * Kullanıcı bildirimi: ekrana sadece 3.5 kanal sığıyordu.
         * Dolgu ve logo küçültüldü; hedef 8-9 kanal.
         */
        /**
         * TV'DE SABİT YÜKSEKLİK (v8.3.0) — KRİTİK
         * SORUN: EPG bilgisi olan satırlar daha uzundu. getItemLayout ise
         * SABİT yükseklik varsayıyordu -> hesap tutmuyor, odak-takipli kaydırma
         * yanlış yere gidiyor ve seçili satır EKRAN DIŞINA taşıyordu.
         * ÇÖZÜM: TV'de satır yüksekliği SABİTLENDİ (EPG olsun olmasın aynı).
         */
        /**
         * TV SATIR YÜKSEKLİĞİ (v8.9.1)
         * 52 px, EPG'li içerik için yetersizdi ve isim kırpılıyordu.
         * 68 px: logo(34) + isim + "şimdi" + ilerleme çubuğu rahat sığar.
         * overflow:hidden KALDIRILDI — hiçbir şey kırpılmasın.
         * 1080p'de ekrana ~11 kanal sığar (eskiden 3.5 idi).
         */
        /**
         * TV SATIRI (v8.9.2) — GERÇEK dp HESABIYLA
         * ÖNCEKİ HATAM: 1080p'yi 1080 dp sandım. React Native ekranı
         * dp cinsinden görür: 1080p TV = 540 dp yükseklik.
         * Kanal listesine kalan alan yalnızca ~314 dp; 72 dp satırla
         * 4 kanal sığıyordu (kullanıcı 5 gördü, doğrulandı).
         * Satır 50 dp'ye indirildi; isim + "ŞİMDİ" + çubuk hâlâ sığıyor.
         */
        isTvLayout && {
          minHeight: 50,
          paddingVertical: 4,
          paddingHorizontal: SPACING.sm,
          marginBottom: 3,
          gap: SPACING.sm,
        },
        rowFocusStyle(colors.brandPrimary, isFocused, RADIUS.md),
      ]}
    >
      <View style={[
        styles.logoWrap,
        { backgroundColor: colors.surfaceTertiary },
        // TV'de logo küçültülür: ekrana daha çok kanal sığsın (v7.8.0)
        isTvLayout && { width: 30, height: 30 },
      ]}>
        {channel.logo ? (
          <Image source={{ uri: channel.logo }} style={styles.logo} resizeMode="contain" />
        ) : (
          <Ionicons name="tv-outline" size={22} color={colors.onSurfaceSecondary} />
        )}
      </View>

      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.onSurface }]} numberOfLines={1}>{channel.name}</Text>
        {now ? (
          <>
            <Text style={[styles.epgNow, { color: colors.onSurfaceSecondary }]} numberOfLines={1}>
              <Text style={{ color: colors.brandPrimary, fontWeight: FONT.weight.bold }}>ŞİMDİ • </Text>
              {now.title}
            </Text>
            <View style={[styles.progressBg, { backgroundColor: colors.surfaceTertiary }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.brandPrimary, width: `${pct * 100}%` }]} />
            </View>
            {next && (
              <Text style={[styles.epgNext, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>
                Sıradaki: {next.title} • {timeRange(next.start, next.stop)}
              </Text>
            )}
          </>
        ) : (
          <Text style={[styles.groupText, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>
            {channel.group || "Kanal"}
          </Text>
        )}
      </View>

      {onToggleFavorite && (
        <TouchableOpacity
          onPress={() => { haptic.soft(); onToggleFavorite(); }}
          hitSlop={12}
          testID={`fav-toggle-${channel.id}`}
          /**
           * TV ODAK DÜZELTMESİ (v7.4.0) — KRİTİK
           * SORUN: Kalp düğmesi de odaklanabilir olduğu için, kumandayla
           * satıra gelindiğinde odak SATIRA değil KALBE düşüyordu. OK tuşuna
           * basınca kanal açılmıyor, favori işaretleniyordu.
           * ÇÖZÜM: TV'de kalp odak alamaz; satırın tamamı tek hedef olur.
           * Favorilere ekleme TV'de uzun-bas menüsünden yapılır.
           * Telefonda dokunma normal çalışmaya devam eder.
           */
          focusable={!isTvLayout}
          importantForAccessibility={isTvLayout ? "no-hide-descendants" : "auto"}
          style={styles.favBtn}
        >
          <Ionicons
            name={isFavorite ? "heart" : "heart-outline"}
            size={22}
            color={isFavorite ? colors.brandPrimary : colors.onSurfaceSecondary}
          />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.sm,
  },
  logoWrap: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logo: { width: "100%", height: "100%" },
  info: { flex: 1, gap: 4 },
  name: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  epgNow: { fontSize: FONT.size.sm },
  epgNext: { fontSize: FONT.size.xs, marginTop: 2 },
  groupText: { fontSize: FONT.size.sm },
  progressBg: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 2,
  },
  progressFill: { height: "100%", borderRadius: 2 },
  favBtn: { padding: SPACING.xs },
});

/**
 * v8.9.0: Özel karşılaştırmalı React.memo KALDIRILDI.
 * Karşılaştırma fonksiyonu geri çağırmaları (onPress/onFocusItem) hesaba
 * katmıyordu; satırlar bayat kapanışlarla kalabiliyordu. Kazancı belirsiz,
 * riski yüksekti. Varsayılan memo (sığ karşılaştırma) yeterli ve güvenli.
 */
export const ChannelRow = React.memo(ChannelRowBase);
