/**
 * KIZILKAN PLAYER — Karşılama Sihirbazı (İlk Açılış)
 * Dosya  : frontend/app/welcome.tsx
 * Sürüm  : v1.0.0 (v6.0.0)
 *
 * ===========================================================================
 * NE SORUNU ÇÖZÜYOR?
 * ===========================================================================
 * Eski akış parça parçaydı: profile-setup -> onboarding -> add-playlist,
 * hepsi gevşek bağlıydı ve profilsiz duruma düşülebiliyordu (kullanıcı boş
 * "Oynatma Listesi Ekle" ekranında takılıyordu).
 *
 * YENİ: TEK ekranda, iki net adım (Netflix mantığı: önce kim, sonra ne):
 *   Adım 1 — İLK PROFİL: ad + renk + isteğe bağlı PIN
 *   Adım 2 — İLK LİSTE : mevcut, kanıtlanmış add-playlist ekranına devret
 *
 * "İstediğin kadar profil" korunur: bu sihirbaz YALNIZCA ilk profili oluşturur.
 * Sonrasında "Kim izliyor?" ekranındaki + ile sınırsız profil eklenir.
 *
 * NOT: Liste ekleme mantığını (M3U/Xtream/MAG) BURADA TEKRARLAMIYORUZ; o kod
 * karmaşık ve iyi çalışıyor. Adım 1 bitince kullanıcı add-playlist'e geçer,
 * o da bitince ana ekrana gider. Böylece kanıtlanmış kod korunur.
 * ===========================================================================
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { useProfiles } from "@/src/store/ProfileContext";
import { useTv } from "@/src/store/TvContext";
import { useTVFocus, focusStyle } from "@/src/hooks/useTVFocus";
import { isValidPinFormat, ensureRecoveryCode } from "@/src/utils/pin";
import { haptic } from "@/src/utils/haptic";

const COLORS = ["#E30A17", "#FB8C00", "#43A047", "#1E88E5", "#8E24AA", "#EC407A", "#00ACC1", "#FDD835"];

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { isTv, overscan } = useTv();
  const { profiles, addProfile } = useProfiles();

  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const canContinue = name.trim().length > 0 && !busy;

  /**
   * Adım 1 tamam: profili oluştur, sonra liste ekleme adımına geç.
   * Profil oluşturma ATOMİK (PIN dahil) — v5.9.0'daki bayat-closure hatası
   * bu yolda da yaşanmasın diye.
   */
  const createProfileAndContinue = async () => {
    if (!canContinue) return;
    setBusy(true);
    try {
      const wantPin = pin.trim();
      if (wantPin) {
        const fmt = isValidPinFormat(wantPin);
        if (!fmt.ok) {
          setBusy(false);
          Alert.alert("Geçersiz PIN", fmt.error || "PIN 4-10 rakam olmalı.");
          return;
        }
      }

      // Zaten bir profil varsa (ör. geri gelinmişse) yenisini oluşturma.
      if (profiles.length === 0) {
        await addProfile(name.trim(), color, false, wantPin || null);
        if (wantPin) {
          try { await ensureRecoveryCode(); } catch { /* kritik değil */ }
        }
      }

      haptic.success();
      // Adım 2: kanıtlanmış liste ekleme ekranı. Oradan ana ekrana gidilir.
      router.replace("/add-playlist");
    } catch (e: any) {
      Alert.alert("Profil oluşturulamadı", String(e?.message || e) + "\n\nLütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };

  // v15.0.1 BUILD FIX: ThemePalette ana zemin tokenı `surface`.
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.surface, padding: SPACING.lg + overscan }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xxxl }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Marka + adım göstergesi */}
          <View style={styles.header}>
            <Text style={[styles.brand, { color: colors.brandPrimary }]}>KIZILKAN</Text>
            <View style={styles.steps}>
              <View style={[styles.stepDot, { backgroundColor: colors.brandPrimary }]} />
              <View style={[styles.stepLine, { backgroundColor: colors.border }]} />
              <View style={[styles.stepDot, { backgroundColor: colors.border }]} />
            </View>
            <Text style={[styles.title, { color: colors.onSurface, fontSize: isTv ? 30 : 24 }]}>
              Profilinizi oluşturun
            </Text>
            <Text style={[styles.sub, { color: colors.onSurfaceSecondary }]}>
              Adım 1/2 — Her profilin kendi listesi, favorileri ve geçmişi olur.
              Sonra istediğiniz kadar profil ekleyebilirsiniz.
            </Text>
          </View>

          {/* İsim */}
          <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>PROFİL ADI</Text>
          <TextInput
            testID="welcome-name-input"
            value={name}
            onChangeText={setName}
            placeholder="Örn: Ali, Anne, Çocuk"
            placeholderTextColor={colors.onSurfaceTertiary}
            autoFocus={!isTv}
            style={[styles.input, { color: colors.onSurface, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, fontSize: isTv ? 20 : FONT.size.base }]}
          />

          {/* Renk */}
          <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>AVATAR RENGİ</Text>
          <View style={styles.colorRow}>
            {COLORS.map(c => (
              <ColorDot key={c} color={c} selected={color === c} onPress={() => setColor(c)} accent={colors.onSurface} />
            ))}
          </View>

          {/* PIN */}
          <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>PIN (İSTEĞE BAĞLI — 4-10 RAKAM)</Text>
          <TextInput
            testID="welcome-pin-input"
            value={pin}
            onChangeText={(t) => setPin(t.replace(/[^0-9]/g, "").slice(0, 10))}
            placeholder="Boş bırakırsanız kilit olmaz"
            placeholderTextColor={colors.onSurfaceTertiary}
            keyboardType="number-pad"
            secureTextEntry
            style={[styles.input, { color: colors.onSurface, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, fontSize: isTv ? 20 : FONT.size.base }]}
          />

          <ContinueButton
            enabled={canContinue}
            label={busy ? "Oluşturuluyor..." : "Devam Et — Liste Ekle"}
            accent={colors.brandPrimary}
            textColor={colors.onBrandPrimary}
            onPress={createProfileAndContinue}
            big={isTv}
          />

          <Text style={[styles.legal, { color: colors.onSurfaceTertiary }]}>
            Yalnızca yasal aboneliğinizle kullanın.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ColorDot({ color, selected, onPress, accent }: { color: string; selected: boolean; onPress: () => void; accent: string }) {
  const { isFocused, onFocus, onBlur } = useTVFocus();
  return (
    <TouchableOpacity
      testID={`welcome-color-${color}`}
      focusable
      onFocus={onFocus}
      onBlur={onBlur}
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.colorDot, { backgroundColor: color, borderColor: selected ? accent : "transparent" }, focusStyle(accent, isFocused, 24)]}
    >
      {selected ? <Ionicons name="checkmark" size={20} color="#fff" /> : null}
    </TouchableOpacity>
  );
}

