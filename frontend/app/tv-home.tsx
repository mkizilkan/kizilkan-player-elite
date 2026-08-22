/**
 * KIZILKAN PLAYER — TV Sütunlu Ana Ekran
 * Dosya  : frontend/app/tv-home.tsx
 * Sürüm  : v1.0.0 (v8.0.0)
 *
 * ===========================================================================
 * NE?
 * ===========================================================================
 * TiviMate / Rike Playzer tarzı ÜÇ SÜTUNLU TV arayüzü:
 *
 *   ┌──────────────┬──────────────────┬─────────────────────┐
 *   │ LİSTELER +   │    KANALLAR      │  ÖNİZLEME + BİLGİ   │
 *   │ KATEGORİLER  │  (+ arama)       │  (canlı görüntü,    │
 *   │              │                  │   EPG, düğmeler)    │
 *   └──────────────┴──────────────────┴─────────────────────┘
 *
 * MEVCUT EKRANA DOKUNULMADI. Ayarlar > TV Arayüzü'nden seçilir;
 * varsayılan "klasik" olduğu için kullanıcı açmadan hiçbir şey değişmez.
 * Telefonda bu ekran hiç kullanılmaz.
 *
 * SOL SÜTUN — AKILLI DAVRANIŞ (kullanıcıyla kararlaştırıldı):
 *   • TEK liste varsa  -> doğrudan kategoriler (gereksiz seviye yok)
 *   • ÇOK liste varsa  -> liste adı, açılınca altında o listenin kategorileri
 * Böylece tek listeli kullanıcı her açılışta fazladan tuşa basmaz; ikinci
 * liste eklenince ağaç kendiliğinden belirir.
 * ===========================================================================
 */

import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Image,
  ActivityIndicator,
  BackHandler,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { useParental } from "@/src/store/ParentalContext";
import { isAdultContent } from "@/src/utils/adult";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { useTv } from "@/src/store/TvContext";
import { FocusButton } from "@/src/components/FocusButton";
import { useTVFocus, rowFocusStyle, focusStyle } from "@/src/hooks/useTVFocus";
import { useFocusScroll } from "@/src/hooks/useFocusScroll";
import { useRemoteKeys } from "@/src/hooks/useRemoteKeys";
import { haptic } from "@/src/utils/haptic";
import { normalize } from "@/src/utils/fuzzy";

/**
 * TVFocusGuideView (v9.12.0) — yalnızca react-native-tvos fork'unda vardır.
 * Sütunlar arası D-pad geçişinde odağın "kaybolmasını" azaltmak için sütun
 * satırını sarar; odak alana girince en son odaklı çocuğa yönlendirir.
 * Fork yoksa/başka platformda düz View'a düşer (güvenli).
 * NOT: Bu additive bir güvenlik ağıdır; tam deterministik sütun grafiği gerçek
 * cihazda iterasyon ister.
 */
const FocusGuide: any = (require("react-native") as any).TVFocusGuideView || View;
import { VideoView, useVideoPlayer } from "expo-video";

const ALL = "__ALL__";
const FAV = "__FAV__";
const SIDE_ROW_H = 46;
const CHAN_ROW_H = 52;

type Tab = "live" | "vod" | "series";

/** Sol sütun öğesi: ya bir liste başlığı ya da bir kategori. */
type SideItem =
  | { kind: "playlist"; id: string; name: string; open: boolean; count: number }
  | { kind: "category"; name: string; count: number; playlistId: string };

export default function TvHomeScreen() {
  return <TvHomeContent />;
}

/**
 * İçerik ayrı bir bileşen olarak dışa aktarılıyor ki (tabs)/index.tsx
 * içinden DOĞRUDAN çağrılabilsin.
 *
 * NEDEN: Eskiden tv-home'a yalnızca playlist-select üzerinden yönlendirme
 * vardı. Kullanıcı Ayarlar'dan "Sütunlu" seçince sekme çubuğu içinde kaldığı
 * için bu ekrana HİÇ UĞRAMIYORDU -> yeni arayüz asla görünmedi.
 * Koşullu render ile bu sorun kökten çözülüyor.
 */
