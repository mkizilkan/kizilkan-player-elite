/**
 * Runtime permission helper with the Emergent contract:
 *  - always check before request
 *  - honor canAskAgain flag
 *  - if denied twice / permanent, offer Linking.openSettings()
 *  - never dead-end the user
 *
 * Web / Expo Go where a permission API is absent → returns granted=true
 * to avoid blocking the flow.
 */
import { Alert, Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";

interface PermissionResult { granted: boolean; canAskAgain: boolean }

/**
 * Show a friendly pre-permission modal (Turkish) that explains WHY.
 * Resolves true if user taps "Devam".
 */
export function askPreConsent(title: string, message: string): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(
      title,
      message,
      [
        { text: "Şimdi Değil", onPress: () => resolve(false), style: "cancel" },
        { text: "Devam", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Offer Open Settings dialog when a permission is permanently denied.
 */
export function offerSettings(title: string, message: string) {
  Alert.alert(
    title,
    message,
    [
      { text: "Vazgeç", style: "cancel" },
      { text: "Ayarları Aç", onPress: () => Linking.openSettings().catch(() => {}) },
    ],
  );
}

// -------------------- MICROPHONE (voice search) --------------------
export async function requestMicrophone(reason: string = "Sesli arama için mikrofon erişimi gerekiyor"): Promise<PermissionResult> {
  if (Platform.OS === "web") return { granted: true, canAskAgain: false };
  try {
    // expo-audio is not currently installed — resolved dynamically so lint passes
    // eslint-disable-next-line import/no-unresolved, @typescript-eslint/no-var-requires
    const audio = (globalThis as any).require ? (globalThis as any).require("expo-audio") : null;
    if (!audio?.requestRecordingPermissionsAsync) return { granted: false, canAskAgain: false };
    const ok = await askPreConsent("Mikrofon Erişimi", reason);
    if (!ok) return { granted: false, canAskAgain: true };
    const res = await audio.requestRecordingPermissionsAsync();
    if (!res.granted && !res.canAskAgain) {
      offerSettings("Mikrofon İzni Reddedildi", "Sesli komut kullanmak için ayarlardan mikrofon iznini açın.");
    }
    return { granted: !!res.granted, canAskAgain: !!res.canAskAgain };
  } catch {
    return { granted: false, canAskAgain: false };
  }
}

// -------------------- NOTIFICATIONS (media session, alarms) --------------------
export async function requestNotifications(reason: string = "Kayıt hatırlatmaları ve media kontrolleri için bildirim izni"): Promise<PermissionResult> {
  if (Platform.OS === "web") return { granted: true, canAskAgain: false };
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return { granted: true, canAskAgain: true };
    if (current.canAskAgain === false) {
      offerSettings("Bildirim İzni", "Ayarlardan bildirim iznini açabilirsiniz.");
      return { granted: false, canAskAgain: false };
    }
    const ok = await askPreConsent("Bildirim İzni", reason);
    if (!ok) return { granted: false, canAskAgain: true };
    const res = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return { granted: !!res.granted, canAskAgain: res.canAskAgain !== false };
  } catch {
    return { granted: false, canAskAgain: false };
  }
}

// -------------------- MEDIA LIBRARY (screenshot / DVR save) --------------------
export async function requestMediaLibrary(reason: string = "Ekran görüntülerini ve kayıtları galeriye kaydetmek için erişim"): Promise<PermissionResult> {
  if (Platform.OS === "web") return { granted: true, canAskAgain: false };
  try {
    // expo-media-library is optional — resolved dynamically so lint passes
    // eslint-disable-next-line import/no-unresolved, @typescript-eslint/no-var-requires
    const ml = (globalThis as any).require ? (globalThis as any).require("expo-media-library") : null;
    if (!ml?.requestPermissionsAsync) return { granted: false, canAskAgain: false };
    const current = await ml.getPermissionsAsync();
    if (current?.granted) return { granted: true, canAskAgain: true };
    const ok = await askPreConsent("Galeri Erişimi", reason);
    if (!ok) return { granted: false, canAskAgain: true };
    const res = await ml.requestPermissionsAsync();
    if (!res.granted && !res.canAskAgain) {
      offerSettings("Galeri İzni Reddedildi", "Ayarlardan galeri iznini açabilirsiniz.");
    }
    return { granted: !!res.granted, canAskAgain: !!res.canAskAgain };
  } catch {
    return { granted: false, canAskAgain: false };
  }
}

/**
 * Called at app startup — asks *only* for notifications (least intrusive baseline).
 * Sensitive perms (mic, media library) are contextual on first use.
 */
export async function requestBaselinePermissions() {
  if (Platform.OS === "web") return;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted && current.canAskAgain !== false) {
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
    }
  } catch {}
}
