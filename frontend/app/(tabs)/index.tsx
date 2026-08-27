import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  Image,
  InteractionManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { useLibrary } from "@/src/store/LibraryContext";
import { api } from "@/src/utils/api";
import { ChannelRow } from "@/src/components/ChannelRow";
import { ChannelActionSheet, type ActionItem } from "@/src/components/ChannelActionSheet";
import { refreshPlaylistContent } from "@/src/utils/refreshPlaylist";
import { CategoryPanel, type CategoryEntry } from "@/src/components/CategoryPanel";
import { InputDialog } from "@/src/components/InputDialog";
import * as IntentLauncher from "expo-intent-launcher";
import {
  loadOverrides, setOverride, toggleGroup, applyOverride,
  subscribeOverrides, type OverrideMap,
  loadOrdering, applyGroupOrder, applyItemOrder, moveGroup, moveItemInGroup,
  renameGroup, deleteGroup, loadCategorySort, saveCategorySort,
  sortCategories, type Ordering, type CategorySort,
} from "@/src/utils/overrides";

/** Kanal satırı yüksekliği (logo 44 + dolgu + kenarlık + satır arası). */
const ROW_HEIGHT_PHONE = 78;
const ROW_HEIGHT_TV = 52;   // v7.8.0: TV'de kompakt satır
import { GroupDialog } from "@/src/components/GroupDialog";
import { PosterGrid } from "@/src/components/PosterGrid";
import { KizilkanLogo } from "@/src/components/KizilkanLogo";
import { ChannelRowSkeleton as _ChannelRowSkeleton } from "@/src/components/Skeleton";
import { useProfiles } from "@/src/store/ProfileContext";
import { useParental } from "@/src/store/ParentalContext";
import { isAdultContent } from "@/src/utils/adult";
import { haptic } from "@/src/utils/haptic";
import type { NowNext, VodItem, SeriesItem } from "@/src/types";
import { FocusButton } from "@/src/components/FocusButton";
import { useTv } from "@/src/store/TvContext";
import { useFocusScroll } from "@/src/hooks/useFocusScroll";
import { TvHomeContent } from "@/app/tv-home";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";
import { recordDiagnostic } from "@/src/utils/diagnostics";

const ALL = "__all__";
type Tab = "live" | "vod" | "series";

/**
 * ANA EKRAN SEÇİCİ (v8.3.0)
 * ===========================================================================
 * TV'de "Sütunlu" arayüz seçiliyse o ekranı, aksi halde klasik ekranı gösterir.
 *
 * NEDEN AYRI SARMALAYICI?
 * Koşullu "return" bir bileşenin İÇİNDE yapılırsa, aşağıdaki hook'lar
 * çağrılmaz ve React "Rendered fewer hooks than expected" hatasıyla ÇÖKER.
 * Bu yüzden seçim, hiç hook kullanmayan ayrı bir sarmalayıcıda yapılıyor;
 * her iki ekran da kendi hook'larını eksiksiz çalıştırır.
 * ===========================================================================
 */
export default function LiveTvScreen() {
  const { isTv, tvLayout } = useTv();
  if (isTv && tvLayout === "columns") return <TvHomeContent />;
  return <ClassicLiveTvScreen />;
}

