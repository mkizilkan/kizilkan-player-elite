import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { FONT } from "@/src/theme/themes";

interface Props {
  size?: "sm" | "md" | "lg" | "xl";
  showSubtitle?: boolean;
  showIcon?: boolean;
  align?: "center" | "left";
}

const SIZES = {
  sm: { title: 20, sub: 10, icon: 14, gap: 6, letter: 3 },
  md: { title: 28, sub: 12, icon: 18, gap: 8, letter: 4 },
  lg: { title: 44, sub: 14, icon: 28, gap: 10, letter: 6 },
  xl: { title: 60, sub: 16, icon: 36, gap: 12, letter: 8 },
};

export function KizilkanLogo({ size = "md", showSubtitle = true, showIcon = true, align = "center" }: Props) {
  const { colors } = useTheme();
  const s = SIZES[size];

  // Neon-glow effect via native text shadow (works on iOS, Android, Web)
  const glowStyle = Platform.select({
    ios: {
      textShadowColor: colors.brandPrimary,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 12,
    },
    android: {
      textShadowColor: colors.brandPrimary,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 8,
    },
    web: {
      textShadowColor: colors.brandPrimary,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 20,
    },
  });

  return (
    <View style={[styles.wrap, { alignItems: align === "center" ? "center" : "flex-start" }]} testID="kizilkan-logo">
      <View style={[styles.row, { gap: s.gap }]}>
        {showIcon && (
          <View style={[styles.iconBadge, { borderColor: colors.brandPrimary, width: s.icon + 12, height: s.icon + 12, borderRadius: (s.icon + 12) / 2 }]}>
            {/**
              * TÜRK BAYRAĞI HİLALİ (v9.4.0 — kullanıcı isteği)
              * Ionicons'un "moon" simgesi YATIK bir aydır; bayraktaki hilale
              * benzemiyordu.
              * Gerçek hilal İKİ DAİREYLE çiziliyor:
              *   1) dolu daire (marka rengi)
              *   2) üstüne SAĞA kaydırılmış, arka plan renginde ikinci daire
              * Aradaki hilal biçimi ortaya çıkar. SVG paketi GEREKMEZ
              * (yeni native paket = derleme riski).
              */}
            <View style={{ width: s.icon * 0.8, height: s.icon * 0.8 }}>
              <View
                style={{
                  position: "absolute",
                  width: s.icon * 0.8,
                  height: s.icon * 0.8,
                  borderRadius: s.icon * 0.4,
                  backgroundColor: colors.brandPrimary,
                }}
              />
              <View
                style={{
                  position: "absolute",
                  left: s.icon * 0.22,
                  top: s.icon * 0.08,
                  width: s.icon * 0.64,
                  height: s.icon * 0.64,
                  borderRadius: s.icon * 0.32,
                  backgroundColor: colors.surface,
                }}
              />
              {/* Yıldız — hilalin ağzına yerleşir */}
              <Ionicons
                name="star"
                size={s.icon * 0.26}
                color={colors.brandPrimary}
                style={{ position: "absolute", right: -s.icon * 0.06, top: s.icon * 0.27 }}
              />
            </View>
          </View>
        )}
        <Text
          style={[
            styles.title,
            glowStyle,
            {
              color: colors.brandPrimary,
              fontSize: s.title,
              letterSpacing: s.letter,
            },
          ]}
        >
          KIZILKAN
        </Text>
      </View>
      {showSubtitle && (
        <Text
          style={[
            styles.sub,
            {
              color: colors.onSurface,
              fontSize: s.sub,
              letterSpacing: s.letter * 0.6,
              marginTop: -s.gap / 2,
            },
          ]}
        >
          ★ P L A Y E R   E L I T E ★
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center" },
  iconBadge: {
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontWeight: "900",
    fontFamily: Platform.select({ ios: "Helvetica Neue", android: "sans-serif-black", default: "System" }),
  },
  sub: {
    fontWeight: "700",
    opacity: 0.9,
  },
});
