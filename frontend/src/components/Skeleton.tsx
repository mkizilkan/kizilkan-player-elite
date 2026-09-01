/**
 * Skeleton loader — animated shimmer using react-native-reanimated.
 * Web-safe (falls back to a static block).
 */
import React, { useEffect } from "react";
import { View, StyleSheet, Platform, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useTheme } from "@/src/theme/ThemeContext";
import { RADIUS } from "@/src/theme/themes";

interface Props {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = "100%", height = 20, radius = RADIUS.sm, style }: Props) {
  const { colors } = useTheme();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [shimmer]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: 0.15 + shimmer.value * 0.35,
  }));

  return (
    <View
      style={[
        styles.base,
        { width: width as any, height, borderRadius: radius, backgroundColor: colors.surfaceTertiary },
        style,
      ]}
    >
      {Platform.OS !== "web" && (
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: colors.surfaceSecondary, borderRadius: radius },
            overlayStyle,
          ]}
        />
      )}
    </View>
  );
}

export function ChannelRowSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.rowSkel, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <Skeleton width={56} height={56} radius={RADIUS.sm} />
      <View style={{ flex: 1, gap: 8, marginLeft: 12 }}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="90%" height={11} />
        <Skeleton width="30%" height={9} />
      </View>
    </View>
  );
}

export function PosterSkeleton({ width = 110, height = 165 }: { width?: number; height?: number }) {
  return (
    <View style={{ gap: 6 }}>
      <Skeleton width={width} height={height} radius={RADIUS.md} />
      <Skeleton width={width * 0.8} height={11} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { overflow: "hidden" },
  rowSkel: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: 8,
  },
});