function ClassicLiveTvScreen() {
  const { isTv: isTvLayout } = useTv();
  /**
   * KANAL ÖNİZLEME (v7.6.0) — TiviMate deseni, TV'YE ÖZEL
   * TV'de OK basınca doğrudan tam ekrana geçmek yerine önce kanal bilgisi +
   * yayın akışı gösterilir; kullanıcı emin olunca tekrar OK ile açar.
   * Telefonda bu ara adım gereksiz olduğu için UYGULANMAZ.
   */
  const [previewChannel, setPreviewChannel] = useState<any>(null);
  // TV: odaklanan satır her zaman ekranda kalsın (v7.2.0)
  const { listRef, onItemFocus, onScrollToIndexFailed } = useFocusScroll<any>();
  const router = useRouter();
  const { colors } = useTheme();
  const { activePlaylist, playlists, toggleFavorite, isFavorite, addToRecent, updatePlaylist, ensureHeavyLoaded, nativeSummary } = usePlaylists();
  const { activeProfile } = useProfiles();
  const { settings: parental, isCategoryLocked, isUnlockedInSession, toggleCategoryLock } = useParental();
  const { isItemHidden, isGroupHidden, hiddenModeUnlocked, toggleHiddenItem, toggleHiddenGroup, toggleWatchlist, inWatchlist } = useLibrary();
  const [tab, setTab] = useState<Tab>("live");
  const [actionItem, setActionItem] = useState<any | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [catPanel, setCatPanel] = useState(false);
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [inputMode, setInputMode] = useState<null | { kind: "rename" | "logo" | "renameGroup"; item: any; group?: string }>(null);
  const [groupDialogItem, setGroupDialogItem] = useState<any | null>(null);
  const [manageGroup, setManageGroup] = useState<string | null>(null);
  const [ordering, setOrdering] = useState<Ordering>({ groups: [], items: {} });
  const [catSort, setCatSort] = useState<CategorySort>("server");

  // Kullanıcı özelleştirmelerini (isim/simge/grup) yükle ve değişimleri dinle.
  useEffect(() => {
    if (!activePlaylist?.id) { setOverrides({}); return; }
    let alive = true;
    const load = () => {
      loadOverrides(activePlaylist.id).then(m => { if (alive) setOverrides(m); });
      loadOrdering(activePlaylist.id).then(o => { if (alive) setOrdering(o); });
      loadCategorySort(activePlaylist.id).then(v => { if (alive) setCatSort(v); });
    };
    load();
    const unsub = subscribeOverrides(load);
    return () => { alive = false; unsub(); };
  }, [activePlaylist?.id]);

  /** Aktif listeyi kaynağından yeniden çeker (cihaz-içi). */
  const doRefresh = async () => {
    if (!activePlaylist || refreshing) return;
    haptic.medium();
    setRefreshing(true);
    try {
      const res = await refreshPlaylistContent(activePlaylist);
      if (res.ok && res.patch) {
        await updatePlaylist(activePlaylist.id, res.patch);
        haptic.success();
        Alert.alert("Liste güncellendi", res.message);
      } else {
        haptic.error();
        Alert.alert("Yenilenemedi", res.message);
      }
    } finally {
      setRefreshing(false);
    }
  };
  const [selectedCat, setSelectedCat] = useState<string>(ALL);

  /**
   * v15.2.1 Native Data Core / Room:
   * Ana Canlı ekranı artık sırf mount oldu diye 10-50 bin kanalı JS belleğine
   * hydrate ETMEZ. Android/Room mevcutsa yalnız görünür sayfa istenir. Film/dizi
   * ve legacy özellikler gerektiğinde ensureHeavyLoaded ile eski sözleşmeye geri
   * dönebilir; hiçbir özellik kaldırılmaz.
   */
  const nativePageGeneration = useRef(0);
  const nativePageLoadingRef = useRef(false);
  const nativeLiveOffsetRef = useRef(0);
  const [nativeLiveItems, setNativeLiveItems] = useState<any[]>([]);
  const [nativeLiveHasMore, setNativeLiveHasMore] = useState(false);
  const [nativeLiveTotal, setNativeLiveTotal] = useState(0);
  const [nativeCategoryRows, setNativeCategoryRows] = useState<Array<{ name: string; count: number }>>([]);
  const nativeLibraryOffsetRef = useRef(0);
  const [nativeLibraryItems, setNativeLibraryItems] = useState<any[]>([]);
  const [nativeLibraryHasMore, setNativeLibraryHasMore] = useState(false);
  const [nativeLibraryTotal, setNativeLibraryTotal] = useState(0);
  const [nativeLibraryCategoryRows, setNativeLibraryCategoryRows] = useState<Array<{ name: string; count: number }>>([]);
  // v15.2.19: native sayfa state'inin hangi playlist'e ait olduğunu açıkça taşı.
  // Active playlist değiştiği renderda eski listenin item'ları bir frame bile gösterilmez.
  const [nativePageOwnerId, setNativePageOwnerId] = useState<string | null>(null);

  const hasAnyCustomGroups = useMemo(() =>
    Object.values(overrides || {}).some((o: any) => Array.isArray(o?.groups) && o.groups.length > 0),
  [overrides]);

  const nativeLivePaged = !!activePlaylist?.id
    && KizilkanNativeCore.available
    && tab === "live"
    && !hasAnyCustomGroups
    && Number(nativeSummary?.channels || activePlaylist.channelsCount || 0) > 0;

  const nativeLibraryPaged = !!activePlaylist?.id
    && KizilkanNativeCore.available
    && (tab === "vod" || tab === "series")
    && !hasAnyCustomGroups
    && Number(tab === "vod" ? (nativeSummary?.vod || activePlaylist.vodCount || 0) : (nativeSummary?.series || activePlaylist.seriesCount || 0)) > 0;

  const selectedIsCustomGroup = useMemo(() => {
    if (selectedCat === ALL) return false;
    return Object.values(overrides || {}).some((o: any) => Array.isArray(o?.groups) && o.groups.includes(selectedCat));
  }, [selectedCat, overrides]);

  const loadNativeLivePage = useCallback(async (reset: boolean) => {
    if (!activePlaylist?.id || !nativeLivePaged || selectedIsCustomGroup) return;
    if (nativePageLoadingRef.current && !reset) return;
    const generation = reset ? ++nativePageGeneration.current : nativePageGeneration.current;
    nativePageLoadingRef.current = true;
    try {
      const offset = reset ? 0 : nativeLiveOffsetRef.current;
      if (reset) nativeLiveOffsetRef.current = 0;
      const page = await KizilkanNativeCore.queryItems<any>(activePlaylist.id, "live", {
        group: selectedCat === ALL ? "__all__" : selectedCat,
        offset,
        limit: 80,
      });
      if (generation !== nativePageGeneration.current) return;
      setNativePageOwnerId(activePlaylist.id);
      setNativeLiveItems(prev => reset ? page.items : [...prev, ...page.items]);
      nativeLiveOffsetRef.current = offset + page.items.length;
      setNativeLiveHasMore(!!page.hasMore);
      setNativeLiveTotal(Number(page.total || 0));
    } catch (e) {
      console.warn("[NativeDataCore] canlı Room sorgusu başarısız; tam katalog JS heap'ine hydrate edilmeyecek", e);
      void recordDiagnostic("database", "NATIVE_LIVE_QUERY_FAILED", { playlistId: activePlaylist.id, error: String((e as any)?.message || e) });
    } finally {
      if (generation === nativePageGeneration.current) nativePageLoadingRef.current = false;
    }
  }, [activePlaylist?.id, nativeLivePaged, selectedIsCustomGroup, selectedCat, ensureHeavyLoaded]);

  const loadNativeLibraryPage = useCallback(async (reset: boolean) => {
    if (!activePlaylist?.id || !nativeLibraryPaged || selectedIsCustomGroup || (tab !== "vod" && tab !== "series")) return;
    if (nativePageLoadingRef.current && !reset) return;
    const generation = reset ? ++nativePageGeneration.current : nativePageGeneration.current;
    nativePageLoadingRef.current = true;
    try {
      const offset = reset ? 0 : nativeLibraryOffsetRef.current;
      if (reset) nativeLibraryOffsetRef.current = 0;
      const page = await KizilkanNativeCore.queryItems<any>(activePlaylist.id, tab, {
        group: selectedCat === ALL ? "__all__" : selectedCat,
        offset, limit: 72,
      });
      if (generation !== nativePageGeneration.current) return;
      setNativePageOwnerId(activePlaylist.id);
      setNativeLibraryItems(prev => reset ? page.items : [...prev, ...page.items]);
      nativeLibraryOffsetRef.current = offset + page.items.length;
      setNativeLibraryHasMore(!!page.hasMore);
      setNativeLibraryTotal(Number(page.total || 0));
    } catch (e) {
      console.warn("[NativeDataCore] VOD/Series Room sorgusu başarısız; tam katalog JS heap'ine hydrate edilmeyecek", e);
      void recordDiagnostic("database", "NATIVE_LIBRARY_QUERY_FAILED", { playlistId: activePlaylist.id, kind: tab, error: String((e as any)?.message || e) });
    } finally {
      if (generation === nativePageGeneration.current) nativePageLoadingRef.current = false;
    }
  }, [activePlaylist?.id, nativeLibraryPaged, selectedIsCustomGroup, selectedCat, tab, ensureHeavyLoaded]);

  useEffect(() => {
    nativePageGeneration.current += 1;
    nativePageLoadingRef.current = false;
    nativeLiveOffsetRef.current = 0;
    nativeLibraryOffsetRef.current = 0;
    setNativePageOwnerId(null);
    setNativeLiveItems([]);
    setNativeLibraryItems([]);
    setNativeCategoryRows([]);
    setNativeLibraryCategoryRows([]);
    setNativeLiveTotal(0);
    setNativeLibraryTotal(0);
    setNativeLiveHasMore(false);
    setNativeLibraryHasMore(false);
    setSelectedCat(ALL);
    setPreviewChannel(null);
    setEpgMap({});
    void recordDiagnostic("catalog", "PLAYLIST_UI_INVALIDATED", { playlistId: activePlaylist?.id || "" });
  }, [activePlaylist?.id]);

  useEffect(() => {
    if (!activePlaylist?.id) {
      setNativeLiveItems([]); setNativeCategoryRows([]); setNativeLiveTotal(0); setNativeLiveHasMore(false);
      return;
    }
    if (nativeLivePaged && !selectedIsCustomGroup) {
      let cancelled = false;
      KizilkanNativeCore.getCategories(activePlaylist.id, "live")
        .then(rows => { if (!cancelled) setNativeCategoryRows(rows || []); })
        .catch(e => console.warn("[NativeDataCore] kategori sorgusu", e));
      void loadNativeLivePage(true);
      return () => { cancelled = true; };
    }
    if (nativeLibraryPaged && !selectedIsCustomGroup && (tab === "vod" || tab === "series")) {
      let cancelled = false;
      KizilkanNativeCore.getCategories(activePlaylist.id, tab)
        .then(rows => { if (!cancelled) setNativeLibraryCategoryRows(rows || []); })
        .catch(e => console.warn("[NativeDataCore] VOD/Series kategori sorgusu", e));
      void loadNativeLibraryPage(true);
      return () => { cancelled = true; };
    }
    // Özel kullanıcı grupları item-level override eşleştirmesi gerektirir.
    // Yalnız bu özellik kullanıldığında legacy tam hydrate'e geri dön.
    if (selectedIsCustomGroup || hasAnyCustomGroups) void ensureHeavyLoaded(activePlaylist.id);
  }, [activePlaylist?.id, nativeLivePaged, nativeLibraryPaged, selectedIsCustomGroup, hasAnyCustomGroups, tab, selectedCat, loadNativeLivePage, loadNativeLibraryPage, ensureHeavyLoaded]);
  const [epgMap, setEpgMap] = useState<Record<string, NowNext>>({});
  const [epgLoading, setEpgLoading] = useState(false);

  // Reset category when switching tabs
  useEffect(() => { setSelectedCat(ALL); }, [tab]);

  const requiresPin = (group?: string | null) => {
    if (!group) return false;
    if (!isCategoryLocked(group)) return false;
    return !isUnlockedInSession(group);
  };

  /** Kanalı DOĞRUDAN açar (önizlemeden onaylanınca da bu çağrılır). */
  const openChannelNow = (item: any) => {
    haptic.light();
    addToRecent(item.id);
    setPreviewChannel(null);
    router.push({ pathname: "/player", params: { id: item.id } });
  };

  const guardedOpenChannel = (item: any) => {
    if (requiresPin(item.group)) {
      router.push({ pathname: "/pin-entry", params: { category: item.group } });
      return;
    }
    /**
     * v7.8.0: ÖNİZLEME KALDIRILDI.
     * v7.6.0'da TiviMate benzerliği için eklemiştim ama kullanıcı deneyimi
     * KÖTÜLEŞTİ: OK tuşu kanalı açmak yerine fazladan bir onay penceresi
     * getiriyordu. Artık OK DOĞRUDAN kanalı açıyor (beklenen davranış).
     */
    openChannelNow(item);
  };

  // Uzun-bas menüsünü açar (artık zengin bottom sheet — IPTV Extreme tarzı).
  const showChannelActions = (item: any) => {
    haptic.medium();
    setActionItem(item);
  };

  /** Bir özel grup için yönetim menüsü (uzun bas ile açılır). */
  const buildGroupActions = (group: string): ActionItem[] => {
    if (!activePlaylist) return [];
    const locked = isCategoryLocked(group);
    const hidden = isGroupHidden(group);
    return [
      {
        icon: "arrow-up",
        label: "Yukarı taşı",
        onPress: async () => { await moveGroup(activePlaylist.id, group, -1, customGroups); haptic.soft(); },
      },
      {
        icon: "arrow-down",
        label: "Aşağı taşı",
        onPress: async () => { await moveGroup(activePlaylist.id, group, 1, customGroups); haptic.soft(); },
      },
      {
        icon: "create",
        label: "Grubu yeniden adlandır",
        onPress: () => setInputMode({ kind: "renameGroup", item: null, group }),
      },
      {
        icon: locked ? "lock-open" : "lock-closed",
        label: locked ? "Şifreyi kaldır" : "Şifre koy (PIN)",
        active: locked,
        onPress: async () => { await toggleCategoryLock(group); haptic.soft(); },
      },
      {
        icon: hidden ? "eye" : "eye-off",
        label: hidden ? "Gizlemeyi kaldır" : "Gizle",
        active: hidden,
        onPress: async () => { await toggleHiddenGroup(group); haptic.soft(); },
      },
      {
        icon: "trash",
        label: "Grubu sil",
        destructive: true,
        onPress: () => {
          Alert.alert(
            "Grubu sil",
            `"${group}" grubu silinecek. İçindeki kanallar SİLİNMEZ, sadece gruptan çıkar.`,
            [
              { text: "Vazgeç", style: "cancel" },
              {
                text: "Sil",
                style: "destructive",
                onPress: async () => {
                  await deleteGroup(activePlaylist.id, group);
                  if (selectedCat === group) setSelectedCat(ALL);
                  haptic.success();
                },
              },
            ]
          );
        },
      },
    ];
  };

  // Aktif item için menü öğelerini üretir (canlı/vod/dizi'ye göre farklı).
  const buildActions = (item: any): ActionItem[] => {
    if (!item) return [];
    const isFav = isFavorite(item.id);
    const isLive = tab === "live";
    const isInWatchlist = !isLive ? inWatchlist(item.id) : false;
    const list: ActionItem[] = [];

    // Oynat — GÜVENLİK: PIN kontrolünü ATLAMAMALI (v5.5.0 düzeltmesi).
    // Eskiden bu menü doğrudan player'a gidiyordu ve kilitli kategoriler
    // PIN sorulmadan açılıyordu.
    list.push({
      icon: "play-circle",
      label: "Oynat",
      onPress: () => {
        if (isLive) guardedOpenChannel(item);
        else guardedOpenDetail(item);
      },
    });

    /**
     * FAVORİ (v7.5.0) — TV kullanılabilirliği
     * v7.4.0'da kalp düğmesi TV'de odak alamaz yapıldı (odağı çalıp kanalın
     * açılmasını engelliyordu). Ama yerine bir yol sunulmamıştı.
     * Artık favori ekleme/çıkarma buradan yapılıyor — hem TV'de hem telefonda.
     */
    list.push({
      icon: isFavorite(item.id) ? "heart" : "heart-outline",
      label: isFavorite(item.id) ? "Favorilerden çıkar" : "Favorilere ekle",
      onPress: () => { haptic.soft(); toggleFavorite(item.id); },
    });

    // Bilgi (vod/dizi)
    if (!isLive) {
      list.push({
        icon: "information-circle",
        label: "Bilgi / Detay",
        onPress: () => router.push({ pathname: "/detail", params: { type: tab, id: item.id } }),
      });
    }

    // EPG (canlı)
    if (isLive && (item.epg_channel_id || item.tvg_id)) {
      list.push({
        icon: "calendar",
        label: "Program Rehberi (EPG)",
        onPress: () => router.push({ pathname: "/epg", params: { channel: item.id } }),
      });
    }

    // Catch-up (canlı + arşiv varsa)
    if (isLive && item.tv_archive === 1) {
      list.push({
        icon: "time",
        label: "Geriye Dönük İzle (Catch-up)",
        onPress: () => router.push({ pathname: "/catchup", params: { channel: item.id } }),
      });
    }

    // Şununla Oynat (çoklu ekran) — canlı
    if (isLive) {
      list.push({
        icon: "grid",
        label: "Çoklu Ekran (Multi-view)",
        onPress: () => router.push("/multi-view"),
      });
    }

    // Favori
    list.push({
      icon: isFav ? "heart" : "heart-outline",
      label: isFav ? "Favoriden çıkar" : "Favoriye ekle",
      active: isFav,
      onPress: () => { haptic.soft(); toggleFavorite(item.id); },
    });

    // İzleme listesi (vod/dizi)
    if (!isLive) {
      list.push({
        icon: isInWatchlist ? "bookmark" : "bookmark-outline",
        label: isInWatchlist ? "İzleme listesinden çıkar" : "İzleme listesine ekle",
        active: isInWatchlist,
        onPress: () => { haptic.soft(); toggleWatchlist(item.id); },
      });
    }

    // İndir (film — url varsa)
    if (tab === "vod" && (item as any).url) {
      list.push({
        icon: "cloud-download",
        label: "İndir",
        onPress: () => router.push({ pathname: "/detail", params: { type: tab, id: item.id } }),
      });
    }

    // Paylaş (yayın linki)
    const shareUrl = (item as any).url;
    if (shareUrl) {
      list.push({
        icon: "share-social",
        label: "Bağlantıyı Paylaş",
        onPress: async () => {
          try {
            const { Share } = await import("react-native");
            await Share.share({ message: shareUrl, title: item.name });
          } catch { /* iptal */ }
        },
      });
    }

    // Şununla Oynat — harici oynatıcıda aç (MX Player, VLC vb.)
    const playUrl = (item as any).url;
    if (playUrl) {
      list.push({
        icon: "open",
        label: "Şununla Oynat (harici)",
        onPress: async () => {
          try {
            await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
              data: playUrl,
              type: "video/*",
              flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
            });
          } catch {
            Alert.alert(
              "Harici oynatıcı",
              "Uygun bir oynatıcı bulunamadı veya açılamadı.\n\nMX Player, VLC gibi bir uygulama kurulu olmalı."
            );
          }
        },
      });
    }

    // Tekrar Oynat — baştan başlat
    if (!isLive) {
      list.push({
        icon: "refresh-circle",
        label: "Tekrar Oynat (baştan)",
        onPress: () => router.push({ pathname: "/detail", params: { type: tab, id: item.id, restart: "1" } }),
      });
    }

    // İsimleri Yönet
    list.push({
      icon: "create",
      label: "Yeniden Adlandır",
      onPress: () => setInputMode({ kind: "rename", item }),
    });

    // Kanal Simgesi Değiştir
    list.push({
      icon: "image",
      label: isLive ? "Kanal Simgesi Değiştir" : "Afiş Değiştir",
      onPress: () => setInputMode({ kind: "logo", item }),
    });

    // Gruba Ekle / Çıkar
    list.push({
      icon: "folder",
      label: "Gruplarım (ekle / çıkar)",
      onPress: () => setGroupDialogItem(item),
    });

    // ÖZEL GRUP İÇİNDEYKEN: öğeyi elle yukarı/aşağı taşı (v5.1.0)
    if (customGroups.includes(selectedCat) && activePlaylist) {
      const idsInOrder = (filtered as any[]).map((x: any) => x.id);
      list.push({
        icon: "arrow-up",
        label: "Bu grupta yukarı taşı",
        onPress: async () => {
          await moveItemInGroup(activePlaylist.id, selectedCat, item.id, -1, idsInOrder);
          haptic.soft();
        },
      });
      list.push({
        icon: "arrow-down",
        label: "Bu grupta aşağı taşı",
        onPress: async () => {
          await moveItemInGroup(activePlaylist.id, selectedCat, item.id, 1, idsInOrder);
          haptic.soft();
        },
      });
    }

    // Gizle
    list.push({
      icon: "eye-off",
      label: "Gizle (PIN gerekir)",
      destructive: true,
      onPress: () => { haptic.warning(); toggleHiddenItem(item.id); },
    });

    return list;
  };
  const guardedOpenDetail = (item: any) => {
    if (requiresPin(item.group)) {
      router.push({ pathname: "/pin-entry", params: { category: item.group } });
      return;
    }
    haptic.light();
    router.push({ pathname: "/detail", params: { type: tab, id: item.id } });
  };

  const currentList = useMemo(() => {
    if (!activePlaylist) return [] as any[];
    let list: any[] = [];
    const nativeOwnerMatches = nativePageOwnerId === activePlaylist.id;
    if (tab === "live") list = nativeLivePaged ? (nativeOwnerMatches ? nativeLiveItems : []) : activePlaylist.channels;
    else if (tab === "vod") list = nativeLibraryPaged ? (nativeOwnerMatches ? nativeLibraryItems : []) : (activePlaylist.vod || []);
    else list = nativeLibraryPaged ? (nativeOwnerMatches ? nativeLibraryItems : []) : (activePlaylist.series || []);
    // KİLİTLİ KATEGORİLER (v5.5.0 düzeltmesi)
    // ESKİ: kilit yalnızca ÇOCUK profilinde listeden gizliyordu; normal
    // profilde kilitli kategoriler listede görünüyordu.
    // YENİ: kilitli kategori, oturumda PIN ile açılmadıkça HER profilde gizli.
    // Çocuk profilinde PIN ile bile açılamaz.
    // KİLİT ile GİZLEME AYRI ŞEYLER (v5.6.0 düzeltmesi):
    //  • KİLİT  : kategori LİSTEDE GÖRÜNÜR ama açmak için PIN ister.
    //  • GİZLEME: kategori listede HİÇ görünmez (aşağıda uygulanıyor).
    //  • İkisi birden seçilirse: gizli kalır; PIN ile açılınca kilit devreye girer.
    // v5.5.0'da kilidi yanlışlıkla "gizleme" gibi davrandırmıştım; geri alındı.
    if (activeProfile?.isKids) {
      // Çocuk profilinde kilitli kategoriler PIN ile bile açılamaz -> tamamen gizli.
      list = list.filter((c: any) => !isCategoryLocked(c.group || ""));
    }
    // Hidden items (per-profile, until session unlock)
    if (!hiddenModeUnlocked) {
      list = list.filter((c: any) => !isItemHidden(c.id) && !(c.group && isGroupHidden(c.group)));
    }
    return list;
  }, [activePlaylist, tab, nativeLivePaged, nativeLiveItems, nativeLibraryPaged, nativeLibraryItems, nativePageOwnerId, activeProfile?.isKids, isCategoryLocked, isUnlockedInSession, hiddenModeUnlocked, isItemHidden, isGroupHidden]);

  /**
   * Kullanıcı özelleştirmelerini (yeni isim / yeni simge) listeye uygular.
   * Orijinal liste bozulmaz; sadece görüntülenen kopya değişir.
   */
  const displayList = useMemo(() => {
    const base = (!overrides || Object.keys(overrides).length === 0)
      ? currentList
      : (currentList as any[]).map(item => applyOverride(item, overrides));
    return parental.adultHidden ? (base as any[]).filter(item => !isAdultContent(item)) : base;
  }, [currentList, overrides, parental.adultHidden]);

  /**
   * KULLANICININ ÖZEL GRUPLARI (v5.1.0)
   * Kendi sırasıyla, EN ÜSTTE gösterilir. Alfabetik sıraya karışıp
   * 50+ kategori arasında kaybolmasınlar diye ayrı tutuluyorlar.
   * Kilitli/gizli olanlar (PIN açılmadıysa) listeden düşer.
   */
  const customGroups = useMemo(() => {
    const set = new Set<string>();
    Object.values(overrides || {}).forEach(o => (o.groups || []).forEach(g => set.add(g)));
    let list = applyGroupOrder(Array.from(set), ordering);
    // Gizli gruplar (PIN ile açılmadıysa) görünmesin.
    if (!hiddenModeUnlocked) list = list.filter(g => !isGroupHidden(g));
    // Kilitli gruplar oturumda açılmadıysa görünmesin.
    list = list.filter(g => !isCategoryLocked(g) || isUnlockedInSession(g));
    return list;
  }, [overrides, ordering, hiddenModeUnlocked, isGroupHidden, isCategoryLocked, isUnlockedInSession]);

  /** Sağlayıcıdan gelen kategoriler — kullanıcının seçtiği sıralamaya göre. */
  const providerCategories = useMemo(() => {
    // Room sayfalama modunda kategorileri yalnız ilk 80 kanaldan türetmek yanlış
    // olur. SQLite GROUP BY sonucu tüm playlist'i kapsar.
    const nativeRows = nativePageOwnerId === activePlaylist?.id
      ? (nativeLivePaged ? nativeCategoryRows : nativeLibraryPaged ? nativeLibraryCategoryRows : [])
      : [];
    if ((nativeLivePaged || nativeLibraryPaged) && nativeRows.length > 0) {
      let names = nativeRows.map(x => x.name).filter(Boolean);
      if (!hiddenModeUnlocked) names = names.filter(g => !isGroupHidden(g));
      if (activeProfile?.isKids) names = names.filter(g => !isCategoryLocked(g));
      return sortCategories(names, catSort);
    }
    const seen: string[] = [];
    displayList.forEach((c: any) => {
      if (c.group && !seen.includes(c.group)) seen.push(c.group); // sunucu sırası korunur
    });
    return sortCategories(seen, catSort);
  }, [displayList, catSort, nativeLivePaged, nativeLibraryPaged, nativeCategoryRows, nativeLibraryCategoryRows, nativePageOwnerId, activePlaylist?.id, hiddenModeUnlocked, isGroupHidden, activeProfile?.isKids, isCategoryLocked]);

  /** Gösterilecek tüm kategoriler: önce ÖZEL GRUPLAR, sonra sağlayıcı. */
  const categories = useMemo(
    () => [...customGroups, ...providerCategories],
    [customGroups, providerCategories]
  );

  /** Kategori paneli için ad + sayı listesi ("TÜMÜ" en üstte). */
  /**
   * PERFORMANS DÜZELTMESİ (v5.5.0)
   * ESKİ: her kategori için TÜM liste taranıyordu.
   *   22.963 kanal x ~100 kategori = ~2.3 MİLYON işlem — her değişimde tekrar.
   *   Bu, dokunmalara geç tepki verilmesinin (donma hissi) ana sebebiydi.
   * YENİ: tek geçişte sayaç haritası kuruluyor -> ~23.000 işlem (~100 kat hızlı).
   */
  const panelCategories = useMemo<CategoryEntry[]>(() => {
    const nativeRows = nativePageOwnerId === activePlaylist?.id
      ? (nativeLivePaged ? nativeCategoryRows : nativeLibraryPaged ? nativeLibraryCategoryRows : [])
      : [];
    if ((nativeLivePaged || nativeLibraryPaged) && nativeRows.length > 0 && customGroups.length === 0) {
      const rows = nativeRows
        .filter(x => hiddenModeUnlocked || !isGroupHidden(x.name))
        .filter(x => !activeProfile?.isKids || !isCategoryLocked(x.name));
      const total = nativeLivePaged
        ? Number(nativeSummary?.channels || activePlaylist?.channelsCount || nativeLiveTotal || 0)
        : Number(tab === "vod" ? (nativeSummary?.vod || activePlaylist?.vodCount || nativeLibraryTotal || 0) : (nativeSummary?.series || activePlaylist?.seriesCount || nativeLibraryTotal || 0));
      return [
        { name: ALL, count: total },
        ...rows.map(x => ({ name: x.name, count: x.count })),
      ];
    }
    const counts = new Map<string, number>();
    const customSet = new Set(customGroups);

    for (const item of displayList as any[]) {
      // Sağlayıcı kategorisi
      const g = item.group || "Diğer";
      if (!customSet.has(g)) counts.set(g, (counts.get(g) || 0) + 1);
      // Kullanıcının özel grupları
      /**
       * ÖZEL GRUP SAYIMI (v8.7.0 sağlamlaştırma)
       * Kullanıcı bildirimi: kendi oluşturduğu gruplarda kanal olmasına
       * rağmen sayı 0 görünüyordu.
       * displayList üzerindeki öğeler applyOverride'dan geçtiği için grup
       * bilgisi HEM override haritasında HEM de öğenin kendisinde olabilir.
       * İkisini birleştirip TEKRARSIZ sayıyoruz.
       */
      const fromMap = overrides[item.id]?.groups || [];
      const fromItem = (item as any).groups || [];
      const merged = fromMap.length || fromItem.length
        ? Array.from(new Set([...fromMap, ...fromItem]))
        : [];
      for (const name of merged) counts.set(name, (counts.get(name) || 0) + 1);
    }

    const list: CategoryEntry[] = [{ name: "TÜMÜ", count: displayList.length }];
    for (const cat of categories) {
      list.push({ name: cat, count: counts.get(cat) || 0, custom: customSet.has(cat) });
    }
    return list;
  }, [categories, displayList, overrides, customGroups, nativeLivePaged, nativeLibraryPaged, nativeCategoryRows, nativeLibraryCategoryRows, nativePageOwnerId, hiddenModeUnlocked, isGroupHidden, activeProfile?.isKids, isCategoryLocked, nativeSummary?.channels, nativeSummary?.vod, nativeSummary?.series, activePlaylist?.id, activePlaylist?.channelsCount, activePlaylist?.vodCount, activePlaylist?.seriesCount, nativeLiveTotal, nativeLibraryTotal, tab]);

  const filtered = useMemo(() => {
    if (selectedCat === ALL) return displayList;

    const isCustom = customGroups.includes(selectedCat);
    const list = (displayList as any[]).filter((c: any) => {
      if (!isCustom && (c.group || "Diğer") === selectedCat) return true;
      const custom = overrides[c.id]?.groups;
      return !!custom && custom.includes(selectedCat);
    });

    // ÖZEL GRUPTA: kullanıcının elle belirlediği sıra uygulanır.
    return isCustom ? applyItemOrder(list as any, selectedCat, ordering) : list;
  }, [displayList, selectedCat, overrides, customGroups, ordering]);

  // v15.2.3 — EPG ISOLATION: kanal listesi EPG'yi ASLA beklemez. İlk görünür
  // pencerenin EPG'si etkileşimler bittikten sonra küçük batch ile arkadan gelir.
  const epgTargets = useMemo(() => (filtered as any[]).slice(0, 16), [filtered]);
  const epgTargetSignature = useMemo(() => epgTargets.map(c => String(c.stream_id || c.epg_channel_id || c.tvg_id || c.id || "")).join("|"), [epgTargets]);

  useEffect(() => {
    if (tab !== "live" || !activePlaylist || epgTargets.length === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const interaction = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(async () => {
        if (cancelled) return;
        setEpgLoading(true);
        try {
          if (activePlaylist.source === "xtream" && activePlaylist.xtreamServer && activePlaylist.xtreamUsername && activePlaylist.xtreamPassword) {
            const cred = { server: activePlaylist.xtreamServer, username: activePlaylist.xtreamUsername, password: activePlaylist.xtreamPassword };
            const { xtreamNowNextBatch } = await import("@/src/utils/iptv");
            const ids = epgTargets.map(c => c.stream_id).filter(Boolean) as string[];
            if (ids.length > 0) {
              const map = await xtreamNowNextBatch(cred, ids);
              if (cancelled) return;
              const out: Record<string, NowNext> = {};
              for (const ch of epgTargets) {
                const sid = ch.stream_id;
                if (sid && map[sid]) {
                  const key = ch.epg_channel_id || ch.tvg_id || sid;
                  const now = map[sid].now, next = map[sid].next;
                  out[key] = {
                    now: now ? { title: now.title, description: now.description || undefined, start: now.start_timestamp ? new Date(now.start_timestamp * 1000).toISOString() : now.start, stop: now.stop_timestamp ? new Date(now.stop_timestamp * 1000).toISOString() : now.stop } : null,
                    next: next ? { title: next.title, description: next.description || undefined, start: next.start_timestamp ? new Date(next.start_timestamp * 1000).toISOString() : next.start, stop: next.stop_timestamp ? new Date(next.stop_timestamp * 1000).toISOString() : next.stop } : null,
                  } as any;
                }
              }
              if (!cancelled) setEpgMap(prev => ({ ...prev, ...out }));
            }
          } else if (activePlaylist.epgUrl) {
            const ids = epgTargets.map(c => c.epg_channel_id || c.tvg_id).filter((x): x is string => !!x);
            if (ids.length > 0) {
              const { getNowNext } = await import("@/src/utils/epg");
              const res = await getNowNext(activePlaylist.id, ids, activePlaylist.epgUrl);
              if (!cancelled) setEpgMap(prev => ({ ...prev, ...(res.data as Record<string, NowNext>) }));
            }
          }
        } catch { /* EPG, kanal listesini bloke eden kritik yol değildir. */ }
        if (!cancelled) setEpgLoading(false);
      }, 280);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      interaction.cancel();
    };
  }, [activePlaylist?.id, activePlaylist?.epgUrl, activePlaylist?.source, activePlaylist?.xtreamServer, activePlaylist?.xtreamUsername, activePlaylist?.xtreamPassword, epgTargetSignature, tab]);

  if (!activePlaylist) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top"]} testID="live-tv-empty">
        <View style={styles.emptyWrap}>
          <Ionicons name="albums-outline" size={60} color={colors.onSurfaceSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>Aktif liste yok</Text>
          <Text style={[styles.emptySub, { color: colors.onSurfaceSecondary }]}>Başlamak için bir oynatma listesi ekleyin.</Text>
          <FocusButton
            testID="empty-add-btn"
            onPress={() => router.push("/add-playlist")}
            style={[styles.emptyBtn, { backgroundColor: colors.brandPrimary }]}
          >
            <Text style={[styles.emptyBtnText, { color: colors.onBrandPrimary }]}>Liste Ekle</Text>
          </FocusButton>
        </View>
      </SafeAreaView>
    );
  }

  // v15.2.24-RC2: Android Native Core varken sayaçların canonical kaynağı Room summary
  // olur. Ağır JS dizilerinin length değeri Room yolunu gölgeleyip tam katalog
  // hidratasyonunu teşvik etmez. Web/native-core olmayan platformlarda legacy korunur.
  const liveCount = KizilkanNativeCore.available ? (nativeSummary?.channels || activePlaylist.channelsCount || 0) : (activePlaylist.channels?.length || activePlaylist.channelsCount || 0);
  const vodCount = KizilkanNativeCore.available ? (nativeSummary?.vod || activePlaylist.vodCount || 0) : (activePlaylist.vod?.length || activePlaylist.vodCount || 0);
  const seriesCount = KizilkanNativeCore.available ? (nativeSummary?.series || activePlaylist.seriesCount || 0) : (activePlaylist.series?.length || activePlaylist.seriesCount || 0);
  const hasVod = vodCount > 0;
  const hasSeries = seriesCount > 0;

  const StickyHeader = (
    <>
      <View style={[styles.segmentWrap, isTvLayout && { paddingBottom: 4 }]}>
        <View style={[styles.segment, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <FocusButton
            testID="seg-live"
            onPress={() => { haptic.soft(); setTab("live"); setSelectedCat(ALL); }}
            focusable
            hasTVPreferredFocus={tab === "live"}
            style={[styles.segmentItem, tab === "live" && { backgroundColor: colors.brandPrimary }]}
          >
            <Ionicons name="tv" size={18} color={tab === "live" ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
            <Text style={[styles.segmentText, { color: tab === "live" ? colors.onBrandPrimary : colors.onSurfaceSecondary }]}>
              Canlı ({liveCount})
            </Text>
          </FocusButton>
          <FocusButton
            testID="seg-vod"
            onPress={() => { haptic.soft(); setTab("vod"); setSelectedCat(ALL); }}
            focusable
            hasTVPreferredFocus={tab === "vod"}
            style={[styles.segmentItem, tab === "vod" && { backgroundColor: colors.brandPrimary }, !hasVod && styles.segmentDisabled]}
            disabled={!hasVod}
          >
            <Ionicons name="film" size={18} color={!hasVod ? colors.onSurfaceTertiary : tab === "vod" ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
            <Text style={[styles.segmentText, { color: !hasVod ? colors.onSurfaceTertiary : tab === "vod" ? colors.onBrandPrimary : colors.onSurfaceSecondary }]}>
              Filmler{hasVod ? ` (${vodCount})` : ""}
            </Text>
          </FocusButton>
          <FocusButton
            testID="seg-series"
            onPress={() => { haptic.soft(); setTab("series"); setSelectedCat(ALL); }}
            focusable
            hasTVPreferredFocus={tab === "series"}
            style={[styles.segmentItem, tab === "series" && { backgroundColor: colors.brandPrimary }, !hasSeries && styles.segmentDisabled]}
            disabled={!hasSeries}
          >
            <Ionicons name="albums" size={18} color={!hasSeries ? colors.onSurfaceTertiary : tab === "series" ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
            <Text style={[styles.segmentText, { color: !hasSeries ? colors.onSurfaceTertiary : tab === "series" ? colors.onBrandPrimary : colors.onSurfaceSecondary }]}>
              Diziler{hasSeries ? ` (${seriesCount})` : ""}
            </Text>
          </FocusButton>
        </View>
      </View>
      <View style={styles.chipRowContainer}>
        {/* TAM EKRAN KATEGORİ PANELİ (v5.0.0) — yatay şeritte kaybolmayı bitirir */}
        <FocusButton
          testID="open-category-panel-btn"
          onPress={() => { haptic.soft(); setCatPanel(true); }}
          focusable
          activeOpacity={0.8}
          style={[styles.catPanelBtn, { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
        >
          <Ionicons name="list" size={18} color={colors.onBrandPrimary} />
        </FocusButton>
        <FocusButton
          testID="category-sort-btn"
          onPress={async () => {
            const next: CategorySort = catSort === "server" ? "az" : catSort === "az" ? "za" : "server";
            setCatSort(next);
            await saveCategorySort(activePlaylist!.id, next);
            haptic.soft();
            Alert.alert(
              "Kategori sıralaması",
              next === "server" ? "Sunucudan geldiği sıra"
                : next === "az" ? "A → Z (artan)"
                : "Z → A (azalan)"
            );
          }}
          focusable
          activeOpacity={0.8}
          style={[styles.catPanelBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, marginLeft: SPACING.sm }]}
        >
          <Ionicons
            name={catSort === "server" ? "server" : catSort === "az" ? "arrow-down" : "arrow-up"}
            size={16}
            color={colors.onSurface}
          />
        </FocusButton>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <CategoryChip label={`Tümü (${nativeLivePaged ? liveCount : nativeLibraryPaged ? nativeLibraryTotal : currentList.length})`} active={selectedCat === ALL} onPress={() => setSelectedCat(ALL)} testID="chip-all" />
          {categories.map(cat => {
            const cnt = panelCategories.find(entry => entry.name === cat)?.count ?? 0;
            return (
              <CategoryChip
                key={cat}
                label={`${cat} (${cnt})`}
                active={selectedCat === cat}
                onPress={() => setSelectedCat(cat)}
                testID={`chip-${cat}`}
              />
            );
          })}
          {categories.length === 0 && currentList.length === 0 && (
            <Text style={{ color: colors.onSurfaceTertiary, paddingVertical: SPACING.sm, fontSize: FONT.size.sm }}>
              {tab === "vod" ? "Bu listede film yok" : tab === "series" ? "Bu listede dizi yok" : "Kanal yok"}
            </Text>
          )}
        </ScrollView>
      </View>
    </>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top"]} testID="live-tv-screen">
      {/**
        * TV'DE KOMPAKT ÜST KISIM (v8.9.2)
        * Gerçek ölçüm: 1080p TV = 540 dp. Üst kısım 226 dp yiyordu ve
        * kanal listesine yalnızca 314 dp kalıyordu (4-5 kanal).
        * TV'de marka/sekme/kategori şeritleri sıkıştırıldı; ~70 dp kazanç.
        */}
      <View style={[styles.header, isTvLayout && { paddingTop: 4, paddingBottom: 2 }]}>
        <View style={{ flex: 1 }}>
          <KizilkanLogo size="md" showSubtitle={false} showIcon align="left" />
          <Text style={[styles.subtitle, { color: colors.onSurfaceSecondary }]} numberOfLines={1}>
            {activePlaylist.name} • {liveCount} kanal
            {hasVod ? ` • ${vodCount} film` : ""}
            {hasSeries ? ` • ${seriesCount} dizi` : ""}
            {activePlaylist.serverCodeBinding?.code ? ` • Kod ${activePlaylist.serverCodeBinding.code}` : ""}
          </Text>
        </View>
        {epgLoading && <ActivityIndicator size="small" color={colors.brandPrimary} />}
        <FocusButton
          testID="open-multi-view-btn"
          onPress={() => router.push("/multi-view")}
          hitSlop={10}
          style={{ marginLeft: SPACING.sm }}
        >
          <Ionicons name="grid" size={20} color={colors.onSurface} />
        </FocusButton>
        <FocusButton
          testID="refresh-playlist-btn"
          onPress={doRefresh}
          disabled={refreshing}
          hitSlop={10}
          focusable
          style={{ marginLeft: SPACING.md, opacity: refreshing ? 0.4 : 1 }}
        >
          <Ionicons name={refreshing ? "hourglass" : "refresh"} size={20} color={colors.onSurface} />
        </FocusButton>
        <FocusButton
          testID="open-epg-timeline-btn"
          onPress={() => router.push("/epg-timeline")}
          hitSlop={10}
          style={{ marginLeft: SPACING.md }}
        >
          <Ionicons name="calendar" size={20} color={colors.onSurface} />
        </FocusButton>
        {playlists.length > 1 && (
          <FocusButton
            testID="switch-playlist-btn"
            onPress={() => router.push("/(tabs)/settings")}
            hitSlop={10}
            focusable
            style={{ marginLeft: SPACING.md }}
          >
            <Ionicons name="swap-horizontal" size={20} color={colors.onSurface} />
          </FocusButton>
        )}
      </View>

      {tab === "live" ? (
        <>
          {StickyHeader}
          <FlatList
            ref={listRef}
            onScrollToIndexFailed={onScrollToIndexFailed}
            data={filtered as any[]}
            onEndReached={() => {
              if (nativeLivePaged && nativeLiveHasMore) void loadNativeLivePage(false);
            }}
            onEndReachedThreshold={0.55}
            keyExtractor={c => c.id}
            contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xxxl }}
            renderItem={({ item, index }) => (
              <ChannelRow
                channel={item}
                onFocusItem={() => isTvLayout && onItemFocus(index)}
                epg={epgMap[item.epg_channel_id || item.tvg_id || ""] || null}
                isFavorite={isFavorite(item.id)}
                onToggleFavorite={() => toggleFavorite(item.id)}
                onPress={() => guardedOpenChannel(item)}
                onLongPress={() => showChannelActions(item)}
              />
            )}
            initialNumToRender={12}
            windowSize={7}
            maxToRenderPerBatch={8}
            updateCellsBatchingPeriod={40}
            /**
             * getItemLayout KALDIRILDI (v8.8.0) — KRİTİK
             * SEBEP: Listede ListHeaderComponent (kategori şeridi) var.
             * getItemLayout yalnızca satırları hesaplıyor, BAŞLIK YÜKSEKLİĞİNİ
             * saymıyordu. Bu yüzden her satırda kayma birikiyor ve odak
             * giderek ekran dışına taşıyordu ("her kanalda biraz daha dışarı").
             * FlatList kendi ölçümünü yapınca konum doğru oluyor;
             * onScrollToIndexFailed zaten geri dönüş sağlıyor.
             */
            // PDF Bulgu 1 (v7.0.0): removeClippedSubviews Android TV'de odak
      // görünürlüğünü bozuyor (odak kaybı, ölçek/gölge kesilmesi).
      // TV'de KAPALI, telefonda AÇIK (performans için gerekli).
      removeClippedSubviews={!isTvLayout}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyTitle, { color: colors.onSurfaceSecondary }]}>Bu kategoride kanal yok</Text>
              </View>
            }
          />
        </>
      ) : (
        <PosterGrid
          items={filtered as (VodItem | SeriesItem)[]}
          testIDPrefix={tab === "vod" ? "vod" : "series"}
          onPressItem={(item) => guardedOpenDetail(item)}
          onLongPressItem={(item) => showChannelActions(item)}
          ListHeaderComponent={StickyHeader as any}
          emptyText={tab === "vod" ? "Bu kategoride film yok" : "Bu kategoride dizi yok"}
          onEndReached={() => { if (nativeLibraryPaged && nativeLibraryHasMore) void loadNativeLibraryPage(false); }}
          onEndReachedThreshold={0.55}
        />
      )}

      {/* KANAL ÖNİZLEME PANELİ (v7.6.0) — TV'ye özel */}
      <Modal
        visible={!!previewChannel}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewChannel(null)}
      >
        <Pressable style={styles.previewBg} onPress={() => setPreviewChannel(null)}>
          <Pressable
            style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.brandPrimary }]}
            onPress={e => e.stopPropagation()}
          >
            {previewChannel && (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md }}>
                  {previewChannel.logo ? (
                    <Image source={{ uri: previewChannel.logo }} style={styles.previewLogo} resizeMode="contain" />
                  ) : (
                    <View style={[styles.previewLogo, { backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="tv-outline" size={28} color={colors.onSurfaceSecondary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.previewName, { color: colors.onSurface }]} numberOfLines={2}>
                      {previewChannel.name}
                    </Text>
                    <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.sm }}>
                      {previewChannel.group || "Diğer"}
                    </Text>
                  </View>
                </View>

                {/* Yayın akışı (EPG) — varsa */}
                {(() => {
                  const e = epgMap[previewChannel.epg_channel_id || previewChannel.tvg_id || ""];
                  if (!e?.now) return null;
                  return (
                    <View style={{ marginTop: SPACING.md, gap: 4 }}>
                      <Text style={{ color: colors.brandPrimary, fontWeight: "700", fontSize: FONT.size.sm }}>
                        ŞİMDİ
                      </Text>
                      <Text style={{ color: colors.onSurface }} numberOfLines={2}>{e.now.title}</Text>
                      {e.next ? (
                        <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.sm, marginTop: 6 }} numberOfLines={1}>
                          SONRA: {e.next.title}
                        </Text>
                      ) : null}
                    </View>
                  );
                })()}

                <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.lg }}>
                  <FocusButton
                    testID="preview-cancel"
                    onPress={() => setPreviewChannel(null)}
                    style={[styles.previewBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 }]}
                  >
                    <Text style={{ color: colors.onSurface, fontWeight: "700" }}>Vazgeç</Text>
                  </FocusButton>
                  <FocusButton
                    testID="preview-play"
                    autoFocus
                    onPress={() => openChannelNow(previewChannel)}
                    style={[styles.previewBtn, { backgroundColor: colors.brandPrimary }]}
                  >
                    <Ionicons name="play" size={18} color={colors.onBrandPrimary} />
                    <Text style={{ color: colors.onBrandPrimary, fontWeight: "700" }}>İzle</Text>
                  </FocusButton>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <CategoryPanel
        visible={catPanel}
        section={tab as any}
        sectionCounts={{
          live: liveCount,
          vod: vodCount,
          series: seriesCount,
        }}
        categories={panelCategories}
        selected={selectedCat === ALL ? "TÜMÜ" : selectedCat}
        onSelectSection={(sec) => { haptic.soft(); setTab(sec as any); setSelectedCat(ALL); }}
        onSelectCategory={(name) => {
          haptic.soft();
          const real = name === "TÜMÜ" ? ALL : name;
          // KİLİTLİ KATEGORİ: açmadan önce PIN sor (v5.6.0)
          if (real !== ALL && requiresPin(real)) {
            router.push({ pathname: "/pin-entry", params: { category: real } });
            return;
          }
          setSelectedCat(real);
        }}
        onLongPressCategory={(name) => { setCatPanel(false); setTimeout(() => setManageGroup(name), 250); }}
        onClose={() => setCatPanel(false)}
      />

      {/* ÖZEL GRUP YÖNETİMİ (uzun bas ile) */}
      <ChannelActionSheet
        visible={!!manageGroup}
        title={manageGroup || ""}
        subtitle="Özel grup yönetimi"
        actions={manageGroup ? buildGroupActions(manageGroup) : []}
        onClose={() => setManageGroup(null)}
      />

      {/* GRUPLARIM — mevcut gruplar listelenir, seçilerek eklenir/çıkarılır */}
      <GroupDialog
        visible={!!groupDialogItem}
        itemName={groupDialogItem?.name || ""}
        allGroups={customGroups}
        memberGroups={groupDialogItem ? (overrides[groupDialogItem.id]?.groups || []) : []}
        onToggle={async (g) => {
          if (!activePlaylist || !groupDialogItem) return;
          await toggleGroup(activePlaylist.id, groupDialogItem.id, g);
          haptic.soft();
        }}
        onDeleteGroup={async (g) => {
          if (!activePlaylist) return;
          await deleteGroup(activePlaylist.id, g);
          if (selectedCat === g) setSelectedCat(ALL);
          haptic.success();
        }}
        onClose={() => setGroupDialogItem(null)}
      />

      <InputDialog
        visible={!!inputMode}
        title={
          inputMode?.kind === "rename" ? "Yeniden Adlandır"
            : inputMode?.kind === "logo" ? "Simge / Afiş Adresi"
            : "Grubu Yeniden Adlandır"
        }
        description={
          inputMode?.kind === "rename" ? "Boş bırakırsanız orijinal isme döner."
            : inputMode?.kind === "logo" ? "Bir görsel adresi (https://...) girin. Boş bırakırsanız orijinaline döner."
            : "Grubun yeni adını girin. Gruptaki tüm içerikler korunur."
        }
        placeholder={inputMode?.kind === "logo" ? "https://ornek.com/logo.png" : "Yeni isim"}
        initialValue={
          inputMode?.kind === "rename" ? (overrides[inputMode.item?.id]?.name || inputMode?.item?.name || "")
            : inputMode?.kind === "logo" ? (overrides[inputMode.item?.id]?.logo || "")
            : (inputMode?.group || "")
        }
        allowEmpty={inputMode?.kind !== "renameGroup"}
        keyboardType={inputMode?.kind === "logo" ? "url" : "default"}
        onConfirm={async (val) => {
          if (!inputMode || !activePlaylist) return;
          if (inputMode.kind === "renameGroup") {
            const old = inputMode.group!;
            await renameGroup(activePlaylist.id, old, val);
            if (selectedCat === old) setSelectedCat(val || ALL);
          } else {
            const id = inputMode.item.id;
            if (inputMode.kind === "rename") await setOverride(activePlaylist.id, id, { name: val });
            else if (inputMode.kind === "logo") await setOverride(activePlaylist.id, id, { logo: val });
          }
          haptic.success();
        }}
        onClose={() => setInputMode(null)}
      />

      <ChannelActionSheet
        visible={!!actionItem}
        title={actionItem?.name || ""}
        subtitle={actionItem?.group || (tab === "live" ? "Canlı Kanal" : tab === "vod" ? "Film" : "Dizi")}
        actions={buildActions(actionItem)}
        onClose={() => setActionItem(null)}
      />
    </SafeAreaView>
  );
}

