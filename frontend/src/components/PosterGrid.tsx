import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, FlatList, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useTVFocus, posterFocusStyle } from "@/src/hooks/useTVFocus";
import type { VodItem, SeriesItem } from "@/src/types";
import { useTv } from "@/src/store/TvContext";
import { useTvFocusMemory } from "@/src/store/TvFocusMemoryContext";
import { useFocusScroll } from "@/src/hooks/useFocusScroll";
import { recordDiagnostic } from "@/src/utils/diagnostics";

const H_PAD = SPACING.lg;
const GAP = SPACING.sm;

interface Props {
  items: (VodItem | SeriesItem)[];
  onPressItem: (item: VodItem | SeriesItem) => void;
  /** Uzun basma (IPTV Extreme tarzı işlem menüsü için) */
  onLongPressItem?: (item: VodItem | SeriesItem) => void;
  ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
  emptyText?: string;
  testIDPrefix?: string;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  /** v17.10.0: Player dönüş key sözleşmesi. */
  focusKeyForItem?: (item: VodItem | SeriesItem) => string;
  focusScope?: string;
  /** Explicit restore isteği; normal D-pad akışında otomatik scroll yapılmaz. */
  restoreKey?: string | null;
  onRestoreConsumed?: () => void;
}

export function PosterGrid({ items, onPressItem, onLongPressItem, ListHeaderComponent, emptyText, testIDPrefix = "poster", onEndReached, onEndReachedThreshold = 0.55, focusKeyForItem, focusScope, restoreKey, onRestoreConsumed }: Props) {
  const { isTv: isTvLayout } = useTv();
  /**
   * GPT v10.2.0:
   * v9.19'un çalışan PosterGrid ölçü/render değerleri korunur.
   * Ancak çok kolonlu grid'de +COL hareketini "ekran dışı" sanıp ikinci
   * scrollToIndex üreten useFocusScroll geri getirilmez. Android TV'nin
   * doğal FlatList/D-pad scroll'u kullanılır.
   */
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const responsive = useResponsive();
  const COL = responsive.columns.poster;
  const CARD_W = (width - H_PAD * 2 - GAP * (COL - 1)) / COL;
  const POSTER_H = CARD_W * 1.5;
  /**
   * v18.0.0 — IZGARA ORTALAMA DÜZELTMESİ:
   * Çok sütunlu FlatList SATIR sayar; eskiden scrollToIndex'e ÖĞE sırası
   * veriliyordu → hedef COL kat aşağıda kalıyor ya da "out of range" hatası
   * yutulup kaba tahmine düşülüyordu. Artık ortak centerIndex satır sırasına
   * çevirir, ölçülmemiş satırda gerçek ortalama satır yüksekliğini kullanır.
   * useFocusScroll'un yalnız ref/ortalama/başarısızlık kancası kullanılır;
   * onItemFocus (D-pad sırasında ikinci kaydırma) BİLEREK bağlanmaz.
   */
  const { listRef: gridRef, onScrollToIndexFailed, centerIndex } = useFocusScroll<VodItem | SeriesItem>();
  const onRestoreConsumedRef = useRef(onRestoreConsumed);
  onRestoreConsumedRef.current = onRestoreConsumed;
  const centeredForRef = useRef<string>("");
  const focusKeyForItemRef = useRef(focusKeyForItem);
  focusKeyForItemRef.current = focusKeyForItem;

  useEffect(() => {
    if (!restoreKey) { centeredForRef.current = ""; return; }
    const keyFor = focusKeyForItemRef.current;
    if (!keyFor || !items.length) return;
    const index = items.findIndex(item => keyFor(item) === restoreKey);
    if (index < 0) return;
    // Aynı istek + aynı konum için tekrar tekrar ortalama yapma (items her
    // sayfa yüklemesinde yeni dizi olur).
    const signature = `${restoreKey}#${index}#${COL}`;
    if (centeredForRef.current === signature) return;
    centeredForRef.current = signature;
    const t = setTimeout(() => {
      centerIndex(index, {
        numColumns: COL,
        onResult: r => {
          void recordDiagnostic("navigation", "FOCUS_RESTORE_CENTER", {
            surface: "poster-grid", key: restoreKey, index, row: r.row, columns: COL, ok: r.ok,
            attempts: r.attempts, elapsedMs: r.elapsedMs, reason: r.reason, isTv: isTvLayout,
          }, { stage: "focus-restore", outcome: r.ok ? "centered" : "failed", durationMs: r.elapsedMs });
          // Telefonda odak olayı yok: ortalama bitti = geri yükleme bitti.
          // TV'de istek, hedef kart gerçekten odak alınca kapanır (focus memory).
          if (!isTvLayout) onRestoreConsumedRef.current?.();
        },
      });
    }, 40);
    return () => clearTimeout(t);
  }, [restoreKey, items, COL, centerIndex, isTvLayout]);

  return (
    <FlatList
      ref={gridRef}
      key={COL}
      onScrollToIndexFailed={onScrollToIndexFailed}
      data={items}
      keyExtractor={i => i.id}
      numColumns={COL}
      ListHeaderComponent={ListHeaderComponent}
      columnWrapperStyle={{ gap: GAP, paddingHorizontal: H_PAD, marginBottom: GAP }}
      contentContainerStyle={{ paddingTop: SPACING.md, paddingBottom: SPACING.xxxl }}
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      /**
       * PERFORMANS (v8.8.0 — kullanıcı bildirimi: "ağır çekim gibi")
       * Aynı anda çizilen afiş sayısı düşürüldü; TV Box'ların GPU'su
       * onlarca büyük görseli aynı anda kaldıramıyordu.
       */
      /**
       * v8.9.0: v8.8.0'daki ayarlar ÇOK AGRESİFTİ (windowSize=3).
       * Ekran dışına çıkan afişler hemen siliniyor, geri gelince yeniden
       * yükleniyordu — bu da "yavaş yükleniyor" hissini ARTIRIYORDU.
       * Dengeli değerlere çekildi.
       */
      initialNumToRender={9}
      windowSize={5}
      maxToRenderPerBatch={6}
      // PDF Bulgu 1 (v7.0.0): removeClippedSubviews Android TV'de odak
      // görünürlüğünü bozuyor (odak kaybı, ölçek/gölge kesilmesi).
      // TV'de KAPALI, telefonda AÇIK (performans için gerekli).
      removeClippedSubviews={!isTvLayout}
      renderItem={({ item }) => (
        <PosterCard
          item={item}
          width={CARD_W}
          height={POSTER_H}
          testIDPrefix={testIDPrefix}
          onPress={() => onPressItem(item)}
          onLongPress={onLongPressItem ? () => onLongPressItem(item) : undefined}
          focusKey={focusKeyForItem?.(item)}
          focusScope={focusScope}
        />
      )}
      ListEmptyComponent={
        emptyText ? (
          <View style={styles.empty}>
            <Ionicons name="film-outline" size={54} color={colors.onSurfaceSecondary} />
            <Text style={[styles.emptyText, { color: colors.onSurfaceSecondary }]}>{emptyText}</Text>
          </View>
        ) : null
      }
    />
  );
}

