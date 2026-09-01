/**
 * Haptic feedback wrapper. Safe on Web (no-op) and gracefully handles errors.
 */
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

export const haptic = {
  light: () => {
    if (isWeb) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  },
  medium: () => {
    if (isWeb) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
  },
  heavy: () => {
    if (isWeb) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
  },
  soft: () => {
    if (isWeb) return;
    try { Haptics.selectionAsync(); } catch {}
  },
  success: () => {
    if (isWeb) return;
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  },
  warning: () => {
    if (isWeb) return;
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
  },
  error: () => {
    if (isWeb) return;
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
  },
};
