/**
 * KIZILKAN PLAYER — Kategori Paneli
 * Dosya  : frontend/src/components/CategoryPanel.tsx
 * Sürüm  : v1.0.0 (v5.0.0)
 *
 * ===========================================================================
 * NE İŞE YARIYOR?
 * ===========================================================================
 * IPTV Extreme Pro'daki gibi TAM EKRAN kategori gezgini.
 *
 * ESKİ SORUN: Kategoriler yatay bir şeritti. 50+ kategoride sağa sağa kaydırmak
 * çok zordu; TV Box'ta kumandayla neredeyse imkânsızdı.
 *
 * YENİ: Üstte bölüm sekmeleri (CANLI / FİLMLER / DİZİLER), altta DİKEY ve
 * kaydırılabilir kategori listesi. Her kategoride öğe sayısı yazar.
 * - Parmakla kaydırma
 * - Kumanda yön tuşları (her satır focusable, ilk satır otomatik odakta)
 * - Çok kategori varsa arama kutusu ile süzme
 * ===========================================================================
 */

import React, { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { useTVFocus, rowFocusStyle } from "@/src/hooks/useTVFocus";
import { useFocusScroll } from "@/src/hooks/useFocusScroll";
import { useTv } from "@/src/store/TvContext";

export type SectionKey = "live" | "vod" | "series";

export interface CategoryEntry {
  /** Kategori adı ("TÜMÜ" özel değeri dahil). */
  name: string;
  /** Bu kategorideki öğe sayısı. */
  count: number;
  /** Kullanıcının kendi oluşturduğu grup mu? (üstte ve yıldızlı gösterilir) */
  custom?: boolean;
}

interface Props {
  visible: boolean;
  /** Aktif bölüm (canlı/film/dizi). */
  section: SectionKey;
  /** Bölüm başına öğe sayıları (sekme etiketleri için). */
  sectionCounts: { live: number; vod: number; series: number };
  categories: CategoryEntry[];
  selected: string;
  /** Favori sayısı (0 ise satır gizlenir). */
  favoriteCount?: number;
  onSelectSection: (s: SectionKey) => void;
  onSelectCategory: (name: string) => void;
  /** Özel gruba uzun basınca (yönetim menüsü için). */
  onLongPressCategory?: (name: string) => void;
  /** "Favoriler" satırına basıldığında. */
  onSelectFavorites?: () => void;
  onClose: () => void;
}

const SECTIONS: { key: SectionKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "live", label: "CANLI", icon: "tv" },
  { key: "vod", label: "FİLMLER", icon: "film" },
  { key: "series", label: "DİZİLER", icon: "albums" },
];

