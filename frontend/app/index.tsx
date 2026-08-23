import { useEffect } from "react";
import { View, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence, Easing, withDelay,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { useProfiles } from "@/src/store/ProfileContext";
import { KizilkanLogo } from "@/src/components/KizilkanLogo";
import { getRecentResumePath } from "@/src/utils/appSession";

export default function Index() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  // v11.5.0: Ambient daire logo ile AYNI merkez noktasını kullanır.
  // Animasyon 1.3x'e kadar büyüdüğü için temel çapı safe alana göre sınırla.
  const safeDiameter = Math.min(width, height) * (Platform.isTV ? 0.58 : 0.72);
  const ambientSize = Math.max(160, Math.min(safeDiameter / 1.3, Platform.isTV ? 440 : 300));
  const { isLoading, playlists } = usePlaylists();
  const { colors, isLoading: themeLoading } = useTheme();
  const { profiles, isLoading: profilesLoading } = useProfiles();

  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  const glow = useSharedValue(0);
  const barWidth = useSharedValue(0);

  useEffect(() => {
    scale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.back(1.6)) });
    opacity.value = withTiming(1, { duration: 600 });
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
    barWidth.value = withDelay(400, withTiming(1, { duration: 1200 }));
  }, [scale, opacity, glow, barWidth]);

  useEffect(() => {
    if (isLoading || themeLoading || profilesLoading) return;
    const t = setTimeout(async () => {
      /**
       * v15.2.3 FAST START / SESSION RESTORE
       * Kısa background/process recreation sonrası kullanıcıyı tekrar profil
       * seçimine atma. Son güvenli route 15 dakika içinde ise restore edilir.
       * İlk kurulum ve gerçekten uzun cold-start davranışı eski güvenli akışta.
       *
       * TEK YÖNLENDİRİCİ (v6.0.0) — akış baştan tutarlı kuruldu.
       *
       * Eski akışta profile-setup / onboarding / add-playlist gevşek bağlıydı
       * ve profilsiz duruma düşülebiliyordu. Artık TEK kural var:
       *
       *   Hiç profil yok           -> Karşılama sihirbazı (profil + liste)
       *   Profil var, liste yok    -> Liste ekleme
       *   Profil var, liste var    -> Profil seçme (Netflix mantığı)
       *
       * "İstediğin kadar profil" korunuyor: sihirbaz yalnızca İLK profili
       * oluşturur; sonrasında profil-seçme ekranından sınırsız profil eklenir.
       */
      const hasProfile = profiles.length > 0;
      const hasPlaylist = playlists.length > 0;

      if (!hasProfile) {
        // Uygulama ilk kez açılıyor (veya profiller sıfırlandı).
        router.replace("/welcome");
      } else if (!hasPlaylist) {
        // Profil var ama hiç liste yok -> liste ekleme adımı.
        router.replace("/onboarding");
      } else {
        const resume = await getRecentResumePath();
        if (resume) {
          router.replace(resume as any);
        } else {
          // Uzun cold-start güvenlik davranışı: profil seçimi/PIN korunur.
          router.replace("/profile-select");
        }
      }
    }, 80);
    return () => clearTimeout(t);
  }, [isLoading, themeLoading, profilesLoading, profiles.length, playlists.length, router]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value * 0.85,
    transform: [{ scale: 0.9 + glow.value * 0.4 }],
  }));
  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value * 100}%`,
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="root-loader">
      {/* Ambient ve logo AYNI mutlak ekran merkezine bağlıdır. Yükleme çubuğu
          layout grubuna dahil değildir; böylece logoyu yukarı itemez. */}
      <Animated.View style={[styles.ambient, { width: ambientSize, height: ambientSize, borderRadius: ambientSize / 2, marginLeft: -ambientSize / 2, marginTop: -ambientSize / 2 }, glowStyle]} pointerEvents="none">
        <LinearGradient
          colors={[colors.brandPrimary + "40", "transparent"]}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <View style={styles.logoOverlay} pointerEvents="none">
        <Animated.View style={logoStyle}>
          <KizilkanLogo size={Platform.OS === "web" ? "lg" : "xl"} showSubtitle showIcon align="center" />
        </Animated.View>
      </View>

      {/* Neon loading bar logo merkezinin altında bağımsız konumlanır. */}
      <View style={[styles.barBg, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <Animated.View style={[styles.barFill, { backgroundColor: colors.brandPrimary }, barStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  logoOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  ambient: {
    position: "absolute",
    top: "50%",
    left: "50%",
    overflow: "hidden",
  },
  barBg: {
    position: "absolute", top: "50%", marginTop: 118,
    width: 220, height: 4, borderRadius: 2,
    overflow: "hidden", borderWidth: 1,
  },
  barFill: {
    height: "100%",
  },
});
