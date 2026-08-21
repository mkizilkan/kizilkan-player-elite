/**
 * KIZILKAN PLAYER — Bulunamayan Rota (404)
 * Dosya   : frontend/app/+not-found.tsx
 * Sürüm   : v1.0.0
 * Faz     : FAZ A / Madde 6
 *
 * ---------------------------------------------------------------------------
 * NE ZAMAN GÖRÜNÜR?
 * ---------------------------------------------------------------------------
 * expo-router, tanımlı olmayan bir yola gidildiğinde bu ekranı gösterir.
 * Gerçek hayatta üç durumda karşımıza çıkar:
 *
 *   1. Derin bağlantı (deep link): kizilkan://olmayan-sayfa
 *   2. Ana Ekran Kısayolları (expo-quick-actions) — quickActions.ts'teki bir
 *      hedef rota yeniden adlandırılırsa kullanıcı buraya düşer.
 *   3. Kodda router.push("/yanlis-yol") gibi bir yazım hatası.
 *
 * Bu dosya olmadan expo-router kendi İngilizce, temasız varsayılan ekranını
 * gösterir — uygulamanın geri kalanıyla uyumsuz görünür ve TV kumandasıyla
 * çıkılamaz. Bu sürüm temalı, Türkçe ve D-pad ile kullanılabilir.
 * ---------------------------------------------------------------------------
 */

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";

export default function NotFoundScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();

  const goHome = () => {
    // replace: kullanıcı geri tuşuyla tekrar 404'e düşmesin.
    router.replace("/");
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      goHome();
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Sayfa Bulunamadı", headerShown: false }} />
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.surface }]}
        edges={["top", "bottom"]}
        testID="not-found-screen"
      >
        <View style={styles.wrap}>
          <View style={[styles.iconWrap, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Ionicons name="compass-outline" size={44} color={colors.brandPrimary} />
          </View>

          <Text style={[styles.code, { color: colors.brandPrimary }]}>404</Text>
          <Text style={[styles.title, { color: colors.onSurface }]}>Böyle bir sayfa yok</Text>
          <Text style={[styles.subtitle, { color: colors.onSurfaceSecondary }]}>
            Aradığın ekran taşınmış veya hiç var olmamış olabilir.
          </Text>

          {pathname ? (
            <View style={[styles.pathBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Text style={[styles.pathLabel, { color: colors.onSurfaceTertiary }]}>İSTENEN YOL</Text>
              <Text style={[styles.pathValue, { color: colors.onSurfaceSecondary }]} numberOfLines={2} selectable>
                {pathname}
              </Text>
            </View>
          ) : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              testID="not-found-home-btn"
              onPress={goHome}
              activeOpacity={0.85}
              focusable
              hasTVPreferredFocus
              style={[styles.button, { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
            >
              <Ionicons name="home" size={18} color={colors.onBrandPrimary} />
              <Text style={[styles.buttonText, { color: colors.onBrandPrimary }]}>Ana Ekran</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="not-found-back-btn"
              onPress={goBack}
              activeOpacity={0.85}
              focusable
              style={[styles.button, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <Ionicons name="chevron-back" size={18} color={colors.onSurface} />
              <Text style={[styles.buttonText, { color: colors.onSurface }]}>Geri Dön</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
    gap: SPACING.sm,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  code: {
    fontSize: FONT.size.xxxl,
    fontWeight: FONT.weight.black,
    letterSpacing: 4,
  },
  title: {
    fontSize: FONT.size.xl,
    fontWeight: FONT.weight.bold,
    textAlign: "center",
  },
  subtitle: {
    fontSize: FONT.size.base,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: SPACING.md,
  },
  pathBox: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 4,
  },
  pathLabel: {
    fontSize: FONT.size.xs,
    fontWeight: FONT.weight.bold,
    letterSpacing: 1,
  },
  pathValue: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.semibold,
  },
  buttonRow: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: SPACING.lg,
    width: "100%",
    maxWidth: 420,
  },
  button: {
    flex: 1,
    height: 50,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
  },
  buttonText: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.bold,
  },
});
