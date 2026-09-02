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
import { DEFAULT_CODE_SOURCE, resolveServerCode } from "@/src/utils/serverCode";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";

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
  const [serverCode, setServerCode] = useState(pl?.serverCodeBinding?.code || "");
  const [serverCodeAutoResolve, setServerCodeAutoResolve] = useState(pl?.serverCodeBinding?.autoResolve ?? true);
  const [playbackUserAgent, setPlaybackUserAgent] = useState(pl?.playbackHeaders?.userAgent || "");
  const [playbackReferer, setPlaybackReferer] = useState(pl?.playbackHeaders?.referer || "");
  const [playbackOrigin, setPlaybackOrigin] = useState(pl?.playbackHeaders?.origin || "");
  const [stTimezoneMode, setStTimezoneMode] = useState<"auto" | "portal" | "device" | "manual">(pl?.stalkerTimezoneMode || "auto");
  const [stTimezone, setStTimezone] = useState(pl?.stalkerTimezone || "");

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
      const playbackHeaders = {
        userAgent: playbackUserAgent.trim() || undefined,
        referer: playbackReferer.trim() || undefined,
        origin: playbackOrigin.trim() || undefined,
      };
      patch.playbackHeaders = Object.values(playbackHeaders).some(Boolean) ? playbackHeaders : undefined;

      if (pl.source === "m3u_url") {
        if (m3uUrl.trim() !== pl.m3uUrl) patch.m3uUrl = m3uUrl.trim();
        if (reloadContent) {
          const targetUrl = (m3uUrl.trim() || pl.m3uUrl)!;
          if (Platform.OS === "android" && KizilkanNativeCore.available) {
            setProgress("M3U Native Core ile yenileniyor ve Room'a indeksleniyor...");
            const summary = await KizilkanNativeCore.fetchAndImportM3u(pl.id, targetUrl);
            const total = Number(summary?.channels || 0) + Number(summary?.vod || 0) + Number(summary?.series || 0);
            if (!summary?.roomIndexed || total === 0) throw new Error("M3U yenilemede içerik bulunamadı.");
            patch.channelsCount = Number(summary.channels || 0);
            patch.vodCount = Number(summary.vod || 0);
            patch.seriesCount = Number(summary.series || 0);
          } else {
            // Web/legacy fallback.
            setProgress("Kanallar yeniden yükleniyor...");
            const res = await fetchAndParseM3U(targetUrl);
            patch.channels = res.channels; patch.vod = res.vod; patch.series = res.series;
          }
        }
      } else if (pl.source === "xtream") {
        patch.xtreamServer = xtServer.trim() || pl.xtreamServer;
        patch.xtreamUsername = xtUser.trim() || pl.xtreamUsername;
        patch.xtreamPassword = xtPass.trim() || pl.xtreamPassword;

        // v15.2.4: Sunucu kodu kullanıcı tarafından değiştirilebilsin; fakat
        // doğrulanmamış kod çalışan hesabın binding'ini bozmasın. Yeni kod önce
        // rehberde çözülür ve mevcut kullanıcı/şifre ile gerçek Xtream auth yapılır.
        const requestedCode = serverCode.trim();
        const currentCode = pl.serverCodeBinding?.code || "";
        if (requestedCode && requestedCode !== currentCode) {
          setProgress(`Sunucu kodu ${requestedCode} doğrulanıyor...`);
          const resolved = await resolveServerCode(
            pl.serverCodeBinding?.codeSource || DEFAULT_CODE_SOURCE,
            requestedCode,
            patch.xtreamUsername!,
            patch.xtreamPassword!,
          );
          patch.xtreamServer = resolved.server;
          patch.accountInfo = resolved.login.user_info as any;
          patch.serverInfo = resolved.login.server_info || null;
          patch.serverCodeBinding = {
            code: requestedCode,
            panelName: resolved.panelName,
            codeSource: pl.serverCodeBinding?.codeSource || DEFAULT_CODE_SOURCE,
            autoResolve: serverCodeAutoResolve,
            preferredServer: resolved.server,
            validatedHosts: Array.from(new Set([resolved.server, ...resolved.hosts])),
            lastResolvedServer: resolved.server,
            lastResolvedAt: new Date().toISOString(),
          };
          setXtServer(resolved.server);
        } else if (pl.serverCodeBinding) {
          patch.serverCodeBinding = { ...pl.serverCodeBinding, autoResolve: serverCodeAutoResolve };
        }

        // GPT v10.5.1: Sunucu Kodu ile bağlı bir listeyi kullanıcı elle farklı
        // DNS'e çevirirse bir sonraki yenilemede Firebase'in eski panel bağı
        // kullanıcının seçimini geri ezmesin. Otomatik DNS takibi güvenli biçimde
        // kapatılır; panel kimliği geçmiş/teşhis bilgisi olarak korunur.
        if (
          pl.serverCodeBinding &&
          requestedCode === currentCode &&
          patch.xtreamServer &&
          patch.xtreamServer !== pl.xtreamServer
        ) {
          patch.serverCodeBinding = {
            ...(patch.serverCodeBinding || pl.serverCodeBinding),
            autoResolve: false,
            lastResolvedServer: patch.xtreamServer,
            lastResolvedAt: new Date().toISOString(),
          };
          setServerCodeAutoResolve(false);
        }
        if (reloadContent) {
          const cred = { server: patch.xtreamServer!, username: patch.xtreamUsername!, password: patch.xtreamPassword! };
          if (Platform.OS === "android" && KizilkanNativeCore.available) {
            const existingJob = KizilkanNativeCore.getBulkImportSnapshot();
            if (existingJob?.running) throw new Error("Başka bir native playlist ekleme/yenileme işi çalışıyor. Bitmesini bekleyin veya durdurun.");
            const jobKey = `edit-${pl.id}-${Date.now()}`;
            setProgress("Xtream Native Core ile doğrulanıyor ve Room'a yenileniyor...");
            const importRunId = await KizilkanNativeCore.startBulkImport([{
              jobKey, playlistId: pl.id, displayName: patch.name || pl.name,
              server: cred.server, username: cred.username, password: cred.password,
            }], 1);
            if (!importRunId) throw new Error("Native Xtream yenileme işi başlatılamadı.");
            let finalRow: any = null;
            const deadline = Date.now() + 12 * 60 * 1000;
            while (Date.now() < deadline) {
              const snap = KizilkanNativeCore.getBulkImportSnapshot();
              if (snap?.runId !== importRunId) { await new Promise(resolve => setTimeout(resolve, 120)); continue; }
              const row = Array.isArray(snap?.jobs) ? snap.jobs.find((j:any) => String(j.jobKey) === jobKey) : null;
              if (row) {
                setProgress(String(row.message || "Xtream yenileniyor..."));
                if (row.state === "failed") throw new Error(String(row.message || "Xtream yenileme başarısız"));
                if (row.state === "completed") { finalRow = row; break; }
              }
              await new Promise(resolve => setTimeout(resolve, 450));
            }
            if (!finalRow) throw new Error("Xtream native yenileme zaman aşımına uğradı.");
            patch.channelsCount = Number(finalRow.channels || 0);
            patch.vodCount = Number(finalRow.vod || 0);
            patch.seriesCount = Number(finalRow.series || 0);
            patch.accountInfo = finalRow.userInfo || patch.accountInfo || pl.accountInfo;
            patch.serverInfo = finalRow.serverInfo || patch.serverInfo || pl.serverInfo;
          } else {
            // Web/legacy fallback: cihaz içi paralel API çağrıları korunur.
            setProgress("Kimlik doğrulanıyor...");
            const login = await xtLoginLocal(cred);
            patch.accountInfo = login.user_info as any;
            patch.serverInfo = login.server_info || null;
            setProgress("Kanallar, filmler ve diziler paralel yükleniyor...");
            const [chRes, vodRes, serRes] = await Promise.allSettled([xtreamLiveStreams(cred), xtVodLocal(cred), xtSeriesLocal(cred)]);
            if (chRes.status === "rejected" || vodRes.status === "rejected" || serRes.status === "rejected") {
              const failed = [
                chRes.status === "rejected" ? `Canlı: ${String(chRes.reason?.message || chRes.reason)}` : "",
                vodRes.status === "rejected" ? `Film: ${String(vodRes.reason?.message || vodRes.reason)}` : "",
                serRes.status === "rejected" ? `Dizi: ${String(serRes.reason?.message || serRes.reason)}` : "",
              ].filter(Boolean).join(" · ");
              throw new Error(`Xtream yenileme eksik kaldı; mevcut katalog korunuyor. ${failed}`);
            }
            patch.channels = chRes.value;
            patch.vod = vodRes.value;
            patch.series = serRes.value;
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
        patch.stalkerTimezoneMode = stTimezoneMode;
        patch.stalkerTimezone = stTimezoneMode === "manual" ? stTimezone.trim() || undefined : undefined;
        // A previously verified portal timezone is preserved until a new profile proves another value.
        patch.stalkerPortalTimezone = pl.stalkerPortalTimezone;
        if (stTimezoneMode === "manual" && !/^[A-Za-z_+\-]+(?:\/[A-Za-z0-9_+\-]+)+$/.test(stTimezone.trim())) {
          throw new Error("Manuel MAG saat dilimi IANA biçiminde olmalı. Örnek: Europe/Istanbul");
        }
        if (reloadContent) {
          const { stalkerLogin, stalkerCatalog, stalkerCredsFromPlaylist, normalizeStalkerAccountInfo } = await import("@/src/utils/stalker");
          const cred = stalkerCredsFromPlaylist({ ...pl, ...patch });
          setProgress("Portal doğrulanıyor...");
          const { session, profile: prof } = await stalkerLogin(cred);
          const profile = prof || {};
          patch.accountInfo = normalizeStalkerAccountInfo(profile);
          if (session.portalTimezone) patch.stalkerPortalTimezone = session.portalTimezone;
          setProgress("MAG katalog hazırlığı başlatılıyor...");
          let catalog;
          try {
            catalog = await stalkerCatalog(cred, session, {
              forceFresh: true,
              onProgress: (progress) => setProgress(progress.message),
            });
          }
          catch (e: any) { throw new Error(`MAG katalog yenileme başarısız: ${String(e?.message || e)}${session.profileError ? `\nProfil aşaması: ${session.profileError}` : ""}`); }
          if (catalog.channels.length + catalog.vod.length + catalog.series.length === 0) {
            throw new Error(
              "Portal bağlandı ama kanal listesi BOŞ.\n\n" +
                (session.profileError ? `Profil aşaması: ${session.profileError}\n\n` : "") +
                "• MAC bu portalda kayıtlı olmayabilir\n" +
                "• Abonelik süresi dolmuş olabilir"
            );
          }
          patch.channels = catalog.channels;
          patch.vod = catalog.vod;
          patch.series = catalog.series;
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

          <Label text="OYNATMA USER-AGENT (isteğe bağlı)" mt />
          <TextInput
            testID="edit-playback-ua-input"
            value={playbackUserAgent} onChangeText={setPlaybackUserAgent}
            autoCapitalize="none" autoCorrect={false}
            placeholder="Boşsa sağlayıcı / motor varsayılanı"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
          />
          <Label text="OYNATMA REFERER (isteğe bağlı)" mt />
          <TextInput
            testID="edit-playback-referer-input"
            value={playbackReferer} onChangeText={setPlaybackReferer}
            autoCapitalize="none" autoCorrect={false} keyboardType="url"
            placeholder="https://panel.example/"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
          />
          <Label text="OYNATMA ORIGIN (isteğe bağlı)" mt />
          <TextInput
            testID="edit-playback-origin-input"
            value={playbackOrigin} onChangeText={setPlaybackOrigin}
            autoCapitalize="none" autoCorrect={false} keyboardType="url"
            placeholder="https://panel.example"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
          />
          <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, marginTop: 6 }}>
            Öncelik: içerik özel ayarı → bu hesap ayarı → sağlayıcı/protokol → motor varsayılanı.
          </Text>

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
              {pl.serverCodeBinding && (
                <>
                  <Label text="SUNUCU KODU" mt />
                  <TextInput
                    testID="edit-server-code-input"
                    value={serverCode}
                    onChangeText={setServerCode}
                    autoCapitalize="none" autoCorrect={false}
                    placeholder="Örn. 042"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
                  />
                  <TouchableOpacity
                    testID="edit-server-code-auto-resolve"
                    onPress={() => setServerCodeAutoResolve(v => !v)}
                    style={[styles.tag, { marginTop: SPACING.sm, backgroundColor: serverCodeAutoResolve ? colors.brandPrimary + "18" : colors.surfaceSecondary, borderColor: serverCodeAutoResolve ? colors.brandPrimary : colors.border }]}
                  >
                    <Ionicons name={serverCodeAutoResolve ? "sync-circle" : "pause-circle-outline"} size={18} color={serverCodeAutoResolve ? colors.brandPrimary : colors.onSurfaceSecondary} />
                    <Text style={[styles.tagText, { color: colors.onSurface, flex: 1 }]}>
                      DNS otomatik güncelle: {serverCodeAutoResolve ? "Açık" : "Kapalı"}
                    </Text>
                  </TouchableOpacity>
                  <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, marginTop: 6 }}>
                    Kod değişirse yeni panel/DNS mevcut kullanıcı adı ve şifreyle doğrulanmadan kaydedilmez.
                  </Text>
                </>
              )}
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

              <Label text="MAG SAAT DİLİ" mt />
              <View style={styles.modeRow}>
                {([
                  ["auto", "Otomatik"],
                  ["portal", "Portal"],
                  ["device", "Cihaz"],
                  ["manual", "Manuel"],
                ] as const).map(([mode, label]) => (
                  <TouchableOpacity
                    key={mode}
                    testID={`edit-st-timezone-${mode}`}
                    onPress={() => setStTimezoneMode(mode)}
                    style={[styles.modeBtn, { borderColor: stTimezoneMode === mode ? colors.brandPrimary : colors.border, backgroundColor: stTimezoneMode === mode ? colors.brandPrimary + "18" : colors.surfaceSecondary }]}
                  >
                    <Text style={{ color: stTimezoneMode === mode ? colors.brandPrimary : colors.onSurface, fontWeight: FONT.weight.bold, fontSize: FONT.size.sm }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {stTimezoneMode === "manual" && (
                <TextInput
                  testID="edit-st-timezone-input"
                  value={stTimezone} onChangeText={setStTimezone}
                  autoCapitalize="none" autoCorrect={false}
                  placeholder="Europe/Istanbul"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  style={[styles.input, { marginTop: SPACING.sm, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
                />
              )}
              <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, marginTop: 6 }}>
                Otomatik mevcut kanıtlanmış MAG profil varsayımlarını korur. Portal modu doğrulanmış get_profile saat dilimini, cihaz modu telefon/TV saat dilimini kullanır.
              </Text>
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
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  modeBtn: { minWidth: 88, height: 42, borderWidth: 1, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: SPACING.md },
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
