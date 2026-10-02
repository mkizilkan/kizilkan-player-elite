import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { useProfiles } from "@/src/store/ProfileContext";
import { useLibrary } from "@/src/store/LibraryContext";
import { useDownloads } from "@/src/store/DownloadContext";
import { DownloadDialog, type SaveTarget, type DownloadOptions } from "@/src/components/DownloadDialog";
import { startNativeDownload } from "@/src/utils/nativeDownloads";
import { api } from "@/src/utils/api";
import { xtreamSeriesInfo as xtSeriesInfoLocal, xtreamVodInfo as xtVodInfoLocal } from "@/src/utils/iptv";
import { storage } from "@/src/utils/storage";
import { haptic } from "@/src/utils/haptic";
import { FocusButton } from "@/src/components/FocusButton";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";

const EPISODE_URL_KEY = "kizilkan.episode.url.";
const PLAYER_NAV_KEY = "kizilkan.player.nav.";
const PLAYER_SERIES_NAV_KEY = "kizilkan.player.seriesNav.";

export default function DetailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ type: string; id: string; navOrigin?: string; navGroup?: string; navSearch?: string; focusKey?: string; navScopeKey?: string }>();
  const { activePlaylist, addToRecent, ensureHeavyLoaded } = usePlaylists();
  const { activeProfile } = useProfiles();
  const sourceOwner = { playlistId: activePlaylist?.id || "", profileId: activeProfile.id };
  const detailScope = JSON.stringify([sourceOwner.profileId, sourceOwner.playlistId, params.id, params.type]);
  const detailScopeRef = useRef(detailScope);
  detailScopeRef.current = detailScope;
  const nativeItemOwnerRef = useRef("");

  // v15.2.4: detay ekranı bütün VOD/Series koleksiyonunu hydrate etmez.
  // Native Core varsa seçili öğeyi doğrudan Room'dan ister.
  useEffect(() => {
    if (!KizilkanNativeCore.available && activePlaylist?.id) void ensureHeavyLoaded(activePlaylist.id);
  }, [activePlaylist?.id, ensureHeavyLoaded]);
  const { toggleWatchlist, inWatchlist, watchProgress, toggleHiddenItem, isItemHidden, isWatched, setWatched, setSeriesLast } = useLibrary();
  const { add: addDownload, isDownloaded, getLocalUri } = useDownloads();

  const [info, setInfo] = useState<any>(null);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dlDialog, setDlDialog] = useState(false);
  const [dlDefaultTarget, setDlDefaultTarget] = useState<SaveTarget>(KizilkanNativeCore.available ? "public" : "app");
  /** v18.6.0: indirilecek öğe (film VEYA bölüm). */
  const [dlItem, setDlItem] = useState<{ id: string; name: string; url: string; ext: string; subdir: string; poster?: string; kind: "vod" | "episode" } | null>(null);
  const [nativeItem, setNativeItem] = useState<any>(null);

  // Kayıtlı varsayılan indirme hedefini oku.
  useEffect(() => {
    storage.getItem<string>("kizilkan.download.target", "").then((t) => {
      if (t === "app" || t === "downloads" || t === "public" || t === "custom") setDlDefaultTarget(t);
    });
  }, []);

  const isSeries = params.type === "series";
  useEffect(() => {
    nativeItemOwnerRef.current = ""; setNativeItem(null);
    if (!KizilkanNativeCore.available || !activePlaylist?.id || !params.id) { setNativeItem(null); return; }
    let cancelled = false;
    KizilkanNativeCore.getItem(activePlaylist.id, isSeries ? "series" : "vod", params.id)
      .then(value => { if (!cancelled) { nativeItemOwnerRef.current = detailScope; setNativeItem(value); } })
      .catch(e => console.warn("[Detail] Room getItem failed", e));
    return () => { cancelled = true; };
  }, [activePlaylist?.id, activeProfile.id, params.id, isSeries]);

  const item = useMemo(() => {
    if (KizilkanNativeCore.available) return nativeItemOwnerRef.current === detailScope ? nativeItem : null;
    if (!activePlaylist) return null;
    const list = isSeries ? (activePlaylist.series || []) : (activePlaylist.vod || []);
    return list.find(x => x.id === params.id) || null;
  }, [activePlaylist, params.id, isSeries, nativeItem, detailScope]);

  useEffect(() => {
    if (!activePlaylist || !item) { setLoading(false); return; }
    if (activePlaylist.source === "xtream") {
      setLoading(true);
      const { xtreamServer, xtreamUsername, xtreamPassword } = activePlaylist;
      const cred = { server: xtreamServer!, username: xtreamUsername!, password: xtreamPassword! };
      const call = isSeries
        ? xtSeriesInfoLocal(cred, String((item as any).series_id))
        : xtVodInfoLocal(cred, String((item as any).stream_id));
      call.then((res: any) => {
        setInfo(res.info || {});
        if (isSeries) setSeasons(res.seasons || []);
      }).catch(e => setError(e.message)).finally(() => setLoading(false));
      return;
    }
    if (activePlaylist.source === "stalker" && isSeries && (item as any).series_id) {
      setLoading(true);
      (async () => {
        const { stalkerLogin, stalkerSeriesInfo, stalkerCredsFromPlaylist } = await import("@/src/utils/stalker");
        const cred = stalkerCredsFromPlaylist(activePlaylist);
        const { session } = await stalkerLogin(cred);
        return stalkerSeriesInfo(cred, session, String((item as any).series_id));
      })().then(res => { setInfo(res.info || {}); setSeasons(res.seasons || []); })
        .catch(e => setError(e.message)).finally(() => setLoading(false));
      return;
    }
    setLoading(false);
  }, [activePlaylist, item, isSeries]);

  if (!item) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]}>
        <Text style={{ color: colors.onSurface, padding: SPACING.lg }}>İçerik bulunamadı</Text>
      </SafeAreaView>
    );
  }

  const poster = (item as any).poster || info?.movie_image || info?.cover_big;
  /**
   * ARKA PLAN GÖRSELİ (v7.3.0)
   * Sunucudan backdrop_path geliyordu ama kullanılmıyordu. Varsa hero
   * bölümünde afişin bulanık kopyası yerine GERÇEK geniş görsel kullanılır —
   * özellikle TV'de çok daha iyi görünür.
   */
  const backdrop =
    (Array.isArray(info?.backdrop_path) ? info?.backdrop_path[0] : info?.backdrop_path) ||
    (item as any).backdrop_path ||
    null;

  const chooseResumePosition = async (progress: any): Promise<number> => {
    const current = Math.max(0, Number(progress?.current || 0));
    const duration = Math.max(0, Number(progress?.duration || 0));
    // İlk birkaç saniye anlamlı bir "kaldığın yer" değildir.
    if (current < 10 || duration <= 0 || current / duration >= 0.95) return 0;
    const mm = Math.floor(current / 60);
    const ss = Math.floor(current % 60);
    return await new Promise<number>((resolve) => {
      Alert.alert(
        "İzlemeye nasıl devam edilsin?",
        `Kayıtlı konum: ${mm}:${String(ss).padStart(2, "0")}`,
        [
          { text: "Baştan izle", style: "cancel", onPress: () => resolve(0) },
          { text: "Kaldığın yerden devam et", onPress: () => resolve(current) },
        ],
        { cancelable: true, onDismiss: () => resolve(0) },
      );
    });
  };

  const handlePlayVod = async () => {
    if (!("url" in item) || !item.url) return;
    // Store movie URL under a synthetic channel id and navigate to player
    const syntheticId = `vodplay-${item.id}`;
    await storage.setItem(EPISODE_URL_KEY + syntheticId, JSON.stringify({
      ...sourceOwner,
      url: (item as any).url,
      headers: (item as any).headers,
      name: item.name,
      group: (item as any).group || "Film",
      container_ext: (item as any).container_ext || "mp4",
      poster,
    }));
    const resumeAt = await chooseResumePosition(watchProgress[item.id]);
    if (detailScope !== detailScopeRef.current) return;
    addToRecent(item.id);
    router.push({ pathname: "/player", params: {
      id: syntheticId, ext: "true",
      ...(resumeAt > 0 ? { resumeAt: String(resumeAt) } : {}),
      navOrigin: params.navOrigin || "detail", navGroup: params.navGroup || (item as any).group || "__all__",
      navSearch: params.navSearch || "", focusKey: params.focusKey || `detail:vod:${item.id}`, navScopeKey: params.navScopeKey,
    } });
  };

  const handlePlayEpisode = async (ep: any) => {
    // v17.0.0: Dizi navigation bundle yalnız BU dizinin bölüm listesini taşır;
    // 20K-100K global katalog PlayerHost'a hydrate edilmez. Tek storage kaydı
    // sayesinde sezon sınırında dahi unlimited next/previous deterministik kalır.
    const orderedEpisodes = seasons.flatMap((season: any) => Array.isArray(season?.episodes) ? season.episodes : []);
    const seriesNavKey = `${activePlaylist?.id || "playlist"}:${item.id}`;
    const navItems = orderedEpisodes.map((candidate: any) => ({
      ...sourceOwner,
      id: `epplay-${candidate.id}`,
      realId: String(candidate.id),
      url: candidate.url,
      name: `${item.name} • ${candidate.title}`,
      group: (item as any).group || "Dizi",
      headers: candidate.headers || (item as any).headers,
      container_ext: candidate.container_ext || "mp4",
      poster: poster || null,
      episode_num: candidate.episode_num ?? null,
    }));
    await storage.setItem(PLAYER_SERIES_NAV_KEY + seriesNavKey, JSON.stringify({ items: navItems }));

    const syntheticId = `epplay-${ep.id}`;
    // v18.6.0: afişte "hangi bölümde kaldın" için dizinin son açılan bölümü.
    setSeriesLast(String(item.id), {
      season: seasons.find((sz: any) => Array.isArray(sz?.episodes) && sz.episodes.some((e: any) => String(e.id) === String(ep.id)))?.season ?? "",
      episode: ep.episode_num ?? "", title: ep.title, episodeId: String(ep.id),
    });
    const idx = navItems.findIndex((candidate: any) => candidate.id === syntheticId);
    const currentPayload = idx >= 0 ? navItems[idx] : {
      ...sourceOwner,
      id: syntheticId, realId: String(ep.id), url: ep.url, name: `${item.name} • ${ep.title}`,
      group: (item as any).group || "Dizi", headers: ep.headers || (item as any).headers, container_ext: ep.container_ext || "mp4", poster: poster || null,
    };
    await storage.setItem(EPISODE_URL_KEY + syntheticId, JSON.stringify({ ...currentPayload, seriesNavKey }));
    // Geriye dönük küçük komşu kaydı da korunur; bundle okunamazsa fail-safe çalışır.
    await storage.setItem(PLAYER_NAV_KEY + syntheticId, JSON.stringify({
      previousId: idx > 0 ? navItems[idx - 1].id : null,
      nextId: idx >= 0 && idx + 1 < navItems.length ? navItems[idx + 1].id : null,
    }));

    const resumeAt = await chooseResumePosition(watchProgress[String(ep.id)]);
    if (detailScope !== detailScopeRef.current) return;
    addToRecent(item.id);
    router.push({ pathname: "/player", params: {
      id: syntheticId, ext: "true", ...(resumeAt > 0 ? { resumeAt: String(resumeAt) } : {}),
      navOrigin: params.navOrigin || "detail", navGroup: params.navGroup || (item as any).group || "__all__",
      navSearch: params.navSearch || "", focusKey: params.focusKey || `detail:series:${item.id}:episode:${ep.id}`, navScopeKey: params.navScopeKey,
    } });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["bottom"]} testID="detail-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xxxl }}>
        <View style={styles.heroWrap}>
          {poster ? (
            <Image source={{ uri: backdrop || poster }} style={styles.heroImg} resizeMode="cover" blurRadius={backdrop ? 0 : 20} />
          ) : (
            <View style={[styles.heroImg, { backgroundColor: colors.surfaceSecondary }]} />
          )}
          <LinearGradient
            colors={["rgba(0,0,0,0.4)", "transparent", colors.surface]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView edges={["top"]} style={styles.heroSafe}>
            <FocusButton onPress={() => router.back()} hitSlop={12} style={styles.backBtn} testID="detail-back-btn">
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </FocusButton>
          </SafeAreaView>

          <View style={styles.heroContent}>
            <View style={styles.posterFrame}>
              {poster ? (
                <Image source={{ uri: poster }} style={styles.posterImg} resizeMode="cover" />
              ) : (
                <View style={[styles.posterImg, { backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name={isSeries ? "albums" : "film"} size={40} color={colors.onSurfaceSecondary} />
                </View>
              )}
            </View>
            <View style={styles.heroInfo}>
              <Text style={[styles.title, { color: "#fff" }]} numberOfLines={3}>{item.name}</Text>
              <View style={styles.metaRow}>
                {(item as any).rating_5based ? (
                  <View style={styles.metaChip}>
                    <Ionicons name="star" size={12} color="#FFD700" />
                    <Text style={styles.metaText}>{Number((item as any).rating_5based).toFixed(1)}</Text>
                  </View>
                ) : null}
                {info?.releasedate || (item as any).release_date || (item as any).year ? (
                  <View style={styles.metaChip}>
                    <Text style={styles.metaText}>
                      {(info?.releasedate || (item as any).release_date || (item as any).year || "").toString().slice(0, 4)}
                    </Text>
                  </View>
                ) : null}
                {/* SÜRE (v7.3.0): artık liste verisinden de okunuyor.
                    Eskiden yalnızca detay çağrısı dönerse görünüyordu. */}
                {info?.duration || (item as any).duration ? (
                  <View style={styles.metaChip}>
                    <Ionicons name="time-outline" size={12} color="#fff" />
                    <Text style={styles.metaText}>{info?.duration || (item as any).duration}</Text>
                  </View>
                ) : null}

                {/* YAŞ SINIRI (v7.3.0) — ebeveyn kontrolü için değerli */}
                {info?.age || (item as any).age ? (
                  <View style={[styles.metaChip, { backgroundColor: "rgba(220,40,40,0.85)" }]}>
                    <Text style={[styles.metaText, { fontWeight: "700" }]}>
                      {String(info?.age || (item as any).age).replace(/[^0-9+]/g, "") || info?.age || (item as any).age}+
                    </Text>
                  </View>
                ) : null}

                {/* ÜLKE (v7.3.0) */}
                {info?.country || (item as any).country ? (
                  <View style={styles.metaChip}>
                    <Ionicons name="flag-outline" size={12} color="#fff" />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {info?.country || (item as any).country}
                    </Text>
                  </View>
                ) : null}
                {info?.genre || (item as any).genre ? (
                  <View style={styles.metaChip}>
                    <Text style={styles.metaText} numberOfLines={1}>{info?.genre || (item as any).genre}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={{ padding: SPACING.xl }}><ActivityIndicator color={colors.brandPrimary} /></View>
        ) : (
          <View style={{ padding: SPACING.lg }}>
            {!isSeries && (
              <View style={{ flexDirection: "row", gap: SPACING.sm }}>
                <FocusButton
                  testID="play-vod-btn"
                  onPress={() => { haptic.medium(); handlePlayVod(); }}
                  activeOpacity={0.85}
                  focusable
                  style={[styles.playBtn, { backgroundColor: colors.brandPrimary, flex: 1 }]}
                >
                  <Ionicons name={watchProgress[item.id] ? "play-circle" : "play"} size={22} color={colors.onBrandPrimary} />
                  <Text style={[styles.playBtnText, { color: colors.onBrandPrimary }]}>
                    {watchProgress[item.id] ? "Devam Et" : isWatched(item.id) ? "Tekrar İzle" : "Oynat"}
                  </Text>
                </FocusButton>
                {/* v18.6.0: izlendi işareti (dokun → işaretle/kaldır) */}
                <FocusButton
                  testID="watched-toggle-btn"
                  onPress={() => { haptic.light(); void setWatched(item.id, !isWatched(item.id)); }}
                  activeOpacity={0.75}
                  focusable
                  style={[styles.iconAction, { backgroundColor: isWatched(item.id) ? colors.success + "33" : colors.surfaceSecondary, borderColor: isWatched(item.id) ? colors.success : colors.border }]}
                >
                  <Ionicons name={isWatched(item.id) ? "checkmark-done-circle" : "checkmark-circle-outline"} size={22} color={isWatched(item.id) ? colors.success : colors.onSurface} />
                </FocusButton>
                {/* FRAGMAN (v7.3.0)
                    Sunucudan youtube_trailer geliyordu ama hiç kullanılmıyordu.
                    Cihazdaki YouTube uygulamasında veya tarayıcıda açılır. */}
                {(info?.youtube_trailer || (item as any).youtube_trailer) ? (
                  <FocusButton
                    testID="trailer-btn"
                    onPress={async () => {
                      haptic.soft();
                      const raw = String(info?.youtube_trailer || (item as any).youtube_trailer || "").trim();
                      // Sağlayıcı bazen tam adres, bazen sadece video kimliği gönderir.
                      const url = /^https?:\/\//i.test(raw)
                        ? raw
                        : `https://www.youtube.com/watch?v=${encodeURIComponent(raw)}`;
                      try {
                        const Linking = (await import("expo-linking")).default;
                        await Linking.openURL(url);
                      } catch {
                        try {
                          const RN = await import("react-native");
                          await RN.Linking.openURL(url);
                        } catch {
                          Alert.alert("Fragman açılamadı", "Cihazda uygun bir uygulama bulunamadı.");
                        }
                      }
                    }}
                    activeOpacity={0.75}
                    style={[styles.iconAction, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                  >
                    <Ionicons name="logo-youtube" size={22} color="#FF0000" />
                  </FocusButton>
                ) : null}

                <FocusButton
                  testID="watchlist-btn"
                  onPress={() => { haptic.soft(); toggleWatchlist(item.id); }}
                  activeOpacity={0.75}
                  style={[styles.iconAction, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                >
                  <Ionicons name={inWatchlist(item.id) ? "bookmark" : "bookmark-outline"} size={22} color={inWatchlist(item.id) ? colors.brandPrimary : colors.onSurface} />
                </FocusButton>
                <FocusButton
                  testID="hide-item-btn"
                  onPress={() => { haptic.warning(); toggleHiddenItem(item.id); }}
                  activeOpacity={0.75}
                  style={[styles.iconAction, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                >
                  <Ionicons name={isItemHidden(item.id) ? "eye-off" : "eye-outline"} size={22} color={isItemHidden(item.id) ? colors.brandPrimary : colors.onSurface} />
                </FocusButton>
              </View>
            )}
            {isSeries && (
              <View style={{ flexDirection: "row", gap: SPACING.sm }}>
                {/* FRAGMAN (v7.3.0)
                    Sunucudan youtube_trailer geliyordu ama hiç kullanılmıyordu.
                    Cihazdaki YouTube uygulamasında veya tarayıcıda açılır. */}
                {(info?.youtube_trailer || (item as any).youtube_trailer) ? (
                  <FocusButton
                    testID="trailer-btn"
                    onPress={async () => {
                      haptic.soft();
                      const raw = String(info?.youtube_trailer || (item as any).youtube_trailer || "").trim();
                      // Sağlayıcı bazen tam adres, bazen sadece video kimliği gönderir.
                      const url = /^https?:\/\//i.test(raw)
                        ? raw
                        : `https://www.youtube.com/watch?v=${encodeURIComponent(raw)}`;
                      try {
                        const Linking = (await import("expo-linking")).default;
                        await Linking.openURL(url);
                      } catch {
                        try {
                          const RN = await import("react-native");
                          await RN.Linking.openURL(url);
                        } catch {
                          Alert.alert("Fragman açılamadı", "Cihazda uygun bir uygulama bulunamadı.");
                        }
                      }
                    }}
                    activeOpacity={0.75}
                    style={[styles.iconAction, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                  >
                    <Ionicons name="logo-youtube" size={22} color="#FF0000" />
                  </FocusButton>
                ) : null}

                <FocusButton
                  testID="watchlist-btn"
                  onPress={() => { haptic.soft(); toggleWatchlist(item.id); }}
                  activeOpacity={0.75}
                  style={[styles.iconAction, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, flex: 1 }]}
                >
                  <Ionicons name={inWatchlist(item.id) ? "bookmark" : "bookmark-outline"} size={22} color={inWatchlist(item.id) ? colors.brandPrimary : colors.onSurface} />
                  <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold, marginLeft: 8 }}>
                    {inWatchlist(item.id) ? "İzleme Listemde" : "İzleme Listeme Ekle"}
                  </Text>
                </FocusButton>
                <FocusButton
                  testID="hide-item-btn"
                  onPress={() => { haptic.warning(); toggleHiddenItem(item.id); }}
                  activeOpacity={0.75}
                  style={[styles.iconAction, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                >
                  <Ionicons name={isItemHidden(item.id) ? "eye-off" : "eye-outline"} size={22} color={isItemHidden(item.id) ? colors.brandPrimary : colors.onSurface} />
                </FocusButton>
              </View>
            )}
            {!isSeries && !!(item as any).url && (
              <FocusButton
                testID="download-vod-btn"
                onPress={async () => {
                  if (isDownloaded(item.id)) {
                    const uri = getLocalUri(item.id);
                    if (uri) {
                      const synth = { id: `dl-${item.id}`, url: uri, name: item.name, group: "İndirilenler", container_ext: (item as any).container_ext || "mp4", poster: item.poster };
                      await storage.setItem(EPISODE_URL_KEY + synth.id, JSON.stringify(synth));
                      router.push({ pathname: "/player", params: { id: synth.id } });
                    }
                  } else {
                    haptic.medium();
                    setDlItem({ id: item.id, name: item.name, url: (item as any).url, ext: (item as any).container_ext || "mp4", subdir: "Filmler", poster: item.poster, kind: "vod" });
                    setDlDialog(true);
                  }
                }}
                activeOpacity={0.75}
                style={[styles.iconAction, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, flex: 1, marginTop: SPACING.sm }]}
              >
                <Ionicons
                  name={isDownloaded(item.id) ? "checkmark-circle" : "cloud-download-outline"}
                  size={22}
                  color={isDownloaded(item.id) ? "#00C853" : colors.brandPrimary}
                />
                <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold, marginLeft: 8 }}>
                  {isDownloaded(item.id) ? "Çevrimdışı Hazır" : "İndir"}
                </Text>
              </FocusButton>
            )}

            {(info?.plot || info?.description || (item as any).plot) ? (
              <View style={{ marginTop: SPACING.lg }}>
                <Text style={[styles.sectionTitle, { color: colors.onSurfaceSecondary }]}>KONU</Text>
                <Text style={[styles.plotText, { color: colors.onSurface }]}>
                  {info?.plot || info?.description || (item as any).plot}
                </Text>
              </View>
            ) : null}

            <View style={styles.detailsGrid}>
              {info?.cast || (item as any).cast ? (
                <DetailRow label="Oyuncular" value={info?.cast || (item as any).cast} />
              ) : null}
              {info?.director || (item as any).director ? (
                <DetailRow label="Yönetmen" value={info?.director || (item as any).director} />
              ) : null}
              {info?.country ? <DetailRow label="Ülke" value={info.country} /> : null}
              {info?.rating || (item as any).rating ? <DetailRow label="Puan" value={String(info?.rating || (item as any).rating)} /> : null}
            </View>

            {isSeries && seasons.length === 0 && (item as any).url ? (
              <FocusButton testID="play-series-direct-btn" onPress={async () => {
                const syntheticId = `seriesplay-${item.id}`;
                await storage.setItem(EPISODE_URL_KEY + syntheticId, JSON.stringify({
                  ...sourceOwner,
                  url: (item as any).url, headers: (item as any).headers, name: item.name, group: (item as any).group || "Dizi", container_ext: (item as any).container_ext || "mp4",
                }));
                const resumeAt = await chooseResumePosition(watchProgress[item.id]);
                if (detailScope !== detailScopeRef.current) return;
                addToRecent(item.id);
                router.push({ pathname: "/player", params: { id: syntheticId, ext: "true", ...(resumeAt > 0 ? { resumeAt: String(resumeAt) } : {}), navOrigin: params.navOrigin || "detail", navGroup: params.navGroup || (item as any).group || "__all__", navSearch: params.navSearch || "", focusKey: params.focusKey || `detail:vod:${item.id}`, navScopeKey: params.navScopeKey } });
              }} focusable style={[styles.playBtn, { backgroundColor: colors.brandPrimary }]}>
                <Ionicons name="play" size={20} color={colors.onBrandPrimary} />
                <Text style={[styles.playBtnText, { color: colors.onBrandPrimary }]}>Oynat</Text>
              </FocusButton>
            ) : null}

            {isSeries && seasons.length > 0 && (
              <View style={{ marginTop: SPACING.xl }}>
                <Text style={[styles.sectionTitle, { color: colors.onSurfaceSecondary }]}>BÖLÜMLER</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm, marginBottom: SPACING.md }}>
                  {seasons.map((s, idx) => {
                    const active = selectedSeasonIdx === idx;
                    // v18.6.0: sezonda izlenen bölüm sayısı; hepsi izlendiyse ✓
                    const eps: any[] = Array.isArray(s?.episodes) ? s.episodes : [];
                    const seen = eps.filter((e: any) => isWatched(String(e.id))).length;
                    const started = eps.some((e: any) => !!watchProgress[String(e.id)]);
                    const allSeen = eps.length > 0 && seen === eps.length;
                    return (
                      <FocusButton
                        key={s.season}
                        testID={`season-${s.season}-btn`}
                        onPress={() => setSelectedSeasonIdx(idx)}
                        focusable
                        style={[
                          styles.seasonChip,
                          { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                          active && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
                        ]}
                      >
                        <Text style={[
                          styles.seasonChipText,
                          { color: active ? colors.onBrandPrimary : colors.onSurface }
                        ]}>Sezon {s.season}{allSeen ? " ✓" : seen > 0 ? ` · ${seen}/${eps.length}` : started ? " ●" : ""}</Text>
                      </FocusButton>
                    );
                  })}
                </ScrollView>
                {seasons[selectedSeasonIdx]?.episodes.map((ep: any) => (
                  <View key={ep.id} style={{ flexDirection: "row", alignItems: "stretch", gap: SPACING.xs }}>
                  <FocusButton
                    testID={`episode-${ep.id}-btn`}
                    onPress={() => handlePlayEpisode(ep)}
                    onLongPress={() => { haptic.medium(); void setWatched(String(ep.id), !isWatched(String(ep.id))); }}
                    delayLongPress={450}
                    activeOpacity={0.75}
                    focusable
                    style={[styles.epRow, { flex: 1, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                  >
                    <View style={[styles.epNum, { backgroundColor: colors.surfaceTertiary }]}>
                      <Text style={[styles.epNumText, { color: colors.onSurface }]}>{ep.episode_num}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.epTitle, { color: colors.onSurface }]} numberOfLines={1}>{ep.title}</Text>
                      {ep.plot ? <Text style={[styles.epPlot, { color: colors.onSurfaceSecondary }]} numberOfLines={2}>{ep.plot}</Text> : null}
                      {/* v18.6.0: kaldığın yer — ilerleme çubuğu + kalan dakika */}
                      {!isWatched(String(ep.id)) && watchProgress[String(ep.id)]?.duration > 0 ? (() => {
                        const wp = watchProgress[String(ep.id)];
                        const pct = Math.min(1, wp.current / wp.duration);
                        const left = Math.max(1, Math.round((wp.duration - wp.current) / 60));
                        return (
                          <View style={{ marginTop: 4, gap: 2 }}>
                            <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
                              <View style={{ height: 3, width: `${pct * 100}%`, backgroundColor: colors.brandPrimary }} />
                            </View>
                            <Text style={{ color: colors.brandPrimary, fontSize: FONT.size.xs }}>Kaldığın yer · {left} dk kaldı</Text>
                          </View>
                        );
                      })() : null}
                    </View>
                    {isWatched(String(ep.id))
                      ? <Ionicons name="checkmark-circle" size={26} color={colors.success} />
                      : <Ionicons name="play-circle" size={26} color={colors.brandPrimary} />}
                  </FocusButton>
                  {/* v18.6.0: bölüm indirme (görünür klasör: İndirilenler/KIZILKAN PLAYER ELITE/Diziler/<dizi>) */}
                  {!!ep.url && (
                    <FocusButton
                      testID={`episode-${ep.id}-dl`}
                      focusable
                      onPress={() => {
                        haptic.medium();
                        const sNum = seasons[selectedSeasonIdx]?.season_number ?? seasons[selectedSeasonIdx]?.season ?? "";
                        const label = `${item.name} S${String(sNum).padStart(2, "0")}E${String(ep.episode_num || "").padStart(2, "0")}${ep.title ? ` ${ep.title}` : ""}`;
                        setDlItem({ id: `ep-${ep.id}`, name: label, url: ep.url, ext: ep.container_ext || "mp4", subdir: `Diziler/${item.name}`, poster: item.poster, kind: "episode" });
                        setDlDialog(true);
                      }}
                      style={[styles.epRow, { width: 52, justifyContent: "center", alignItems: "center", paddingHorizontal: 0, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                    >
                      <Ionicons name="cloud-download-outline" size={22} color={colors.brandPrimary} />
                    </FocusButton>
                  )}
                  </View>
                ))}
              </View>
            )}

            {error && <Text style={{ color: colors.error, marginTop: SPACING.md }}>{error}</Text>}
          </View>
        )}
      </ScrollView>

      <DownloadDialog
        visible={dlDialog && !!dlItem}
        fileName={`${dlItem?.name || "video"}.${dlItem?.ext || "mp4"}`}
        sourceUrl={dlItem?.url || ""}
        defaultTarget={dlDefaultTarget}
        maxConnections={Number((activePlaylist as any)?.accountInfo?.max_connections || 0) || undefined}
        subdirLabel={dlItem?.subdir || "Filmler"}
        onConfirm={async (target: SaveTarget, remember: boolean, opts: DownloadOptions) => {
          if (!dlItem) return;
          if (remember) {
            await storage.setItem("kizilkan.download.target", target);
            setDlDefaultTarget(target);
          }
          // v18.6.0: görünür klasör / seçilen klasör → native parçalı motor.
          if (target === "public" || target === "custom") {
            await startNativeDownload({
              id: `ndl-${dlItem.id}`, name: dlItem.name, url: dlItem.url, ext: dlItem.ext,
              subdir: dlItem.subdir, parts: opts.parts, treeUri: opts.treeUri, size: opts.size,
            });
            router.push("/downloads");
            return;
          }
          // Eski yol (uygulama içi / cihaza aktar) — aynen korunur.
          await addDownload({
            id: dlItem.id,
            name: dlItem.name,
            poster: dlItem.poster,
            sourceUrl: dlItem.url,
            ext: dlItem.ext,
            kind: "vod",
            saveTarget: target === "downloads" ? "downloads" : "app",
          });
          router.push("/downloads");
        }}
        onClose={() => setDlDialog(false)}
      />
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: SPACING.sm }}>
      <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1 }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ color: colors.onSurface, fontSize: FONT.size.base, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

const HERO_H = 340;
const POSTER_W = 110;
const POSTER_H = 165;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  heroWrap: { height: HERO_H, position: "relative" },
  heroImg: { width: "100%", height: "100%" },
  heroSafe: { position: "absolute", top: 0, left: 0, right: 0 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center", justifyContent: "center",
    marginLeft: SPACING.md, marginTop: SPACING.sm,
  },
  heroContent: {
    position: "absolute",
    bottom: SPACING.lg,
    left: SPACING.lg, right: SPACING.lg,
    flexDirection: "row",
    gap: SPACING.lg,
  },
  posterFrame: {
    width: POSTER_W, height: POSTER_H,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.15)",
  },
  posterImg: { width: "100%", height: "100%" },
  heroInfo: { flex: 1, justifyContent: "flex-end" },
  title: { fontSize: FONT.size.xxl, fontWeight: FONT.weight.black, lineHeight: 28 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: SPACING.sm },
  metaChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: RADIUS.sm, backgroundColor: "rgba(255,255,255,0.12)",
  },
  metaText: { color: "#fff", fontSize: FONT.size.xs, fontWeight: FONT.weight.semibold },
  playBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm,
    height: 52, borderRadius: RADIUS.pill,
  },
  playBtnText: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  iconAction: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    height: 52, borderRadius: RADIUS.pill, borderWidth: 1, paddingHorizontal: SPACING.md, minWidth: 52,
  },
  sectionTitle: { fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1.5, marginBottom: SPACING.sm },
  plotText: { fontSize: FONT.size.base, lineHeight: 22 },
  detailsGrid: { marginTop: SPACING.lg },
  seasonChip: {
    height: 36, paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill, borderWidth: 1,
    justifyContent: "center", flexShrink: 0,
  },
  seasonChipText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.bold },
  epRow: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1,
    marginBottom: SPACING.sm,
  },
  epNum: {
    width: 40, height: 40, borderRadius: RADIUS.sm,
    alignItems: "center", justifyContent: "center",
  },
  epNumText: { fontSize: FONT.size.base, fontWeight: FONT.weight.black },
  epTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  epPlot: { fontSize: FONT.size.sm, marginTop: 2 },
});
