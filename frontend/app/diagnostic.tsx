import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { haptic } from "@/src/utils/haptic";
import * as Clipboard from "expo-clipboard";
import { FocusButton } from "@/src/components/FocusButton";
import { KizilkanNativeCore, type DatabaseHealth, type DatabaseMaintenanceResult } from "@/modules/kizilkan-native-core";
import { recordDiagnostic } from "@/src/utils/diagnostics";

interface TestResult { url: string; label: string; ok: boolean; ms?: number }
type MaintenanceMode = "diagnose" | "quick" | "normal" | "deep";

function formatBytes(value: any): string {
  const n = Math.max(0, Number(value || 0));
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function statusLabel(status?: string): string {
  if (status === "healthy") return "Sağlıklı";
  if (status === "attention") return "Bakım öneriliyor";
  if (status === "critical") return "Kontrol gerekli";
  return "Ölçülmedi";
}


/** Zaman aşımlı erişim testi. */
async function probe(url: string, timeoutMs = 12000): Promise<{ ok: boolean; ms: number }> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timer);
    return { ok: res.ok || res.status < 500, ms: Date.now() - t0 };
  } catch {
    clearTimeout(timer);
    return { ok: false, ms: Date.now() - t0 };
  }
}

export default function DiagnosticScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activePlaylist } = usePlaylists();
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [allOk, setAllOk] = useState<boolean | null>(null);
  const [dbHealth, setDbHealth] = useState<DatabaseHealth | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState<MaintenanceMode | null>(null);
  const [lastMaintenance, setLastMaintenance] = useState<DatabaseMaintenanceResult | null>(null);

  /**
   * v4.8.3: Bu ekran ESKİDEN emergent backend'ini test ediyordu. Xtream/M3U/EPG
   * artık tamamen cihaz-içi çalıştığı için o test anlamsızdı ve kullanıcıya
   * yanıltıcı kırmızı hata gösteriyordu. Artık GERÇEKTEN önemli olanı test eder:
   * kullanıcının IPTV sunucusu ve EPG adresi.
   */
  const runTest = async () => {
    haptic.medium();
    setTesting(true);
    setAllOk(null);

    const targets: { url: string; label: string }[] = [];
    if (activePlaylist) {
      if (activePlaylist.source === "xtream" && activePlaylist.xtreamServer) {
        const base = activePlaylist.xtreamServer.replace(/\/+$/, "");
        targets.push({
          url: `${base}/player_api.php?username=${encodeURIComponent(activePlaylist.xtreamUsername || "")}&password=${encodeURIComponent(activePlaylist.xtreamPassword || "")}`,
          label: `IPTV sunucusu • ${base.replace(/^https?:\/\//, "")}`,
        });
      } else if (activePlaylist.m3uUrl) {
        targets.push({
          url: activePlaylist.m3uUrl,
          label: `M3U listesi • ${activePlaylist.m3uUrl.replace(/^https?:\/\//, "").split("/")[0]}`,
        });
      }
      if (activePlaylist.epgUrl) {
        targets.push({
          url: activePlaylist.epgUrl,
          label: `EPG kaynağı • ${activePlaylist.epgUrl.replace(/^https?:\/\//, "").split("/")[0]}`,
        });
      }
    }
    // Genel internet kontrolü (sunucu mu, internet mi sorunlu ayırt etmek için)
    targets.push({ url: "https://clients3.google.com/generate_204", label: "İnternet bağlantısı" });

    setResults(targets.map(t => ({ ...t, ok: false })));

    const done: TestResult[] = [];
    for (const t of targets) {
      const r = await probe(t.url);
      done.push({ ...t, ok: r.ok, ms: r.ok ? r.ms : undefined });
      setResults([...done, ...targets.slice(done.length).map(x => ({ ...x, ok: false }))]);
    }

    const ok = done.every(d => d.ok);
    setAllOk(ok);
    setTesting(false);
    if (ok) haptic.success(); else haptic.error();
  };

  const loadDatabaseHealth = async (includeIntegrity = false) => {
    if (!KizilkanNativeCore.available) return;
    setDbLoading(true);
    const started = Date.now();
    try {
      const health = await KizilkanNativeCore.getDatabaseHealth(includeIntegrity);
      setDbHealth(health);
      await recordDiagnostic("database", "DB_HEALTH_READ", {
        includeIntegrity, status: health?.status, totalBytes: health?.totalBytes, walBytes: health?.walBytes,
        reclaimableBytes: health?.reclaimableBytes, mediaOrphans: health?.mediaOrphans, epgOrphans: health?.epgOrphans,
      }, { stage: "health-read", durationMs: Date.now() - started, outcome: "success" });
    } catch (error: any) {
      await recordDiagnostic("database", "DB_HEALTH_READ_FAILED", { message: String(error?.message || error || "") }, { stage: "health-read", durationMs: Date.now() - started, outcome: "failed", errorClass: String(error?.name || "Error") });
      Alert.alert("Veritabanı", `Sağlık bilgisi okunamadı: ${String(error?.message || error || "Bilinmeyen hata")}`);
    } finally { setDbLoading(false); }
  };

  const executeMaintenance = async (mode: MaintenanceMode) => {
    if (!KizilkanNativeCore.available || maintenanceMode) return;
    setMaintenanceMode(mode);
    try {
      const result = await KizilkanNativeCore.runDatabaseMaintenance(mode);
      setLastMaintenance(result);
      setDbHealth(result.after || await KizilkanNativeCore.getDatabaseHealth(false));
      haptic.success();
      if (mode !== "diagnose") {
        Alert.alert("Veritabanı bakımı tamamlandı", [
          `Mod: ${mode === "quick" ? "Hızlı" : mode === "normal" ? "Normal" : "Derin"}`,
          `Süre: ${Math.round(Number(result.durationMs || 0) / 100) / 10} sn`,
          `Geri kazanılan toplam alan: ${formatBytes(Math.max(0, Number(result.reclaimedTotalBytes || 0)))}`,
          `Orphan medya: ${Number(result.removedMediaOrphans || 0)}`,
          `Orphan EPG: ${Number(result.removedEpgOrphans || 0)}`,
          `Eski EPG: ${Number(result.removedExpiredEpg || 0)}`,
          `Eski telemetri: ${Number(result.removedNormalTelemetry || 0) + Number(result.removedCriticalTelemetry || 0)}`,
          result.vacuumRan ? "VACUUM: çalıştırıldı" : "VACUUM: çalıştırılmadı",
        ].join("\n"));
      }
    } catch (error: any) {
      haptic.error();
      Alert.alert("Bakım başarısız", String(error?.message || error || "Bilinmeyen hata"));
    } finally { setMaintenanceMode(null); }
  };

  const requestMaintenance = (mode: MaintenanceMode) => {
    if (mode === "deep") {
      Alert.alert(
        "Derin veritabanı bakımı",
        "Orphan/retention temizliği, WAL checkpoint, PRAGMA optimize ve VACUUM uygulanacak. Büyük veritabanlarında işlem zaman alabilir. Kullanıcı verisi için destructive migration kullanılmaz.",
        [{ text: "Vazgeç", style: "cancel" }, { text: "Derin Bakımı Başlat", style: "destructive", onPress: () => void executeMaintenance("deep") }],
      );
      return;
    }
    void executeMaintenance(mode);
  };

  useEffect(() => {
    void loadDatabaseHealth(false);
    runTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyToClipboard = async (text: string) => {
    try { await Clipboard.setStringAsync(text); haptic.success(); Alert.alert("Kopyalandı", text); } catch {}
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top"]} testID="diagnostic-screen">
      <View style={styles.header}>
        <FocusButton testID="diag-back-btn" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </FocusButton>
        <Text style={[styles.title, { color: colors.onSurface }]}>Bağlantı Testi</Text>
        <FocusButton
          testID="diag-retest-btn"
          onPress={runTest}
          hitSlop={12}
          disabled={testing}
          style={styles.iconBtn}
        >
          <Ionicons name="refresh" size={22} color={testing ? colors.onSurfaceTertiary : colors.brandPrimary} />
        </FocusButton>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl, gap: SPACING.md }}>
        <View style={[styles.summaryCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <View style={[styles.statusDot, { backgroundColor: allOk === null ? "#FFA000" : allOk ? "#00C853" : "#E53935" }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryTitle, { color: colors.onSurface }]}>
              {testing ? "Test ediliyor..." : allOk === null ? "Hazır" : allOk ? "Her şey yolunda" : "Bazı adreslere ulaşılamadı"}
            </Text>
            <Text style={[styles.summarySub, { color: colors.onSurfaceSecondary }]} numberOfLines={1}>
              {activePlaylist ? `Liste: ${activePlaylist.name}` : "Etkin liste yok"}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.onSurfaceTertiary }]}>VERİTABANI SAĞLIK MERKEZİ</Text>

        {!KizilkanNativeCore.available ? (
          <View style={[styles.helpCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Ionicons name="hardware-chip-outline" size={18} color={colors.onSurfaceTertiary} />
            <Text style={[styles.helpText, { color: colors.onSurfaceSecondary, flex: 1 }]}>Native Room sağlık ölçümü bu platformda kullanılamıyor.</Text>
          </View>
        ) : (
          <>
            <View style={[styles.dbCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <View style={styles.dbHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dbTitle, { color: colors.onSurface }]}>{statusLabel(dbHealth?.status)}</Text>
                  <Text style={[styles.urlMeta, { color: colors.onSurfaceSecondary }]}>Room / SQLite • {String(dbHealth?.journalMode || "WAL").toUpperCase()}</Text>
                </View>
                {dbLoading ? <ActivityIndicator color={colors.brandPrimary} /> : (
                  <FocusButton testID="db-health-refresh" onPress={() => void loadDatabaseHealth(true)} style={styles.smallIconBtn}>
                    <Ionicons name="scan-outline" size={20} color={colors.brandPrimary} />
                  </FocusButton>
                )}
              </View>

              <View style={styles.metricGrid}>
                <View style={styles.metric}><Text style={[styles.metricValue,{color:colors.onSurface}]}>{formatBytes(dbHealth?.totalBytes)}</Text><Text style={[styles.metricLabel,{color:colors.onSurfaceSecondary}]}>Toplam</Text></View>
                <View style={styles.metric}><Text style={[styles.metricValue,{color:colors.onSurface}]}>{formatBytes(dbHealth?.databaseBytes)}</Text><Text style={[styles.metricLabel,{color:colors.onSurfaceSecondary}]}>Ana DB</Text></View>
                <View style={styles.metric}><Text style={[styles.metricValue,{color:colors.onSurface}]}>{formatBytes(dbHealth?.walBytes)}</Text><Text style={[styles.metricLabel,{color:colors.onSurfaceSecondary}]}>WAL</Text></View>
                <View style={styles.metric}><Text style={[styles.metricValue,{color:colors.onSurface}]}>{formatBytes(dbHealth?.reclaimableBytes)}</Text><Text style={[styles.metricLabel,{color:colors.onSurfaceSecondary}]}>Boş sayfa</Text></View>
              </View>

              <View style={[styles.dbDivider,{backgroundColor:colors.border}]} />
              <Text style={[styles.dbLine,{color:colors.onSurfaceSecondary}]}>Medya: {Number(dbHealth?.mediaCount || 0).toLocaleString("tr-TR")} • EPG: {Number(dbHealth?.epgCount || 0).toLocaleString("tr-TR")} • Telemetri: {Number(dbHealth?.diagnosticEventCount || 0).toLocaleString("tr-TR")}</Text>
              <Text style={[styles.dbLine,{color:colors.onSurfaceSecondary}]}>Orphan medya: {Number(dbHealth?.mediaOrphans || 0).toLocaleString("tr-TR")} • Orphan EPG: {Number(dbHealth?.epgOrphans || 0).toLocaleString("tr-TR")}</Text>
              <Text style={[styles.dbLine,{color:colors.onSurfaceSecondary}]}>Eski EPG adayı: {Number(dbHealth?.expiredEpgCandidates || 0).toLocaleString("tr-TR")} • Retention telemetri: {(Number(dbHealth?.expiredNormalTelemetryCandidates || 0)+Number(dbHealth?.expiredCriticalTelemetryCandidates || 0)).toLocaleString("tr-TR")}</Text>
              <Text style={[styles.dbLine,{color:colors.onSurfaceSecondary}]}>Freelist: %{Number(dbHealth?.reclaimablePercent || 0).toFixed(2)} • quick_check: {String(dbHealth?.quickCheck || "tarama yapılmadı")} • FK ihlali: {Number(dbHealth?.foreignKeyViolations ?? -1) < 0 ? "tarama yapılmadı" : Number(dbHealth?.foreignKeyViolations || 0)}</Text>
              <Text style={[styles.dbLine,{color:colors.onSurfaceSecondary}]}>Önerilen bakım: {String(dbHealth?.recommendedMaintenance || "none")} • Neden: {(dbHealth?.healthReasons || []).join(", ") || "ölçülen sorun yok"}</Text>
            </View>

            <View style={styles.maintenanceGrid}>
              <FocusButton testID="db-maint-diagnose" disabled={!!maintenanceMode} onPress={() => requestMaintenance("diagnose")} style={[styles.maintenanceBtn,{backgroundColor:colors.surfaceSecondary,borderColor:colors.border}]}>
                {maintenanceMode === "diagnose" ? <ActivityIndicator color={colors.brandPrimary}/> : <Ionicons name="search-outline" size={19} color={colors.brandPrimary}/>}
                <Text style={[styles.maintenanceText,{color:colors.onSurface}]}>Tanıla</Text>
              </FocusButton>
              <FocusButton testID="db-maint-quick" disabled={!!maintenanceMode} onPress={() => requestMaintenance("quick")} style={[styles.maintenanceBtn,{backgroundColor:colors.surfaceSecondary,borderColor:colors.border}]}>
                {maintenanceMode === "quick" ? <ActivityIndicator color={colors.brandPrimary}/> : <Ionicons name="flash-outline" size={19} color={colors.brandPrimary}/>}
                <Text style={[styles.maintenanceText,{color:colors.onSurface}]}>Hızlı</Text>
              </FocusButton>
              <FocusButton testID="db-maint-normal" disabled={!!maintenanceMode} onPress={() => requestMaintenance("normal")} style={[styles.maintenanceBtn,{backgroundColor:colors.surfaceSecondary,borderColor:colors.border}]}>
                {maintenanceMode === "normal" ? <ActivityIndicator color={colors.brandPrimary}/> : <Ionicons name="construct-outline" size={19} color={colors.brandPrimary}/>}
                <Text style={[styles.maintenanceText,{color:colors.onSurface}]}>Normal</Text>
              </FocusButton>
              <FocusButton testID="db-maint-deep" disabled={!!maintenanceMode} onPress={() => requestMaintenance("deep")} style={[styles.maintenanceBtn,{backgroundColor:colors.surfaceSecondary,borderColor:colors.border}]}>
                {maintenanceMode === "deep" ? <ActivityIndicator color={colors.brandPrimary}/> : <Ionicons name="layers-outline" size={19} color={colors.brandPrimary}/>}
                <Text style={[styles.maintenanceText,{color:colors.onSurface}]}>Derin</Text>
              </FocusButton>
            </View>

            {lastMaintenance && (
              <View style={[styles.helpCard,{backgroundColor:colors.surfaceSecondary,borderColor:colors.border}]}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.brandPrimary}/>
                <Text style={[styles.helpText,{color:colors.onSurfaceSecondary,flex:1}]}>Son bakım: {String(lastMaintenance.mode)} • {Math.round(Number(lastMaintenance.durationMs || 0)/100)/10} sn • geri kazanım {formatBytes(Math.max(0,Number(lastMaintenance.reclaimedTotalBytes || 0)))}</Text>
              </View>
            )}
          </>
        )}

        <Text style={[styles.sectionTitle, { color: colors.onSurfaceTertiary }]}>IPTV SUNUCUSU & EPG</Text>

        {results.map(r => (
          <FocusButton
            key={r.url}
            testID={`diag-url-${r.url}`}
            onPress={() => copyToClipboard(r.url)}
            style={[styles.urlCard, { backgroundColor: colors.surfaceSecondary, borderColor: r.ok ? "#00C853" : colors.border }]}
            activeOpacity={0.75}
          >
            <View style={[styles.dot, { backgroundColor: r.ok ? "#00C853" : testing ? "#FFA000" : "#E53935" }]}>
              {testing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : r.ok ? (
                <Ionicons name="checkmark" size={16} color="#fff" />
              ) : (
                <Ionicons name="close" size={16} color="#fff" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.urlText, { color: colors.onSurface }]} numberOfLines={2}>
                {r.label}
              </Text>
              <Text style={[styles.urlMeta, { color: colors.onSurfaceSecondary }]}>
                {testing && !r.ok ? "Test ediliyor..."
                  : r.ok ? `Erişilebilir${r.ms ? ` • ${r.ms}ms` : ""}`
                  : "Erişilemedi"}
              </Text>
            </View>
            <Ionicons name="copy-outline" size={18} color={colors.onSurfaceTertiary} />
          </FocusButton>
        ))}

        <FocusButton
          testID="diag-run-btn"
          onPress={runTest}
          disabled={testing}
          style={[styles.primaryBtn, { backgroundColor: colors.brandPrimary, opacity: testing ? 0.5 : 1 }]}
        >
          {testing ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <Ionicons name="pulse" size={20} color={colors.onBrandPrimary} />
              <Text style={[styles.primaryBtnText, { color: colors.onBrandPrimary }]}>Testi Tekrarla</Text>
            </>
          )}
        </FocusButton>

        <View style={[styles.helpCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Ionicons name="information-circle" size={18} color={colors.brandPrimary} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[styles.helpTitle, { color: colors.onSurface }]}>Bağlanılamıyorsa</Text>
            <Text style={[styles.helpText, { color: colors.onSurfaceSecondary }]}>
              • Sadece IPTV sunucusu kırmızıysa: sunucu geçici olarak yanıt vermiyor
              olabilir ya da eş zamanlı bağlantı sınırınız dolmuş olabilir.
              {"\n"}• İnternet de kırmızıysa: Wi-Fi / mobil veri bağlantınızı kontrol edin.
              {"\n"}• VPN veya proxy kullanıyorsanız kapatıp deneyin.
              {"\n"}• EPG kırmızıysa yayınlar açılır, sadece program rehberi gelmez.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  title: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold, flex: 1, textAlign: "center" },
  iconBtn: { padding: 4 },
  summaryCard: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1,
  },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  summaryTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  summarySub: { fontSize: FONT.size.xs, marginTop: 2 },
  sectionTitle: { fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1.5, marginTop: SPACING.md },
  urlCard: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1,
  },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  urlText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  urlMeta: { fontSize: FONT.size.xs, marginTop: 2 },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm,
    height: 52, borderRadius: RADIUS.pill, marginTop: SPACING.md,
  },
  primaryBtnText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  helpCard: {
    flexDirection: "row", gap: SPACING.md,
    padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, marginTop: SPACING.md,
  },
  helpTitle: { fontSize: FONT.size.sm, fontWeight: FONT.weight.bold },
  helpText: { fontSize: FONT.size.xs, lineHeight: 18 },
  dbCard: { padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, gap: 8 },
  dbHeaderRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  dbTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  smallIconBtn: { padding: 8 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  metric: { width: "50%", paddingVertical: 6 },
  metricValue: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  metricLabel: { fontSize: FONT.size.xs, marginTop: 2 },
  dbDivider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  dbLine: { fontSize: FONT.size.xs, lineHeight: 18 },
  maintenanceGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  maintenanceBtn: { width: "48%", minHeight: 48, borderWidth: 1, borderRadius: RADIUS.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 10 },
  maintenanceText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
});
