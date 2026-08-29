import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { useTv } from "@/src/store/TvContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { refreshPlaylistContent, type RefreshProgress } from "@/src/utils/refreshPlaylist";
import { useProfiles } from "@/src/store/ProfileContext";
import { KizilkanLogo } from "@/src/components/KizilkanLogo";
import { haptic } from "@/src/utils/haptic";
import { FocusButton } from "@/src/components/FocusButton";
import { playlistTypeLabel, playlistVisualColor, playlistTypeIcon } from "@/src/utils/playlistVisual";

export default function PlaylistSelect() {
  /**
   * TV SÜTUNLU DÜZEN (v8.0.0)
   * Kullanıcı Ayarlar'dan "Sütunlu" seçtiyse ana ekran yerine tv-home açılır.
   * Varsayılan "classic" olduğu için mevcut davranış DEĞİŞMEZ.
   */
  const { isTv, tvLayout } = useTv();
  const homeRoute = (isTv && tvLayout === "columns") ? "/tv-home" : "/(tabs)";
  const router = useRouter();
  const { colors } = useTheme();
  const { playlists, activePlaylist, setActivePlaylist, isLoading, loadedProfileId, updatePlaylist, heavyLoading, repairFailedId} = usePlaylists();
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshAllProgress, setRefreshAllProgress] = useState("");
  const [refreshAllDetails, setRefreshAllDetails] = useState<string[]>([]);
  const [refreshOneProgress, setRefreshOneProgress] = useState("");

  const { activeProfile } = useProfiles();
  const navigationStartedRef = useRef(false);
  const autoCancelledRef = useRef(false);
  const autoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [autoTimer, setAutoTimer] = useState(4);

  const sorted = useMemo(() => {
    // last-used first
    if (!playlists?.length) return [];
    const copy = [...playlists];
    copy.sort((a, b) => {
      if (activePlaylist?.id === a.id) return -1;
      if (activePlaylist?.id === b.id) return 1;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    return copy;
  }, [playlists, activePlaylist]);

  // Auto-continue with the last-used playlist if user is idle.
  // GPT ELITE v12.5.0: profil metadata'sı hazır olduktan SONRA deterministik
  // başlar. Kullanıcı bir kez etkileşirse aynı mount boyunca tekrar kurulmaz.
  const clearAutoTimers = React.useCallback(() => {
    if (autoTimeoutRef.current) clearTimeout(autoTimeoutRef.current);
    if (autoIntervalRef.current) clearInterval(autoIntervalRef.current);
    autoTimeoutRef.current = null;
    autoIntervalRef.current = null;
  }, []);

  const cancelAuto = React.useCallback(() => {
    autoCancelledRef.current = true;
    clearAutoTimers();
    setAutoTimer(-1);
  }, [clearAutoTimers]);

  const formatRefreshProgress = (p: RefreshProgress) => {
    if (p.phase !== "content") return p.message;
    const mark = (s?: string, count?: number) => s === "done" ? `✅${count ?? ""}` : s === "error" ? "❌" : "⏳";
    return `Canlı ${mark(p.live, p.liveCount)} · Film ${mark(p.vod, p.vodCount)} · Dizi ${mark(p.series, p.seriesCount)}`;
  };

  /** Bir listeyi kaynağından yeniden çeker (cihaz-içi). */
  const refreshOne = async (pl: any) => {
    if (refreshingId) return;
    cancelAuto();
    setRefreshingId(pl.id);
    try {
      const res = await refreshPlaylistContent(pl, (p) => setRefreshOneProgress(`${pl.name} · ${formatRefreshProgress(p)}`));
      if (res.ok && res.patch) {
        setRefreshOneProgress(`${pl.name} · Cihaza kaydediliyor...`);
        await updatePlaylist(pl.id, res.patch);
        Alert.alert("Liste güncellendi", res.message);
      } else {
        Alert.alert("Yenilenemedi", res.message);
      }
    } finally {
      setRefreshingId(null);
      setRefreshOneProgress("");
    }
  };
  const refreshAll = async () => {
    if (refreshingId || refreshingAll || !playlists.length) return;
    cancelAuto();
    setRefreshingAll(true);
    setRefreshAllDetails([]);
    let ok = 0;
    let completed = 0;
    let cursor = 0;
    const failed: string[] = [];
    const status = new Map<string, string>();

    const publish = () => {
      const active = [...status.entries()]
        .filter(([, value]) => !value.startsWith("✅") && !value.startsWith("❌"))
        .slice(0, 2)
        .map(([name, value]) => `${name}: ${value}`);
      setRefreshAllProgress(`${completed}/${playlists.length} tamamlandı`);
      setRefreshAllDetails(active);
    };

    const worker = async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= playlists.length) return;
        const pl: any = playlists[idx];
        status.set(pl.name, "Başlıyor...");
        publish();
        try {
          const res = await refreshPlaylistContent(pl, (p) => {
            status.set(pl.name, formatRefreshProgress(p));
            publish();
          });
          if (res.ok && res.patch) {
            status.set(pl.name, "Cihaza kaydediliyor...");
            publish();
            await updatePlaylist(pl.id, res.patch);
            ok += 1;
            status.set(pl.name, `✅ ${res.message}`);
          } else {
            failed.push(`${pl.name}: ${res.message}`);
            status.set(pl.name, `❌ ${res.message}`);
          }
        } catch (e: any) {
          const msg = e?.message || "Bilinmeyen hata";
          failed.push(`${pl.name}: ${msg}`);
          status.set(pl.name, `❌ ${msg}`);
        } finally {
          completed += 1;
          publish();
        }
      }
    };

    try {
      // İki kontrollü worker: tek yavaş panel tüm kuyruğu bloke etmez;
      // aynı anda aşırı bağlantı açıp sağlayıcıyı da zorlamaz.
      await Promise.all([worker(), worker()]);
      Alert.alert(
        "Tümünü Güncelle",
        `${ok}/${playlists.length} liste güncellendi.` +
          (failed.length ? `\n\nBaşarısız:\n${failed.slice(0, 8).join("\n")}` : "")
      );
    } finally {
      setRefreshingAll(false);
      setRefreshAllProgress("");
      setRefreshAllDetails([]);
    }
  };

  useEffect(() => {
    clearAutoTimers();
    if (isLoading || loadedProfileId !== activeProfile.id || navigationStartedRef.current) return;

    if (sorted.length === 0) {
      navigationStartedRef.current = true;
      router.replace("/add-playlist");
      return;
    }

    if (sorted.length === 1) {
      const only = sorted[0];
      navigationStartedRef.current = true;
      (async () => {
        if (activePlaylist?.id !== only.id) await setActivePlaylist(only.id);
        router.replace(homeRoute as any);
      })().catch(() => { navigationStartedRef.current = false; });
      return;
    }

    if (autoCancelledRef.current) return;
    setAutoTimer(4);
    autoIntervalRef.current = setInterval(() => {
      setAutoTimer(t => (t > 0 ? t - 1 : 0));
    }, 1000);
    autoTimeoutRef.current = setTimeout(() => {
      clearAutoTimers();
      if (autoCancelledRef.current || navigationStartedRef.current) return;
      navigationStartedRef.current = true;
      (async () => {
        const last = sorted[0];
        if (activePlaylist?.id !== last.id) await setActivePlaylist(last.id);
        router.replace(homeRoute as any);
      })().catch(() => { navigationStartedRef.current = false; });
    }, 4000);

    return clearAutoTimers;
  }, [isLoading, loadedProfileId, activeProfile.id, sorted, activePlaylist?.id, router, setActivePlaylist, homeRoute, clearAutoTimers]);

  /**
   * LİSTE KİLİDİ (v9.3.0 — kullanıcı isteği)
   * Listeye PIN konulduysa geçmeden önce sorulur. Profil PIN'inden
   * bağımsızdır: aynı profildeki bazı listeler korumalı olabilir.
   * Ana anahtar ve kurtarma kodu burada da geçerlidir.
   */
  const [pinForList, setPinForList] = useState<string | null>(null);
  const [listPin, setListPin] = useState("");
  const [listPinErr, setListPinErr] = useState<string | null>(null);

  const enterList = async (id: string) => {
    if (navigationStartedRef.current) return;
    navigationStartedRef.current = true;
    try {
      if (activePlaylist?.id !== id) await setActivePlaylist(id);
      router.replace(homeRoute as any);
    } catch {
      navigationStartedRef.current = false;
    }
  };

  const choose = async (id: string) => {
    haptic.medium();
    const pl: any = playlists.find(p => p.id === id);
    if (pl?.hasPin) {
      setPinForList(id);
      setListPin("");
      setListPinErr(null);
      return;
    }
    await enterList(id);
  };

  const sourceIcon = (source?: string) => {
    if (source === "xtream") return "server";
    if (source === "stalker") return "hardware-chip";
    if (source === "m3u_url") return "link";
    return "document-attach";
  };
  const sourceLabel = (source?: string) => {
    if (source === "xtream") return "Xtream Codes";
    if (source === "stalker") return "MAG / Stalker";
    if (source === "m3u_url") return "M3U URL";
    return "M3U Dosya";
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top"]} testID="playlist-select-screen">
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <KizilkanLogo size="md" showSubtitle={false} showIcon align="center" />
            <Text style={[styles.hello, { color: colors.onSurfaceSecondary }]}>
              Merhaba <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold }}>{activeProfile.name}</Text>
            </Text>
            <Text style={[styles.title, { color: colors.onSurface }]}>Hangi liste ile başlayalım?</Text>
            {autoTimer > 0 && sorted.length > 1 && (
              <FocusButton testID="cancel-auto-btn" onPress={cancelAuto} style={{ marginTop: SPACING.sm }}>
                <Text style={[styles.autoText, { color: colors.brandPrimary }]}>
                  {autoTimer}s içinde son liste otomatik açılacak (Dokun: durdur)
                </Text>
              </FocusButton>
            )}
          </View>

          <View style={{ paddingHorizontal: SPACING.lg, marginTop: SPACING.md }}>
            <FocusButton testID="refresh-all-playlists-btn" focusable disabled={refreshingAll || !!refreshingId} onPress={refreshAll} style={[styles.refreshAllBtn,{backgroundColor:colors.surfaceSecondary,borderColor:colors.border}]}>
              {refreshingAll ? <ActivityIndicator size="small" color={colors.brandPrimary}/> : <Ionicons name="refresh-circle" size={22} color={colors.brandPrimary}/>}
              <Text style={{color:colors.onSurface,fontWeight:FONT.weight.bold}}>{refreshingAll ? `Güncelleniyor · ${refreshAllProgress}` : "Tümünü Güncelle"}</Text>
            </FocusButton>
            {(refreshingAll && refreshAllDetails.length > 0) && (
              <View style={[styles.refreshDetails, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
                {refreshAllDetails.map((line, i) => (
                  <Text key={`${i}-${line}`} numberOfLines={2} style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs }}>{line}</Text>
                ))}
              </View>
            )}
            {!!refreshOneProgress && (
              <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs, marginTop: SPACING.xs }}>{refreshOneProgress}</Text>
            )}
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {/**
              * v16.4.0 — ONARIM DURUM BANDI
              * heavyLoading: içerik kaynağından yeniden indiriliyor.
              * repairFailedId: onarım da başarısız — kullanıcıya ne yapacağını söyler.
              */}
            {heavyLoading && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md, marginBottom: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.brandPrimary }}>
                <ActivityIndicator size="small" color={colors.brandPrimary} />
                <Text style={{ color: colors.onSurface, flex: 1, fontSize: FONT.size.sm }}>
                  Liste içeriği hazırlanıyor…
                </Text>
              </View>
            )}
            {!!repairFailedId && !heavyLoading && (
              <View style={{ padding: SPACING.md, marginBottom: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.error }}>
                <Text style={{ color: colors.error, fontWeight: FONT.weight.bold, marginBottom: 4 }}>
                  Bu listenin içeriği cihazda yok
                </Text>
                <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.sm, lineHeight: 18 }}>
                  İçerik indirilemedi. İnternet bağlantınızı kontrol edip listeye tekrar dokunun.
                  Sorun sürerse listeyi silip yeniden ekleyin.
                </Text>
              </View>
            )}
            {sorted.map((p, i) => {
              const typeColor = playlistVisualColor(p);
              return (
              <FocusButton
                key={p.id}
                testID={`playlist-cell-${p.id}`}
                onPress={() => choose(p.id)}
                onFocus={cancelAuto}
                activeOpacity={0.85}
                focusable
                hasTVPreferredFocus={i === 0}
                /**
                 * v16.2.0 — SEÇİLİ LİSTE BELİRGİNLEŞTİRİLDİ.
                 * Önceden yalnız kenarlık rengi ve küçük "• SON" yazısı vardı;
                 * kullanıcı hangi listenin aktif olduğunu ayırt edemiyordu.
                 * Artık: kalın kenarlık + marka rengi dolgu + sol renk şeridi
                 * + "AKTİF" rozeti.
                 */
                style={[
                  styles.cell,
                  activePlaylist?.id === p.id
                    ? {
                        backgroundColor: colors.brandPrimary + "26",
                        borderColor: colors.brandPrimary,
                        borderWidth: 2,
                        borderLeftWidth: 6,
                      }
                    : { backgroundColor: typeColor + "10", borderColor: typeColor + "88" },
                ]}
              >
                <View style={[styles.iconBox, { backgroundColor: typeColor + "22" }]}>
                  <Ionicons name={playlistTypeIcon(p) as any} size={28} color={typeColor} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.name, { color: colors.onSurface }]} numberOfLines={1}>
                    {p.name}
                    {activePlaylist?.id === p.id && (
                      <Text style={{ color: colors.brandPrimary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>
                        {"  ✓ AKTİF"}
                      </Text>
                    )}
                    {/**
                      * v16.4.0 — İÇERİK YOK ROZETİ.
                      * Cihaz kaydında bu listeler seçilmeye çalışıldığında
                      * "Room indeksi ve legacy veri dosyası bulunamadı" hatası
                      * alınıyor ve seçim SESSİZCE başarısız oluyordu; kullanıcı
                      * neden seçilmediğini anlamıyordu. Artık görünür.
                      */}
                    {repairFailedId === p.id && (
                      <Text style={{ color: colors.error, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>
                        {"  ⚠ İÇERİK YOK"}
                      </Text>
                    )}
                  </Text>
                  <Text style={[styles.sub, { color: colors.onSurfaceSecondary }]} numberOfLines={1}>
                    <Text style={{ color: typeColor, fontWeight: FONT.weight.bold }}>{playlistTypeLabel(p)}</Text>
                    {/* v16.2.0: Room kanonik depo olduğundan diziler bellekte BOŞ olabilir;
                        sayaçlar önce meta'dan okunur, yoksa dizi uzunluğuna düşülür.
                        Aksi halde dolu listeler "0 kanal" görünüyordu. */}
                    {` • ${p.channelsCount ?? p.channels?.length ?? 0} kanal`}
                    {(p.vodCount ?? p.vod?.length ?? 0) ? ` • ${p.vodCount ?? p.vod?.length} film` : ""}
                    {(p.seriesCount ?? p.series?.length ?? 0) ? ` • ${p.seriesCount ?? p.series?.length} dizi` : ""}
                  </Text>
                  {p.serverCodeBinding && (
                    <Text style={[styles.sub, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>
                      Panel: {p.serverCodeBinding.panelName} • Sunucu kodu: {p.serverCodeBinding.code}
                    </Text>
                  )}
                </View>
                <FocusButton
                  testID={`playlist-refresh-${p.id}`}
                  onPress={() => refreshOne(p)}
                  disabled={!!refreshingId}
                  hitSlop={10}
                  focusable
                  style={{ padding: 6, opacity: refreshingId === p.id ? 0.4 : 1 }}
                >
                  {refreshingId === p.id
                    ? <ActivityIndicator size="small" color={colors.brandPrimary} />
                    : <Ionicons name="refresh" size={20} color={colors.brandPrimary} />}
                </FocusButton>
                <Ionicons name="chevron-forward" size={22} color={colors.onSurfaceTertiary} />
              </FocusButton>
              );
            })}

            <FocusButton
              testID="add-new-playlist-btn"
              onPress={() => router.push("/add-playlist")}
              activeOpacity={0.85}
              focusable
              style={[styles.cell, styles.addCell, { borderColor: colors.border }]}
            >
              <View style={[styles.iconBox, { backgroundColor: colors.surface }]}>
                <Ionicons name="add" size={28} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.brandPrimary }]}>Yeni Liste Ekle</Text>
                <Text style={[styles.sub, { color: colors.onSurfaceSecondary }]}>M3U / Xtream Codes / MAG</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.brandPrimary} />
            </FocusButton>
          </ScrollView>

          <View style={styles.footer}>
            <FocusButton
              testID="switch-profile-link"
              onPress={() => router.replace("/profile-select")}
              hitSlop={10}
            >
              <Text style={[styles.footerText, { color: colors.onSurfaceSecondary }]}>
                <Ionicons name="person-circle-outline" size={14} color={colors.onSurfaceSecondary} />{" "}
                Profil değiştir
              </Text>
            </FocusButton>
          </View>
        </>
      )}
      {/* LİSTE PIN GİRİŞİ (v9.3.0) */}
      <Modal visible={!!pinForList} transparent animationType="fade" onRequestClose={() => setPinForList(null)}>
        <Pressable
          focusable={false}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center", padding: SPACING.lg }}
          onPress={() => setPinForList(null)}
        >
          <Pressable
            focusable={false}
            style={{ width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACING.lg }}
            onPress={e => e.stopPropagation()}
          >
            <Text style={{ color: colors.onSurface, fontSize: FONT.size.lg, fontWeight: "800", textAlign: "center" }}>
              Liste Kilitli
            </Text>
            <Text style={{ color: colors.onSurfaceSecondary, textAlign: "center", marginTop: 6 }}>
              {playlists.find(p => p.id === pinForList)?.name}
            </Text>
            <TextInput
              testID="list-pin-input"
              value={listPin}
              onChangeText={t => { setListPin(t.replace(/\D/g, "").slice(0, 10)); setListPinErr(null); }}
              placeholder="PIN (4-10 rakam)"
              placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={10}
              autoFocus={!isTv}
              style={{
                marginTop: SPACING.md, height: 52, borderRadius: RADIUS.md, borderWidth: 1,
                borderColor: colors.border, backgroundColor: colors.surfaceSecondary,
                color: colors.onSurface, paddingHorizontal: SPACING.md, textAlign: "center", fontSize: 20,
              }}
            />
            {listPinErr ? (
              <Text style={{ color: colors.error, textAlign: "center", marginTop: 8 }}>{listPinErr}</Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md }}>
              <TouchableOpacity
                onPress={() => setPinForList(null)}
                style={{ flex: 1, height: 48, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: colors.onSurface, fontWeight: "700" }}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="list-pin-submit"
                onPress={async () => {
                  const pl: any = playlists.find(p => p.id === pinForList);
                  const { checkPin, isAccepted } = await import("@/src/utils/pin");
                  const r = await checkPin(listPin, pl?.pin);
                  if (isAccepted(r)) {
                    const id = pinForList!;
                    setPinForList(null);
                    await enterList(id);
                  } else {
                    setListPinErr("Yanlış PIN");
                    haptic.error();
                  }
                }}
                disabled={listPin.length < 4}
                style={{ flex: 1, height: 48, borderRadius: RADIUS.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", opacity: listPin.length < 4 ? 0.5 : 1 }}
              >
                <Text style={{ color: colors.onBrandPrimary, fontWeight: "700" }}>Giriş</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { alignItems: "center", paddingTop: SPACING.xl, paddingHorizontal: SPACING.xl, gap: 4 },
  hello: { fontSize: FONT.size.sm, marginTop: SPACING.lg },
  title: { fontSize: 22, fontWeight: FONT.weight.black, marginTop: SPACING.sm, textAlign: "center" },
  autoText: { fontSize: FONT.size.xs, fontWeight: FONT.weight.semibold, textAlign: "center" },
  list: { padding: SPACING.lg, gap: SPACING.sm, paddingBottom: SPACING.xxxl },
  refreshAllBtn: { minHeight: 48, borderWidth: 1, borderRadius: RADIUS.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, paddingHorizontal: SPACING.lg },
  refreshDetails: { marginTop: SPACING.sm, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, gap: 4 },
  cell: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1.5,
  },
  addCell: { borderStyle: "dashed", borderWidth: 2, marginTop: SPACING.sm },
  iconBox: { width: 56, height: 56, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  name: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  sub: { fontSize: FONT.size.xs, marginTop: 2 },
  footer: { alignItems: "center", padding: SPACING.md },
  footerText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
});
