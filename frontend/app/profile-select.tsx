import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { useProfiles, PROFILE_AVATAR_COLORS } from "@/src/store/ProfileContext";
import { isValidPinFormat, ensureRecoveryCode } from "@/src/utils/pin";
import { FocusButton } from "@/src/components/FocusButton";
import { useTv } from "@/src/store/TvContext";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { haptic } from "@/src/utils/haptic";
import { getScanRecoveryIntent, clearScanRecoveryIntent } from "@/src/utils/appSession"; // v15.0.1 BUILD FIX: eksik haptic bağını gerçek utility ile tamamla.

export default function ProfileSelect() {
  // PDF Bulgu 5: TV'de klavye otomatik açılmamalı, odağı kaçırıyor.
  const { isTv } = useTv();
  const router = useRouter();
  const { colors } = useTheme();
  const { profiles, activeProfile, switchProfile, addProfile, setPin, verifyPinAsync, verifyAdminPin, adminHasPin, authorizeProfileSession } = useProfiles();
  const { isLoading: playlistsLoading, loadedProfileId } = usePlaylists();
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [adminGate, setAdminGate] = useState(false);  // + için yönetici PIN ekranı
  const [adminPinInput, setAdminPinInput] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PROFILE_AVATAR_COLORS[0]);
  const [newPin, setNewPin] = useState("");   // v5.6.0: profil oluştururken PIN
  const [isKids, setIsKids] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{ profileId: string; to: "/playlist-select" | "/add-playlist" } | null>(null);

  const postAuthRoute = async (profileId: string): Promise<"/playlist-select" | "/add-playlist"> => {
    const recovery = await getScanRecoveryIntent();
    if (recovery?.profileId === profileId) {
      await clearScanRecoveryIntent();
      return "/add-playlist";
    }
    // v17.0.7: Bayat /add-playlist appSession kaydı tek başına recovery kanıtı değildir.
    // Yalnız profile bağlı açık scanRecoveryIntent tarama ekranına döndürebilir.
    return "/playlist-select";
  };

  /**
   * v11.5.0 — PROFİL GEÇİŞ BARİYERİ
   * switchProfile() AsyncStorage yazımını bekler ama React activeProfile state'inin
   * yeni render'a yansımasını garanti etmez. Eski akış hemen router.replace()
   * yaptığı için Playlist/Theme/TV provider'ları önceki profile ait state ile bir
   * kare çalışabiliyor ve sonraki yeniden-yükleme ile siyah/boş ekrana düşebiliyordu.
   * Yönlendirme artık activeProfile gerçekten hedef profile dönmeden yapılmaz.
   */
  useEffect(() => {
    if (!pendingNavigation) return;
    if (activeProfile.id !== pendingNavigation.profileId) return;
    // Profil değişti ama profile özel playlist metadata henüz yüklenmediyse
    // route değiştirme. Siyah ekranın ana yarışlarından biri buydu.
    if (playlistsLoading || loadedProfileId !== pendingNavigation.profileId) return;
    const to = pendingNavigation.to;
    setPendingNavigation(null);
    setPinFor(null);
    setPinInput("");
    setPinError(null);
    setShowAdd(false);
    router.replace(to);
  }, [activeProfile.id, playlistsLoading, loadedProfileId, pendingNavigation, router]);

  const initials = (name: string) => name.trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const handleSelect = async (pid: string) => {
    const p = profiles.find(x => x.id === pid);
    if (!p) return;
    // HER DEFASINDA PIN SOR (v5.7.0 — kullanıcı isteği)
    // ESKİ: zaten aktif olan profile girerken PIN sorulmuyordu; uygulamayı
    // kapatıp açan biri doğrudan içeri girebiliyordu.
    if (p.hasPin) {
      setPendingNavigation(null);
      setPinFor(pid);
      setPinInput("");
      setPinError(null);
      return;
    }
    await switchProfile(pid);
    authorizeProfileSession(pid);
    setPendingNavigation({ profileId: pid, to: await postAuthRoute(pid) });
  };

  const submitPin = async () => {
    if (!pinFor || pinBusy) return;
    setPinBusy(true);
    setPinError(null);
    try {
      const accepted = await verifyPinAsync(pinFor, pinInput);
      if (!accepted) {
        setPendingNavigation(null);
        setPinError("Yanlış PIN");
        return;
      }
      await switchProfile(pinFor);
      authorizeProfileSession(pinFor);
      setPendingNavigation({ profileId: pinFor, to: await postAuthRoute(pinFor) });
    } catch (e: any) {
      setPendingNavigation(null);
      setPinError(`PIN doğrulanamadı: ${String(e?.message || e)}`);
    } finally {
      setPinBusy(false);
    }
  };

  const submitNew = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    // v5.7.0: PIN artık profil oluşturulurken ATOMİK olarak veriliyor.
    const wantPin = newPin.trim();
    if (wantPin) {
      const fmt = isValidPinFormat(wantPin);
      if (!fmt.ok) {
        setBusy(false);
        Alert.alert("Geçersiz PIN", fmt.error || "PIN 4-10 rakam olmalı.");
        return;
      }
    }
    /**
     * SAĞLAMLAŞTIRMA (v6.2.0)
     * ESKİ: try/catch yoktu. addProfile/storage bir hata fırlatırsa
     *       setBusy(false) HİÇ çalışmıyor ve düğme sonsuza kadar dönüyordu
     *       (senin gördüğün "dönüp duruyor").
     * YENİ: finally ile busy HER DURUMDA temizlenir; hata kullanıcıya söylenir.
     * Ayrıca yeni profilin listesi HENÜZ YOK — playlist-select'e uğramadan
     * doğrudan liste ekleme ekranına gidiyoruz (gereksiz sıçrama yok).
     */
    try {
      const p = await addProfile(newName, newColor, isKids, wantPin || null);
      if (wantPin) {
        try { await ensureRecoveryCode(); } catch { /* kurtarma kodu kritik değil */ }
      }
      setNewPin("");
      await switchProfile(p.id);
      authorizeProfileSession(p.id);
      setPendingNavigation({ profileId: p.id, to: "/add-playlist" });
    } catch (e: any) {
      Alert.alert(
        "Profil oluşturulamadı",
        String(e?.message || e) + "\n\nLütfen tekrar deneyin."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} testID="profile-select-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Text style={[styles.brand, { color: colors.brandPrimary }]}>KIZILKAN</Text>
          <Text style={[styles.title, { color: colors.onSurface }]}>Kim izliyor?</Text>
        </View>

        <ScrollView contentContainerStyle={styles.gridWrap} keyboardShouldPersistTaps="handled">
          {!showAdd && !pinFor && !adminGate && (
            <View style={styles.grid}>
              {profiles.map(p => (
                <FocusButton
                  key={p.id}
                  testID={`profile-${p.id}-btn`}
                  onPress={() => handleSelect(p.id)}
                  activeOpacity={0.8}
                  focusable
                  style={styles.profileCell}
                >
                  <View style={[styles.avatar, { backgroundColor: p.color }]}>
                    <Text style={styles.avatarInitials}>{initials(p.name)}</Text>
                    {p.hasPin && (
                      <View style={[styles.pinBadge, { backgroundColor: colors.surface }]}>
                        <Ionicons name="lock-closed" size={12} color={colors.onSurface} />
                      </View>
                    )}
                    {p.isKids && (
                      <View style={[styles.kidsBadge, { backgroundColor: colors.brandPrimary }]}>
                        <Text style={styles.kidsBadgeText}>ÇOCUK</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.profileName, { color: colors.onSurface }]} numberOfLines={1}>{p.name}</Text>
                </FocusButton>
              ))}
              <FocusButton
                testID="add-profile-btn"
                onPress={() => {
                  // v6.1.0 (Seçenek C): Profil ekleme YÖNETİCİ PIN'i ister.
                  // Yöneticinin PIN'i yoksa koruma yok -> doğrudan ekleme formu.
                  if (adminHasPin()) {
                    setAdminPinInput("");
                    setAdminError(null);
                    setAdminGate(true);
                  } else {
                    setShowAdd(true);
                  }
                }}
                activeOpacity={0.8}
                focusable
                style={styles.profileCell}
              >
                <View style={[styles.avatarAdd, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
                  <Ionicons name="add" size={40} color={colors.onSurfaceSecondary} />
                </View>
                <Text style={[styles.profileName, { color: colors.onSurfaceSecondary }]}>Profil Ekle</Text>
              </FocusButton>
            </View>
          )}

          {showAdd && (
            <View style={styles.form}>
              <Text style={[styles.formLabel, { color: colors.onSurfaceSecondary }]}>PROFİL ADI</Text>
              <TextInput
                testID="new-profile-name-input"
                value={newName}
                onChangeText={setNewName}
                placeholder="Örn: Ali, Anne, Çocuk"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
              />

              <Text style={[styles.formLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.lg }]}>AVATAR RENGİ</Text>
              <View style={styles.colorRow}>
                {PROFILE_AVATAR_COLORS.map(c => (
                  <FocusButton
                    key={c}
                    testID={`color-${c}-btn`}
                    onPress={() => setNewColor(c)}
                    style={[styles.colorSwatch, { backgroundColor: c, borderColor: newColor === c ? colors.onSurface : "transparent" }]}
                  />
                ))}
              </View>

              {/* PROFİL PIN'İ (v5.6.0 — eskiden bu alan hiç yoktu) */}
              <Text style={[styles.formLabel, { color: colors.onSurfaceSecondary, marginTop: SPACING.lg }]}>
                PIN (İSTEĞE BAĞLI — 4-10 RAKAM)
              </Text>
              <TextInput
                testID="new-profile-pin-input"
                value={newPin}
                onChangeText={(t) => setNewPin(t.replace(/[^0-9]/g, "").slice(0, 10))}
                placeholder="Boş bırakırsanız kilit olmaz"
                placeholderTextColor={colors.onSurfaceTertiary}
                keyboardType="number-pad"
                secureTextEntry
                style={[styles.input, { color: colors.onSurface, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
              />

              <FocusButton
                testID="toggle-kids-btn"
                onPress={() => setIsKids(!isKids)}
                style={[styles.kidsToggle, { backgroundColor: colors.surfaceSecondary, borderColor: isKids ? colors.brandPrimary : colors.border }]}
              >
                <Ionicons name={isKids ? "checkbox" : "square-outline"} size={22} color={isKids ? colors.brandPrimary : colors.onSurfaceSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.kidsTitle, { color: colors.onSurface }]}>Çocuk Profili</Text>
                  <Text style={[styles.kidsSub, { color: colors.onSurfaceSecondary }]}>Sadece &quot;Ebeveyn Kontrolü&quot;nde kilitli olmayan içerikler gösterilir</Text>
                </View>
              </FocusButton>

              <View style={styles.actionRow}>
                <FocusButton
                  testID="cancel-new-btn"
                  onPress={() => setShowAdd(false)}
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.cancelText, { color: colors.onSurface }]}>İptal</Text>
                </FocusButton>
                <FocusButton
                  testID="save-new-profile-btn"
                  onPress={submitNew}
                  disabled={busy || !newName.trim()}
                  style={[styles.saveBtn, { backgroundColor: colors.brandPrimary, opacity: busy || !newName.trim() ? 0.5 : 1 }]}
                >
                  {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                    <Text style={[styles.saveText, { color: colors.onBrandPrimary }]}>Oluştur</Text>
                  )}
                </FocusButton>
              </View>
            </View>
          )}

          {adminGate && (
            <View style={styles.form}>
              <Text style={[styles.pinTitle, { color: colors.onSurface }]}>Yönetici PIN&apos;i</Text>
              <Text style={[styles.pinSub, { color: colors.onSurfaceSecondary }]}>
                Yeni profil eklemek için yönetici (ana profil) PIN&apos;ini girin
              </Text>
              <TextInput
                testID="admin-pin-input"
                value={adminPinInput}
                onChangeText={t => { setAdminPinInput(t.replace(/\D/g, "").slice(0, 10)); setAdminError(null); }}
                placeholder="PIN (4-10 rakam)"
                placeholderTextColor={colors.onSurfaceTertiary}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={10}
                autoFocus={!isTv}
                style={[styles.pinInput, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
              />
              {adminError && <Text style={[styles.pinError, { color: colors.error }]}>{adminError}</Text>}
              <View style={styles.actionRow}>
                <FocusButton
                  testID="cancel-admin-btn"
                  onPress={() => { setAdminGate(false); setAdminPinInput(""); setAdminError(null); }}
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.cancelText, { color: colors.onSurface }]}>İptal</Text>
                </FocusButton>
                <FocusButton
                  testID="submit-admin-btn"
                  onPress={async () => {
                    if (await verifyAdminPin(adminPinInput)) {
                      setAdminGate(false);
                      setAdminPinInput("");
                      setShowAdd(true);
                    } else {
                      setAdminError("Yönetici PIN'i yanlış");
                      haptic.error();
                    }
                  }}
                  disabled={adminPinInput.length < 4}
                  style={[styles.saveBtn, { backgroundColor: colors.brandPrimary, opacity: adminPinInput.length < 4 ? 0.5 : 1 }]}
                >
                  <Text style={[styles.saveText, { color: colors.onBrandPrimary }]}>Onayla</Text>
                </FocusButton>
              </View>
            </View>
          )}

          {pinFor && (
            <View style={styles.form}>
              <Text style={[styles.pinTitle, { color: colors.onSurface }]}>PIN Girin</Text>
              <Text style={[styles.pinSub, { color: colors.onSurfaceSecondary }]}>Bu profil PIN ile korunuyor</Text>
              <TextInput
                testID="pin-input"
                value={pinInput}
                onChangeText={t => { setPinInput(t.replace(/\D/g, "").slice(0, 10)); setPinError(null); }}
                placeholder="PIN (4-10 rakam)"
                placeholderTextColor={colors.onSurfaceTertiary}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={10}
                autoFocus={!isTv}
                style={[styles.pinInput, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
              />
              {pinError && <Text style={[styles.pinError, { color: colors.error }]}>{pinError}</Text>}
              <View style={styles.actionRow}>
                <FocusButton
                  testID="cancel-pin-btn"
                  onPress={() => { setPinFor(null); setPinInput(""); setPinError(null); }}
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.cancelText, { color: colors.onSurface }]}>İptal</Text>
                </FocusButton>
                <FocusButton
                  testID="submit-pin-btn"
                  onPress={submitPin}
                  disabled={pinBusy || !!pendingNavigation || pinInput.length < 4}
                  style={[styles.saveBtn, { backgroundColor: colors.brandPrimary, opacity: pinBusy || pendingNavigation || pinInput.length < 4 ? 0.5 : 1 }]}
                >
                  {pinBusy || pendingNavigation ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                    <Text style={[styles.saveText, { color: colors.onBrandPrimary }]}>Giriş</Text>
                  )}
                </FocusButton>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { alignItems: "center", paddingTop: SPACING.xl, paddingBottom: SPACING.lg, gap: SPACING.sm },
  brand: { fontSize: FONT.size.sm, fontWeight: FONT.weight.black, letterSpacing: 4 },
  title: { fontSize: 28, fontWeight: FONT.weight.black, letterSpacing: 0.5 },
  gridWrap: { padding: SPACING.lg, alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.lg, justifyContent: "center", maxWidth: 400 },
  profileCell: { alignItems: "center", gap: SPACING.sm, width: 110 },
  avatar: {
    width: 96, height: 96, borderRadius: RADIUS.md * 1.5,
    alignItems: "center", justifyContent: "center", position: "relative",
  },
  avatarAdd: {
    width: 96, height: 96, borderRadius: RADIUS.md * 1.5,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderStyle: "dashed",
  },
  avatarInitials: { color: "#fff", fontSize: 36, fontWeight: FONT.weight.black },
  pinBadge: {
    position: "absolute", bottom: 6, right: 6,
    width: 24, height: 24, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  kidsBadge: {
    position: "absolute", top: -8, left: -8,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.sm,
  },
  kidsBadgeText: { color: "#fff", fontSize: 9, fontWeight: FONT.weight.black, letterSpacing: 1 },
  profileName: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, textAlign: "center" },
  form: { width: "100%", maxWidth: 360, gap: SPACING.sm },
  formLabel: { fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1.5 },
  input: {
    height: 52, borderWidth: 1, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg, fontSize: FONT.size.lg,
  },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.md, paddingVertical: SPACING.sm },
  colorSwatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 3 },
  kidsToggle: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1.5,
    marginTop: SPACING.lg,
  },
  kidsTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  kidsSub: { fontSize: FONT.size.sm, marginTop: 2, lineHeight: 16 },
  actionRow: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.xl },
  cancelBtn: {
    flex: 1, height: 52, borderRadius: RADIUS.pill, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  cancelText: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  saveBtn: {
    flex: 1, height: 52, borderRadius: RADIUS.pill,
    alignItems: "center", justifyContent: "center",
  },
  saveText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  pinTitle: { fontSize: FONT.size.xl, fontWeight: FONT.weight.bold, textAlign: "center", marginBottom: 4 },
  pinSub: { fontSize: FONT.size.sm, textAlign: "center", marginBottom: SPACING.xl },
  pinInput: {
    height: 64, borderWidth: 1, borderRadius: RADIUS.md,
    fontSize: 28, fontWeight: FONT.weight.black,
    letterSpacing: 12, textAlign: "center",
  },
  pinError: { fontSize: FONT.size.sm, textAlign: "center", marginTop: SPACING.sm },
});
