/**
 * KIZILKAN PLAYER — Kök Yerleşim (Root Layout)
 * Dosya   : frontend/app/_layout.tsx
 * Sürüm   : v4.3.0  (önceki: v4.2.0)
 * Faz     : FAZ A / Madde 5
 *
 * ---------------------------------------------------------------------------
 * BU SÜRÜMDE NE DEĞİŞTİ
 * ---------------------------------------------------------------------------
 * [+] ErrorBoundary eklendi — tüm ağacın EN DIŞINDA. Render hatası artık
 *     beyaz ekran yerine Türkçe, aksiyon alınabilir bir ekran gösteriyor.
 * [-] LogBox.ignoreAllLogs(true) KALDIRILDI. Bu satır tüm sarı uyarıları ve
 *     hata kutularını bastırıyordu; gerçek sorunlar görünmez hale geliyordu.
 * [~] SplashScreen.preventAutoHideAsync() artık .catch() ile korunuyor
 *     (yakalanmamış promise reddi uyarısını engeller).
 * [~] Bildirim izni için kurulan setTimeout artık temizleniyor (memory leak
 *     ve unmount sonrası state güncellemesi riski kaldırıldı).
 * [+] "+not-found" rotası Stack'e kaydedildi.
 *
 * KORUNANLAR (hiçbiri değişmedi):
 *   - 8 Provider'ın tamamı ve İÇ İÇE GEÇME SIRASI birebir aynı
 *   - 21 Stack.Screen kaydının tamamı, aynı sırayla, aynı options ile
 *   - useIconFonts yükleme mantığı ve erken return davranışı
 *   - registerQuickActions + requestBaselinePermissions (3 sn gecikme dahil)
 *   - StatusBar style="light", screenOptions headerShown:false / animation:"fade"
 * ---------------------------------------------------------------------------
 */

import { Stack, usePathname, useRouter, useSegments } from "expo-router";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, type ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";
import { ThemeProvider } from "@/src/theme/ThemeContext";
import { ProfileProvider, useProfiles } from "@/src/store/ProfileContext";
import { PlaylistProvider } from "@/src/store/PlaylistContext";
import { ParentalProvider } from "@/src/store/ParentalContext";
import { LibraryProvider } from "@/src/store/LibraryContext";
import { DownloadProvider } from "@/src/store/DownloadContext";
import { registerQuickActions } from "@/src/utils/quickActions";
import { requestBaselinePermissions } from "@/src/utils/permissions";
import { prepareExternalStream } from "@/src/utils/externalOpen";
import { AppState, View } from "react-native";
import { PlayerProvider } from "@/src/player/PlayerContext";
import PlayerHost from "@/src/player/PlayerHost";
import { TvProvider, useTv } from "@/src/store/TvContext";
import { markAppBackground, markAppForeground, persistAppPath } from "@/src/utils/appSession";

// Açılış ekranı, fontlar hazır olana kadar ekranda kalsın.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* bazı platformlarda çağrı zaten yapılmış olabilir — yoksayılabilir */
});


const PROFILE_GATE_EXEMPT_PATHS = new Set(["/", "/welcome", "/profile-select"]);

function ProfileSessionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeProfile, isLoading, sessionAuthorizedProfileId } = useProfiles();
  const blocked = !isLoading && !PROFILE_GATE_EXEMPT_PATHS.has(pathname) && !!activeProfile?.hasPin && sessionAuthorizedProfileId !== activeProfile.id;
  useEffect(() => {
    if (blocked) router.replace("/profile-select");
  }, [blocked, router]);
  // PIN korumalı route bir frame bile görünmesin; redirect tamamlanana kadar siyah bariyer.
  if (blocked) return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  return <>{children}</>;
}

