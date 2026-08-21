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

interface TestResult { url: string; label: string; ok: boolean; ms?: number }

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

  useEffect(() => {
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
});
