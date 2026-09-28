/**
 * KIZILKAN PLAYER v18.4.0 — Taramaya özel proxy ayarları.
 * ===========================================================================
 * Yalnız TARAMA trafiği proxy'den geçer. Oynatma/yenileme/EPG/timeshift ETKİLENMEZ.
 * Varsayılan KAPALI. Kaynak × tür seçimi, canlı ilerlemeli test (duraklat/devam/
 * "bu kadar yeter"), tarama sırasında ölen proxy'de sıradakine geçiş (native).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { FocusButton } from "@/src/components/FocusButton";
import { haptic } from "@/src/utils/haptic";
import {
  loadScanProxyConfig, applyScanProxyConfig, saveScanProxyConfig,
  startLivenessTest, pauseLivenessTest, resumeLivenessTest, stopLivenessTest, livenessProgress,
  testSingleProxy, useWithoutTest, human, setScanProxyUse, clearScanProxyLists, scanProxyStatus,
  PROXY_SOURCE_CATALOG, DEFAULT_SCAN_PROXY_CONFIG,
  type ScanProxyConfig, type ProxyProtocol,
} from "@/src/utils/scanProxy";
import type { NativeScanProxyStatus, ScanProxyTestProgress } from "@/modules/panel-scan";

const PROTOS: ProxyProtocol[] = ["http", "socks4", "socks5"];

export default function ScanProxyScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [cfg, setCfg] = useState<ScanProxyConfig>(DEFAULT_SCAN_PROXY_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dl, setDl] = useState<{ done: number; total: number; label: string } | null>(null);
  const [status, setStatus] = useState("");
  const [prog, setProg] = useState<ScanProxyTestProgress | null>(null);
  const [customUrl, setCustomUrl] = useState("");
  const [customScheme, setCustomScheme] = useState<ProxyProtocol>("http");
  const pollRef = useRef<any>(null);
  // v18.5.0: native havuz özeti (proxy kapalıyken de görünür).
  const [pst, setPst] = useState<NativeScanProxyStatus | null>(null);
  const refreshStatus = useCallback(() => { try { setPst(scanProxyStatus()); } catch {} }, []);
  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  useEffect(() => {
    let alive = true;
    loadScanProxyConfig().then(c => { if (alive) { setCfg(c); setLoaded(true); } });
    return () => { alive = false; if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const patch = (p: Partial<ScanProxyConfig>) => setCfg(prev => ({ ...prev, ...p }));

  const toggleProto = (sourceId: string, proto: ProxyProtocol) => {
    setCfg(prev => {
      const cur = prev.autoSelections[sourceId] || [];
      const next = cur.includes(proto) ? cur.filter(x => x !== proto) : [...cur, proto];
      const map = { ...prev.autoSelections };
      if (next.length) map[sourceId] = next; else delete map[sourceId];
      return { ...prev, autoSelections: map };
    });
  };
  const selectAllProtos = (sourceId: string, protos: ProxyProtocol[]) =>
    setCfg(prev => ({ ...prev, autoSelections: { ...prev.autoSelections, [sourceId]: protos } }));

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      const p = livenessProgress();
      setProg(p);
      if (p.phase !== "running" && p.phase !== "paused") { clearInterval(pollRef.current); pollRef.current = null; refreshStatus(); }
    }, 500);
  }, [refreshStatus]);

  const onSave = async () => {
    setBusy(true); setStatus(""); setDl(null);
    try {
      const res = await applyScanProxyConfig(cfg, (done, total, last) => setDl({ done, total, label: last.label }));
      setDl(null); refreshStatus();
      const bs = res.byScheme;
      const lines = res.sources.slice(0, 12).map(s => `• ${s.label}: ${s.error ? "HATA" : human(s.count)}`).join("\n");
      setStatus(`${human(res.entryCount)} aday yüklendi  (HTTP ${human(bs.http)} · SOCKS4 ${human(bs.socks4)} · SOCKS5 ${human(bs.socks5)}).\n${lines}\n\nCanlılık testini başlatın veya "Test etmeden kullan".`);
    } catch (e: any) { setStatus("Hata: " + String(e?.message || e)); setDl(null); }
    finally { setBusy(false); }
  };

  const onStartTest = async () => {
    await saveScanProxyConfig(cfg);
    const r = await startLivenessTest(cfg.test);
    if (!r.started) { Alert.alert("Test başlamadı", r.error || "Bilinmeyen hata"); return; }
    startPolling();
  };
  const onStopUseTested = async () => { await stopLivenessTest(true); setProg(livenessProgress()); refreshStatus(); setStatus("Test durduruldu; çalışan proxy'ler havuz olarak kullanılıyor."); };
  const onSingleTest = async () => {
    setBusy(true);
    try { const r = await testSingleProxy(); setStatus(r.ok ? `✔ Proxy çalışıyor.\nDış IP: ${r.ip}\nProxy: ${r.proxy}` : `✖ ${r.error || "başarısız"}`); }
    finally { setBusy(false); }
  };
  const onUseWithout = async () => { const s = await useWithoutTest(); setPst(s); setStatus(`Test edilmeden ${human(s.pool)} proxy havuz yapıldı.`); };

  const card = { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md } as const;
  const label = { color: colors.onSurface, fontSize: FONT.size.base, fontWeight: FONT.weight.semibold } as const;
  const muted = { color: colors.onSurfaceTertiary, fontSize: FONT.size.sm } as const;
  const testing = prog?.phase === "running" || prog?.phase === "paused";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top"]} testID="scan-proxy-screen">
      <View style={styles.header}>
        <TouchableOpacity testID="scan-proxy-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.onSurface }]}>Tarama Proxy'si</Text>
        <View style={{ width: 26 }} />
      </View>

      {!loaded ? <ActivityIndicator style={{ marginTop: SPACING.xxl }} color={colors.brandPrimary} /> : (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl, gap: SPACING.md }}>
          <View style={card}>
            <Text style={muted}>Proxy YALNIZ çoklu hesap/panel taramasında kullanılır. Sağlayıcı IP'nizi engellerse engel proxy'ye düşer; izlemeniz etkilenmez.</Text>
          </View>

          <View style={[card, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
            <View style={{ flex: 1, paddingRight: SPACING.md }}>
              <Text style={label}>Taramada proxy kullan</Text>
              <Text style={muted}>Kapalıyken tarama doğrudan sizin bağlantınızdan yapılır.</Text>
            </View>
            <Switch testID="scan-proxy-enabled" value={cfg.enabled} onValueChange={v => { haptic.light(); patch({ enabled: v }); void setScanProxyUse(v).then(setPst); }}
              trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} />
          </View>

          <View style={[card, { borderColor: colors.error }]}>
            <Text style={{ color: colors.error, fontWeight: FONT.weight.bold, fontSize: FONT.size.sm }}>⚠ Güvenlik</Text>
            <Text style={[muted, { marginTop: SPACING.xs }]}>Panel <Text style={{ fontWeight: FONT.weight.bold }}>http://</Text> ise kullanıcı adı/şifre proxy sahibine görünür (https:// şifreli). Ücretsiz public proxy trafiği kaydedebilir; güvenilir/ödemeli önerilir.</Text>
          </View>

          {/* Kaynak seçimi */}
          <View style={{ flexDirection: "row", gap: SPACING.sm }}>
            {(["manual", "auto"] as const).map(src => {
              const active = cfg.source === src;
              return (
                <FocusButton key={src} focusKey={`sp-src-${src}`} onPress={() => { haptic.light(); patch({ source: src }); }}
                  style={{ flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: "center",
                    backgroundColor: active ? colors.brandPrimary : colors.surfaceSecondary, borderWidth: 1, borderColor: active ? colors.brandPrimary : colors.border }}>
                  <Text style={{ color: active ? colors.onBrandPrimary : colors.onSurface, fontWeight: FONT.weight.semibold }}>{src === "manual" ? "Elle gir" : "Otomatik liste"}</Text>
                </FocusButton>
              );
            })}
          </View>

          {cfg.source === "manual" && (
            <View style={card}>
              <Text style={label}>Proxy satırları</Text>
              <Text style={[muted, { marginBottom: SPACING.sm }]}>Her satıra bir proxy:{"\n"}socks5://kullanici:sifre@gw.saglayici.com:7777{"\n"}http://1.2.3.4:8080  ·  1.2.3.4:1080</Text>
              <TextInput testID="scan-proxy-manual" value={cfg.manualText} onChangeText={t => patch({ manualText: t })}
                placeholder="scheme://kullanici:sifre@host:port" placeholderTextColor={colors.onSurfaceTertiary}
                multiline autoCapitalize="none" autoCorrect={false}
                style={{ color: colors.onSurface, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: RADIUS.sm, padding: SPACING.md, minHeight: 110, textAlignVertical: "top", fontSize: FONT.size.sm }} />
            </View>
          )}

          {cfg.source === "auto" && (
            <View style={card}>
              <Text style={label}>Kaynaklar ve türleri</Text>
              <Text style={[muted, { marginBottom: SPACING.sm }]}>Her kaynaktan hangi türü indireceğinizi seçin. Ücretsiz listelerin çoğu kısa ömürlüdür; canlılık testi ayıklar.</Text>
              {PROXY_SOURCE_CATALOG.map(src => {
                const sel = cfg.autoSelections[src.id] || [];
                const avail = PROTOS.filter(p => src.urls[p]);
                return (
                  <View key={src.id} style={{ paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ color: colors.onSurface, fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold }}>{src.label}</Text>
                      <TouchableOpacity onPress={() => { haptic.light(); selectAllProtos(src.id, sel.length === avail.length ? [] as any : avail); }} hitSlop={8}>
                        <Text style={{ color: colors.brandPrimary, fontSize: FONT.size.xs }}>{sel.length === avail.length ? "Temizle" : "Tümü"}</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.xs }}>
                      {avail.map(proto => {
                        const on = sel.includes(proto);
                        return (
                          <FocusButton key={proto} focusKey={`sp-${src.id}-${proto}`} onPress={() => { haptic.light(); toggleProto(src.id, proto); }}
                            style={{ paddingVertical: 6, paddingHorizontal: SPACING.md, borderRadius: RADIUS.pill, borderWidth: 1,
                              backgroundColor: on ? colors.brandPrimary + "22" : "transparent", borderColor: on ? colors.brandPrimary : colors.border }}>
                            <Text style={{ color: on ? colors.brandPrimary : colors.onSurfaceSecondary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>{proto.toUpperCase()}</Text>
                          </FocusButton>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
              {/* Özel URL */}
              <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm, alignItems: "center" }}>
                <TextInput value={customUrl} onChangeText={setCustomUrl} placeholder="Özel liste URL'i (txt)" placeholderTextColor={colors.onSurfaceTertiary}
                  autoCapitalize="none" autoCorrect={false}
                  style={{ flex: 1, color: colors.onSurface, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: FONT.size.xs }} />
                <TouchableOpacity onPress={() => { const i = PROTOS.indexOf(customScheme); setCustomScheme(PROTOS[(i + 1) % PROTOS.length]); }}
                  style={{ paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.sm }}>
                  <Text style={{ color: colors.onSurface, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>{customScheme.toUpperCase()}</Text>
                </TouchableOpacity>
                <FocusButton focusKey="sp-add-url" onPress={() => {
                  const u = customUrl.trim();
                  if (!/^https?:\/\//i.test(u)) { Alert.alert("Geçersiz URL", "http(s):// ile başlamalı."); return; }
                  patch({ customSources: [...cfg.customSources, { url: u, scheme: customScheme }] }); setCustomUrl("");
                }} style={{ paddingHorizontal: SPACING.md, justifyContent: "center", backgroundColor: colors.surfaceTertiary, borderRadius: RADIUS.sm }}>
                  <Ionicons name="add" size={20} color={colors.onSurface} />
                </FocusButton>
              </View>
              {cfg.customSources.map((c, i) => (
                <View key={c.url + i} style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.xs }}>
                  <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs, flex: 1 }} numberOfLines={1}>{c.scheme.toUpperCase()} · {c.url}</Text>
                  <TouchableOpacity onPress={() => patch({ customSources: cfg.customSources.filter((_, j) => j !== i) })} hitSlop={8}>
                    <Ionicons name="trash" size={15} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Kaydet + indirme ilerlemesi */}
          <FocusButton focusKey="sp-save" disabled={busy} onPress={() => { haptic.medium(); void onSave(); }}
            style={{ paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: "center", backgroundColor: colors.brandPrimary, opacity: busy ? 0.6 : 1 }}>
            <Text style={{ color: colors.onBrandPrimary, fontWeight: FONT.weight.bold }}>{cfg.source === "auto" ? "Listeleri İndir" : "Listeyi Yükle"}</Text>
          </FocusButton>
          {dl && (
            <View style={card}>
              <Text style={muted}>İndiriliyor {dl.done}/{dl.total} · {dl.label}</Text>
              <Bar colors={colors} ratio={dl.total ? dl.done / dl.total : 0} />
            </View>
          )}

          {/* Canlılık testi */}
          {(
            <View style={card}>
              <Text style={label}>Canlılık testi</Text>
              <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm }}>
                {(["system", "custom"] as const).map(m => {
                  const active = cfg.test.mode === m;
                  return (
                    <FocusButton key={m} focusKey={`sp-tmode-${m}`} onPress={() => patch({ test: { ...cfg.test, mode: m } })}
                      style={{ flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.sm, alignItems: "center", borderWidth: 1, backgroundColor: active ? colors.brandPrimary + "22" : "transparent", borderColor: active ? colors.brandPrimary : colors.border }}>
                      <Text style={{ color: active ? colors.brandPrimary : colors.onSurfaceSecondary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>{m === "system" ? "Sistem (dış IP)" : "Kendi siten"}</Text>
                    </FocusButton>
                  );
                })}
              </View>
              {cfg.test.mode === "custom" && (
                <>
                  <TextInput value={cfg.test.url} onChangeText={t => patch({ test: { ...cfg.test, url: t } })} placeholder="https://kontrol-adresi..." placeholderTextColor={colors.onSurfaceTertiary}
                    autoCapitalize="none" autoCorrect={false}
                    style={{ marginTop: SPACING.sm, color: colors.onSurface, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: FONT.size.xs }} />
                  <TextInput value={cfg.test.expectText} onChangeText={t => patch({ test: { ...cfg.test, expectText: t } })} placeholder="Yanıtta geçmesi gereken metin (isteğe bağlı)" placeholderTextColor={colors.onSurfaceTertiary}
                    autoCapitalize="none" autoCorrect={false}
                    style={{ marginTop: SPACING.sm, color: colors.onSurface, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: FONT.size.xs }} />
                </>
              )}

              {/* v18.5.0: test seçenekleri */}
              <View style={{ marginTop: SPACING.sm, gap: SPACING.xs }}>
                <View style={styles.optRow}>
                  <Text style={[muted, { flex: 1 }]}>Şeffafları ele (IP adresinizi gösterenler)</Text>
                  <Switch value={cfg.test.rejectTransparent} onValueChange={v => patch({ test: { ...cfg.test, rejectTransparent: v } })} trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} />
                </View>
                <View style={styles.optRow}>
                  <Text style={[muted, { flex: 1 }]}>Yalnız elite kullan (IP gizli + proxy izi yok)</Text>
                  <Switch value={cfg.test.eliteOnly} onValueChange={v => patch({ test: { ...cfg.test, eliteOnly: v } })} trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} />
                </View>
                <View style={[styles.optRow, { gap: SPACING.xs }]}>
                  <Text style={[muted, { flex: 1 }]}>Paralellik</Text>
                  {[32, 64, 128].map(n => (
                    <TouchableOpacity key={n} onPress={() => patch({ test: { ...cfg.test, concurrency: n } })}
                      style={[styles.miniChip, { borderColor: cfg.test.concurrency === n ? colors.brandPrimary : colors.border }]}>
                      <Text style={{ color: cfg.test.concurrency === n ? colors.brandPrimary : colors.onSurfaceSecondary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={[styles.optRow, { gap: SPACING.xs }]}>
                  <Text style={[muted, { flex: 1 }]}>Zaman aşımı</Text>
                  {[3000, 6000, 10000].map(n => (
                    <TouchableOpacity key={n} onPress={() => patch({ test: { ...cfg.test, timeoutMs: n } })}
                      style={[styles.miniChip, { borderColor: cfg.test.timeoutMs === n ? colors.brandPrimary : colors.border }]}>
                      <Text style={{ color: cfg.test.timeoutMs === n ? colors.brandPrimary : colors.onSurfaceSecondary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>{n / 1000} sn</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {prog && (prog.phase !== "idle") && (
                <View style={{ marginTop: SPACING.md, gap: SPACING.xs }}>
                  <Text style={{ color: colors.onSurface, fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold }}>
                    {prog.phase === "running" ? "Test ediliyor…" : prog.phase === "paused" ? "Duraklatıldı" : prog.phase === "stopped" ? "Durduruldu" : "Bitti"}
                  </Text>
                  <Text style={muted}>1/2 Hızlı bağlantı elemesi · {human(prog.tcpTested || 0)}/{human(prog.tcpTotal || 0)} · açık port {human(prog.tcpAlive || 0)}</Text>
                  <Bar colors={colors} ratio={prog.tcpTotal ? (prog.tcpTested || 0) / prog.tcpTotal : 0} />
                  <Text style={[muted, { marginTop: SPACING.xs }]}>2/2 Doğrulama + anonimlik · {human(prog.tested)}/{human(prog.total)}</Text>
                  <Bar colors={colors} ratio={prog.stage === "verify" && prog.total ? prog.tested / prog.total : 0} />
                  <Text style={[muted, { marginTop: SPACING.xs }]}>
                    {`✔ Kullanılabilir ${prog.working}  ·  ✖ Ölü ${prog.dead}\n`}
                    {`🛡 Elite ${prog.elite || 0} · Anonim ${prog.anonymous || 0} · Şeffaf ${prog.transparent} · Bilinmiyor ${prog.unknownAnon || 0}\n`}
                    {`HTTP ${prog.http} · SOCKS4 ${prog.socks4} · SOCKS5 ${prog.socks5}  ·  ${prog.ratePerSec}/sn${prog.etaMs > 0 ? `  ·  ~${Math.ceil(prog.etaMs / 1000)} sn` : ""}`}
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md, flexWrap: "wrap" }}>
                {!testing ? (
                  <FocusButton focusKey="sp-test-start" onPress={() => { haptic.medium(); void onStartTest(); }}
                    style={{ flexGrow: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.sm, alignItems: "center", backgroundColor: colors.brandPrimary }}>
                    <Text style={{ color: colors.onBrandPrimary, fontWeight: FONT.weight.bold }}>Testi Başlat</Text>
                  </FocusButton>
                ) : (
                  <>
                    {prog?.phase === "running"
                      ? <FocusButton focusKey="sp-test-pause" onPress={() => { pauseLivenessTest(); setProg(livenessProgress()); }} style={{ flexGrow: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.sm, alignItems: "center", borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold }}>Duraklat</Text></FocusButton>
                      : <FocusButton focusKey="sp-test-resume" onPress={() => { resumeLivenessTest(); startPolling(); }} style={{ flexGrow: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.sm, alignItems: "center", borderWidth: 1, borderColor: colors.brandPrimary }}><Text style={{ color: colors.brandPrimary, fontWeight: FONT.weight.bold }}>Devam</Text></FocusButton>}
                    <FocusButton focusKey="sp-test-enough" onPress={() => { haptic.medium(); void onStopUseTested(); }} style={{ flexGrow: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.sm, alignItems: "center", backgroundColor: colors.success }}><Text style={{ color: "#fff", fontWeight: FONT.weight.bold }}>Yeter, kullan</Text></FocusButton>
                    <FocusButton focusKey="sp-test-stop" onPress={() => { void stopLivenessTest(false); setProg(livenessProgress()); }} style={{ flexGrow: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.sm, alignItems: "center", borderWidth: 1, borderColor: colors.error }}><Text style={{ color: colors.error, fontWeight: FONT.weight.bold }}>İptal</Text></FocusButton>
                  </>
                )}
              </View>
              <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm }}>
                <FocusButton focusKey="sp-use-notest" onPress={() => { haptic.light(); void onUseWithout(); }} style={{ flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.sm, alignItems: "center", borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.sm }}>Test etmeden kullan</Text></FocusButton>
                <FocusButton focusKey="sp-single" onPress={() => { haptic.light(); void onSingleTest(); }} style={{ flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.sm, alignItems: "center", borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.sm }}>Tek IP testi</Text></FocusButton>
              </View>
            </View>
          )}

          {!!status && <View style={card}><Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.sm }}>{status}</Text></View>}

          {/* v18.5.0: havuz özeti + temizle */}
          {pst && (
            <View style={card}>
              <Text style={label}>Havuz</Text>
              <Text style={[muted, { marginTop: SPACING.xs }]}>
                {`Taramada kullanım: ${pst.enabled ? "AÇIK" : "kapalı"}\n`}
                {`Aday ${human(pst.candidates)} · Havuz ${human(pst.pool)}${pst.poolTested ? " (test edildi)" : pst.pool ? " (test edilmedi)" : ""} · Canlı ${human(pst.alive)}\n`}
                {pst.poolByAnon ? `Elite ${pst.poolByAnon.elite} · Anonim ${pst.poolByAnon.anonymous} · Şeffaf ${pst.poolByAnon.transparent} · Bilinmiyor ${pst.poolByAnon.unknown}\n` : ""}
                {`İyi (panelden yanıt almış, kalıcı): ${pst.good || 0}`}
                {pst.lastTestAt ? `\nSon test: ${Math.max(0, Math.round((Date.now() - pst.lastTestAt) / 60000))} dk önce` : ""}
              </Text>
              <TouchableOpacity onPress={() => {
                Alert.alert("Listeleri temizle", "Aday liste, havuz ve iyi proxy listesi silinecek.", [
                  { text: "Vazgeç", style: "cancel" },
                  { text: "Temizle", style: "destructive", onPress: () => { void clearScanProxyLists().then(setPst); setProg(null); } },
                ]);
              }} style={{ marginTop: SPACING.sm, alignSelf: "flex-start" }}>
                <Text style={{ color: colors.error, fontSize: FONT.size.sm, fontWeight: FONT.weight.bold }}>Listeleri temizle</Text>
              </TouchableOpacity>
            </View>
          )}
          {busy && <ActivityIndicator color={colors.brandPrimary} />}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Bar({ colors, ratio }: { colors: any; ratio: number }) {
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, marginTop: SPACING.xs, overflow: "hidden" }}>
      <View style={{ height: 6, width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, backgroundColor: colors.brandPrimary }} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  title: { fontSize: FONT.size.xl, fontWeight: "700" },
  optRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  miniChip: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.pill, borderWidth: 1 },
});