function PosterCard({ item, width, height, testIDPrefix, onPress, onLongPress, focusKey, focusScope }: { item: any; width: number; height: number; testIDPrefix: string; onPress: () => void; onLongPress?: () => void; focusKey?: string; focusScope?: string }) {
  const { colors } = useTheme();
  const { isFocused, onFocus, onBlur } = useTVFocus();
  const focusMemory = useTvFocusMemory(focusScope);
  const focusBinding = focusMemory.bind(focusKey || `${testIDPrefix}-${item.id}`);
  // v18.0.0: geri yükleme hedefi ZATEN odaktaysa onFocus tekrar gelmez; isteği
  // burada tamamla (aksi hâlde tercihli odak 4 sn açık kalır, log "timeout" der).
  const restoreTargetAlreadyFocused = focusBinding.hasTVPreferredFocus && isFocused;
  React.useEffect(() => {
    if (restoreTargetAlreadyFocused) focusBinding.rememberFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreTargetAlreadyFocused]);
  return (
    <TouchableOpacity
      testID={`${testIDPrefix}-${item.id}`}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      onFocus={() => { onFocus(); focusBinding.rememberFocus(); }}
      onBlur={onBlur}
      hasTVPreferredFocus={focusBinding.hasTVPreferredFocus}
      activeOpacity={0.8}
      focusable
      // AFİŞ BÜYÜTMESİ (v6.4.0): TV'de odaklanan afiş belirgin şekilde büyür
      style={[{ width }, posterFocusStyle(colors.brandPrimary, isFocused, RADIUS.md)]}
    >
      <View style={[styles.poster, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, height }]}>
        {item.poster ? (
          <Image source={{ uri: item.poster }} style={styles.posterImg} resizeMode="cover" />
        ) : (
          <View style={styles.posterFallback}>
            <Ionicons name="film-outline" size={30} color={colors.onSurfaceSecondary} />
          </View>
        )}
        {"rating_5based" in item && item.rating_5based ? (
          <View style={styles.ratingTag}>
            <Ionicons name="star" size={10} color="#FFD700" />
            <Text style={styles.ratingText}>{Number(item.rating_5based).toFixed(1)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.name, { color: colors.onSurface }]} numberOfLines={2}>{item.name}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  poster: {
    width: "100%",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  posterImg: { width: "100%", height: "100%" },
  posterFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  ratingTag: {
    position: "absolute", top: 6, right: 6,
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  ratingText: { color: "#fff", fontSize: FONT.size.xs, fontWeight: FONT.weight.bold },
  name: {
    marginTop: 6, fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold, minHeight: 34,
  },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: SPACING.xxxl, gap: SPACING.md },
  emptyText: { fontSize: FONT.size.base },
});