export function CategoryPanel({
  visible,
  section,
  sectionCounts,
  categories,
  selected,
  favoriteCount = 0,
  onSelectSection,
  onSelectCategory,
  onLongPressCategory,
  onSelectFavorites,
  onClose,
}: Props) {
  const { isTv: isTvLayout } = useTv();
  // TV: odaklanan kategori ekranda kalsın + panel açılınca ilk öğe odakta (v7.3.0)
  const { listRef, onItemFocus, onScrollToIndexFailed } = useFocusScroll<any>();
  const { colors } = useTheme();
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return categories;
    return categories.filter(c => c.name.toLocaleLowerCase("tr").includes(q));
  }, [categories, query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/* v15.0.1 BUILD FIX: panel zemini geçerli ThemePalette.surface tokenına bağlıdır. */}
      <View style={[styles.root, { backgroundColor: colors.surface }]}>
        {/* Başlık */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.onSurface }]}>Kategoriler</Text>
          <TouchableOpacity testID="category-close-btn" onPress={onClose} hitSlop={12} focusable>
            <Ionicons name="close" size={26} color={colors.onSurface} />
          </TouchableOpacity>
        </View>

        {/* Bölüm sekmeleri */}
        <View style={styles.tabRow}>
          {SECTIONS.map(s => {
            const active = section === s.key;
            const count = sectionCounts[s.key] || 0;
            return (
              <TouchableOpacity
                key={s.key}
                testID={`category-section-${s.key}`}
                focusable
                activeOpacity={0.8}
                onPress={() => onSelectSection(s.key)}
                style={[
                  styles.tab,
                  {
                    backgroundColor: active ? colors.brandPrimary : colors.surfaceSecondary,
                    borderColor: active ? colors.brandPrimary : colors.border,
                  },
                ]}
              >
                <Ionicons
                  name={s.icon}
                  size={16}
                  color={active ? colors.onBrandPrimary : colors.onSurfaceSecondary}
                />
                <Text
                  style={[
                    styles.tabText,
                    { color: active ? colors.onBrandPrimary : colors.onSurfaceSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {s.label}
                </Text>
                <Text
                  style={[
                    styles.tabCount,
                    { color: active ? colors.onBrandPrimary : colors.onSurfaceTertiary },
                  ]}
                >
                  {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Arama — çok kategori varsa çok işe yarar */}
        {categories.length > 8 && (
          <View style={[styles.searchBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color={colors.onSurfaceSecondary} />
            <TextInput
              testID="category-search-input"
              value={query}
              onChangeText={setQuery}
              placeholder="Kategori ara..."
              placeholderTextColor={colors.onSurfaceTertiary}
              style={[styles.searchInput, { color: colors.onSurface }]}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")} hitSlop={10} focusable>
                <Ionicons name="close-circle" size={18} color={colors.onSurfaceSecondary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Kategori listesi — DİKEY, kaydırılabilir, kumanda uyumlu */}
        <FlatList
          ref={listRef}
          onScrollToIndexFailed={onScrollToIndexFailed}
          data={shown}
          keyExtractor={(item) => item.name}
          initialNumToRender={20}
          windowSize={10}
          // PDF Bulgu 1 (v7.0.0): removeClippedSubviews Android TV'de odak
      // görünürlüğünü bozuyor (odak kaybı, ölçek/gölge kesilmesi).
      // TV'de KAPALI, telefonda AÇIK (performans için gerekli).
      removeClippedSubviews={!isTvLayout}
          contentContainerStyle={{ paddingBottom: SPACING.xl }}
          ListHeaderComponent={
            favoriteCount > 0 && onSelectFavorites ? (
              <Pressable
                testID="category-favorites"
                focusable
                onPress={() => { onSelectFavorites(); onClose(); }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: pressed ? colors.surfaceTertiary : colors.surfaceSecondary,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons name="heart" size={20} color={colors.brandPrimary} />
                <Text style={[styles.rowText, { color: colors.onSurface }]}>FAVORİLER</Text>
                <Text style={[styles.rowCount, { color: colors.onSurfaceTertiary }]}>{favoriteCount}</Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item, index }) => (
            <CategoryRow
              item={item}
              active={item.name === selected}
              first={index === 0}
              onPress={() => { onSelectCategory(item.name); onClose(); }}
              onLongPress={item.custom && onLongPressCategory ? () => onLongPressCategory(item.name) : undefined}
              onFocusItem={() => isTvLayout && onItemFocus(index)}
            />
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.onSurfaceSecondary }]}>
              Kategori bulunamadı
            </Text>
          }
        />
      </View>
    </Modal>
  );
}

/**
 * Tek kategori satırı — TV KUMANDA ODAĞI destekli (v5.2.0).
 * Odaklanınca kalın çerçeve + parlama + hafif büyüme uygulanır ki kullanıcı
 * 2-3 metre uzaktan nerede olduğunu net görsün.
 */
function CategoryRow({
  item, active, first, onPress, onLongPress, onFocusItem,
}: {
  item: CategoryEntry;
  active: boolean;
  first: boolean;
  /** TV: bu satır odaklandığında listeyi kaydır. */
  onFocusItem?: () => void;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { colors } = useTheme();
  const { isFocused, onFocus, onBlur } = useTVFocus();

  return (
    <Pressable
      testID={`category-row-${item.name}`}
      focusable
      hasTVPreferredFocus={first}
      onFocus={() => { onFocus(); onFocusItem?.(); }}
      onBlur={onBlur}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: active
            ? colors.brandPrimary + "22"
            : pressed
            ? colors.surfaceTertiary
            : colors.surfaceSecondary,
          borderColor: active ? colors.brandPrimary : colors.border,
        },
        rowFocusStyle(colors.brandPrimary, isFocused),
      ]}
    >
      <Ionicons
        name={item.custom ? "star" : active ? "radio-button-on" : "radio-button-off"}
        size={18}
        color={item.custom ? "#FFB300" : active ? colors.brandPrimary : colors.onSurfaceTertiary}
      />
      <Text
        style={[styles.rowText, { color: active ? colors.brandPrimary : colors.onSurface }]}
        numberOfLines={1}
      >
        {item.name}
      </Text>
      <Text style={[styles.rowCount, { color: colors.onSurfaceTertiary }]}>{item.count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: SPACING.xl },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, borderBottomWidth: 1,
  },
  title: { fontSize: FONT.size.xl, fontWeight: FONT.weight.bold },
  tabRow: {
    flexDirection: "row", gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, paddingVertical: 10, borderRadius: RADIUS.pill, borderWidth: 1,
  },
  tabText: { fontSize: FONT.size.xs, fontWeight: FONT.weight.bold },
  tabCount: { fontSize: FONT.size.xs, fontWeight: FONT.weight.semibold },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    marginHorizontal: SPACING.lg, marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md, height: 44,
    borderRadius: RADIUS.md, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: FONT.size.base, paddingVertical: 0 },
  row: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    marginHorizontal: SPACING.lg, marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: 14,
    borderRadius: RADIUS.md, borderWidth: 1,
  },
  rowText: { flex: 1, fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  rowCount: { fontSize: FONT.size.sm, fontWeight: FONT.weight.bold },
  empty: { textAlign: "center", marginTop: SPACING.xl, fontSize: FONT.size.base },
});

export default CategoryPanel;
