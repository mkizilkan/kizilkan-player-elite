import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useTheme } from "@/src/theme/ThemeContext";
import { THEMES, THEME_LABELS, ThemeName, SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { useProfiles } from "@/src/store/ProfileContext";
import { useParental } from "@/src/store/ParentalContext";
import { useLibrary } from "@/src/store/LibraryContext";
import { isValidPinFormat, ensureRecoveryCode } from "@/src/utils/pin";
import { useTv } from "@/src/store/TvContext";
import { fetchAndCacheEpg } from "@/src/utils/epg";
import { api } from "@/src/utils/api";
import { FocusButton } from "@/src/components/FocusButton";
import { refreshPlaylistContent } from "@/src/utils/refreshPlaylist";
import { playlistTypeLabel, playlistVisualColor, playlistTypeIcon } from "@/src/utils/playlistVisual";
import { storage } from "@/src/utils/storage";
import {
  PLAYER_BUFFER_KEY, PLAYER_BUFFER_OPTIONS, PLAYER_BUFFER_PRESETS, PLAYER_BUFFER_DEFAULT_MS,
  bufferLabel,
} from "@/src/player/v2";

export default function SettingsTab() {
  const { isTv, mode: tvMode, setMode: setTvMode, tvLayout, setTvLayout, tvPreview, setTvPreview } = useTv();
  const { toggleHiddenGroup, isGroupHidden, hiddenGroups, clearAllProgress } = useLibrary();
  const router = useRouter();
  const { colors, themeName, setTheme } = useTheme();
  const { playlists, activePlaylist, setActivePlaylist, removePlaylist, updatePlaylist } = usePlaylists();
  const { profiles, activeProfile, switchProfile, removeProfile, setPin: setProfPin, verifyAdminPin, adminHasPin } = useProfiles();
  const { settings: parental, setPin, clearPin, toggleCategoryLock, setAdultHidden, verifyPinAsync, isCategoryLocked } = useParental();
  const [epgInput, setEpgInput] = useState<string>(activePlaylist?.epgUrl || "");
  const [epgLoading, setEpgLoading] = useState(false);
  const [epgMsg, setEpgMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [refreshingAllPlaylists, setRefreshingAllPlaylists] = useState(false);
  const [refreshAllPlaylistProgress, setRefreshAllPlaylistProgress] = useState("");
  const [playerBufferMs, setPlayerBufferMs] = useState<number>(PLAYER_BUFFER_DEFAULT_MS);

  // Parental PIN modal
  const [pinModal, setPinModal] = useState<null | "create" | "change">(null);
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");
  const [pinErr, setPinErr] = useState<string | null>(null);

  // Category lock modal
  const [showLockModal, setShowLockModal] = useState(false);
  const [showHideModal, setShowHideModal] = useState(false);
  const [adultPinModal, setAdultPinModal] = useState(false);
  const [adultPin, setAdultPin] = useState("");
  const [adultPinErr, setAdultPinErr] = useState<string | null>(null);
  const [profilePinFor, setProfilePinFor] = useState<string | null>(null);
  const [provModal, setProvModal] = useState(false);
  const [listPinFor, setListPinFor] = useState<string | null>(null);
  const [listPinVal, setListPinVal] = useState("");
  const [tvModePicker, setTvModePicker] = useState(false);      // TV modu seçim listesi
  const [tvLayoutPicker, setTvLayoutPicker] = useState(false);  // TV arayüzü seçim listesi
  const [accRefreshing, setAccRefreshing] = useState(false);
  const [provForm, setProvForm] = useState<Record<string, string>>({});
  const [deleteFor, setDeleteFor] = useState<string | null>(null);   // silinecek profil (yönetici PIN sonrası)
  const [delPinInput, setDelPinInput] = useState("");
  const [delError, setDelError] = useState<string | null>(null);
  const [profilePinVal, setProfilePinVal] = useState("");

  // Chromecast modal
  const [showCastModal, setShowCastModal] = useState(false);
  // DVR modal
  const [showDvrModal, setShowDvrModal] = useState(false);
  // Shortcuts modal
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  // Notification modal
  const [showNotifModal, setShowNotifModal] = useState(false);
  // Siri modal
  const [showSiriModal, setShowSiriModal] = useState(false);
  // Formats modal
  const [showFormatsModal, setShowFormatsModal] = useState(false);

  React.useEffect(() => {
    setEpgInput(activePlaylist?.epgUrl || "");
    setEpgMsg(null);
  }, [activePlaylist?.id]);

  React.useEffect(() => {
    storage.getItem<number>(PLAYER_BUFFER_KEY, PLAYER_BUFFER_DEFAULT_MS)
      .then(v => { if (typeof v === "number") setPlayerBufferMs(v); })
      .catch(() => {});
  }, []);

  const changePlayerBuffer = async (ms: number) => {
    setPlayerBufferMs(ms);
    await storage.setItem(PLAYER_BUFFER_KEY, ms);
  };

  /** GPT ELITE v14.1.0 — Ayarlar ekranında geri getirilen 2-worker Tümünü Güncelle. */
  const refreshAllPlaylists = async () => {
    if (refreshingAllPlaylists || playlists.length === 0) return;
    setRefreshingAllPlaylists(true);
    setRefreshAllPlaylistProgress(`0/${playlists.length} tamamlandı`);
    let cursor = 0;
    let completed = 0;
    let ok = 0;
    const failed: string[] = [];
    const worker = async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= playlists.length) return;
        const pl = playlists[idx];
        setRefreshAllPlaylistProgress(`${completed}/${playlists.length} · ${pl.name} güncelleniyor`);
        const res = await refreshPlaylistContent(pl);
        if (res.ok && res.patch) {
          await updatePlaylist(pl.id, res.patch);
          ok++;
        } else {
          failed.push(`${pl.name}: ${res.message}`);
        }
        completed++;
        setRefreshAllPlaylistProgress(`${completed}/${playlists.length} tamamlandı`);
      }
    };
    try {
      await Promise.all([worker(), worker()]);
      Alert.alert(
        "Tümünü Güncelle",
        `${ok}/${playlists.length} liste güncellendi.` +
          (failed.length ? `\n\nGüncellenemeyen:\n${failed.join("\n")}` : "")
      );
    } finally {
      setRefreshingAllPlaylists(false);
      setRefreshAllPlaylistProgress("");
    }
  };

  const themeKeys = Object.keys(THEMES) as ThemeName[];

  const fetchEpg = async () => {
    if (!activePlaylist) return;
    if (!epgInput.trim()) { setEpgMsg({ type: "err", text: "EPG URL girin" }); return; }
    setEpgLoading(true);
    setEpgMsg(null);
    try {
      // CİHAZ-İÇİ: XMLTV'yi doğrudan indir + ayrıştır + sakla (backend YOK).
      const res = await fetchAndCacheEpg(epgInput.trim(), activePlaylist.id);
      await updatePlaylist(activePlaylist.id, { epgUrl: epgInput.trim() });
      setEpgMsg({ type: "ok", text: `${res.count} program yüklendi` });
    } catch (e: any) {
      setEpgMsg({ type: "err", text: e.message || "EPG yüklenemedi" });
    } finally {
      setEpgLoading(false);
    }
  };

  /**
   * Yalnızca HESAP BİLGİSİNİ tazeler (v7.5.0).
   * Kanalları yeniden indirmez; bu yüzden saniyeler içinde biter.
   * Aktif bağlantı sayısı böylece gerçek zamanlıya yakın görünür.
   */
  const refreshAccountInfo = async () => {
    if (!activePlaylist || activePlaylist.source !== "xtream") return;
    /**
     * KİMLİK ALANLARI DÜZELTMESİ (v7.7.0)
     * Playlist tipinde kimlik bilgisi DÜZ alanlarda tutuluyor
     * (xtreamServer / xtreamUsername / xtreamPassword).
     * Eski kodum "activePlaylist.xtream" nesnesini arıyordu — böyle bir alan
     * YOK, bu yüzden her zaman "hesap bilgisi bulunamadı" hatası veriyordu.
     */
    const pl: any = activePlaylist;
    const cred = {
      server: pl.xtreamServer,
      username: pl.xtreamUsername,
      password: pl.xtreamPassword,
    };
    if (!cred.server || !cred.username) {
      Alert.alert("Yenilenemedi", "Bu liste için hesap bilgisi bulunamadı.");
      return;
    }
    setAccRefreshing(true);
    try {
      const { xtreamLogin } = await import("@/src/utils/iptv");
      const login = await xtreamLogin(cred);
      await updatePlaylist(activePlaylist.id, {
        accountInfo: login.user_info as any,
        serverInfo: login.server_info as any,
      } as any);
    } catch (e: any) {
      Alert.alert("Yenilenemedi", String(e?.message || e));
    } finally {
      setAccRefreshing(false);
    }
  };

  const savePin = async () => {
    // v5.5.0: PIN 4-10 hane
    const fmt = isValidPinFormat(newPin);
    if (!fmt.ok) { setPinErr(fmt.error || "Geçersiz PIN"); return; }
    if (newPin !== newPin2) { setPinErr("PIN'ler eşleşmiyor"); return; }
    await setPin(newPin);
    setPinModal(null);
    setNewPin(""); setNewPin2(""); setPinErr(null);

    // KURTARMA KODU (v5.5.0): PIN unutulursa kilitli kalmasın diye cihaza özel
    // 10 haneli bir kod üretilir ve kullanıcıya BİR KEZ gösterilir.
    const code = await ensureRecoveryCode();
    // NOT: Ana anahtar (maymuncuk) burada GÖSTERİLMEZ — kullanıcı isteği.
    // Sessizce çalışır; ekranda yazsa herkes görebilirdi.
    Alert.alert(
      "PIN kaydedildi — Kurtarma Kodunuz",
      `Bu kodu güvenli bir yere NOT EDİN:\n\n${code}\n\n` +
        "PIN'inizi unutursanız bu kodla açabilirsiniz.",
      [{ text: "Not aldım" }]
    );
  };

  const uniqueGroups = React.useMemo(() => {
    if (!activePlaylist) return [] as string[];
    const s = new Set<string>();
    activePlaylist.channels.forEach(c => { if (c.group) s.add(c.group); });
    (activePlaylist.vod || []).forEach(c => { if (c.group) s.add(c.group); });
    (activePlaylist.series || []).forEach(c => { if (c.group) s.add(c.group); });
    return Array.from(s).sort();
  }, [activePlaylist]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top"]} testID="settings-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xxxl }}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.onSurface }]}>Ayarlar</Text>
          <View style={[styles.profileBadge, { backgroundColor: activeProfile.color }]}>
            <Text style={styles.profileBadgeText}>{activeProfile.name}</Text>
          </View>
        </View>

        {/* Hesap Bilgileri */}
        {activePlaylist?.accountInfo ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <SectionTitle text="HESAP BİLGİLERİ" />
              {/* HESAP YENİLEME (v7.5.0)
                  Aktif bağlantı sayısı yalnızca liste eklenirken/yenilenirken
                  alınıyordu; bu yüzden bayat görünüyordu. Bu düğme SADECE
                  hesap bilgisini sunucudan tazeler (kanalları yeniden
                  indirmez — hızlıdır). */}
              {activePlaylist?.source === "xtream" && (
                <FocusButton
                  testID="refresh-account-btn"
                  onPress={refreshAccountInfo}
                  disabled={accRefreshing}
                  hitSlop={10}
                  focusRadius={8}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6 }}
                >
                  {accRefreshing ? (
                    <ActivityIndicator size="small" color={colors.brandPrimary} />
                  ) : (
                    <Ionicons name="refresh" size={16} color={colors.brandPrimary} />
                  )}
                  <Text style={{ color: colors.brandPrimary, fontSize: FONT.size.xs, fontWeight: "700" }}>
                    {accRefreshing ? "Yenileniyor" : "Yenile"}
                  </Text>
                </FocusButton>
              )}
            </View>
            <View style={{ paddingHorizontal: SPACING.lg }}>
              <AccountInfoCard
            playlist={activePlaylist}
            provider={activePlaylist?.providerInfo}
            onEditProvider={() => {
              const p = activePlaylist?.providerInfo || {};
              setProvForm({
                apkUrl: p.apkUrl || "", website: p.website || "",
                telegram: p.telegram || "", whatsapp: p.whatsapp || "",
                allowedPlayers: p.allowedPlayers || "", bannedPlayers: p.bannedPlayers || "",
                notes: p.notes || "",
              });
              setProvModal(true);
            }}
          />
            </View>
          </>
        ) : null}

        {/* Tema */}
        <SectionTitle text="TEMA SEÇİMİ" />
        <View style={styles.themeGrid}>
          {themeKeys.map(key => {
            const p = THEMES[key];
            const active = themeName === key;
            return (
              <FocusButton
                key={key} testID={`theme-${key}-btn`} onPress={() => setTheme(key)} activeOpacity={0.85} focusable
                style={[
                  styles.themeCard,
                  { backgroundColor: p.surface, borderColor: active ? colors.brandPrimary : colors.border },
                  /**
                   * TEMA KUTUSU ORANI (v7.8.0)
                   * TV'nin geniş ekranında %47.5 genişlik + 1.4 en-boy oranı
                   * devasa kutular üretiyordu (kullanıcı bildirdi).
                   * TV'de 4 sütun ve daha yatık oran kullanılıyor.
                   */
                  isTv && { width: "23%", aspectRatio: 1.9 },
                ]}
              >
                <View style={[styles.themeSwatch, { backgroundColor: p.brandPrimary }]} />
                <Text style={[styles.themeName, { color: p.onSurface }]}>{THEME_LABELS[key]}</Text>
                {active && (
                  <View style={styles.themeCheck}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.brandPrimary} />
                  </View>
                )}
              </FocusButton>
            );
          })}
        </View>

        {/* Gelişmiş Özellikler */}
        <SectionTitle text="GELİŞMİŞ ÖZELLİKLER" />
        <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.sm }}>
          <FocusButton
            testID="feature-multi-view-btn"
            onPress={() => router.push("/multi-view")}
            style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="grid" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.onSurface }]}>Çoklu Ekran</Text>
              <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>2 veya 4 kanalı aynı anda izle</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
          </FocusButton>

          <FocusButton
            testID="feature-epg-timeline-btn"
            onPress={() => router.push("/epg-timeline")}
            style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="calendar" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.onSurface }]}>7 Günlük TV Rehberi</Text>
              <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>Tam ekran zaman çizelgesi</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
          </FocusButton>

          <FocusButton
            testID="feature-backup-btn"
            onPress={() => router.push("/backup")}
            style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="cloud-upload" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.onSurface }]}>Yedekleme</Text>
              <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>Hesapları/ayarları dışa aktar veya yükle</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
          </FocusButton>

          <FocusButton
            testID="feature-dvr-btn"
            onPress={() => setShowDvrModal(true)}
            style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="recording" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.onSurface }]}>Kayıt Alma (DVR)</Text>
              <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>Canlı yayını cihaza kaydet</Text>
            </View>
            <View style={[styles.miniTag, { backgroundColor: colors.surfaceTertiary }]}>
              <Text style={[styles.miniTagText, { color: colors.onSurfaceSecondary }]}>YAKINDA</Text>
            </View>
          </FocusButton>

          <FocusButton
            testID="feature-downloads-btn"
            onPress={() => router.push("/downloads")}
            style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="cloud-download" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.onSurface }]}>İndirilenler</Text>
              <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>Çevrimdışı film/dizi/bölüm kütüphaneniz</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
          </FocusButton>

          <FocusButton
            testID="feature-formats-btn"
            onPress={() => setShowFormatsModal(true)}
            style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="videocam" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.onSurface }]}>Desteklenen Formatlar</Text>
              <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>MP4, MKV, HLS/M3U8, TS, DASH — HTTP/HTTPS</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
          </FocusButton>

          <FocusButton
            testID="tv-mode-btn"
            onPress={() => {
              // GPT ELITE v12.5.0: Eski kod burada tanımsız `next` değişkenini
              // okuyordu. Seçim zaten aşağıdaki TV Modu picker'ında yapılır.
              setTvModePicker(true);
            }}
            style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="tv" size={22} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.onSurface }]}>TV Modu (kumanda)</Text>
              <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>
                {tvMode === "auto" ? `Otomatik${isTv ? " • TV algılandı" : " • telefon"}`
                  : tvMode === "on" ? "Açık — TV düzeni zorlanıyor"
                  : "Kapalı — telefon düzeni"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
          </FocusButton>

          {/* TV ARAYÜZ SEÇİMİ (v8.0.0) — yalnızca TV'de görünür */}
          {isTv && (
            <>
              <FocusButton
                testID="tv-layout-btn"
                onPress={() => setTvLayoutPicker(true)}
                style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              >
                <Ionicons name="grid" size={20} color={colors.brandPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.onSurface }]}>TV Arayüzü</Text>
                  <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>
                    {tvLayout === "columns"
                      ? "Sütunlu (kategoriler | kanallar | önizleme)"
                      : "Klasik (tek sütun)"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
              </FocusButton>

              {tvLayout === "columns" && (
                <FocusButton
                  testID="tv-preview-btn"
                  onPress={() => setTvPreview(!tvPreview)}
                  style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                >
                  <Ionicons name="eye" size={20} color={colors.brandPrimary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.onSurface }]}>Sağ panel önizlemesi</Text>
                    <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>
                      {tvPreview
                        ? "Açık — kanal bilgisi ve logo gösterilir"
                        : "Kapalı — daha hafif (zayıf cihazlar için)"}
                    </Text>
                  </View>
                  <Ionicons
                    name={tvPreview ? "toggle" : "toggle-outline"}
                    size={26}
                    color={tvPreview ? colors.brandPrimary : colors.onSurfaceTertiary}
                  />
                </FocusButton>
              )}
            </>
          )}

          <FocusButton
            testID="feature-diagnostic-btn"
            onPress={() => router.push("/diagnostic")}
            style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="pulse" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.onSurface }]}>Bağlantıyı Test Et</Text>
              <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>Backend erişilebilirlik kontrolü (Network hata çözümü)</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
          </FocusButton>

          <FocusButton
            testID="feature-stats-btn"
            onPress={() => router.push("/stats")}
            style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="stats-chart" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.onSurface }]}>İzleme İstatistikleri</Text>
              <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>Toplam süre, favori kanallar, dashboard</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
          </FocusButton>

          <FocusButton
            testID="feature-shortcuts-btn"
            onPress={() => setShowShortcutsModal(true)}
            style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="apps" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.onSurface }]}>Ana Ekran Kısayolları</Text>
              <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>Uygulama simgesine uzun bas → Ara/Favoriler/EPG</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
          </FocusButton>

          <FocusButton
            testID="feature-notification-btn"
            onPress={() => setShowNotifModal(true)}
            style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="notifications" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.onSurface }]}>Bildirim Paneli Kontrolü</Text>
              <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>Android bildirim panelinde media kontrolleri</Text>
            </View>
            <View style={[styles.miniTag, { backgroundColor: colors.surfaceTertiary }]}>
              <Text style={[styles.miniTagText, { color: colors.onSurfaceSecondary }]}>NATIVE</Text>
            </View>
          </FocusButton>

          <FocusButton
            testID="feature-siri-btn"
            onPress={() => setShowSiriModal(true)}
            style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="mic" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.onSurface }]}>Siri / Google Assistant</Text>
              <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>Sesli komutla kanal aç</Text>
            </View>
            <View style={[styles.miniTag, { backgroundColor: colors.surfaceTertiary }]}>
              <Text style={[styles.miniTagText, { color: colors.onSurfaceSecondary }]}>NATIVE</Text>
            </View>
          </FocusButton>
        </View>

        {/* Aile Planı */}
        <SectionTitle text="AİLE PLANI (PROFİLLER)" />
        <View style={{ paddingHorizontal: SPACING.lg }}>
          {profiles.map(p => {
            const isActive = p.id === activeProfile.id;
            return (
              <View key={p.id} style={[styles.profileCard, { backgroundColor: colors.surfaceSecondary, borderColor: isActive ? colors.brandPrimary : colors.border }]}>
                <View style={[styles.pAvatar, { backgroundColor: p.color }]}>
                  <Text style={styles.pAvatarText}>{p.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pName, { color: colors.onSurface }]}>{p.name}</Text>
                  <View style={styles.pMetaRow}>
                    {p.isAdmin && <View style={[styles.miniTag, { backgroundColor: "#FFB300" }]}><Text style={[styles.miniTagText, { color: "#000" }]}>YÖNETİCİ</Text></View>}
                    {p.isKids && <View style={[styles.miniTag, { backgroundColor: colors.brandPrimary }]}><Text style={styles.miniTagText}>ÇOCUK</Text></View>}
                    {p.hasPin && <Ionicons name="lock-closed" size={12} color={colors.onSurfaceSecondary} />}
                  </View>
                </View>
                {/* PROFİL PIN YÖNETİMİ (v5.6.0 — eskiden sonradan PIN konulamıyordu) */}
                <FocusButton
                  testID={`profile-pin-${p.id}`}
                  onPress={() => setProfilePinFor(p.id)}
                  style={styles.pAction}
                  hitSlop={8}
                >
                  <Ionicons
                    name={p.hasPin ? "lock-closed" : "lock-open-outline"}
                    size={18}
                    color={p.hasPin ? colors.brandPrimary : colors.onSurfaceTertiary}
                  />
                </FocusButton>
                {!isActive && (
                  <FocusButton
                    testID={`switch-profile-${p.id}`}
                    onPress={() => {
                      /**
                       * GÜVENLİK AÇIĞI DÜZELTMESİ (v8.6.0)
                       * Buradaki geçiş PIN SORMADAN yapılıyordu — PIN'li bir
                       * profile (yönetici dahil) doğrudan girilebiliyordu.
                       * Artık PIN'li profillere geçiş, PIN ekranı üzerinden
                       * yapılıyor (profil seçme ekranıyla aynı kural).
                       */
                      if (p.hasPin) {
                        router.replace("/profile-select");
                        return;
                      }
                      switchProfile(p.id);
                    }}
                    style={styles.pAction}
                  >
                    <Ionicons name="swap-horizontal" size={20} color={colors.brandPrimary} />
                  </FocusButton>
                )}
                {profiles.length > 1 && !p.isAdmin && (
                  <FocusButton
                    testID={`delete-profile-${p.id}`}
                    onPress={() => {
                      // v6.1.0 (Seçenek C): Profil silme YÖNETİCİ PIN'i ister.
                      if (adminHasPin()) {
                        setDeleteFor(p.id); setDelPinInput(""); setDelError(null);
                      } else {
                        Alert.alert("Profili sil", `"${p.name}" profili ve listeleri silinsin mi?`, [
                          { text: "Vazgeç", style: "cancel" },
                          { text: "Sil", style: "destructive", onPress: () => removeProfile(p.id) },
                        ]);
                      }
                    }}
                    style={styles.pAction}
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </FocusButton>
                )}
              </View>
            );
          })}
          <FocusButton
            testID="manage-profiles-btn"
            onPress={() => router.push("/profile-select")}
            style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="people" size={18} color={colors.brandPrimary} />
            <Text style={[styles.linkText, { color: colors.brandPrimary }]}>Profil ekle / değiştir</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
          </FocusButton>

          {/* PROFİLDEN ÇIK (v6.3.0 — kullanıcı isteği)
              Kendi profilinden çıkıp "Kim izliyor?" ekranına döner.
              PIN'li profillere geri girerken tekrar PIN sorulur. */}
          <FocusButton
            testID="logout-profile-btn"
            onPress={() => {
              Alert.alert(
                "Profilden çık",
                `"${activeProfile?.name}" profilinden çıkılacak ve profil seçme ekranına dönülecek.`,
                [
                  { text: "Vazgeç", style: "cancel" },
                  { text: "Çık", onPress: () => router.replace("/profile-select") },
                ]
              );
            }}
            style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.onSurface} />
            <Text style={[styles.linkText, { color: colors.onSurface }]}>Profilden çık</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
          </FocusButton>

          {/* KENDİ PROFİLİNİ SİL (v6.3.0 — kullanıcı isteği)
              Yalnızca YÖNETİCİ OLMAYAN profiller kendini silebilir.
              Kullanıcı zaten kendi profilinin içinde (PIN'ini girdi), bu yüzden
              yönetici PIN'i istenmez; onay yeterlidir. */}
          {!activeProfile?.isAdmin && profiles.length > 1 && (
            <FocusButton
              testID="delete-own-profile-btn"
              onPress={() => {
                Alert.alert(
                  "Profilimi sil",
                  `"${activeProfile?.name}" profili ve ona ait TÜM listeler, favoriler ve ` +
                    "geçmiş kalıcı olarak silinecek.\n\nBu işlem geri alınamaz.",
                  [
                    { text: "Vazgeç", style: "cancel" },
                    {
                      text: "Profilimi sil",
                      style: "destructive",
                      onPress: async () => {
                        const id = activeProfile.id;
                        await removeProfile(id);
                        router.replace("/profile-select");
                      },
                    },
                  ]
                );
              }}
              style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.error ?? "#D32F2F" }]}
            >
              <Ionicons name="person-remove-outline" size={18} color={colors.error ?? "#D32F2F"} />
              <Text style={[styles.linkText, { color: colors.error ?? "#D32F2F" }]}>Profilimi sil</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            </FocusButton>
          )}
        </View>

        {/* Ebeveyn Kontrolü */}
        <SectionTitle text="EBEVEYN KONTROLÜ" />
        <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.sm }}>
          <View style={[styles.rowCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Ionicons name={parental.enabled ? "lock-closed" : "lock-open-outline"} size={20} color={parental.enabled ? colors.brandPrimary : colors.onSurfaceSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.onSurface }]}>PIN Koruması</Text>
              <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>
                {parental.enabled ? "Aktif - Kilitli kategoriler PIN ister" : "Pasif"}
              </Text>
            </View>
            {parental.enabled ? (
              <>
                <FocusButton testID="change-pin-btn" onPress={() => setPinModal("change")} style={styles.smallBtn}>
                  <Text style={[styles.smallBtnText, { color: colors.brandPrimary }]}>Değiştir</Text>
                </FocusButton>
                <FocusButton testID="remove-pin-btn" onPress={clearPin} style={styles.smallBtn}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </FocusButton>
              </>
            ) : (
              <FocusButton testID="create-pin-btn" onPress={() => setPinModal("create")} style={[styles.smallBtn, { backgroundColor: colors.brandPrimary, paddingHorizontal: SPACING.md, borderRadius: RADIUS.pill }]}>
                <Text style={[styles.smallBtnText, { color: colors.onBrandPrimary }]}>PIN Oluştur</Text>
              </FocusButton>
            )}
          </View>
          <FocusButton
            testID="adult-content-toggle"
            onPress={async () => {
              if (!parental.adultHidden) {
                await setAdultHidden(true);
                Alert.alert("+18 içerik gizlendi", "Canlı, film, dizi ve arama ekranlarında yetişkin içerik filtresi aktif.");
              } else {
                if (!parental.enabled || !parental.pin) { Alert.alert("PIN gerekli", "+18 içeriği yeniden açmak için önce Ebeveyn Kontrolü PIN'i oluşturun."); return; }
                setAdultPin(""); setAdultPinErr(null); setAdultPinModal(true);
              }
            }}
            style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name={parental.adultHidden ? "eye-off" : "eye"} size={22} color={parental.adultHidden ? colors.brandPrimary : colors.onSurfaceSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.onSurface }]}>+18 içeriği gizle</Text>
              <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>{parental.adultHidden ? "Gizli · Açmak için PIN gerekir" : "Görünür"}</Text>
            </View>
            {/* v15.0.1 BUILD FIX: React Native CSS `order` desteklemez; knob/text sırası gerçek child sırasıyla korunur. */}
            <View
              accessibilityRole="switch"
              accessibilityState={{ checked: !!parental.adultHidden }}
              style={[styles.adultSwitch, { backgroundColor: parental.adultHidden ? colors.brandPrimary : colors.surface, borderColor: parental.adultHidden ? colors.brandPrimary : colors.border }]}
            >
              {parental.adultHidden ? (
                <>
                  <Text style={[styles.adultSwitchText, { color: colors.onBrandPrimary }]}>AÇIK</Text>
                  <View style={styles.adultSwitchKnob} />
                </>
              ) : (
                <>
                  <View style={styles.adultSwitchKnob} />
                  <Text style={[styles.adultSwitchText, { color: colors.onSurfaceSecondary }]}>KAPALI</Text>
                </>
              )}
            </View>
          </FocusButton>


          {parental.enabled && (
            <>
              <FocusButton
                testID="lock-categories-btn"
                onPress={() => setShowLockModal(true)}
                style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              >
                <Ionicons name="funnel" size={18} color={colors.brandPrimary} />
                <Text style={[styles.linkText, { color: colors.brandPrimary }]}>
                  Kategorileri kilitle ({parental.lockedCategories.length} kilitli)
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
              </FocusButton>

          <FocusButton
            testID="hide-categories-btn"
            onPress={() => setShowHideModal(true)}
            style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="eye-off" size={22} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.onSurface }]}>
                Kategorileri gizle ({hiddenGroups.length} gizli)
              </Text>
              <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>
                Gizlenen kategoriler listede hiç görünmez (PIN ile açılır)
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
          </FocusButton>
              <FocusButton
                testID="hidden-manager-btn"
                onPress={() => router.push(parental.enabled ? "/hidden-pin" : "/hidden-manager")}
                style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              >
                <Ionicons name="eye-off" size={18} color={colors.brandPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.onSurface }]}>Kanal/Film/Dizi Gizleme</Text>
                  <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>Belirli öğeleri tamamen gizle (PIN gerekir)</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
              </FocusButton>
            </>
          )}
          {!parental.enabled && (
            <FocusButton
              testID="hidden-manager-btn"
              onPress={() => router.push("/hidden-manager")}
              style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <Ionicons name="eye-off-outline" size={18} color={colors.onSurfaceSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.onSurface }]}>Kanal/Film/Dizi Gizleme</Text>
                <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>Önce PIN oluşturun</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            </FocusButton>
          )}
        </View>

        {/* TV'ye Yansıtma */}
        <SectionTitle text="TV'YE YANSITMA" />
        <View style={{ paddingHorizontal: SPACING.lg }}>
          <FocusButton
            testID="chromecast-btn"
            onPress={() => setShowCastModal(true)}
            style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="tv" size={18} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.onSurface }]}>Chromecast / AirPlay</Text>
              <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>
                Oynatıcıdaki yayınlama simgesinden kullanılır
              </Text>
            </View>
            <View style={[styles.miniTag, { backgroundColor: colors.brandPrimary }]}>
              <Text style={[styles.miniTagText, { color: colors.onBrandPrimary }]}>AKTİF</Text>
            </View>
          </FocusButton>
        </View>

        {/* Player V2 — genel canlı tampon ayarı */}
        <SectionTitle text="OYNATICI" />
        <View style={{ paddingHorizontal: SPACING.lg }}>
          <View style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, alignItems: "flex-start", flexDirection: "column" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
              <Ionicons name="speedometer-outline" size={20} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.onSurface }]}>Canlı Yayın Tamponu</Text>
                <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>
                  Düşük değer daha hızlı kanal açar; yüksek değer zayıf bağlantıda daha stabildir.
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.sm }}>
              {PLAYER_BUFFER_PRESETS.map(preset => {
                const active = playerBufferMs === preset.ms;
                return (
                  <FocusButton
                    key={preset.id}
                    testID={`settings-buffer-preset-${preset.id}`}
                    focusable
                    onPress={() => void changePlayerBuffer(preset.ms)}
                    style={{
                      minWidth: isTv ? 180 : 96,
                      borderWidth: 1,
                      borderColor: active ? colors.brandPrimary : colors.border,
                      backgroundColor: active ? colors.brandPrimary + "22" : colors.surfaceTertiary,
                      borderRadius: RADIUS.md,
                      paddingHorizontal: SPACING.md,
                      paddingVertical: SPACING.sm,
                    }}
                  >
                    <Text style={{ color: active ? colors.brandPrimary : colors.onSurface, fontWeight: FONT.weight.bold }}>
                      {preset.label}
                    </Text>
                    <Text style={{ color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 }}>
                      {preset.detail}
                    </Text>
                  </FocusButton>
                );
              })}
            </View>
            <Text style={[styles.rowSub, { color: colors.onSurfaceTertiary, marginTop: SPACING.sm }]}>
              Gelişmiş değerler
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.xs }}>
              {PLAYER_BUFFER_OPTIONS.map(ms => {
                const active = playerBufferMs === ms;
                return (
                  <FocusButton
                    key={ms}
                    testID={`settings-buffer-${ms}`}
                    focusable
                    onPress={() => void changePlayerBuffer(ms)}
                    style={{
                      borderWidth: 1,
                      borderColor: active ? colors.brandPrimary : colors.border,
                      backgroundColor: active ? colors.brandPrimary + "18" : colors.surfaceTertiary,
                      borderRadius: RADIUS.pill,
                      paddingHorizontal: SPACING.sm,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: active ? colors.brandPrimary : colors.onSurface, fontWeight: FONT.weight.bold }}>
                      {ms === 0 ? "0" : `${ms / 1000}s`}
                    </Text>
                  </FocusButton>
                );
              })}
            </View>
            <Text style={[styles.rowSub, { color: colors.onSurfaceTertiary, marginTop: SPACING.sm }]}>
              Seçili: {bufferLabel(playerBufferMs)}
            </Text>
          </View>
        </View>

        {/* Oynatma Listeleri */}
        <SectionTitle text="OYNATMA LİSTELERİ" />
        <View style={{ paddingHorizontal: SPACING.lg }}>
          {playlists.length > 0 && (
            <FocusButton
              testID="settings-refresh-all-playlists"
              focusable
              disabled={refreshingAllPlaylists}
              onPress={() => void refreshAllPlaylists()}
              style={[styles.linkBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, marginBottom: SPACING.sm }]}
            >
              {refreshingAllPlaylists
                ? <ActivityIndicator size="small" color={colors.brandPrimary} />
                : <Ionicons name="refresh-circle" size={22} color={colors.brandPrimary} />}
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.onSurface }]}>Tümünü Güncelle</Text>
                <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>
                  {refreshingAllPlaylists ? refreshAllPlaylistProgress : "Tüm oynatma listelerini 2 kontrollü worker ile güncelle"}
                </Text>
              </View>
            </FocusButton>
          )}
          {playlists.map(pl => {
            const active = activePlaylist?.id === pl.id;
            const typeColor = playlistVisualColor(pl);
            return (
              <View key={pl.id} style={[styles.plCard, { backgroundColor: typeColor + "10", borderColor: active ? colors.brandPrimary : typeColor + "88" }]}>
                <View style={{ width: 4, alignSelf: "stretch", borderRadius: 4, backgroundColor: typeColor, marginRight: SPACING.sm }} />
                <FocusButton testID={`select-playlist-${pl.id}`} style={{ flex: 1 }} onPress={() => setActivePlaylist(pl.id)}>
                  <Text style={[styles.plName, { color: colors.onSurface }]} numberOfLines={1}>{pl.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: typeColor + "22", borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Ionicons name={playlistTypeIcon(pl) as any} size={13} color={typeColor} />
                      <Text style={{ color: typeColor, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>{playlistTypeLabel(pl)}</Text>
                    </View>
                    <Text style={[styles.plMeta, { color: colors.onSurfaceSecondary, flex: 1 }]} numberOfLines={1}>
                      {pl.channels.length} kanal{pl.vod?.length ? ` • ${pl.vod.length} film` : ""}{pl.series?.length ? ` • ${pl.series.length} dizi` : ""}
                    </Text>
                  </View>
                  {pl.serverCodeBinding && (
                    <Text style={[styles.plMeta, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>
                      Panel: {pl.serverCodeBinding.panelName} • Sunucu kodu: {pl.serverCodeBinding.code}
                    </Text>
                  )}
                  {/**
                    * HESAP ÖZETİ (v9.3.0 — kullanıcı isteği)
                    * Her listenin yanında bitiş tarihi ve max kullanıcı sayısı.
                    * Ayrı ekrana girmeden hangi aboneliğin ne zaman bittiği görünür.
                    */}
                  {(() => {
                    const acc: any = (pl as any).accountInfo;
                    if (!acc) return null;
                    const parts: string[] = [];

                    // Bitiş tarihi: Xtream saniye damgası, Stalker düz metin
                    const exp = acc.exp_date || acc.tariff_expired_date;
                    if (exp) {
                      const ts = Number(exp);
                      if (Number.isFinite(ts) && ts > 0) {
                        const d = new Date(ts * 1000);
                        const kalan = Math.ceil((d.getTime() - Date.now()) / 86400000);
                        parts.push(
                          `${d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })}` +
                            (kalan > 0 ? ` (${kalan} gün)` : " (SÜRESİ DOLDU)")
                        );
                      } else {
                        parts.push(String(exp));
                      }
                    }
                    if (acc.max_connections) parts.push(`${acc.max_connections} kullanıcı`);
                    if (parts.length === 0) return null;

                    const bitti = /DOLDU/.test(parts[0] || "");
                    return (
                      <Text
                        style={[styles.plMeta, { color: bitti ? (colors.error ?? "#D32F2F") : colors.onSurfaceTertiary }]}
                        numberOfLines={1}
                      >
                        {parts.join(" • ")}
                      </Text>
                    );
                  })()}
                </FocusButton>
                {active && <Ionicons name="radio-button-on" size={20} color={colors.brandPrimary} />}
                {/* LİSTE KİLİDİ (v9.3.0) — profil PIN'inden bağımsız */}
                <FocusButton
                  testID={`lock-playlist-${pl.id}`}
                  onPress={() => { setListPinFor(pl.id); setListPinVal(""); }}
                  hitSlop={8}
                  style={{ marginLeft: SPACING.sm }}
                >
                  <Ionicons
                    name={(pl as any).hasPin ? "lock-closed" : "lock-open-outline"}
                    size={18}
                    color={(pl as any).hasPin ? colors.brandPrimary : colors.onSurfaceTertiary}
                  />
                </FocusButton>
                <FocusButton testID={`edit-playlist-${pl.id}`} onPress={() => router.push({ pathname: "/edit-playlist", params: { id: pl.id } })} hitSlop={8} style={{ marginLeft: SPACING.sm }}>
                  <Ionicons name="create-outline" size={20} color={colors.onSurface} />
                </FocusButton>
                <FocusButton testID={`delete-playlist-${pl.id}`} onPress={() => removePlaylist(pl.id)} hitSlop={8} style={{ marginLeft: SPACING.sm }}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </FocusButton>
              </View>
            );
          })}
          <FocusButton
            testID="add-new-playlist-btn"
            onPress={() => router.push("/add-playlist")}
            style={[styles.addBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="add" size={20} color={colors.brandPrimary} />
            <Text style={[styles.addBtnText, { color: colors.brandPrimary }]}>Yeni liste ekle</Text>
          </FocusButton>
        </View>

        {/* EPG */}
        <SectionTitle text="EPG (PROGRAM REHBERİ)" />
        <View style={{ paddingHorizontal: SPACING.lg }}>
          <Text style={[styles.hint, { color: colors.onSurfaceSecondary }]}>
            XMLTV URL girin. Aktif liste için kaydedilir. Örnek: https://epgshare01.online/epgshare01/epg_ripper_TR1.xml.gz
          </Text>
          <TextInput
            testID="epg-url-input"
            value={epgInput} onChangeText={setEpgInput}
            editable={!!activePlaylist}
            placeholder="https://.../epg.xml (veya .xml.gz)"
            placeholderTextColor={colors.onSurfaceTertiary}
            autoCapitalize="none" autoCorrect={false}
            style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
          />
          <FocusButton
            testID="fetch-epg-btn" onPress={fetchEpg}
            disabled={!activePlaylist || epgLoading}
            style={[styles.epgBtn, { backgroundColor: colors.brandPrimary, opacity: (!activePlaylist || epgLoading) ? 0.5 : 1 }]}
          >
            {epgLoading ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <>
                <Ionicons name="download-outline" size={18} color={colors.onBrandPrimary} />
                <Text style={[styles.epgBtnText, { color: colors.onBrandPrimary }]}>EPG&apos;yi Yükle</Text>
              </>
            )}
          </FocusButton>
          {epgMsg && (
            <Text testID="epg-message" style={[styles.epgMsg, { color: epgMsg.type === "ok" ? colors.success : colors.error }]}>
              {epgMsg.text}
            </Text>
          )}
        </View>

        {/* Hakkında */}
        <SectionTitle text="HAKKINDA" />
        <View style={{ paddingHorizontal: SPACING.lg }}>
          <View style={[styles.aboutCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Text style={[styles.aboutTitle, { color: colors.onSurface }]}>KIZILKAN PLAYER ELITE</Text>
            <Text style={[styles.aboutVersion, { color: colors.onSurfaceSecondary }]}>Sürüm {Constants.expoConfig?.version ?? "4.4.0"} • Ultimate Edition</Text>
                <Text style={[styles.aboutText, { color: colors.onSurfaceSecondary }]}>
                  Kişisel IPTV player. Yalnızca kendi yasal aboneliğiniz veya kamuya açık kaynaklarla kullanın.
                </Text>
          </View>
        </View>
      </ScrollView>

      {/* PIN Modal */}
      <Modal visible={pinModal !== null} transparent animationType="fade" onRequestClose={() => setPinModal(null)}>
        <Pressable focusable={false} style={styles.modalBg} onPress={() => setPinModal(null)}>
          <Pressable focusable={false} style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={e => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>
              {pinModal === "create" ? "PIN Oluştur" : "PIN Değiştir"}
            </Text>
            <TextInput
              testID="new-pin-1"
              value={newPin}
              onChangeText={t => setNewPin(t.replace(/\D/g, "").slice(0, 4))}
              placeholder="Yeni PIN (4-10 rakam)"
              placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="number-pad" secureTextEntry maxLength={10}
              style={[styles.modalInput, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
            />
            <TextInput
              testID="new-pin-2"
              value={newPin2}
              onChangeText={t => setNewPin2(t.replace(/\D/g, "").slice(0, 4))}
              placeholder="PIN'i tekrar girin"
              placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="number-pad" secureTextEntry maxLength={10}
              style={[styles.modalInput, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
            />
            {pinErr && <Text style={{ color: colors.error, fontSize: FONT.size.sm, marginTop: 4 }}>{pinErr}</Text>}
            <View style={{ flexDirection: "row", gap: SPACING.md, marginTop: SPACING.lg }}>
              <FocusButton onPress={() => { setPinModal(null); setNewPin(""); setNewPin2(""); setPinErr(null); }} style={[styles.mBtn, { borderColor: colors.border, borderWidth: 1 }]}>
                <Text style={[styles.mBtnText, { color: colors.onSurface }]}>İptal</Text>
              </FocusButton>
              <FocusButton testID="save-pin-btn" onPress={savePin} style={[styles.mBtn, { backgroundColor: colors.brandPrimary }]}>
                <Text style={[styles.mBtnText, { color: colors.onBrandPrimary }]}>Kaydet</Text>
              </FocusButton>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* LİSTE KİLİDİ MODALI (v9.3.0) */}
      <Modal visible={!!listPinFor} transparent animationType="fade" onRequestClose={() => setListPinFor(null)}>
        <Pressable focusable={false} style={styles.modalBg} onPress={() => setListPinFor(null)}>
          <Pressable focusable={false} style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={e => e.stopPropagation()}>
            {(() => {
              const pl: any = playlists.find(x => x.id === listPinFor);
              const has = !!pl?.hasPin;
              return (
                <>
                  <Text style={[styles.modalTitle, { color: colors.onSurface }]}>{pl?.name} — Liste Kilidi</Text>
                  <Text style={[styles.hint, { color: colors.onSurfaceSecondary }]}>
                    {has
                      ? "Bu liste kilitli. Yeni PIN girip değiştirebilir veya kaldırabilirsiniz."
                      : "PIN koyarsanız bu listeye geçerken PIN sorulur. Profil PIN'inden bağımsızdır."}
                  </Text>
                  <TextInput
                    testID="list-lock-input"
                    value={listPinVal}
                    onChangeText={t => setListPinVal(t.replace(/\D/g, "").slice(0, 10))}
                    placeholder={has ? "Yeni PIN (4-10 rakam)" : "PIN (4-10 rakam)"}
                    placeholderTextColor={colors.onSurfaceTertiary}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={10}
                    style={[styles.input, { color: colors.onSurface, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
                  />
                  <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md }}>
                    {has && (
                      <FocusButton
                        onPress={async () => {
                          await updatePlaylist(listPinFor!, { hasPin: false, pin: undefined } as any);
                          setListPinFor(null);
                          Alert.alert("Tamam", "Liste kilidi kaldırıldı.");
                        }}
                        style={[styles.mBtn, { backgroundColor: colors.surfaceTertiary }]}
                      >
                        <Text style={[styles.mBtnText, { color: colors.error ?? "#D32F2F" }]}>Kilidi kaldır</Text>
                      </FocusButton>
                    )}
                    <FocusButton
                      testID="list-lock-save"
                      onPress={async () => {
                        const fmt = isValidPinFormat(listPinVal);
                        if (!fmt.ok) { Alert.alert("Geçersiz PIN", fmt.error || ""); return; }
                        await updatePlaylist(listPinFor!, { hasPin: true, pin: listPinVal } as any);
                        await ensureRecoveryCode();
                        setListPinFor(null);
                        Alert.alert("Kilit kuruldu", "Bu listeye geçerken PIN sorulacak.");
                      }}
                      style={[styles.mBtn, { backgroundColor: colors.brandPrimary }]}
                    >
                      <Text style={[styles.mBtnText, { color: colors.onBrandPrimary }]}>Kaydet</Text>
                    </FocusButton>
                  </View>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* TV MODU SEÇİMİ (v8.4.0 — kullanıcı isteği: döngü yerine liste) */}
      <Modal visible={tvModePicker} transparent animationType="fade" onRequestClose={() => setTvModePicker(false)}>
        <Pressable focusable={false} style={styles.modalBg} onPress={() => setTvModePicker(false)}>
          <Pressable focusable={false} style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={e => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>TV Modu</Text>
            {([
              { v: "auto", t: "Otomatik", d: "Cihaz türüne göre karar verilir" },
              { v: "on", t: "TV Modu (açık)", d: "Büyük yazı, kalın odak, kumanda düzeni" },
              { v: "off", t: "Telefon Modu", d: "Dokunmatik düzen" },
            ] as const).map(opt => (
              <FocusButton
                key={opt.v}
                testID={`tvmode-${opt.v}`}
                autoFocus={opt.v === "auto"}
                onPress={async () => { await setTvMode(opt.v); setTvModePicker(false); }}
                style={[styles.lockRow, { borderBottomColor: colors.border }]}
              >
                <Ionicons
                  name={tvMode === opt.v ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={tvMode === opt.v ? colors.brandPrimary : colors.onSurfaceTertiary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.onSurface }]}>{opt.t}</Text>
                  <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>{opt.d}</Text>
                </View>
              </FocusButton>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* TV ARAYÜZÜ SEÇİMİ (v8.4.0) */}
      <Modal visible={tvLayoutPicker} transparent animationType="fade" onRequestClose={() => setTvLayoutPicker(false)}>
        <Pressable focusable={false} style={styles.modalBg} onPress={() => setTvLayoutPicker(false)}>
          <Pressable focusable={false} style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={e => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>TV Arayüzü</Text>
            {([
              { v: "classic", t: "Klasik", d: "Tek sütun — sekmeler ve kanal listesi" },
              { v: "columns", t: "Sütunlu (DENEYSEL)", d: "4 sütun — henüz kararsız, sorun çıkarsa Klasik'e dönün" },
            ] as const).map(opt => (
              <FocusButton
                key={opt.v}
                testID={`tvlayout-${opt.v}`}
                autoFocus={opt.v === "classic"}
                onPress={async () => {
                  await setTvLayout(opt.v);
                  setTvLayoutPicker(false);
                  Alert.alert(
                    "TV arayüzü değişti",
                    opt.v === "columns"
                      ? "Sütunlu düzen seçildi.\n\nAlt menüden 'Canlı TV'ye geçin."
                      : "Klasik düzene dönüldü."
                  );
                }}
                style={[styles.lockRow, { borderBottomColor: colors.border }]}
              >
                <Ionicons
                  name={tvLayout === opt.v ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={tvLayout === opt.v ? colors.brandPrimary : colors.onSurfaceTertiary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.onSurface }]}>{opt.t}</Text>
                  <Text style={[styles.rowSub, { color: colors.onSurfaceSecondary }]}>{opt.d}</Text>
                </View>
              </FocusButton>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* SAĞLAYICI BİLGİLERİ DÜZENLEME (v7.2.0) */}
      <Modal visible={provModal} transparent animationType="slide" onRequestClose={() => setProvModal(false)}>
        <Pressable focusable={false} style={styles.modalBg} onPress={() => setProvModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "center" }}>
            <Pressable focusable={false} style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: "85%" }]} onPress={e => e.stopPropagation()}>
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Sağlayıcı Bilgilerim</Text>
              <Text style={[styles.hint, { color: colors.onSurfaceSecondary, marginBottom: SPACING.sm }]}>
                Bu bilgiler sunucudan gelmez; sağlayıcınızdan aldıklarınızı buraya
                kaydedersiniz. Liste yenilendiğinde kaybolmaz.
              </Text>
              <ScrollView>
                {[
                  { k: "apkUrl", l: "APK / Güncelleme linki", p: "https://..." },
                  { k: "website", l: "Web sitesi", p: "https://..." },
                  { k: "telegram", l: "Telegram", p: "@kanal veya https://t.me/..." },
                  { k: "whatsapp", l: "WhatsApp", p: "+90..." },
                  { k: "allowedPlayers", l: "İzin verilen oynatıcılar", p: "Örn: VLC, MX Player" },
                  { k: "bannedPlayers", l: "Yasaklı oynatıcılar", p: "Örn: ..." },
                  { k: "notes", l: "Notlar / Duyurular", p: "Sağlayıcı duyuruları" },
                ].map(fld => (
                  <View key={fld.k} style={{ marginBottom: SPACING.sm }}>
                    <Text style={[styles.hint, { color: colors.onSurfaceTertiary }]}>{fld.l}</Text>
                    <TextInput
                      testID={`prov-${fld.k}`}
                      value={provForm[fld.k] || ""}
                      onChangeText={t => setProvForm(prev => ({ ...prev, [fld.k]: t }))}
                      placeholder={fld.p}
                      placeholderTextColor={colors.onSurfaceTertiary}
                      autoCapitalize="none"
                      style={[styles.input, { color: colors.onSurface, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
                    />
                  </View>
                ))}
              </ScrollView>
              <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md }}>
                <FocusButton onPress={() => setProvModal(false)} style={[styles.mBtn, { backgroundColor: colors.surfaceTertiary }]}>
                  <Text style={[styles.mBtnText, { color: colors.onSurface }]}>Vazgeç</Text>
                </FocusButton>
                <FocusButton
                  testID="prov-save"
                  onPress={async () => {
                    if (!activePlaylist) return;
                    const clean: Record<string, string> = {};
                    Object.entries(provForm).forEach(([k, v]) => { if (v && v.trim()) clean[k] = v.trim(); });
                    await updatePlaylist(activePlaylist.id, { providerInfo: clean } as any);
                    setProvModal(false);
                  }}
                  style={[styles.mBtn, { backgroundColor: colors.brandPrimary }]}
                >
                  <Text style={[styles.mBtnText, { color: colors.onBrandPrimary }]}>Kaydet</Text>
                </FocusButton>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* PROFİL SİLME — YÖNETİCİ PIN MODALI (v6.1.0) */}
      <Modal visible={!!deleteFor} transparent animationType="fade" onRequestClose={() => { setDeleteFor(null); setDelPinInput(""); }}>
        <Pressable focusable={false} style={styles.modalBg} onPress={() => { setDeleteFor(null); setDelPinInput(""); }}>
          <Pressable focusable={false} style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={e => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Profili Sil</Text>
            <Text style={[styles.hint, { color: colors.onSurfaceSecondary }]}>
              {profiles.find(x => x.id === deleteFor)?.name} profili ve TÜM listeleri silinecek.
              Onaylamak için yönetici PIN&apos;ini girin.
            </Text>
            <TextInput
              testID="delete-admin-pin"
              value={delPinInput}
              onChangeText={t => { setDelPinInput(t.replace(/\D/g, "").slice(0, 10)); setDelError(null); }}
              placeholder="Yönetici PIN (4-10 rakam)"
              placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={10}
              style={[styles.input, { color: colors.onSurface, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
            />
            {delError && <Text style={{ color: colors.error, marginTop: 6 }}>{delError}</Text>}
            <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md }}>
              <FocusButton onPress={() => { setDeleteFor(null); setDelPinInput(""); setDelError(null); }} style={[styles.mBtn, { backgroundColor: colors.surfaceTertiary }]}>
                <Text style={[styles.mBtnText, { color: colors.onSurface }]}>Vazgeç</Text>
              </FocusButton>
              <FocusButton
                testID="delete-confirm-btn"
                onPress={async () => {
                  if (await verifyAdminPin(delPinInput)) {
                    const id = deleteFor!;
                    setDeleteFor(null); setDelPinInput("");
                    await removeProfile(id);
                  } else {
                    setDelError("Yönetici PIN'i yanlış");
                  }
                }}
                disabled={delPinInput.length < 4}
                style={[styles.mBtn, { backgroundColor: colors.error ?? "#D32F2F", opacity: delPinInput.length < 4 ? 0.5 : 1 }]}
              >
                <Text style={[styles.mBtnText, { color: "#fff" }]}>Sil</Text>
              </FocusButton>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* PROFİL PIN MODALI (v5.6.0)
          Kullanıcı isteği: profile sonradan PIN konulabilsin, kaldırılabilsin,
          isterse tekrar konulabilsin. */}
      <Modal visible={!!profilePinFor} transparent animationType="fade" onRequestClose={() => { setProfilePinFor(null); setProfilePinVal(""); }}>
        <Pressable focusable={false} style={styles.modalBg} onPress={() => { setProfilePinFor(null); setProfilePinVal(""); }}>
          <Pressable focusable={false} style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={e => e.stopPropagation()}>
            {(() => {
              const prof = profiles.find(x => x.id === profilePinFor);
              const has = !!prof?.hasPin;
              return (
                <>
                  <Text style={[styles.modalTitle, { color: colors.onSurface }]}>
                    {prof?.name} — Profil PIN&apos;i
                  </Text>
                  <Text style={[styles.hint, { color: colors.onSurfaceSecondary }]}>
                    {has
                      ? "Bu profilde PIN var. Yeni PIN girip değiştirebilir veya kaldırabilirsiniz."
                      : "PIN koyarsanız bu profile geçerken PIN sorulur. 4-10 rakam."}
                  </Text>
                  <TextInput
                    testID="profile-pin-input"
                    value={profilePinVal}
                    onChangeText={t => setProfilePinVal(t.replace(/[^0-9]/g, "").slice(0, 10))}
                    placeholder={has ? "Yeni PIN (4-10 rakam)" : "PIN (4-10 rakam)"}
                    placeholderTextColor={colors.onSurfaceTertiary}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={10}
                    style={[styles.input, { color: colors.onSurface, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
                  />
                  <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md }}>
                    {has && (
                      <FocusButton
                        testID="profile-pin-remove"
                        onPress={async () => {
                          await setProfPin(profilePinFor!, null);
                          setProfilePinFor(null); setProfilePinVal("");
                          Alert.alert("Tamam", "Profil PIN'i kaldırıldı.");
                        }}
                        style={[styles.mBtn, { backgroundColor: colors.surfaceTertiary }]}
                      >
                        <Text style={[styles.mBtnText, { color: colors.error ?? "#D32F2F" }]}>PIN&apos;i kaldır</Text>
                      </FocusButton>
                    )}
                    <FocusButton
                      testID="profile-pin-save"
                      onPress={async () => {
                        const fmt = isValidPinFormat(profilePinVal);
                        if (!fmt.ok) { Alert.alert("Geçersiz PIN", fmt.error || ""); return; }
                        await setProfPin(profilePinFor!, profilePinVal);
                        const code = await ensureRecoveryCode();
                        setProfilePinFor(null); setProfilePinVal("");
                        Alert.alert(
                          "PIN kaydedildi — Kurtarma Kodunuz",
                          `Bu kodu güvenli bir yere NOT EDİN:\n\n${code}\n\nPIN'inizi unutursanız bu kodla açabilirsiniz.`
                        );
                      }}
                      style={[styles.mBtn, { backgroundColor: colors.brandPrimary }]}
                    >
                      <Text style={[styles.mBtnText, { color: colors.onBrandPrimary }]}>Kaydet</Text>
                    </FocusButton>
                  </View>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* KATEGORİ GİZLEME MODALI (v5.5.0 — daha önce hiç yoktu) */}
      <Modal visible={showHideModal} transparent animationType="fade" onRequestClose={() => setShowHideModal(false)}>
        <Pressable focusable={false} style={styles.modalBg} onPress={() => setShowHideModal(false)}>
          <Pressable focusable={false} style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: "80%" }]} onPress={e => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Gizli Kategoriler</Text>
            <Text style={[styles.hint, { color: colors.onSurfaceSecondary, marginBottom: SPACING.md }]}>
              Gizlenen kategoriler listede HİÇ görünmez. Görmek için Gizli İçerikler
              ekranından PIN girmek gerekir.
            </Text>
            <ScrollView>
              {uniqueGroups.map(g => {
                const hidden = isGroupHidden(g);
                return (
                  <FocusButton
                    key={g}
                    testID={`toggle-cat-hide-${g}`}
                    onPress={() => toggleHiddenGroup(g)}
                    style={[styles.lockRow, { borderBottomColor: colors.border }]}
                  >
                    <Ionicons name={hidden ? "eye-off" : "eye-outline"} size={18} color={hidden ? colors.brandPrimary : colors.onSurfaceSecondary} />
                    <Text style={[styles.lockRowText, { color: colors.onSurface }]} numberOfLines={1}>{g}</Text>
                    <Ionicons name={hidden ? "checkbox" : "square-outline"} size={22} color={hidden ? colors.brandPrimary : colors.onSurfaceTertiary} />
                  </FocusButton>
                );
              })}
            </ScrollView>
            <FocusButton
              onPress={() => setShowHideModal(false)}
              style={[styles.mBtn, { backgroundColor: colors.brandPrimary, marginTop: SPACING.md }]}
            >
              <Text style={[styles.mBtnText, { color: colors.onBrandPrimary }]}>Tamam</Text>
            </FocusButton>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={adultPinModal} transparent animationType="fade" onRequestClose={() => setAdultPinModal(false)}>
        <Pressable focusable={false} style={styles.modalBg} onPress={() => setAdultPinModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "center" }}>
            <Pressable focusable={false} style={[styles.modalCard, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>+18 İçeriği Aç</Text>
              <TextInput value={adultPin} onChangeText={t=>{setAdultPin(t.replace(/\D/g,"").slice(0,10));setAdultPinErr(null);}} secureTextEntry keyboardType="number-pad" autoFocus={!isTv} placeholder="PIN" placeholderTextColor={colors.onSurfaceTertiary} style={{ marginTop: SPACING.md, height: 52, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md, textAlign: "center", fontSize: 20, color: colors.onSurface, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }} />
              {adultPinErr ? <Text style={{ color: colors.error, textAlign: "center", marginTop: 8 }}>{adultPinErr}</Text> : null}
              <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md }}>
                <FocusButton onPress={()=>setAdultPinModal(false)} style={[styles.mBtn,{borderColor:colors.border,borderWidth:1}]}><Text style={{color:colors.onSurface}}>İptal</Text></FocusButton>
                <FocusButton onPress={async()=>{const ok=await verifyPinAsync(adultPin);if(!ok){setAdultPinErr("Yanlış PIN");return;}await setAdultHidden(false);setAdultPinModal(false);setAdultPin("");}} style={[styles.mBtn,{backgroundColor:colors.brandPrimary}]}><Text style={{color:colors.onBrandPrimary}}>Aç</Text></FocusButton>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Category Lock Modal */}
      <Modal visible={showLockModal} transparent animationType="fade" onRequestClose={() => setShowLockModal(false)}>
        <Pressable focusable={false} style={styles.modalBg} onPress={() => setShowLockModal(false)}>
          <Pressable focusable={false} style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: "80%" }]} onPress={e => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Kilitli Kategoriler</Text>
            <Text style={[styles.hint, { color: colors.onSurfaceSecondary, marginBottom: SPACING.md }]}>
              Bu kategorilere PIN olmadan erişilemez. Çocuk profillerinde tamamen gizlenir.
            </Text>
            <ScrollView>
              {uniqueGroups.map(g => {
                const locked = isCategoryLocked(g);
                return (
                  <FocusButton
                    key={g}
                    testID={`toggle-cat-lock-${g}`}
                    onPress={() => toggleCategoryLock(g)}
                    style={[styles.lockRow, { borderBottomColor: colors.border }]}
                  >
                    <Ionicons name={locked ? "lock-closed" : "lock-open-outline"} size={18} color={locked ? colors.brandPrimary : colors.onSurfaceSecondary} />
                    <Text style={[styles.lockRowText, { color: colors.onSurface }]} numberOfLines={1}>{g}</Text>
                    <Ionicons name={locked ? "checkbox" : "square-outline"} size={22} color={locked ? colors.brandPrimary : colors.onSurfaceTertiary} />
                  </FocusButton>
                );
              })}
            </ScrollView>
            <FocusButton onPress={() => setShowLockModal(false)} style={[styles.mBtn, { backgroundColor: colors.brandPrimary, marginTop: SPACING.md }]}>
              <Text style={[styles.mBtnText, { color: colors.onBrandPrimary }]}>Tamam</Text>
            </FocusButton>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Chromecast info modal */}
      <Modal visible={showCastModal} transparent animationType="fade" onRequestClose={() => setShowCastModal(false)}>
        <Pressable focusable={false} style={styles.modalBg} onPress={() => setShowCastModal(false)}>
          <Pressable focusable={false} style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={e => e.stopPropagation()}>
            <Ionicons name="tv" size={40} color={colors.brandPrimary} style={{ alignSelf: "center", marginBottom: SPACING.md }} />
            <Text style={[styles.modalTitle, { color: colors.onSurface, textAlign: "center" }]}>Chromecast / AirPlay</Text>
            <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.base, lineHeight: 22, marginTop: SPACING.md, textAlign: "center" }}>
              Chromecast ve AirPlay özelliği, Expo Go üzerinde çalışamayan native modüller gerektirir.
              {"\n\n"}Bu özelliği kullanmak için uygulamayı <Text style={{ color: colors.brandPrimary, fontWeight: FONT.weight.bold }}>Publish</Text> edip iOS/Android build&apos;i almalısınız.
              Build sonrası cast butonu otomatik olarak aktif olacaktır.
            </Text>
            <FocusButton testID="cast-info-ok-btn" onPress={() => setShowCastModal(false)} style={[styles.mBtn, { backgroundColor: colors.brandPrimary, marginTop: SPACING.lg }]}>
              <Text style={[styles.mBtnText, { color: colors.onBrandPrimary }]}>Anladım</Text>
            </FocusButton>
          </Pressable>
        </Pressable>
      </Modal>
      {/* DVR info modal */}
      <Modal visible={showDvrModal} transparent animationType="fade" onRequestClose={() => setShowDvrModal(false)}>
        <Pressable focusable={false} style={styles.modalBg} onPress={() => setShowDvrModal(false)}>
          <Pressable focusable={false} style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={e => e.stopPropagation()}>
            <Ionicons name="recording" size={40} color={colors.brandPrimary} style={{ alignSelf: "center", marginBottom: SPACING.md }} />
            <Text style={[styles.modalTitle, { color: colors.onSurface, textAlign: "center" }]}>Kayıt Alma (DVR)</Text>
            <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.base, lineHeight: 22, marginTop: SPACING.md, textAlign: "center" }}>
              Canlı yayın kaydetme, dosya sistemine yazma iznine ve native FFmpeg modülüne ihtiyaç duyar; Expo Go üzerinde çalışamaz.
              {"\n\n"}Bu özelliği kullanmak için <Text style={{ color: colors.brandPrimary, fontWeight: FONT.weight.bold }}>Publish</Text> edip iOS/Android build alın.
              {"\n\n"}Alternatif: Xtream API kaynağınız Catch-up destekliyorsa, geriye dönük programları player&apos;dan izleyebilirsiniz.
            </Text>
            <FocusButton testID="dvr-info-ok-btn" onPress={() => setShowDvrModal(false)} style={[styles.mBtn, { backgroundColor: colors.brandPrimary, marginTop: SPACING.lg }]}>
              <Text style={[styles.mBtnText, { color: colors.onBrandPrimary }]}>Anladım</Text>
            </FocusButton>
          </Pressable>
        </Pressable>
      </Modal>
      {/* Shortcuts info modal */}
      <Modal visible={showShortcutsModal} transparent animationType="fade" onRequestClose={() => setShowShortcutsModal(false)}>
        <Pressable focusable={false} style={styles.modalBg} onPress={() => setShowShortcutsModal(false)}>
          <Pressable focusable={false} style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={e => e.stopPropagation()}>
            <Ionicons name="apps" size={40} color={colors.brandPrimary} style={{ alignSelf: "center", marginBottom: SPACING.md }} />
            <Text style={[styles.modalTitle, { color: colors.onSurface, textAlign: "center" }]}>Ana Ekran Kısayolları</Text>
            <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.base, lineHeight: 22, marginTop: SPACING.md, textAlign: "center" }}>
              KIZILKAN PLAYER ELITE simgesine uzun bastığınızda 4 hızlı kısayol görürsünüz:
              {"\n\n"}• 🔍 Ara{"\n"}• ❤️ Favoriler{"\n"}• 📅 TV Rehberi{"\n"}• ⚏ Çoklu Ekran
              {"\n\n"}Bu özellik iOS/Android native build gerektirir. Expo Go&apos;da çalışmaz.
              Kod tarafında hazır; <Text style={{ color: colors.brandPrimary, fontWeight: FONT.weight.bold }}>Publish</Text> sonrası aktif olur.
            </Text>
            <FocusButton testID="shortcuts-info-ok-btn" onPress={() => setShowShortcutsModal(false)} style={[styles.mBtn, { backgroundColor: colors.brandPrimary, marginTop: SPACING.lg }]}>
              <Text style={[styles.mBtnText, { color: colors.onBrandPrimary }]}>Anladım</Text>
            </FocusButton>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Notification info modal */}
      <Modal visible={showNotifModal} transparent animationType="fade" onRequestClose={() => setShowNotifModal(false)}>
        <Pressable focusable={false} style={styles.modalBg} onPress={() => setShowNotifModal(false)}>
          <Pressable focusable={false} style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={e => e.stopPropagation()}>
            <Ionicons name="notifications" size={40} color={colors.brandPrimary} style={{ alignSelf: "center", marginBottom: SPACING.md }} />
            <Text style={[styles.modalTitle, { color: colors.onSurface, textAlign: "center" }]}>Bildirim Paneli Kontrolü</Text>
            <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.base, lineHeight: 22, marginTop: SPACING.md, textAlign: "center" }}>
              İzlerken uygulamayı arka plana aldığınızda:
              {"\n\n"}📱 Android bildirim panelinde{"\n"}▶️ Oynat/Duraklat{"\n"}⏭ İleri/Geri{"\n"}❌ Kapat{"\n\n"}
              butonları çıkacak. Media session (MediaStyle) native modül gerektirir, Expo Go&apos;da çalışmaz.
              <Text style={{ color: colors.brandPrimary, fontWeight: FONT.weight.bold }}> Publish</Text> sonrası aktif olur.
            </Text>
            <FocusButton testID="notif-info-ok-btn" onPress={() => setShowNotifModal(false)} style={[styles.mBtn, { backgroundColor: colors.brandPrimary, marginTop: SPACING.lg }]}>
              <Text style={[styles.mBtnText, { color: colors.onBrandPrimary }]}>Anladım</Text>
            </FocusButton>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Formats info modal */}
      <Modal visible={showFormatsModal} transparent animationType="fade" onRequestClose={() => setShowFormatsModal(false)}>
        <Pressable focusable={false} style={styles.modalBg} onPress={() => setShowFormatsModal(false)}>
          <Pressable focusable={false} style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={e => e.stopPropagation()}>
            <Ionicons name="videocam" size={40} color={colors.brandPrimary} style={{ alignSelf: "center", marginBottom: SPACING.md }} />
            <Text style={[styles.modalTitle, { color: colors.onSurface, textAlign: "center" }]}>Desteklenen Formatlar</Text>
            <Text style={{ color: colors.onSurface, fontSize: FONT.size.sm, lineHeight: 22, marginTop: SPACING.md }}>
              <Text style={{ fontWeight: FONT.weight.bold }}>Yerel çalar (ExoPlayer / AVPlayer):</Text>
              {"\n"}✅ MP4, M4V, MOV — H.264, H.265/HEVC
              {"\n"}✅ MKV — H.264/HEVC, AAC/AC3/EAC3, çoklu ses/altyazı
              {"\n"}✅ TS — MPEG-TS (canlı IPTV standart)
              {"\n"}✅ HLS / M3U8 — Apple HTTP Live Streaming
              {"\n"}✅ DASH / MPD — MPEG-DASH
              {"\n"}✅ WebM / VP9
              {"\n"}⚠️ AVI — DivX/Xvid sınırlı
              {"\n"}⚠️ WMV — Windows Media (sınırlı)
              {"\n"}⚠️ FLV — Flash Video (eski)
              {"\n\n"}<Text style={{ fontWeight: FONT.weight.bold }}>Protokol:</Text>
              {"\n"}✅ HTTP — Çoğu IPTV kanalı (usesCleartextTraffic aktif)
              {"\n"}✅ HTTPS — Tüm SSL/TLS kanalları
              {"\n"}✅ Kimlik doğrulama URL&apos;leri (?token=... &authtoken=...)
              {"\n\n"}<Text style={{ fontWeight: FONT.weight.bold }}>Ses/Altyazı:</Text>
              {"\n"}✅ Çoklu ses parçası (Türkçe/İngilizce/Original)
              {"\n"}✅ WebVTT, SRT, ASS altyazı
              {"\n"}✅ SubRip embedded
              {"\n\n"}<Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs }}>
                Not: AVI/WMV/FLV formatlarında hata alırsanız sağlayıcınızdan MP4/HLS talep edin. DRM&apos;li (Widevine/FairPlay) içerikler yerel oynatıcıda çalışmaz.
              </Text>
            </Text>
            <FocusButton testID="formats-ok-btn" onPress={() => setShowFormatsModal(false)} style={[styles.mBtn, { backgroundColor: colors.brandPrimary, marginTop: SPACING.lg }]}>
              <Text style={[styles.mBtnText, { color: colors.onBrandPrimary }]}>Anladım</Text>
            </FocusButton>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Siri info modal */}
      <Modal visible={showSiriModal} transparent animationType="fade" onRequestClose={() => setShowSiriModal(false)}>
        <Pressable focusable={false} style={styles.modalBg} onPress={() => setShowSiriModal(false)}>
          <Pressable focusable={false} style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={e => e.stopPropagation()}>
            <Ionicons name="mic" size={40} color={colors.brandPrimary} style={{ alignSelf: "center", marginBottom: SPACING.md }} />
            <Text style={[styles.modalTitle, { color: colors.onSurface, textAlign: "center" }]}>Siri / Google Assistant</Text>
            <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.base, lineHeight: 22, marginTop: SPACING.md, textAlign: "center" }}>
              &quot;Hey Siri, KIZILKAN&apos;da beIN Sports 1 aç&quot; benzeri komutlar için:
              {"\n\n"}• iOS App Intents (iOS 16+){"\n"}• Android App Actions (Google Assistant){"\n\n"}
              Universal Search entegrasyonu native config ve capability gerektirir.
              <Text style={{ color: colors.brandPrimary, fontWeight: FONT.weight.bold }}> Publish</Text> sonrası App Intent shortcuts otomatik kaydedilir.
            </Text>
            <FocusButton testID="siri-info-ok-btn" onPress={() => setShowSiriModal(false)} style={[styles.mBtn, { backgroundColor: colors.brandPrimary, marginTop: SPACING.lg }]}>
              <Text style={[styles.mBtnText, { color: colors.onBrandPrimary }]}>Anladım</Text>
            </FocusButton>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function SectionTitle({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text style={{
      fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1.5,
      color: colors.onSurfaceTertiary,
      marginTop: SPACING.xl, marginBottom: SPACING.md, paddingHorizontal: SPACING.lg,
    }}>{text}</Text>
  );
}

