import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import {
  fetchAndParseM3U,
  xtreamLogin as xtLoginLocal,
  xtreamLiveStreams, xtreamVod as xtVodLocal, xtreamSeries as xtSeriesLocal,
} from "@/src/utils/iptv";

export default function EditPlaylist() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id: string }>();
  const { playlists, updatePlaylist } = usePlaylists();
  const pl = playlists.find(p => p.id === params.id);

  const [name, setName] = useState(pl?.name || "");
  const [m3uUrl, setM3uUrl] = useState(pl?.m3uUrl || "");
  const [xtServer, setXtServer] = useState(pl?.xtreamServer || "");
  const [xtUser, setXtUser] = useState(pl?.xtreamUsername || "");
  const [xtPass, setXtPass] = useState(pl?.xtreamPassword || "");
  const [showPass, setShowPass] = useState(false);   // şifre görünürlüğü (v9.4.0)
  const [stPortal, setStPortal] = useState(pl?.stalkerPortal || "");
  const [stMac, setStMac] = useState(pl?.stalkerMac || "");
  const [stSerial, setStSerial] = useState(pl?.stalkerSerial || "");
  const [reloadContent, setReloadContent] = useState(true);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pl) {
      router.back();
    }
  }, [pl, router]);

  if (!pl) return null;

  const save = async () => {
    setError(null);
    setLoading(true);
    setProgress("");
    try {
      const patch: any = { name: name.trim() || pl.name };

      if (pl.source === "m3u_url") {
        if (m3uUrl.trim() !== pl.m3uUrl) patch.m3uUrl = m3uUrl.trim();
        if (reloadContent) {
          // CİHAZ-İÇİ: backend yerine doğrudan indir + ayrıştır.
          setProgress("Kanallar yeniden yükleniyor...");
          const res = await fetchAndParseM3U((m3uUrl.trim() || pl.m3uUrl)!);
          patch.channels = res.channels;
          patch.vod = res.vod;
          patch.series = res.series;
        }
      } else if (pl.source === "xtream") {
        patch.xtreamServer = xtServer.trim() || pl.xtreamServer;
        patch.xtreamUsername = xtUser.trim() || pl.xtreamUsername;
        patch.xtreamPassword = xtPass.trim() || pl.xtreamPassword;

        // GPT v10.5.1: Sunucu Kodu ile bağlı bir listeyi kullanıcı elle farklı
        // DNS'e çevirirse bir sonraki yenilemede Firebase'in eski panel bağı
        // kullanıcının seçimini geri ezmesin. Otomatik DNS takibi güvenli biçimde
        // kapatılır; panel kimliği geçmiş/teşhis bilgisi olarak korunur.
        if (
          pl.serverCodeBinding &&
          patch.xtreamServer &&
          patch.xtreamServer !== pl.xtreamServer
        ) {
          patch.serverCodeBinding = {
            ...pl.serverCodeBinding,
            autoResolve: false,
            lastResolvedServer: patch.xtreamServer,
            lastResolvedAt: new Date().toISOString(),
          };
        }
        if (reloadContent) {
          // CİHAZ-İÇİ + PARALEL (emergent backend YOK).
          const cred = {
            server: patch.xtreamServer!,
            username: patch.xtreamUsername!,
            password: patch.xtreamPassword!,
          };
          setProgress("Kimlik doğrulanıyor...");
          const login = await xtLoginLocal(cred);
          patch.accountInfo = login.user_info as any;
          (patch as any).serverInfo = login.server_info || null;

          setProgress("Kanallar, filmler ve diziler paralel yükleniyor...");
          const [chRes, vodRes, serRes] = await Promise.allSettled([
            xtreamLiveStreams(cred),
            xtVodLocal(cred),
            xtSeriesLocal(cred),
          ]);
          patch.channels = chRes.status === "fulfilled" ? chRes.value : [];
          patch.vod = vodRes.status === "fulfilled" ? vodRes.value : [];
          patch.series = serRes.status === "fulfilled" ? serRes.value : [];

          if (chRes.status === "rejected" && (patch.vod?.length || 0) === 0 && (patch.series?.length || 0) === 0) {
            throw new Error("İçerik yüklenemedi. Sunucu veya bilgileri kontrol edin.");
          }
        }
      } else if (pl.source === "stalker") {
        /**
         * STALKER / MAG DÜZENLE — ARTIK CİHAZ İÇİ (v9.6.0)
         * Eskiden api.stalkerLogin/Load (emergent backend) çağrılıyordu; backend
         * kapalı olduğu için MAG düzenle/yenile ÇALIŞMIYORDU. Protokolün tamamı
         * zaten src/utils/stalker.ts içinde cihazda çalışıyor (add-playlist ile
         * aynı kanıtlanmış yol): handshake -> profile -> get_all_channels.
         */
        patch.stalkerPortal = stPortal.trim() || pl.stalkerPortal;
        patch.stalkerMac = (stMac.trim().toUpperCase()) || pl.stalkerMac;
        patch.stalkerSerial = stSerial.trim() || pl.stalkerSerial;
        if (reloadContent) {
          const { stalkerLogin, stalkerChannels, normalizeMac } = await import("@/src/utils/stalker");
          const cred = {
            portal: (patch.stalkerPortal || "").trim(),
            mac: normalizeMac((patch.stalkerMac || "").trim()),
            serial: (patch.stalkerSerial || "").trim() || undefined,
          };
          setProgress("Portal doğrulanıyor...");
          const { session, profile: prof } = await stalkerLogin(cred);
          const profile = prof || {};
          patch.accountInfo = {
            username: profile.login, status: profile.status, mac: profile.mac,
            phone: profile.phone, tariff_plan: profile.tariff_plan,
            tariff_expired_date: profile.tariff_expired_date || profile.exp_billing_date,
          };
          setProgress("Kanallar yükleniyor...");
          const chans = await stalkerChannels(cred, session);
          if (chans.length === 0) {
            throw new Error(
              "Portal bağlandı ama kanal listesi BOŞ.\n\n" +
                "• MAC bu portalda kayıtlı olmayabilir\n" +
                "• Abonelik süresi dolmuş olabilir"
            );
          }
          patch.channels = chans;
        }
      }

      await updatePlaylist(pl.id, patch);
      router.back();
    } catch (e: any) {
      setError(e.message || "Hata");
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top", "bottom"]} testID="edit-playlist-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.header}>
          <TouchableOpacity testID="edit-close-btn" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.onSurface }]}>Hesabı Düzenle</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl }} keyboardShouldPersistTaps="handled">
          <View style={[styles.tag, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Ionicons
              name={pl.source === "xtream" ? "server" : pl.source === "stalker" ? "hardware-chip" : pl.source === "m3u_file" ? "document-attach" : "link"}
              size={16}
              color={colors.brandPrimary}
            />
            <Text style={[styles.tagText, { color: colors.onSurface }]}>
              {pl.source === "xtream" ? "Xtream Codes API" : pl.source === "stalker" ? "MAG Portal" : pl.source === "m3u_file" ? "M3U Dosya" : "M3U URL"}
            </Text>
          </View>

          {pl.serverCodeBinding && (
            <View style={[styles.tag, { backgroundColor: "#F59E0B18", borderColor: "#F59E0B88", marginTop: SPACING.sm }]}>
              <Ionicons name="cloud-done-outline" size={16} color="#F59E0B" />
              <Text style={[styles.tagText, { color: colors.onSurface, flex: 1 }]}>
                Panel: {pl.serverCodeBinding.panelName} • Sunucu kodu: {pl.serverCodeBinding.code} • DNS otomatik: {pl.serverCodeBinding.autoResolve ? "Açık" : "Kapalı"}
              </Text>
            </View>
          )}

          <Label text="LİSTE ADI" />
          <TextInput
            testID="edit-name-input"
            value={name} onChangeText={setName}
            placeholderTextColor={colors.onSurfaceTertiary}
            style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
          />

          {pl.source === "m3u_url" && (
            <>
              <Label text="M3U URL" mt />
              <TextInput
                testID="edit-m3u-url-input"
                value={m3uUrl} onChangeText={setM3uUrl}
                autoCapitalize="none" autoCorrect={false} keyboardType="url"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
              />
            </>
          )}

          {pl.source === "xtream" && (
            <>
              <Label text="SUNUCU" mt />
              <TextInput testID="edit-xt-server-input" value={xtServer} onChangeText={setXtServer}
                autoCapitalize="none" autoCorrect={false} keyboardType="url"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]} />
              <Label text="KULLANICI ADI" mt />
              <TextInput testID="edit-xt-user-input" value={xtUser} onChangeText={setXtUser}
                autoCapitalize="none" autoCorrect={false}
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]} />
              <Label text="ŞİFRE" mt />
              {/**
                * ŞİFREYİ GÖSTER (v9.4.0 — kullanıcı isteği)
                * Şifre yıldızlı geldiği için kullanıcı kayıtlı değeri göremiyor,
                * doğru mu diye kontrol edemiyordu. Göz simgesiyle açılıp
                * kapanabiliyor.
                */}
              <View style={{ position: "relative", justifyContent: "center" }}>
                <TextInput
                  testID="edit-xt-pass-input"
                  value={xtPass}
                  onChangeText={setXtPass}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showPass}
                  placeholderTextColor={colors.onSurfaceTertiary}
                  style={[
                    styles.input,
                    { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border, paddingRight: 48 },
                  ]}
                />
                <TouchableOpacity
                  testID="toggle-pass-visibility"
                  onPress={() => setShowPass(v => !v)}
                  hitSlop={12}
                  style={{ position: "absolute", right: 12 }}
                >
                  <Ionicons
                    name={showPass ? "eye-off" : "eye"}
                    size={20}
                    color={colors.onSurfaceSecondary}
                  />
                </TouchableOpacity>
              </View>
            </>
          )}

          {pl.source === "stalker" && (
            <>
              <Label text="PORTAL URL" mt />
              <TextInput testID="edit-st-portal-input" value={stPortal} onChangeText={setStPortal}
                autoCapitalize="none" autoCorrect={false} keyboardType="url"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]} />
              <Label text="MAC ADRESİ" mt />
              <TextInput testID="edit-st-mac-input" value={stMac} onChangeText={t => setStMac(t.toUpperCase())}
                autoCapitalize="characters" autoCorrect={false}
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]} />
              <Label text="SERIAL NUMBER (isteğe bağlı)" mt />
              <TextInput testID="edit-st-serial-input" value={stSerial} onChangeText={setStSerial}
                autoCapitalize="none" autoCorrect={false}
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]} />
            </>
          )}

          {pl.source !== "m3u_file" && (
            <TouchableOpacity
              testID="reload-toggle-btn"
              onPress={() => setReloadContent(!reloadContent)}
              style={[styles.reloadToggle, { backgroundColor: colors.surfaceSecondary, borderColor: reloadContent ? colors.brandPrimary : colors.border }]}
            >
              <Ionicons
                name={reloadContent ? "checkbox" : "square-outline"}
                size={22}
                color={reloadContent ? colors.brandPrimary : colors.onSurfaceSecondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.reloadTitle, { color: colors.onSurface }]}>İçeriği yeniden yükle</Text>
                <Text style={[styles.reloadSub, { color: colors.onSurfaceSecondary }]}>
                  Kanallar, filmler, diziler ve hesap bilgileri yeniden çekilir
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {error && (
            <View testID="edit-error-box" style={[styles.errBox, { backgroundColor: colors.error + "22", borderColor: colors.error }]}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={[styles.errText, { color: colors.error }]}>{error}</Text>
            </View>
          )}
          {loading && progress && (
            <View style={[styles.progressBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <ActivityIndicator color={colors.brandPrimary} />
              <Text style={[styles.progressText, { color: colors.onSurface }]}>{progress}</Text>
            </View>
          )}
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TouchableOpacity
            testID="save-edit-btn"
            onPress={save}
            disabled={loading}
            style={[styles.cta, { backgroundColor: colors.brandPrimary, opacity: loading ? 0.7 : 1 }]}
          >
            {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <>
                <Ionicons name="save" size={20} color={colors.onBrandPrimary} />
                <Text style={[styles.ctaText, { color: colors.onBrandPrimary }]}>Değişiklikleri Kaydet</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Label({ text, mt }: { text: string; mt?: boolean }) {
  const { colors } = useTheme();
  return (
    <Text style={{
      fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1.5,
      color: colors.onSurfaceSecondary,
      marginTop: mt ? SPACING.lg : 0, marginBottom: SPACING.sm,
    }}>{text}</Text>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  title: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  tag: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderRadius: RADIUS.pill, borderWidth: 1,
    marginBottom: SPACING.lg,
  },
  tagText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.bold },
  input: {
    height: 52, borderWidth: 1, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg, fontSize: FONT.size.lg,
  },
  reloadToggle: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1.5,
    marginTop: SPACING.xl,
  },
  reloadTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  reloadSub: { fontSize: FONT.size.sm, marginTop: 2, lineHeight: 16 },
  errBox: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg,
  },
  errText: { flex: 1, fontSize: FONT.size.base },
  progressBox: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg,
  },
  progressText: { fontSize: FONT.size.base },
  footer: { padding: SPACING.lg, borderTopWidth: 1 },
  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm,
    height: 56, borderRadius: RADIUS.pill,
  },
  ctaText: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
});
