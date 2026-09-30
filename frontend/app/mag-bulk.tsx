/**
 * KIZILKAN PLAYER v18.7.0 — ÇOKLU MAC (MAG) EKLEME EKRANI.
 * ===========================================================================
 * Xtream combo (çoklu hesap) taramasının MAG karşılığı: kullanıcı birden fazla portal
 * adresini (DNS:port, http/https olmadan da) ve birden fazla MAC'i (liste veya aralık) girer;
 * her (portal × MAC) taranır, yalnız GEÇERLİ hesaplar eklenir.
 *  • Port/portal bilinmiyorsa otomatik keşif (discoverMagPortal).
 *  • Rehberden host: kod / panel adı / tümü (fetchPanelDirectory + filterDirectory).
 *  • Proxy'li tarama (ScanProxyToggleRow → native proxy havuzu, rotasyonlu).
 *  • Duraklat / Devam / İptal.
 * YASAL: yalnız kullanıcının KENDİ MAC adresleri.
 * ===========================================================================
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { FocusButton } from "@/src/components/FocusButton";
import { ScanProxyToggleRow, ScanProxyLiveLine } from "@/src/components/ScanProxyControls";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { recordDiagnostic } from "@/src/utils/diagnostics";
import { haptic } from "@/src/utils/haptic";
import type { Playlist } from "@/src/types";
import {
  parseMacList, expandMacRange, parsePortalHosts, buildMagBulkJobs, MAG_MAX_MACS,
  type MagHostEntry,
} from "@/src/utils/magBulk";
import { runMagBulkScan, type MagScanResult } from "@/src/utils/magBulkScan";
import { PanelScan } from "@/modules/panel-scan";

type HostMode = "manual" | "code" | "name" | "all";

const CATEGORY_META: Record<MagScanResult["category"], { label: string; color: (c: any) => string; icon: any }> = {
  valid: { label: "Geçerli", color: c => c.success || "#2ecc71", icon: "checkmark-circle" },
  expired: { label: "Süresi dolmuş", color: c => c.warning || "#f39c12", icon: "time" },
  blocked: { label: "Yetkisiz/bloke", color: c => c.error, icon: "close-circle" },
  "no-portal": { label: "Portal yok", color: c => c.onSurfaceTertiary, icon: "help-circle" },
  error: { label: "Hata", color: c => c.onSurfaceTertiary, icon: "alert-circle" },
};

function stableId(prefix: string, identity: string): string {
  const key = String(identity || "").trim().toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `pl-${prefix}-${(h >>> 0).toString(16).padStart(8, "0")}`;
}
function magIdentity(portal: string, mac: string): string {
  let host = portal;
  try { host = new URL(/^https?:\/\//i.test(portal) ? portal : `http://${portal}`).host.toLowerCase(); } catch {}
  return `${host}\u0000${mac.toUpperCase()}`;
}

export default function MagBulkScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { playlists, addPlaylist, updatePlaylist } = usePlaylists();

  const [hostMode, setHostMode] = useState<HostMode>("manual");
  const [hostText, setHostText] = useState("");
  const [codeText, setCodeText] = useState("");
  const [macListText, setMacListText] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeCount, setRangeCount] = useState("");
  const [useRange, setUseRange] = useState(false);
  const [useProxy, setUseProxy] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [results, setResults] = useState<MagScanResult[]>([]);
  const [adding, setAdding] = useState(false);

  const cancelRef = useRef(false);
  const pauseRef = useRef(false);

  // Girişten iş listesi (önizleme sayıları).
  const parsed = useMemo(() => {
    const macList = parseMacList(macListText);
    const range = useRange ? expandMacRange(rangeStart, { count: Number(rangeCount || 0) }) : { macs: [], capped: false as boolean, error: undefined as string | undefined };
    const macSet = new Set<string>();
    const macs: string[] = [];
    for (const m of [...macList.macs, ...range.macs]) if (!macSet.has(m)) { macSet.add(m); macs.push(m); }
    const hostsParsed = parsePortalHosts(hostText);
    return { macs, invalidMacs: macList.invalid, rangeError: range.error, rangeCapped: range.capped, hosts: hostsParsed.hosts, invalidHosts: hostsParsed.invalid };
  }, [macListText, useRange, rangeStart, rangeCount, hostText]);

  const resolveHosts = useCallback(async (): Promise<MagHostEntry[]> => {
    if (hostMode === "manual") return parsed.hosts;
    // Rehberden host çöz (kod / panel adı / tümü). MAG portalları combo rehberindeki hostlardır.
    const { fetchPanelDirectory, filterDirectory, DEFAULT_CODE_SOURCE, CODE_SOURCE_KEY } = await import("@/src/utils/serverCode");
    const { storage } = await import("@/src/utils/storage");
    const src = (await storage.getItem<string>(CODE_SOURCE_KEY, DEFAULT_CODE_SOURCE)) || DEFAULT_CODE_SOURCE;
    const dir = await fetchPanelDirectory(src);
    const target = hostMode === "code" ? { codes: codeText.split(/[\s,;]+/).filter(Boolean) }
      : hostMode === "name" ? { names: codeText.split(/[\s,;]+/).filter(Boolean) }
      : {};
    const filtered = filterDirectory(dir, "all", target);
    const seen = new Set<string>();
    const out: MagHostEntry[] = [];
    for (const panel of filtered) for (const h of panel.hosts) {
      const key = h.toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push({ raw: h, host: h, hasPort: /:\d+/.test(new URL(h).host) }); }
    }
    return out;
  }, [hostMode, parsed.hosts, codeText]);

  const startScan = useCallback(async () => {
    if (parsed.macs.length === 0) { Alert.alert("MAC yok", "En az bir geçerli MAC girin (liste veya aralık)."); return; }
    if (parsed.macs.length > MAG_MAX_MACS) { Alert.alert("Çok fazla MAC", `En fazla ${MAG_MAX_MACS} MAC taranabilir.`); return; }
    let hosts: MagHostEntry[];
    try { hosts = await resolveHosts(); } catch (e: any) { Alert.alert("Host çözülemedi", String(e?.message || e)); return; }
    if (hosts.length === 0) { Alert.alert("Portal yok", hostMode === "manual" ? "En az bir portal adresi girin." : "Rehberde eşleşen host bulunamadı."); return; }
    const { jobs, capped } = buildMagBulkJobs(hosts, parsed.macs);
    if (capped) Alert.alert("Uyarı", "Çok fazla kombinasyon; ilk 8192 iş taranacak.");

    haptic.medium();
    cancelRef.current = false; pauseRef.current = false;
    setPaused(false); setScanning(true); setResults([]); setProgress({ done: 0, total: jobs.length, current: "" });
    void recordDiagnostic("scan", "MAG_BULK_UI_START", { jobs: jobs.length, hosts: hosts.length, macs: parsed.macs.length, proxy: useProxy, hostMode });
    try {
      await runMagBulkScan(jobs, {
        concurrency: 3,
        useProxy,
        onResult: r => setResults(prev => [...prev, r]),
        onProgress: (done, total, current) => setProgress({ done, total, current: current || "" }),
        control: {
          isCancelled: () => cancelRef.current,
          waitIfPaused: async () => { while (pauseRef.current && !cancelRef.current) await new Promise(r => setTimeout(r, 200)); },
        },
      });
    } catch (e: any) {
      Alert.alert("Tarama hatası", String(e?.message || e));
    } finally {
      setScanning(false); setPaused(false);
    }
  }, [parsed.macs, resolveHosts, hostMode, useProxy]);

  const validResults = results.filter(r => r.category === "valid");

  const addValid = useCallback(async () => {
    const toAdd = validResults.filter(r => !playlists.some(pl => pl.stalkerPortal && pl.stalkerMac && magIdentity(pl.stalkerPortal, pl.stalkerMac) === magIdentity(r.portal, r.mac)));
    if (toAdd.length === 0) { Alert.alert("Eklenecek yok", "Geçerli sonuç yok ya da hepsi zaten ekli."); return; }
    setAdding(true);
    const { stalkerLogin, stalkerCatalog, normalizeStalkerAccountInfo } = await import("@/src/utils/stalker");
    let added = 0;
    for (const r of toAdd) {
      try {
        const id = stableId("mag", magIdentity(r.portal, r.mac));
        if (playlists.some(pl => pl.id === id)) continue;
        const cred = { portal: r.portal, mac: r.mac, deviceModel: "MAG320" as const };
        const { session, profile } = await stalkerLogin(cred, { forceFresh: true });
        const shell: Playlist = {
          id, name: `MAG ${r.mac.slice(-8)}`, source: "stalker",
          stalkerPortal: r.portal, stalkerMac: r.mac.toUpperCase(),
          accountInfo: normalizeStalkerAccountInfo(profile || {}),
          channels: [], vod: [], series: [],
          catalogSync: { initialSyncState: "pending", roomVerified: true, updatedAt: new Date().toISOString() },
          createdAt: new Date().toISOString(),
        };
        await addPlaylist(shell);
        added++;
        // Canlı katalog arka planda (live-first — §5 MAG kuralı).
        void (async () => {
          try {
            const catalog = await stalkerCatalog(cred, session, { liveOnly: true });
            await updatePlaylist(id, {
              channels: catalog.channels,
              catalogCapabilities: { live: catalog.channels.length ? "supported" : "empty", vod: "empty", series: "empty", updatedAt: new Date().toISOString() },
              catalogSync: { initialSyncState: "live_ready", roomVerified: true, updatedAt: new Date().toISOString() },
              lastRefreshOk: true, lastRefreshedAt: new Date().toISOString(),
            });
          } catch (e: any) {
            await updatePlaylist(id, { catalogSync: { initialSyncState: "partial_error", initialSyncError: String(e?.message || e), roomVerified: true, updatedAt: new Date().toISOString() } }).catch(() => {});
          }
        })();
      } catch (e: any) {
        void recordDiagnostic("scan", "MAG_BULK_ADD_ERROR", { mac: r.mac.slice(-8), message: String(e?.message || e).slice(0, 120) });
      }
    }
    setAdding(false);
    void recordDiagnostic("scan", "MAG_BULK_ADDED", { requested: toAdd.length, added });
    Alert.alert("Eklendi", `${added} MAG hesabı eklendi. Canlı kanallar arka planda yükleniyor.`, [{ text: "Listeye Git", onPress: () => router.replace("/(tabs)") }]);
  }, [validResults, playlists, addPlaylist, updatePlaylist, router]);

  const S = makeStyles(colors);
  const catCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of results) m[r.category] = (m[r.category] || 0) + 1;
    return m;
  }, [results]);

  return (
    <SafeAreaView style={S.root} edges={["top", "bottom"]}>
      <View style={S.header}>
        <FocusButton testID="mag-bulk-back" onPress={() => router.back()} style={S.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </FocusButton>
        <Text style={S.title}>Çoklu MAC Ekle</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl }}>
        <View style={[S.banner]}>
          <Ionicons name="shield-checkmark" size={18} color={colors.brandPrimary} />
          <Text style={S.bannerText}>Yalnız SİZE AİT MAG cihazlarının MAC adreslerini tarayın. Başkasının MAC'ini kullanmak yasadışıdır.</Text>
        </View>

        {/* Host kaynağı */}
        <Text style={S.label}>PORTAL KAYNAĞI</Text>
        <View style={S.chipRow}>
          {([["manual", "Adres gir"], ["code", "Rehber · kod"], ["name", "Rehber · panel adı"], ["all", "Rehber · tümü"]] as [HostMode, string][]).map(([m, lbl]) => (
            <FocusButton key={m} testID={`mag-host-mode-${m}`} onPress={() => setHostMode(m)} style={[S.chip, hostMode === m && S.chipOn]}>
              <Text style={[S.chipText, hostMode === m && S.chipTextOn]}>{lbl}</Text>
            </FocusButton>
          ))}
        </View>

        {hostMode === "manual" ? (
          <>
            <Text style={S.hint}>http/https gerekmez. Virgül, boşluk veya alt alta birden fazla adres. Port yoksa otomatik bulunur.</Text>
            <TextInput testID="mag-hosts-input" value={hostText} onChangeText={setHostText} multiline
              placeholder={"line.saglayici.com:8080\niptv.baska.net"} placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none" autoCorrect={false} style={[S.input, { minHeight: 70 }]} />
            {parsed.hosts.length > 0 && <Text style={S.count}>{parsed.hosts.length} geçerli adres{parsed.invalidHosts.length ? ` · ${parsed.invalidHosts.length} geçersiz` : ""}</Text>}
          </>
        ) : hostMode === "all" ? (
          <Text style={S.hint}>Panel rehberindeki TÜM hostlar denenecek (uzun sürebilir).</Text>
        ) : (
          <>
            <Text style={S.hint}>{hostMode === "code" ? "Panel kod(lar)ı" : "Panel ad(lar)ı"} — virgül veya boşlukla ayırın.</Text>
            <TextInput testID="mag-code-input" value={codeText} onChangeText={setCodeText}
              placeholder={hostMode === "code" ? "1234, 5678" : "PANEL ADI"} placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none" autoCorrect={false} style={S.input} />
          </>
        )}

        {/* MAC girişi */}
        <Text style={[S.label, { marginTop: SPACING.md }]}>MAC ADRESLERİ</Text>
        <Text style={S.hint}>Liste: virgül/boşluk/alt alta. Biçim serbest (00:1A:79:.. veya 001A79..).</Text>
        <TextInput testID="mag-maclist-input" value={macListText} onChangeText={t => setMacListText(t.toUpperCase())} multiline
          placeholder={"00:1A:79:AA:BB:01\n00:1A:79:AA:BB:02"} placeholderTextColor={colors.onSurfaceTertiary}
          autoCapitalize="characters" autoCorrect={false} style={[S.input, { minHeight: 70 }]} />

        <View style={S.switchRow}>
          <Text style={S.switchLabel}>MAC aralığı üret</Text>
          <Switch testID="mag-range-switch" value={useRange} onValueChange={setUseRange}
            trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} />
        </View>
        {useRange && (
          <View style={{ flexDirection: "row", gap: SPACING.sm }}>
            <TextInput testID="mag-range-start" value={rangeStart} onChangeText={t => setRangeStart(t.toUpperCase())}
              placeholder="Başlangıç MAC" placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="characters" autoCorrect={false} style={[S.input, { flex: 2 }]} />
            <TextInput testID="mag-range-count" value={rangeCount} onChangeText={t => setRangeCount(t.replace(/[^0-9]/g, ""))}
              placeholder="Adet" placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="number-pad" style={[S.input, { flex: 1 }]} />
          </View>
        )}
        {parsed.rangeError && <Text style={[S.count, { color: colors.error }]}>{parsed.rangeError}</Text>}
        <Text style={S.count}>
          Toplam {parsed.macs.length} MAC{parsed.invalidMacs.length ? ` · ${parsed.invalidMacs.length} geçersiz` : ""}{parsed.rangeCapped ? ` · ${MAG_MAX_MACS}'e kırpıldı` : ""}
        </Text>

        {/* Proxy */}
        <ScanProxyToggleRow onOpenCenter={() => router.push("/scan-proxy")} />
        <View style={S.switchRow}>
          <Text style={S.switchLabel}>Bu taramada proxy kullan</Text>
          <Switch testID="mag-useproxy-switch" value={useProxy} onValueChange={setUseProxy}
            trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} />
        </View>

        {/* Tara / duraklat / iptal */}
        {!scanning ? (
          <FocusButton testID="mag-scan-btn" onPress={startScan} style={[S.primaryBtn]}>
            <Ionicons name="search" size={18} color="#fff" />
            <Text style={S.primaryBtnText}>Taramayı Başlat</Text>
          </FocusButton>
        ) : (
          <View style={{ gap: SPACING.sm }}>
            <View style={S.progressRow}>
              <ActivityIndicator color={colors.brandPrimary} />
              <Text style={S.progressText} numberOfLines={1}>
                {progress.done}/{progress.total} · {progress.current}
              </Text>
            </View>
            <ScanProxyLiveLine active={useProxy} />
            <View style={{ flexDirection: "row", gap: SPACING.sm }}>
              <FocusButton testID="mag-pause-btn" onPress={() => { pauseRef.current = !pauseRef.current; setPaused(pauseRef.current); }} style={[S.secondaryBtn, { flex: 1 }]}>
                <Text style={S.secondaryBtnText}>{paused ? "Devam" : "Duraklat"}</Text>
              </FocusButton>
              <FocusButton testID="mag-cancel-btn" onPress={() => { cancelRef.current = true; }} style={[S.secondaryBtn, { flex: 1, borderColor: colors.error }]}>
                <Text style={[S.secondaryBtnText, { color: colors.error }]}>İptal</Text>
              </FocusButton>
            </View>
          </View>
        )}

        {/* Sonuç özeti */}
        {results.length > 0 && (
          <View style={{ gap: SPACING.xs, marginTop: SPACING.sm }}>
            <View style={S.summaryRow}>
              {(Object.keys(CATEGORY_META) as MagScanResult["category"][]).filter(c => catCounts[c]).map(c => (
                <View key={c} style={S.summaryChip}>
                  <Ionicons name={CATEGORY_META[c].icon} size={14} color={CATEGORY_META[c].color(colors)} />
                  <Text style={[S.summaryChipText, { color: CATEGORY_META[c].color(colors) }]}>{CATEGORY_META[c].label}: {catCounts[c]}</Text>
                </View>
              ))}
            </View>
            {validResults.length > 0 && !scanning && (
              <FocusButton testID="mag-add-valid-btn" onPress={addValid} disabled={adding} style={[S.primaryBtn, { backgroundColor: colors.success || "#2ecc71" }]}>
                {adding ? <ActivityIndicator color="#fff" /> : <Ionicons name="add-circle" size={18} color="#fff" />}
                <Text style={S.primaryBtnText}>{adding ? "Ekleniyor…" : `Geçerli ${validResults.length} hesabı ekle`}</Text>
              </FocusButton>
            )}
          </View>
        )}

        {/* Sonuç listesi */}
        {results.map((r, i) => {
          const meta = CATEGORY_META[r.category];
          return (
            <View key={`${r.portal}-${r.mac}-${i}`} style={S.resultRow}>
              <Ionicons name={meta.icon} size={18} color={meta.color(colors)} />
              <View style={{ flex: 1 }}>
                <Text style={S.resultMac}>{r.mac}</Text>
                <Text style={S.resultSub} numberOfLines={1}>{r.hostRaw}{r.expiry ? ` · bitiş ${r.expiry}` : ""}{r.message ? ` · ${r.message}` : ""}</Text>
              </View>
              <Text style={[S.resultCat, { color: meta.color(colors) }]}>{meta.label}</Text>
            </View>
          );
        })}
        {!PanelScan.available && useProxy && <Text style={[S.count, { color: colors.error }]}>Proxy native modülü yok; tarama doğrudan bağlantıyla yapılır.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    header: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: c.border },
    iconBtn: { padding: SPACING.xs, borderRadius: RADIUS.pill },
    title: { color: c.onSurface, fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
    banner: { flexDirection: "row", gap: SPACING.sm, alignItems: "center", backgroundColor: c.brandPrimary + "22", borderColor: c.brandPrimary, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm },
    bannerText: { flex: 1, color: c.onSurface, fontSize: FONT.size.xs },
    label: { color: c.onSurfaceSecondary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 0.5 },
    hint: { color: c.onSurfaceTertiary, fontSize: FONT.size.xs },
    count: { color: c.onSurfaceSecondary, fontSize: FONT.size.xs, fontWeight: FONT.weight.semibold },
    input: { backgroundColor: c.surfaceSecondary, color: c.onSurface, borderColor: c.border, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, fontSize: FONT.size.sm, textAlignVertical: "top" },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs },
    chip: { paddingVertical: 6, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary },
    chipOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
    chipText: { color: c.onSurfaceSecondary, fontSize: FONT.size.xs, fontWeight: FONT.weight.semibold },
    chipTextOn: { color: "#fff" },
    switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.xs },
    switchLabel: { color: c.onSurface, fontSize: FONT.size.sm },
    primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, backgroundColor: c.brandPrimary, paddingVertical: SPACING.md, borderRadius: RADIUS.md, marginTop: SPACING.sm },
    primaryBtnText: { color: "#fff", fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
    secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, borderColor: c.border },
    secondaryBtnText: { color: c.onSurface, fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
    progressRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
    progressText: { flex: 1, color: c.onSurfaceSecondary, fontSize: FONT.size.sm },
    summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs },
    summaryChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.pill, backgroundColor: c.surfaceSecondary },
    summaryChipText: { fontSize: FONT.size.xs, fontWeight: FONT.weight.bold },
    resultRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: c.border },
    resultMac: { color: c.onSurface, fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
    resultSub: { color: c.onSurfaceTertiary, fontSize: FONT.size.xs },
    resultCat: { fontSize: FONT.size.xs, fontWeight: FONT.weight.bold },
  });
}