function AccountInfoCard({ playlist, provider, onEditProvider }: { playlist: any; provider?: any; onEditProvider?: () => void }) {
  const { colors } = useTheme();
  const acc = playlist.accountInfo || {};
  const isXtream = playlist.source === "xtream";
  const isStalker = playlist.source === "stalker";

  const formatExpiry = () => {
    if (isXtream && acc.exp_date) {
      const ts = Number(acc.exp_date);
      if (!Number.isFinite(ts) || ts <= 0) return "Süresiz";
      return new Date(ts * 1000).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
    }
    if (isStalker && acc.tariff_expired_date) return String(acc.tariff_expired_date);
    return "—";
  };

  const daysLeft = () => {
    if (isXtream && acc.exp_date) {
      const ts = Number(acc.exp_date);
      if (!Number.isFinite(ts) || ts <= 0) return null;
      const diff = ts * 1000 - Date.now();
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    return null;
  };

  const d = daysLeft();
  const isActive = (acc.status || "").toLowerCase() === "active" || d === null || (d !== null && d > 0);

  return (
    <View style={[cardStyles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]} testID="account-info-card">
      <View style={cardStyles.headRow}>
        <View style={[cardStyles.statusDot, { backgroundColor: isActive ? colors.success : colors.error }]} />
        <Text style={[cardStyles.status, { color: isActive ? colors.success : colors.error }]}>
          {isActive ? "AKTİF" : "SÜRESİ DOLDU"}
        </Text>
        {acc.is_trial === "1" && (
          <View style={[cardStyles.trialBadge, { backgroundColor: colors.brandPrimary }]}>
            <Text style={[cardStyles.trialText, { color: colors.onBrandPrimary }]}>DENEME</Text>
          </View>
        )}
      </View>
      <View style={cardStyles.grid}>
        <InfoField label="Kullanıcı" value={acc.username || acc.mac || "—"} />
        <InfoField label="Bitiş Tarihi" value={formatExpiry()} />
        {d !== null && (
          <InfoField label="Kalan Gün" value={d > 0 ? `${d} gün` : "Süresi doldu"} accent={d > 0 && d < 15 ? "warning" : "normal"} />
        )}
        {isXtream && (
          <>
            <InfoField label="Max Kullanıcı" value={String(acc.max_connections || "—")} />
            {/* v7.2.0: Bu değer CANLI DEĞİL — sunucudan yalnızca liste
                eklenirken/yenilenirken alınan ANLIK görüntüdür. Kullanıcı
                "yanlış" sanmasın diye açıkça belirtiliyor. */}
            <InfoField
              label="Aktif Bağlantı (son yenilemede)"
              value={String(acc.active_cons ?? "0")}
            />
          </>
        )}
        {isStalker && (
          <>
            {acc.tariff_plan ? <InfoField label="Paket" value={String(acc.tariff_plan)} /> : null}
            {acc.mac ? <InfoField label="MAC" value={String(acc.mac)} /> : null}
            {acc.phone ? <InfoField label="Telefon" value={String(acc.phone)} /> : null}
          </>
        )}
      </View>

      {/* SUNUCU BİLGİLERİ (kullanıcı isteği: görünür olsun) */}
      {isXtream && playlist.serverInfo ? (
        <View style={[cardStyles.serverBox, { borderTopColor: colors.border }]}>
          <Text style={[cardStyles.serverTitle, { color: colors.onSurfaceTertiary }]}>SUNUCU BİLGİLERİ</Text>
          <View style={cardStyles.grid}>
            {playlist.serverInfo.url ? <InfoField label="Sunucu" value={String(playlist.serverInfo.url)} /> : null}
            {playlist.serverInfo.port ? <InfoField label="Port" value={String(playlist.serverInfo.port)} /> : null}
            {playlist.serverInfo.https_port ? <InfoField label="HTTPS Port" value={String(playlist.serverInfo.https_port)} /> : null}
            {playlist.serverInfo.server_protocol ? <InfoField label="Protokol" value={String(playlist.serverInfo.server_protocol)} /> : null}
            {playlist.serverInfo.timezone ? <InfoField label="Saat Dilimi" value={String(playlist.serverInfo.timezone)} /> : null}
            {playlist.serverInfo.version ? <InfoField label="Sürüm" value={String(playlist.serverInfo.version)} /> : null}
          </View>
        </View>
      ) : null}

      {/* SAĞLAYICI BİLGİLERİ — KULLANICININ KENDİ GİRDİĞİ (v7.2.0)
          Xtream standardında APK linki / Telegram / WhatsApp ALANI YOKTUR.
          Panel göndermiyorsa uygulama uyduramaz. Bu yüzden kullanıcı kendi
          sağlayıcısından aldığı bilgileri buraya kaydedebilir; elinin altında
          durur ve liste yenilendiğinde kaybolmaz. */}
      {onEditProvider ? (
        <View style={[cardStyles.serverBox, { borderTopColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[cardStyles.serverTitle, { color: colors.onSurfaceTertiary }]}>
              SAĞLAYICI BİLGİLERİM
            </Text>
            <FocusButton onPress={onEditProvider} hitSlop={8} focusRadius={8}>
              <Ionicons name="create-outline" size={18} color={colors.brandPrimary} />
            </FocusButton>
          </View>
          {provider && (provider.apkUrl || provider.telegram || provider.whatsapp || provider.website || provider.notes) ? (
            <View style={cardStyles.grid}>
              {provider.apkUrl ? <InfoField label="APK / Güncelleme" value={provider.apkUrl} /> : null}
              {provider.website ? <InfoField label="Web sitesi" value={provider.website} /> : null}
              {provider.telegram ? <InfoField label="Telegram" value={provider.telegram} /> : null}
              {provider.whatsapp ? <InfoField label="WhatsApp" value={provider.whatsapp} /> : null}
              {provider.allowedPlayers ? <InfoField label="İzin verilen oynatıcılar" value={provider.allowedPlayers} /> : null}
              {provider.bannedPlayers ? <InfoField label="Yasaklı oynatıcılar" value={provider.bannedPlayers} /> : null}
              {provider.notes ? <InfoField label="Notlar / Duyurular" value={provider.notes} /> : null}
            </View>
          ) : (
            <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.sm, lineHeight: 19 }}>
              Sağlayıcınızın APK indirme linki, destek bağlantısı ve oynatıcı
              kurallarını buraya kaydedebilirsiniz. Bu bilgiler Xtream
              standardında bulunmadığı için sunucudan otomatik gelmez.
              {"\n\n"}Eklemek için sağ üstteki kalem simgesine dokunun.
            </Text>
          )}
        </View>
      ) : null}

      {/* DESTEKLENEN YAYIN FORMATLARI (sunucudan — Xtream standardı) */}
      {isXtream && Array.isArray(acc.allowed_output_formats) && acc.allowed_output_formats.length > 0 ? (
        <View style={[cardStyles.serverBox, { borderTopColor: colors.border }]}>
          <Text style={[cardStyles.serverTitle, { color: colors.onSurfaceTertiary }]}>
            DESTEKLENEN YAYIN FORMATLARI
          </Text>
          <Text style={{ color: colors.onSurface, fontSize: FONT.size.sm }}>
            {acc.allowed_output_formats.join(" • ").toUpperCase()}
          </Text>
        </View>
      ) : null}

      {/* PANEL MESAJI (sunucudan — duyuru alanı) */}
      {acc.message ? (
        <View style={[cardStyles.serverBox, { borderTopColor: colors.border }]}>
          <Text style={[cardStyles.serverTitle, { color: colors.onSurfaceTertiary }]}>
            PANEL MESAJI / DUYURU
          </Text>
          <Text style={{ color: colors.onSurface, fontSize: FONT.size.sm, lineHeight: 19 }}>
            {String(acc.message)}
          </Text>
        </View>
      ) : null}

      {/* PANELİN GÖNDERDİĞİ DİĞER ALANLAR
          Bazı paneller APK linki, destek bağlantısı gibi ÖZEL alanlar gönderir.
          Standart olmadıkları için hepsini olduğu gibi listeliyoruz. */}
      {acc.extra && Object.keys(acc.extra).length > 0 ? (
        <View style={[cardStyles.serverBox, { borderTopColor: colors.border }]}>
          <Text style={[cardStyles.serverTitle, { color: colors.onSurfaceTertiary }]}>
            SAĞLAYICININ GÖNDERDİĞİ EK BİLGİLER
          </Text>
          <View style={cardStyles.grid}>
            {Object.entries(acc.extra).slice(0, 12).map(([k, v]) => (
              <InfoField key={k} label={k} value={String(v)} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function InfoField({ label, value, accent }: { label: string; value: string; accent?: "normal" | "warning" }) {
  const { colors } = useTheme();
  const color = accent === "warning" ? colors.error : colors.onSurface;
  return (
    <View style={cardStyles.field}>
      <Text style={[cardStyles.fieldLabel, { color: colors.onSurfaceTertiary }]}>{label}</Text>
      <Text style={[cardStyles.fieldValue, { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: { padding: SPACING.lg, borderRadius: RADIUS.md, borderWidth: 1 },
  headRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.md },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  status: { fontSize: FONT.size.sm, fontWeight: FONT.weight.black, letterSpacing: 1.5 },
  trialBadge: { marginLeft: "auto", paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.sm },
  trialText: { fontSize: FONT.size.xs, fontWeight: FONT.weight.black, letterSpacing: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.md },
  serverBox: { marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1 },
  serverTitle: { fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1, marginBottom: SPACING.sm },
  field: { minWidth: "45%", flexGrow: 1 },
  fieldLabel: { fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1, marginBottom: 2 },
  fieldValue: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
});

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.md },
  title: { fontSize: FONT.size.xxl, fontWeight: FONT.weight.black, flex: 1 },
  profileBadge: { paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: RADIUS.pill },
  profileBadgeText: { color: "#fff", fontSize: FONT.size.sm, fontWeight: FONT.weight.bold },
  themeGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: SPACING.lg, gap: SPACING.md },
  themeCard: { width: "47.5%", aspectRatio: 1.4, borderRadius: RADIUS.md, borderWidth: 2, padding: SPACING.md, justifyContent: "space-between" },
  themeSwatch: { width: 40, height: 40, borderRadius: RADIUS.pill },
  themeName: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  themeCheck: { position: "absolute", top: 8, right: 8 },
  profileCard: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1.5, marginBottom: SPACING.sm,
  },
  pAvatar: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  pAvatarText: { color: "#fff", fontSize: FONT.size.lg, fontWeight: FONT.weight.black },
  pName: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  pMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  miniTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.sm },
  miniTagText: { color: "#fff", fontSize: 9, fontWeight: FONT.weight.black, letterSpacing: 1 },
  pAction: { padding: SPACING.xs },
  linkBtn: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    height: 52, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.lg,
  },
  linkText: { flex: 1, fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  rowCard: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1,
  },
  rowTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  rowSub: { fontSize: FONT.size.sm, marginTop: 2 },
  smallBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  smallBtnText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.bold },
  plCard: { flexDirection: "row", alignItems: "center", padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1.5, marginBottom: SPACING.sm },
  plName: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  plMeta: { fontSize: FONT.size.sm, marginTop: 2 },
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 48, borderRadius: RADIUS.md, borderWidth: 1.5, borderStyle: "dashed",
  },
  addBtnText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  hint: { fontSize: FONT.size.sm, marginBottom: SPACING.md, lineHeight: 18 },
  input: { height: 48, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, fontSize: FONT.size.base, marginBottom: SPACING.md },
  epgBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, height: 48, borderRadius: RADIUS.pill },
  epgBtnText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  epgMsg: { marginTop: SPACING.sm, fontSize: FONT.size.sm },
  aboutCard: { padding: SPACING.lg, borderRadius: RADIUS.md, borderWidth: 1 },
  aboutTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.black, letterSpacing: 1 },
  aboutVersion: { fontSize: FONT.size.sm, marginTop: 2, marginBottom: SPACING.sm },
  aboutText: { fontSize: FONT.size.sm, lineHeight: 18 },
  // Modals
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: SPACING.lg },
  modalCard: { width: "100%", maxWidth: 400, padding: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1, gap: SPACING.sm },
  modalTitle: { fontSize: FONT.size.xl, fontWeight: FONT.weight.bold, marginBottom: SPACING.md },
  modalInput: { height: 52, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, fontSize: FONT.size.lg },
  mBtn: { flex: 1, height: 48, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  mBtnText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  lockRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, paddingVertical: SPACING.md, borderBottomWidth: 1 },
  lockRowText: { flex: 1, fontSize: FONT.size.base },

  adultSwitch: { minWidth: 88, height: 38, borderWidth: 1, borderRadius: 19, flexDirection: "row", alignItems: "center", paddingHorizontal: 6, gap: 5 },
  adultSwitchKnob: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#fff" },
  adultSwitchText: { flex: 1, textAlign: "center", fontSize: 10, fontWeight: "800" },
});
