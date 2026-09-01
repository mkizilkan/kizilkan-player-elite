import React, { useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ImageBackground, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { KizilkanLogo } from "@/src/components/KizilkanLogo";
import { FocusButton } from "@/src/components/FocusButton";

export default function Onboarding() {
  const router = useRouter();
  const { colors } = useTheme();
  const fade = React.useRef(new Animated.Value(0)).current;
  const scale = React.useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 40, friction: 7, useNativeDriver: true }),
    ]).start();
  }, [fade, scale]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="onboarding-screen">
      <ImageBackground
        source={{ uri: "https://images.pexels.com/photos/333850/pexels-photo-333850.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=1200&w=800" }}
        style={styles.bg}
        resizeMode="cover"
      >
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.7)", colors.surface]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          <Animated.View style={[styles.top, { opacity: fade, transform: [{ scale }] }]}>
            <KizilkanLogo size="xl" showSubtitle showIcon />
          </Animated.View>

          <Animated.View style={[styles.bottom, { opacity: fade }]}>
            <Text style={[styles.heading, { color: colors.onSurface }]}>
              Kişisel IPTV{"\n"}deneyiminiz başlıyor
            </Text>
            <Text style={[styles.sub, { color: colors.onSurfaceSecondary }]}>
              M3U, Xtream Codes API veya MAG portal ile aboneliğinize her yerden erişin. Premium player, çoklu profil, EPG, catch-up ve fazlası.
            </Text>

            <FocusButton
              testID="onboarding-add-playlist-btn"
              onPress={() => router.push("/add-playlist")}
              activeOpacity={0.85}
              style={[styles.cta, { backgroundColor: colors.brandPrimary, shadowColor: colors.brandPrimary }]}
            >
              <Ionicons name="add-circle" size={22} color={colors.onBrandPrimary} />
              <Text style={[styles.ctaText, { color: colors.onBrandPrimary }]}>
                Oynatma Listesi Ekle
              </Text>
            </FocusButton>

            <View style={styles.legalRow}>
              <Ionicons name="shield-checkmark-outline" size={14} color={colors.onSurfaceSecondary} />
              <Text style={[styles.legal, { color: colors.onSurfaceSecondary }]}>
                Yalnızca yasal aboneliğinizle kullanın.
              </Text>
            </View>
          </Animated.View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1, justifyContent: "space-between", paddingHorizontal: SPACING.xl },
  top: { paddingTop: SPACING.xxxl, alignItems: "center" },
  bottom: { paddingBottom: SPACING.xl },
  heading: { fontSize: 28, fontWeight: FONT.weight.bold, lineHeight: 34, marginBottom: SPACING.md, textAlign: "center" },
  sub: { fontSize: FONT.size.lg, lineHeight: 22, marginBottom: SPACING.xl, textAlign: "center" },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    height: 56,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.xl,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  ctaText: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: SPACING.lg,
  },
  legal: { fontSize: FONT.size.sm },
});