function CategoryChip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <FocusButton
      testID={testID}
      onPress={onPress}
      activeOpacity={0.75}
      focusable
      style={[
        styles.chip,
        { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
        active && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
      ]}
    >
      <Text
        style={[styles.chipText, { color: colors.onSurfaceSecondary }, active && { color: colors.onBrandPrimary }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </FocusButton>
  );
}

const styles = StyleSheet.create({
  previewBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: SPACING.lg },
  previewCard: { width: "100%", maxWidth: 560, borderRadius: RADIUS.lg, borderWidth: 2, padding: SPACING.lg },
  previewLogo: { width: 64, height: 64, borderRadius: RADIUS.sm },
  previewName: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  previewBtn: { flex: 1, flexDirection: "row", height: 52, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", gap: 8 },
  safe: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.sm,
  },
  brand: { fontSize: FONT.size.xxl, fontWeight: FONT.weight.black, letterSpacing: 2 },
  subtitle: { fontSize: FONT.size.sm, marginTop: 4 },
  segmentWrap: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  segment: {
    flexDirection: "row",
    borderRadius: RADIUS.pill,
    padding: 4,
    borderWidth: 1,
  },
  segmentItem: {
    flex: 1, height: 48, borderRadius: RADIUS.pill,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingHorizontal: SPACING.sm,
  },
  segmentDisabled: { opacity: 0.4 },
  segmentText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.bold },
  chipRowContainer: { height: 56, flexDirection: "row", alignItems: "center" },
  catPanelBtn: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1,
    alignItems: "center", justifyContent: "center", marginLeft: SPACING.lg,
  },
  chipRow: { gap: SPACING.sm, paddingHorizontal: SPACING.lg, alignItems: "center" },
  chip: {
    height: 36, borderRadius: RADIUS.pill, borderWidth: 1,
    paddingHorizontal: SPACING.md, justifyContent: "center", flexShrink: 0,
  },
  chipText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  emptyWrap: {
    flex: 1, alignItems: "center", justifyContent: "center",
    padding: SPACING.xl, gap: SPACING.md,
  },
  emptyTitle: { fontSize: FONT.size.xl, fontWeight: FONT.weight.bold, marginTop: SPACING.md },
  emptySub: { fontSize: FONT.size.base, textAlign: "center" },
  emptyBtn: {
    marginTop: SPACING.md, paddingHorizontal: SPACING.xl, height: 48, borderRadius: RADIUS.pill,
    alignItems: "center", justifyContent: "center",
  },
  emptyBtnText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
});