function ContinueButton({ enabled, label, accent, textColor, onPress, big }: { enabled: boolean; label: string; accent: string; textColor: string; onPress: () => void; big?: boolean }) {
  const { isFocused, onFocus, onBlur } = useTVFocus();
  return (
    <TouchableOpacity
      testID="welcome-continue-btn"
      focusable
      hasTVPreferredFocus
      onFocus={onFocus}
      onBlur={onBlur}
      disabled={!enabled}
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.continue, { backgroundColor: accent, opacity: enabled ? 1 : 0.4, height: big ? 62 : 54 }, focusStyle(accent, isFocused, 30)]}
    >
      <Text style={[styles.continueText, { color: textColor, fontSize: big ? 20 : FONT.size.base }]}>{label}</Text>
      <Ionicons name="arrow-forward" size={20} color={textColor} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.lg, marginTop: SPACING.md },
  brand: { fontSize: 26, fontWeight: FONT.weight.bold, letterSpacing: 6 },
  steps: { flexDirection: "row", alignItems: "center", gap: 6, marginVertical: SPACING.sm },
  stepDot: { width: 10, height: 10, borderRadius: 5 },
  stepLine: { width: 40, height: 2 },
  title: { fontWeight: FONT.weight.bold, textAlign: "center" },
  sub: { fontSize: FONT.size.sm, textAlign: "center", paddingHorizontal: SPACING.lg },
  label: { fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1, marginBottom: SPACING.sm, marginTop: SPACING.lg },
  input: { height: 54, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md },
  colorRow: { flexDirection: "row", gap: SPACING.md, flexWrap: "wrap" },
  colorDot: { width: 48, height: 48, borderRadius: 24, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  continue: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, borderRadius: RADIUS.pill, marginTop: SPACING.xl },
  continueText: { fontWeight: FONT.weight.bold },
  legal: { fontSize: FONT.size.xs, textAlign: "center", marginTop: SPACING.lg },
});