/** Bildirim izni istemeden önce beklenen süre (kullanıcı splash'i görsün). */
const PERMISSION_PROMPT_DELAY_MS = 3000;

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const sessionPath = segments[0] === "(tabs)" && pathname === "/" ? "/(tabs)" : pathname;
  const pathnameRef = useRef(sessionPath);
  pathnameRef.current = sessionPath;

  /**
   * "ŞUNUNLA AÇ" DESTEĞİ (v4.9.0)
   * Başka bir uygulama bize bir video gönderdiğinde (Android intent) burada
   * yakalanır, geçici harici yayın kaydına çevrilir ve player açılır.
   */
  useEffect(() => {
    if (!loaded && !error) return;
    let cancelled = false;

    const open = async (url: string | null) => {
      if (!url || cancelled) return;
      const prepared = await prepareExternalStream(url);
      if (prepared && !cancelled) {
        router.push({ pathname: "/player", params: { id: prepared.id, ext: prepared.ext } });
      }
    };

    // Uygulama kapalıyken açıldıysa
    Linking.getInitialURL().then(open).catch(() => {});
    // Uygulama açıkken gelen bağlantı
    const sub = Linking.addEventListener("url", (e) => { open(e.url); });

    return () => { cancelled = true; try { sub.remove(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, error]);

  useEffect(() => {
    if (!loaded && !error) return;
    void persistAppPath(sessionPath);
  }, [sessionPath, loaded, error]);

  useEffect(() => {
    if (!loaded && !error) return;
    const sub = AppState.addEventListener("change", state => {
      if (state === "background" || state === "inactive") {
        void markAppBackground(pathnameRef.current);
      } else if (state === "active") {
        void markAppForeground(pathnameRef.current);
      }
    });
    return () => sub.remove();
  }, [loaded, error]);

  useEffect(() => {
    if (!loaded && !error) return;

    SplashScreen.hideAsync().catch(() => {});
    registerQuickActions();

    // Kullanıcıya splash'i görecek kadar zaman tanıyıp izni nazikçe iste.
    const timer = setTimeout(() => {
      requestBaselinePermissions().catch(() => {});
    }, PERMISSION_PROMPT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
        <SafeAreaProvider>
          {/* SAĞLAYICI SIRASI (v8.5.0)
              ProfileProvider EN DIŞTA; hem tema hem TV arayüzü ayarı PROFİLE
              ÖZEL olduğu için ikisi de aktif profili bilmek zorunda.
              Bağımlılık kontrolü yapıldı: ProfileContext ne temayı ne de TV
              bağlamını kullanıyor, bu yüzden sıra değişimi güvenli. */}
          <ProfileProvider>
          <ProfileSessionGate>
          <TvProvider>
          <ThemeProvider>
              <PlaylistProvider>
                <ParentalProvider>
                  <LibraryProvider>
                    <DownloadProvider>
                      <PlayerProvider>
                      <StatusBar style="light" />
                      {/*
                        TV OVERSCAN NOTU (v7.7.0'da KALDIRILDI)
                        Eskiden burada TvSafeArea tüm uygulamayı 24px iç boşlukla
                        sarıyordu. İKİ CİDDİ YAN ETKİ yarattı:
                          1) VİDEO tam ekran olamıyordu -> televizyonda kenarda
                             çerçeve kalıyordu (kullanıcı bildirdi)
                          2) Liste alanı daralıyordu -> ekrana daha az kanal
                             sığıyordu
                        Overscan artık YALNIZCA menü ekranlarında, ihtiyaç olan
                        yerde uygulanıyor; video ve listeler tam alanı kullanıyor.
                      */}
                      <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
                        <Stack.Screen name="index" />
                        <Stack.Screen name="onboarding" />
                        <Stack.Screen name="tv-home" />
                        {/* v8.8.0 + v9.8.0: Oynatıcı ekranının arka planı SİYAH.
                            Eskiden Stack'in varsayılan arka planı tema rengiydi;
                            video yüklenirken üstte tema renginde bir şerit
                            görünüyordu (Türk Bayrağı temasında kırmızı).
                            v9.8.0 KRİTİK: Bu ekran AŞAĞIDA İKİNCİ KEZ de kayıtlıydı
                            ve orada contentStyle YOKTU; react-navigation son kaydı
                            kullandığı için siyah arka plan SESSİZCE eziliyor, şerit
                            geri geliyordu. İki kayıt TEK kayıtta birleştirildi. */}
                        <Stack.Screen
                          name="player"
                          options={{
                            contentStyle: { backgroundColor: "#000" },
                            /* v9.12.0: fade → none. Fade sırasında player yarı
                               saydamken ALTINDAKİ temalı sekme navigatörü sızıp
                               üstte tema renginde bir şerit/tint bırakıyordu
                               (zap/panel açınca re-layout ile gidiyordu). Anında
                               opak geçiş bu bleed-through'u kökten keser. */
                            animation: "none",
                            orientation: "default",
                          }}
                        />
                        <Stack.Screen name="profile-select" />
                        <Stack.Screen name="playlist-select" />
                        <Stack.Screen name="pin-entry" options={{ presentation: "modal", animation: "fade" }} />
                        <Stack.Screen name="add-playlist" options={{ presentation: "modal" }} />
                        <Stack.Screen name="edit-playlist" options={{ presentation: "modal" }} />
                        <Stack.Screen name="(tabs)" />
                        <Stack.Screen name="multi-view" options={{ animation: "fade", orientation: "default" }} />
                        <Stack.Screen name="detail" options={{ animation: "slide_from_right" }} />
                        <Stack.Screen name="epg" options={{ presentation: "modal" }} />
                        <Stack.Screen name="epg-timeline" options={{ orientation: "default" }} />
                        <Stack.Screen name="backup" options={{ presentation: "modal" }} />
                        <Stack.Screen name="catchup" options={{ presentation: "modal" }} />
                        <Stack.Screen name="stats" options={{ presentation: "modal" }} />
                        <Stack.Screen name="hidden-manager" options={{ presentation: "modal" }} />
                        <Stack.Screen name="hidden-pin" options={{ presentation: "modal", animation: "fade" }} />
                        <Stack.Screen name="diagnostic" options={{ presentation: "modal" }} />
                        <Stack.Screen name="downloads" options={{ presentation: "modal" }} />
                        <Stack.Screen name="+not-found" options={{ animation: "fade" }} />
                      </Stack>
                      {/* YOL B / v15: KALICI PLAYER — her zaman mount.
                          Görünürken opak siyah player katmanı Stack üstündedir.
                          Gizliyken alpha/zIndex kullanılmaz; PlayerHost ekran dışına
                          taşınır ve dokunma geçirir. Böylece Android TV SurfaceView
                          hole-punch/alpha kompozisyonunda tema rengi şerit/tint
                          olarak sızamaz; surface de gereksiz detach edilmez. */}
                      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
                        <PlayerHost />
                      </View>
                      </PlayerProvider>
                    </DownloadProvider>
                  </LibraryProvider>
                </ParentalProvider>
              </PlaylistProvider>
            </ThemeProvider>
          </TvProvider>
          </ProfileSessionGate>
          </ProfileProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

