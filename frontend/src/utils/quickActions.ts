/**
 * Home Screen Quick Actions (iOS 3D Touch, Android app-icon shortcuts).
 * Requires a development / production build (native module) — in Expo Go it's a safe no-op.
 * The user launches the action from the OS home screen; we route it inside the app.
 */
import * as QuickActions from "expo-quick-actions";
import { router } from "expo-router";
import { Platform } from "react-native";

const ITEMS: any[] = [
  {
    id: "search",
    title: "Ara",
    subtitle: "Kanal • Film • Dizi",
    icon: Platform.select({ ios: "symbol:magnifyingglass", android: "search" }),
    params: { href: "/(tabs)/search" },
  },
  {
    id: "favorites",
    title: "Favoriler",
    subtitle: "Favori kanallarım",
    icon: Platform.select({ ios: "symbol:heart.fill", android: "heart" }),
    params: { href: "/(tabs)/favorites" },
  },
  {
    id: "epg",
    title: "TV Rehberi",
    subtitle: "7 günlük EPG",
    icon: Platform.select({ ios: "symbol:calendar", android: "calendar" }),
    params: { href: "/epg-timeline" },
  },
  {
    id: "multi-view",
    title: "Çoklu Ekran",
    subtitle: "2–4 kanal aynı anda",
    icon: Platform.select({ ios: "symbol:square.grid.2x2.fill", android: "grid" }),
    params: { href: "/multi-view" },
  },
];

let listener: any = null;

export async function registerQuickActions() {
  if (Platform.OS === "web") return;
  try {
    await QuickActions.setItems(ITEMS);
    if (listener) return;
    listener = QuickActions.addListener((action) => {
      const href = action?.params?.href as string | undefined;
      if (href) {
        // Slight delay so the router is ready
        setTimeout(() => {
          try { router.push(href as any); } catch {}
        }, 250);
      }
    });
    // Handle case where app was launched from a quick action
    // v15.0.1 BUILD FIX: async callback öncesi href sabitlenir; nullable params narrowing kaybolmaz.
    const initialHref = QuickActions.initial?.params?.href as string | undefined;
    if (initialHref) {
      setTimeout(() => {
        try { router.push(initialHref as any); } catch {}
      }, 500);
    }
  } catch {
    // Expo Go / unsupported — silent
  }
}

export function unregisterQuickActions() {
  try { listener?.remove?.(); } catch {}
  listener = null;
}