export function TvHomeContent() {
  const router = useRouter();
  const { colors } = useTheme();
  const { settings: parental } = useParental();
  const { tvPreview, isTv } = useTv();
  const { width: screenW } = useWindowDimensions();
  /**
   * ÇÖKME DÜZELTMESİ (v8.4.0)
   * "Cannot read property 'includes' of undefined"
   * SEBEP: favorites/toggleFavorite/isFavorite/addToRecent LibraryContext'te
   * DEĞİL, PlaylistContext'te bulunuyor. Yanlış context'ten alındığı için
   * favorites UNDEFINED oluyordu ve favorites.includes(...) uygulamayı
   * çökertiyordu. Bu yüzden sütunlu arayüz hiç açılamıyordu.
   */
  const {
    playlists, activePlaylist, setActivePlaylist, isLoading, ensureHeavyLoaded,
    favorites, toggleFavorite, isFavorite, addToRecent,
  } = usePlaylists();

  // v15.2 Native Core: TV sütunlu ekran tam koleksiyon ister.
  useEffect(() => {
    if (activePlaylist?.id) void ensureHeavyLoaded(activePlaylist.id);
  }, [activePlaylist?.id, ensureHeavyLoaded]);

  const [tab, setTab] = useState<Tab>("live");
  const [selectedCat, setSelectedCat] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState<any>(null);

  /**
   * EKRAN ODAK DURUMU (v9.7.0 — çift ses / şerit düzeltmesi)
   * OK'a basıp /player açılınca bu ekran ARKADA kalıyor ama unmount OLMUYOR;
   * önizleme oynatıcısı çalmaya devam edip ANA oynatıcıyla çift ses ve iki
   * TextureView yüzey çakışması (üstte tema renkli şerit/tint) yaratıyordu.
   * useFocusEffect ile ekran odaktan çıkınca (player üste gelince) önizlemeyi
   * durduruyoruz; geri dönünce yeniden başlıyor.
   */
  const [screenFocused, setScreenFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, [])
  );
  /** Açık liste düğümleri (çoklu liste modunda). */
  const [openPlaylists, setOpenPlaylists] = useState<Record<string, boolean>>({});
  /**
   * EPG (v9.0.0) — 4. sütun için.
   * Cihaz-içi EPG önbelleğinden okunuyor (getNowNext); ağ çağrısı yok,
   * bu yüzden kumanda gezinmesini yavaşlatmaz.
   */
  const [epgMap, setEpgMap] = useState<Record<string, any>>({});

  const sideScroll = useFocusScroll<SideItem>();
  const chanScroll = useFocusScroll<any>();

  const multiPlaylist = playlists.length > 1;

  /**
   * DAR EKRAN KORUMASI (v8.9.0)
   * Sütunlu düzen 3 sütuna bölünür; dar/dikey ekranda sütunlar okunamaz hale
   * gelir (kullanıcı bildirimi: "telefon gibi dikine gösteriyor").
   * 800 px altında uyarı gösterilir; kullanıcı cihazı yatay çevirebilir.
   */
  const tooNarrow = screenW < 800;

  /** Aktif listedeki, seçili sekmeye ait tüm öğeler. */
  const baseList = useMemo(() => {
    if (!activePlaylist) return [] as any[];
    let list:any[];
    if (tab === "vod") list = (activePlaylist.vod || []) as any[];
    else if (tab === "series") list = (activePlaylist.series || []) as any[];
    else list = (activePlaylist.channels || []) as any[];
    return parental.adultHidden ? list.filter(x => !isAdultContent(x)) : list;
  }, [activePlaylist, tab, parental.adultHidden]);

  /** Kategoriler + sayıları (tek geçiş — büyük listelerde hızlı). */
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of baseList) {
      const g = it.group || "Diğer";
      counts.set(g, (counts.get(g) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "tr"))
      .map(([name, count]) => ({ name, count }));
  }, [baseList]);

  /** Sol sütunun nihai içeriği (liste ağacı veya düz kategoriler). */
  /**
   * ANA BÖLÜMLER (v8.6.0 — kullanıcı bildirimi)
   * Sol sütunda CANLI / FİLMLER / DİZİLER yoktu; kullanıcı bölümler arasında
   * geçemiyordu. TiviMate'te de bu bölümler sol menünün en üstündedir.
   */
  const sectionRows = useMemo(() => {
    if (!activePlaylist) return [];
    return [
      { key: "live" as Tab, label: "CANLI KANALLAR", count: activePlaylist.channels?.length || 0, icon: "tv" as const },
      { key: "vod" as Tab, label: "FİLMLER", count: activePlaylist.vod?.length || 0, icon: "film" as const },
      { key: "series" as Tab, label: "DİZİLER", count: activePlaylist.series?.length || 0, icon: "albums" as const },
    ];
  }, [activePlaylist]);

  const sideItems = useMemo<SideItem[]>(() => {
    const favCount = baseList.filter(x => (favorites || []).includes(x.id)).length;
    const head: SideItem[] = [
      { kind: "category", name: FAV, count: favCount, playlistId: activePlaylist?.id || "" },
      { kind: "category", name: ALL, count: baseList.length, playlistId: activePlaylist?.id || "" },
    ];

    if (!multiPlaylist) {
      // TEK LİSTE: doğrudan kategoriler
      return [
        ...head,
        ...categories.map(c => ({
          kind: "category" as const,
          name: c.name,
          count: c.count,
          playlistId: activePlaylist?.id || "",
        })),
      ];
    }

    // ÇOK LİSTE: her liste bir düğüm; açık olanın kategorileri altında
    const out: SideItem[] = [];
    for (const pl of playlists) {
      const isActive = pl.id === activePlaylist?.id;
      const open = !!openPlaylists[pl.id];
      out.push({
        kind: "playlist",
        id: pl.id,
        name: pl.name,
        open,
        // v15.0.1 BUILD FIX: Playlist runtime sözleşmesinde channelCount yok; yüklenmiş kanal dizisi tek gerçek kaynaktır.
        count: pl.channels?.length || 0,
      });
      if (open && isActive) {
        out.push(...head);
        out.push(
          ...categories.map(c => ({
            kind: "category" as const,
            name: c.name,
            count: c.count,
            playlistId: pl.id,
          }))
        );
      }
    }
    return out;
  }, [multiPlaylist, categories, baseList, favorites, playlists, activePlaylist?.id, openPlaylists]);

  /** Orta sütun: seçili kategoriye ve aramaya göre süzülmüş kanallar. */
  const channels = useMemo(() => {
    let list = baseList;
    if (selectedCat === FAV) list = list.filter(x => (favorites || []).includes(x.id));
    else if (selectedCat !== ALL) list = list.filter(x => (x.group || "Diğer") === selectedCat);

    const q = normalize(search.trim());
    if (q) list = list.filter(x =>
      normalize(String(x.name || "")).includes(q) ||
      normalize(String(x.group || "")).includes(q)
    );
    return list;
  }, [baseList, selectedCat, favorites, search]);

  const openItem = useCallback((item: any) => {
    haptic.light();
    if (tab === "live") {
      // v9.8.0: Önizlemeyi TAM oynatıcıya geçmeden ANINDA durdur; böylece yeni
      // kanal yüklenene kadar önizleme sesi çakışmaz. (useFocusEffect blur'u
      // iç içe navigatörlerde biraz gecikebiliyor.)
      setScreenFocused(false);
      addToRecent(item.id);
      router.push({ pathname: "/player", params: { id: item.id } });
    } else {
      router.push({ pathname: "/detail", params: { type: tab, id: item.id } });
    }
  }, [tab, addToRecent, router]);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * KUMANDA DESTEĞİ (v8.0.1)
   * ══════════════════════════════════════════════════════════════════════
   * Bu blok, tüm bağımlılıkları (openItem, highlighted, tab...) TANIMLANDIKTAN
   * SONRA yer alır. JavaScript'te const yukarı taşınmadığı için, hook'u yukarı
   * koymak sessizce "undefined" hatası üretirdi (v7.6.0'da bu hatayı yaşadık).
   */

  /** Sonraki/önceki kanala geç ve sağ panelde göster. */
  const stepChannel = useCallback((delta: 1 | -1) => {
    if (channels.length === 0) return;
    const cur = highlighted ? channels.findIndex(c => c.id === highlighted.id) : -1;
    const next = (cur + delta + channels.length) % channels.length;
    const target = channels[next];
    if (!target) return;
    haptic.soft();
    setHighlighted(target);
    chanScroll.onItemFocus(next);
  }, [channels, highlighted, chanScroll]);

  useRemoteKeys({
    // CH+ / CH- : listede kanal gezme (Homatics, Fire TV kumandaları)
    channelUp: () => stepChannel(1),
    channelDown: () => stepChannel(-1),
    // Oynat tuşu: seçili kanalı aç
    play: () => { if (highlighted) openItem(highlighted); },
    playPause: () => { if (highlighted) openItem(highlighted); },
    // Rehber tuşu: TV rehberine git
    guide: () => router.push("/epg-timeline"),
    // Bilgi tuşu: seçili kanalın detayına git (film/dizi ise)
    info: () => { if (highlighted && tab !== "live") openItem(highlighted); },
    // Uzun-bas geri: aramayı temizle ve TÜMÜ'ye dön (hızlı sıfırlama)
    backLongPress: () => {
      haptic.medium();
      setSearch("");
      setSelectedCat(ALL);
    },
  });

  /**
   * GERİ TUŞU (v8.0.1)
   * Kademeli davranış — yanlışlıkla uygulamadan düşmeyi zorlaştırır:
   *   1. Arama doluysa    -> aramayı temizle
   *   2. Kategori seçiliyse -> TÜMÜ'ye dön
   *   3. İkisi de temizse  -> profil seçimine dön (normal geri)
   */
  useEffect(() => {
    if (tab !== "live" || !activePlaylist?.id) return;
    let alive = true;
    (async () => {
      try {
        const ids = channels
          .slice(0, 60)
          .map((c: any) => c.epg_channel_id || c.tvg_id)
          .filter(Boolean) as string[];
        if (ids.length === 0) return;
        const { getNowNext } = await import("@/src/utils/epg");
        const res = await getNowNext(activePlaylist.id, ids, (activePlaylist as any).epgUrl);
        if (alive && res?.data) setEpgMap(res.data);
      } catch { /* EPG yoksa sütun boş görünür, sorun değil */ }
    })();
    return () => { alive = false; };
  }, [tab, activePlaylist?.id, selectedCat, channels.length]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (search.trim()) { setSearch(""); return true; }
      if (selectedCat !== ALL) { setSelectedCat(ALL); return true; }
      return false;   // varsayılan davranış
    });
    return () => sub.remove();
  }, [search, selectedCat]);

  /** Bir öğenin EPG bilgisi (şimdi/sıradaki). */
  const epgFor = useCallback((item: any) => {
    const key = item?.epg_channel_id || item?.tvg_id || "";
    return key ? (epgMap as any)[key] : null;
  }, [epgMap]);

  const catLabel = (name: string) =>
    name === ALL ? "TÜMÜ" : name === FAV ? "⭐ FAVORİLER" : name;

  if (tooNarrow) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: SPACING.xl }]}>
        <Ionicons name="phone-landscape" size={54} color={colors.brandPrimary} />
        <Text style={{ color: colors.onSurface, fontSize: FONT.size.lg, fontWeight: "800", marginTop: SPACING.md, textAlign: "center" }}>
          Sütunlu düzen geniş ekran ister
        </Text>
        <Text style={{ color: colors.onSurfaceSecondary, textAlign: "center", marginTop: SPACING.sm, lineHeight: 20 }}>
          Bu düzen üç sütuna bölünür ve dar ekranda okunamaz.{"\n\n"}
          Cihazı YATAY çevirin veya Ayarlar → TV Arayüzü → "Klasik" seçin.
        </Text>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.surface }]} testID="tv-home">
      {/* ÜST ŞERİT: sekmeler + liste adı + araçlar */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <Text style={[styles.brand, { color: colors.brandPrimary }]}>KIZILKAN</Text>


        <View style={{ flex: 1 }} />
        <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.sm }} numberOfLines={1}>
          {activePlaylist?.name || "—"}
        </Text>
        <FocusButton testID="tvh-settings" onPress={() => router.push("/(tabs)/settings")} focusRadius={20} style={styles.iconBtn}>
          <Ionicons name="settings-outline" size={20} color={colors.onSurface} />
        </FocusButton>
      </View>

      <FocusGuide style={styles.columns} autoFocus>
        {/* ══ SÜTUN 1 (%25): ANA BÖLÜMLER ══ */}
        <View style={[styles.secCol, { borderRightColor: colors.border }]}>
          <View style={{ paddingHorizontal: 4 }}>
            {sectionRows.map(sec => {
              const active = tab === sec.key;
              return (
                <FocusButton
                  key={sec.key}
                  testID={`tvh-sec-${sec.key}`}
                  autoFocus={sec.key === "live"}
                  onPress={() => { setTab(sec.key); setSelectedCat(ALL); setHighlighted(null); haptic.soft(); }}
                  focusRadius={RADIUS.sm}
                  style={[
                    styles.sideRow,
                    active && { backgroundColor: colors.brandPrimary + "33" },
                  ]}
                >
                  <Ionicons
                    name={sec.icon}
                    size={15}
                    color={active ? colors.brandPrimary : colors.onSurfaceSecondary}
                  />
                  <Text
                    style={[styles.sideText, { color: active ? colors.brandPrimary : colors.onSurface, fontWeight: "800", fontSize: FONT.size.xs }]}
                    numberOfLines={1}
                  >
                    {sec.label}
                  </Text>
                  <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs }}>{sec.count}</Text>
                </FocusButton>
              );
            })}
          </View>
        </View>

        {/* ══ SÜTUN 2 (%25): IPTV LİSTELERİ + AKORDİYON KATEGORİLER ══ */}
        <View style={[styles.listCol, { borderRightColor: colors.border }]}>
          <FlatList
            ref={sideScroll.listRef}
            data={sideItems}
            keyExtractor={(it, i) => (it.kind === "playlist" ? `p-${it.id}` : `c-${it.name}-${i}`)}
            onScrollToIndexFailed={sideScroll.onScrollToIndexFailed}
            getItemLayout={(_, index) => ({ length: SIDE_ROW_H, offset: SIDE_ROW_H * index, index })}
            renderItem={({ item, index }) => (
              <SideRow
                item={item}
                label={item.kind === "playlist" ? item.name : catLabel(item.name)}
                selected={item.kind === "category" && item.name === selectedCat}
                onFocusItem={() => sideScroll.onItemFocus(index)}
                onPress={async () => {
                  if (item.kind === "playlist") {
                    // Liste düğümü: aç/kapat + o listeyi aktif yap
                    if (item.id !== activePlaylist?.id) await setActivePlaylist(item.id);
                    setOpenPlaylists(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                    setSelectedCat(ALL);
                  } else {
                    setSelectedCat(item.name);
                  }
                  haptic.soft();
                }}
              />
            )}
          />
        </View>

        {/* ══ SÜTUN 3+4 ══
            CANLI  : sütun 3 = önizleme + kanallar, sütun 4 = EPG
            VOD/DİZİ: ikisi BİRLEŞİK -> afiş ızgarası (kullanıcının tarifi) */}
        <View
          style={[
            tab === "live" ? styles.chanCol : styles.vodCol,
            { borderRightColor: colors.border },
          ]}
        >
          {/* KÜÇÜK EKRAN — TiviMate'te olduğu gibi sütunun üstünde */}
          {tvPreview && (
            <View style={[styles.previewBox2, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <View style={styles.previewInner}>
                {highlighted?.logo ? (
                  <Image source={{ uri: highlighted.logo }} style={{ width: "45%", height: "45%" }} resizeMode="contain" />
                ) : (
                  <Ionicons name="tv-outline" size={32} color={colors.onSurfaceTertiary} />
                )}
                {highlighted ? (
                  <Text style={{ color: "#fff", fontSize: FONT.size.xs, marginTop: 4 }} numberOfLines={1}>
                    {highlighted.name}
                  </Text>
                ) : null}
              </View>
              {/* CANLI ÖNİZLEME (v9.6.0): yalnızca canlı sekmede ve bir kanal
                  odaklıyken. Çözülene kadar üstteki logo/isim görünür; oynamaya
                  başlayınca video onların üstünü kaplar. */}
              {tab === "live" && highlighted?.url ? (
                <LivePreview channel={highlighted} isTv={isTv} playlist={activePlaylist} active={screenFocused} />
              ) : null}
            </View>
          )}

          <View style={[styles.searchBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Ionicons name="search" size={16} color={colors.onSurfaceTertiary} />
            <TextInput
              testID="tvh-search"
              value={search}
              onChangeText={setSearch}
              placeholder="Kanal ara…"
              placeholderTextColor={colors.onSurfaceTertiary}
              // TV'de klavye otomatik açılmasın (odağı kaçırır)
              autoFocus={false}
              style={{ flex: 1, color: colors.onSurface, paddingVertical: 6 }}
            />
          </View>

          {tab !== "live" ? (
            /* AFİŞ IZGARASI — film/dizi (3+4 birleşik alanda) */
            <FlatList
              data={channels}
              keyExtractor={(it: any) => String(it.id)}
              numColumns={4}
              key="vodgrid"
              initialNumToRender={8}
              windowSize={5}
              contentContainerStyle={{ padding: 6 }}
              ListEmptyComponent={
                <Text style={{ color: colors.onSurfaceSecondary, padding: SPACING.md }}>
                  {search ? "Sonuç yok" : "Bu kategoride içerik yok"}
                </Text>
              }
              renderItem={({ item }) => (
                <FocusButton
                  testID={`tvh-vod-${item.id}`}
                  onPress={() => openItem(item)}
                  onFocus={() => setHighlighted((p: any) => (p?.id === item.id ? p : item))}
                  focusRadius={RADIUS.sm}
                  style={{ flex: 1 / 4, margin: 4 }}
                >
                  <View style={{ aspectRatio: 2 / 3, borderRadius: RADIUS.sm, overflow: "hidden", backgroundColor: colors.surfaceTertiary }}>
                    {item.poster ? (
                      <Image source={{ uri: item.poster }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                    ) : (
                      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="film-outline" size={22} color={colors.onSurfaceTertiary} />
                      </View>
                    )}
                  </View>
                  <Text style={{ color: colors.onSurface, fontSize: 10, marginTop: 3 }} numberOfLines={2}>
                    {item.name}
                  </Text>
                </FocusButton>
              )}
            />
          ) : (
          <FlatList
            ref={chanScroll.listRef}
            data={channels}
            keyExtractor={(it: any) => String(it.id)}
            onScrollToIndexFailed={chanScroll.onScrollToIndexFailed}
            getItemLayout={(_, index) => ({ length: CHAN_ROW_H, offset: CHAN_ROW_H * index, index })}
            initialNumToRender={14}
            windowSize={9}
            ListEmptyComponent={
              <Text style={{ color: colors.onSurfaceSecondary, padding: SPACING.md }}>
                {search ? "Sonuç yok" : "Bu kategoride içerik yok"}
              </Text>
            }
            renderItem={({ item, index }) => (
              <ChanRow
                item={item}
                fav={isFavorite(item.id)}
                onFocusItem={() => {
                  chanScroll.onItemFocus(index);
                  /**
                   * SONSUZ DÖNGÜ DÜZELTMESİ (v8.9.0) — ÇÖKMENİN SEBEBİ
                   * setHighlighted her odak olayında koşulsuz çağrılıyordu.
                   * Her çağrı yeniden render, her render odak olayı… bellek
                   * şişip uygulama kapanıyordu ("bir süre sonra çıkıyor").
                   * Artık yalnızca GERÇEKTEN değiştiyse güncelleniyor.
                   */
                  setHighlighted((prev: any) => (prev?.id === item.id ? prev : item));
                }}
                onPress={() => openItem(item)}
              />
            )}
          />
          )}
        </View>

        {/* ══ SÜTUN 4 (%25): EPG — kanalların karşılıkları ══
            VOD/Dizi'de bu sütun kullanılmaz; 3+4 birleşip afiş ızgarası olur. */}
        <View style={styles.epgCol}>
          {tab === "live" ? (
            <FlatList
              data={channels}
              keyExtractor={(it: any) => `epg-${it.id}`}
              initialNumToRender={10}
              windowSize={5}
              ListHeaderComponent={
                /* HİZA (v9.10.0): Kanal sütununda listenin ÜSTÜNDE önizleme
                   (varsa) VE arama kutusu (her zaman, CHAN_ROW_H=52) var. EPG
                   sütunu bunların İKİSİNİ birden telafi etmeli; eskiden yalnızca
                   önizlemeyi sayıyordu → EPG bir satır yukarıda kalıyordu. */
                <View style={{ height: (tvPreview ? (screenW / 4) * 9 / 16 : 0) + CHAN_ROW_H }} />
              }
              renderItem={({ item }) => {
                const e = epgFor(item);
                const isSel = highlighted?.id === item.id;
                return (
                  <View
                    style={[
                      styles.rowSm,
                      /* HİZA (v9.10.0): kanal satırıyla AYNI yükseklik (48+4=52)
                         olmalı; eskiden minHeight:44 idi ve aşağı indikçe kayıyordu. */
                      { height: CHAN_ROW_H - 4, marginBottom: 4 },
                      isSel && { backgroundColor: colors.brandPrimary + "22" },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ color: e?.now ? colors.onSurface : colors.onSurfaceTertiary, fontSize: FONT.size.xs }}
                        numberOfLines={1}
                      >
                        {e?.now?.title || "—"}
                      </Text>
                      {e?.next ? (
                        <Text style={{ color: colors.onSurfaceTertiary, fontSize: 10 }} numberOfLines={1}>
                          {e.next.title}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              }}
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.md }}>
              <Ionicons name="grid-outline" size={40} color={colors.onSurfaceTertiary} />
              <Text style={{ color: colors.onSurfaceSecondary, textAlign: "center", marginTop: SPACING.sm, fontSize: FONT.size.sm }}>
                Film ve dizilerde afişler orta sütunda listelenir
              </Text>
            </View>
          )}
        </View>
      </FocusGuide>
    </SafeAreaView>
  );
}

/** Sol sütun satırı (liste düğümü veya kategori). */
function SideRow({
  item, label, selected, onPress, onFocusItem,
}: {
  item: SideItem;
  label: string;
  selected: boolean;
  onPress: () => void;
  onFocusItem: () => void;
}) {
  const { colors } = useTheme();
  const { isFocused, onFocus, onBlur } = useTVFocus();
  const isPl = item.kind === "playlist";

  return (
    <FocusButton
      testID={`tvh-side-${label}`}
      onPress={onPress}
      onFocus={() => { onFocus(); onFocusItem(); }}
      onBlur={onBlur}
      focusRadius={RADIUS.sm}
      style={[
        styles.sideRow,
        selected && { backgroundColor: colors.brandPrimary + "33" },
        isFocused && rowFocusStyle(colors.brandPrimary, true, RADIUS.sm),
      ]}
    >
      {isPl && (
        <Ionicons
          name={(item as any).open ? "chevron-down" : "chevron-forward"}
          size={14}
          color={colors.onSurfaceSecondary}
        />
      )}
      <Text
        style={[
          styles.sideText,
          { color: selected ? colors.brandPrimary : colors.onSurface, fontWeight: isPl ? "800" : "500" },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs }}>{item.count}</Text>
    </FocusButton>
  );
}

/** Orta sütun kanal satırı. */
function ChanRow({
  item, fav, onPress, onFocusItem,
}: {
  item: any;
  fav: boolean;
  onPress: () => void;
  onFocusItem: () => void;
}) {
  const { colors } = useTheme();
  const { isFocused, onFocus, onBlur } = useTVFocus();

  return (
    <FocusButton
      testID={`tvh-chan-${item.id}`}
      onPress={onPress}
      onFocus={() => { onFocus(); onFocusItem(); }}
      onBlur={onBlur}
      focusRadius={RADIUS.sm}
      style={[
        styles.chanRow,
        isFocused && rowFocusStyle(colors.brandPrimary, true, RADIUS.sm),
      ]}
    >
      <View style={[styles.chanLogo, { backgroundColor: colors.surfaceTertiary }]}>
        {item.logo || item.poster ? (
          <Image source={{ uri: item.logo || item.poster }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
        ) : (
          <Ionicons name="tv-outline" size={16} color={colors.onSurfaceTertiary} />
        )}
      </View>
      <Text style={{ flex: 1, color: colors.onSurface, fontSize: FONT.size.sm }} numberOfLines={1}>
        {item.name}
      </Text>
      {fav ? <Ionicons name="heart" size={14} color={colors.brandPrimary} /> : null}
    </FocusButton>
  );
}

/**
 * CANLI ÖNİZLEME (v9.6.0 — kullanıcı isteği)
 * ===========================================================================
 * TV listesinde gezinirken odaklanan kanal, OK'a basmadan önizleme
 * penceresinde CANLI oynar (TiviMate deseni). Eskiden yalnızca logo görünüyordu.
 *
 * TASARIM KARARLARI:
 * - DEBOUNCE (600ms): hızlı gezinirken her kanalı açıp kapatmayız; kullanıcı
 *   bir kanalda durunca oynatılır. Aksi halde onlarca kanal art arda açılıp
 *   TV box'ı boğardı.
 * - STALKER: yayın adresi bir KOMUT; create_link ile çözülür (stalkerResolveStream).
 * - YÜZEY: TV'de textureView (v9.5.0'daki "ses var/görüntü yok" düzeltmesiyle
 *   tutarlı) — önizleme de aynı sorundan etkilenmesin.
 * - MOTOR: yalnızca ExoPlayer (hafif). ExoPlayer açamayan (bazı .ts) kanallar
 *   önizlemede boş kalabilir; OK'a basınca açılan TAM oynatıcı VLC'ye düşerek
 *   yine de oynatır. Önizleme için bu makul bir denge.
 * ===========================================================================
 */
function LivePreview({
  channel, isTv, playlist, active,
}: {
  channel: any;
  isTv: boolean;
  playlist: any;
  active: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (debRef.current) clearTimeout(debRef.current);
    };
  }, []);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    // Ekran odakta değilse (player üstte) önizleme OYNAMAZ — çift ses/yüzey
    // çakışmasını önler.
    if (!active) { setUrl(null); return; }
    if (!channel?.url) { setUrl(null); return; }
    // Yeni odakta önce mevcut oynatmayı bırak (kaynağı boşalt), sonra debounce.
    setUrl(null);
    debRef.current = setTimeout(async () => {
      try {
        if (playlist?.source === "stalker") {
          const { stalkerResolveStream, normalizeMac } = await import("@/src/utils/stalker");
          const cred = {
            portal: playlist.stalkerPortal,
            mac: normalizeMac(playlist.stalkerMac || ""),
            serial: playlist.stalkerSerial,
          };
          const { url: resolved } = await stalkerResolveStream(cred, null, String(channel.url));
          if (aliveRef.current) setUrl(resolved);
        } else {
          if (aliveRef.current) setUrl(String(channel.url));
        }
      } catch {
        if (aliveRef.current) setUrl(null);
      }
    }, 600);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [channel?.id, channel?.url, playlist?.id, playlist?.source, active]);

  const player = useVideoPlayer(url ?? null, (p) => { p.loop = false; p.play(); });

  useEffect(() => {
    if (player && url) { try { player.play(); } catch {} }
  }, [player, url]);

  // Ekran odaktan çıkınca oynatıcıyı DURDUR (çift ses kökü).
  useEffect(() => {
    if (!active && player) { try { player.pause(); } catch {} }
  }, [active, player]);

  if (!active || !url) return null;   // durdurulunca/çözülene kadar logo fallback görünür
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      nativeControls={false}
      allowsFullscreen={false}
      surfaceType={isTv ? "textureView" : "surfaceView"}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1,
  },
  brand: { fontSize: 18, fontWeight: "800", letterSpacing: 3, marginRight: SPACING.sm },
  tabBtn: { paddingHorizontal: SPACING.md, paddingVertical: 7, borderRadius: RADIUS.pill },
  iconBtn: { padding: 8, borderRadius: 20 },

  columns: { flex: 1, flexDirection: "row" },
  /**
   * TiviMate DÜZENİ (v9.0.0) — kullanıcının tarifine göre
   *  1) Ana bölümler      %25
   *  2) IPTV listeleri + akordiyon kategoriler   %25
   *  3) Önizleme (üstte) + kanallar              %25
   *  4) EPG (kanal karşılıkları)                 %25
   * VOD/Dizi'de 3+4 BİRLEŞİK -> afiş ızgarası
   */
  secCol:  { width: "25%", borderRightWidth: 1, paddingVertical: 2 },
  listCol: { width: "25%", borderRightWidth: 1, paddingVertical: 2 },
  chanCol: { width: "25%", borderRightWidth: 1 },
  epgCol:  { flex: 1 },
  vodCol:  { flex: 1 },   // 3+4 birleşik
  previewBox2: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  rowSm: { minHeight: 44, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: RADIUS.sm, marginBottom: 2 },

  sideRow: {
    height: SIDE_ROW_H - 4, marginHorizontal: 4, marginBottom: 4,
    paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: RADIUS.sm,
  },
  sideText: { flex: 1, fontSize: FONT.size.sm },

  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 8, marginBottom: 6,
  },
  chanRow: {
    height: CHAN_ROW_H - 4, marginBottom: 4, paddingHorizontal: 8,
    flexDirection: "row", alignItems: "center", gap: 8, borderRadius: RADIUS.sm,
  },
  chanLogo: { width: 32, height: 32, borderRadius: 4, alignItems: "center", justifyContent: "center", overflow: "hidden" },

  previewBox: { width: "100%", aspectRatio: 16 / 9, borderRadius: RADIUS.md, borderWidth: 1, overflow: "hidden", marginBottom: SPACING.sm },
  previewInner: { flex: 1, alignItems: "center", justifyContent: "center" },
  previewLogo: { width: "55%", height: "55%" },
  previewName: { fontSize: FONT.size.base, fontWeight: "800" },
  actBtn: { flexDirection: "row", height: 46, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", gap: 8 },
});
