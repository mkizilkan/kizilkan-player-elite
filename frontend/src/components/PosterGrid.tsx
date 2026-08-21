import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, FlatList, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useTVFocus, posterFocusStyle } from "@/src/hooks/useTVFocus";
import type { VodItem, SeriesItem } from "@/src/types";
import { useTv } from "@/src/store/TvContext";

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
}

export function PosterGrid({ items, onPressItem, onLongPressItem, ListHeaderComponent, emptyText, testIDPrefix = "poster" }: Props) {
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

  return (
    <FlatList
      key={COL}
      data={items}
      keyExtractor={i => i.id}
      numColumns={COL}
      ListHeaderComponent={ListHeaderComponent}
      columnWrapperStyle={{ gap: GAP, paddingHorizontal: H_PAD, marginBottom: GAP }}
      contentContainerStyle={{ paddingTop: SPACING.md, paddingBottom: SPACING.xxxl }}
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

function PosterCard({ item, width, height, testIDPrefix, onPress, onLongPress }: { item: any; width: number; height: number; testIDPrefix: string; onPress: () => void; onLongPress?: () => void }) {
  const { colors } = useTheme();
  const { isFocused, onFocus, onBlur } = useTVFocus();
  return (
    <TouchableOpacity
      testID={`${testIDPrefix}-${item.id}`}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      onFocus={onFocus}
      onBlur={onBlur}
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
