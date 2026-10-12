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
  PROXY_SOURCE_CATALOG, DEFAULT_SCAN_PROXY_CONFIG, removeProxySource,
  type ScanProxyConfig, type ProxyProtocol,
} from "@/src/utils/scanProxy";
import { PanelScan, type NativeScanProxyStatus, type ScanProxyTestProgress } from "@/modules/panel-scan";

const PROTOS: ProxyProtocol[] = ["http", "socks4", "socks5"];

export default function ScanProxyScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [cfg, setCfg] = useState<ScanProxyConfig>(DEFAULT_SCAN_PROXY_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
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

  useEffect(() => {
    let alive = true;
    loadScanProxyConfig().then(c => { if (alive) { setCfg(c); setLoaded(true); } }).catch(error => {
      if (alive) { setLoaded(true); setLoadError(String(error?.message || error)); }
    });
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
  useEffect(() => {
    let alive=true;
    void PanelScan.restoreScanProxyState().then(current=>{if(!alive)return;setProg(current);refreshStatus();
      if(current.phase==='running'||current.phase==='paused')startPolling();
    }).catch(()=>{if(alive)setStatus('Proxy test kaydı okunamadı; mevcut dosyalar korunuyor.');});
    return()=>{alive=false;};
  }, [startPolling]);

  const onSave = async () => {
    setBusy(true); setStatus(""); setDl(null);
    try {
      const res = await applyScanProxyConfig(cfg, (done, total, last) => setDl({ done, total, label: last.label }));
      setDl(null); refreshStatus();
      const bs = res.byScheme;
      const lines = res.sources.map(s => `• ${s.label}: ${s.error || `${human(s.count)} yeni / ${human(s.rawCount ?? s.count)} satır${s.mirrorUsed ? " · yedek kaynak" : ""}`}`).join("\n");
      setStatus(`${human(res.entryCount)} aday yüklendi  (HTTP ${human(bs.http)} · SOCKS4 ${human(bs.socks4)} · SOCKS5 ${human(bs.socks5)}).\n${lines}\n\nCanlılık testini başlatın veya "Test etmeden kullan".`);
    } catch (e: any) { setStatus("Hata: " + String(e?.message || e)); setDl(null); }
    finally { setBusy(false); }
  };

  const onStartTest = async (resume = false) => {
    try {
      await saveScanProxyConfig(cfg);
      const r = await startLivenessTest(cfg.test, resume);
      if (!r.started) { Alert.alert("Test başlamadı", r.error || "Bilinmeyen hata"); return; }
      startPolling();
    } catch(error:any) { Alert.alert('Test başlamadı',String(error?.message||error)); }
  };
  const onStopUseTested = async () => { try{await stopLivenessTest(true); const current=livenessProgress();setProg(current); refreshStatus();
    setStatus(current.working ? `${current.working} doğrulanmış proxy havuz olarak kullanılıyor.` : 'Yeni doğrulanmış proxy yok; mevcut havuz korundu. Test etmeden kullan ayrı bir seçenektir.');}
    catch(error:any){setStatus('Test durdurma/kayıt işlemi tamamlanamadı: '+String(error?.message||error));} };
  const onSingleTest = async () => {
    setBusy(true);
    try { const r = await testSingleProxy(); setStatus(r.ok ? `✔ Proxy çalışıyor.\nDış IP: ${r.ip}\nProxy: ${r.proxy}` : `✖ ${r.error || "başarısız"}`); }
    catch(error:any){setStatus('Test tamamlanamadı: '+String(error?.message||error));}
    finally { setBusy(false); }
  };
  const onUseWithout = async () => { try{const s = await useWithoutTest(); setPst(s); setStatus(`Test edilmeden ${human(s.pool)} proxy havuz yapıldı.`);}catch(error:any){setStatus('Havuz kaydedilemedi: '+String(error?.message||error));} };

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

      {!loaded ? <ActivityIndicator style={{ marginTop: SPACING.xxl }} color={colors.brandPrimary} /> : loadError ? <Text style={{ color: colors.error, padding: SPACING.lg }}>{loadError}{"\n"}Mevcut tercihleri değiştirmeden ekranı kapatıp tekrar açın.</Text> : (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl, gap: SPACING.md }}>
          <View style={card}>
            <Text style={muted}>Proxy tarama bağlantısında kullanılır. Hesap veya IP engeli olmamasını garanti etmez. Koruma ve hız sınırı yanıtlarında tarama geri çekilir.</Text>
          </View>

          <View style={[card, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
            <View style={{ flex: 1, paddingRight: SPACING.md }}>
              <Text style={label}>Taramada proxy kullan</Text>
              <Text style={muted}>Kapalıyken tarama doğrudan sizin bağlantınızdan yapılır.</Text>
            </View>
            <Switch testID="scan-proxy-enabled" value={cfg.enabled} onValueChange={v => { haptic.light(); patch({ enabled: v }); void setScanProxyUse(v).then(setPst).catch(()=>setStatus('Proxy tercihi kaydedilemedi; mevcut havuz korunuyor.')); }}
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
              <Text style={[muted, { marginBottom: SPACING.sm }]}>Ücretsiz veya ücretli, her satıra bir proxy:{"\n"}socks5://kullanici:sifre@gateway:7777{"\n"}host:port:kullanici:sifre · kullanici:sifre@host:port{"\n"}JSON listesi ve cURL -x / -U biçimi de okunur. Komut çalıştırılmaz. Özel karakterler URL biçiminde yüzde kodlanabilir. SOCKS4 parola doğrulamasını desteklemez.</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginBottom: SPACING.sm }}>
                {(["http", "https", "socks4", "socks5"] as const).map(scheme => <FocusButton key={scheme} focusKey={`sp-manual-${scheme}`} onPress={() => patch({ manualScheme: scheme })}
                  style={[styles.miniChip, { borderColor: cfg.manualScheme === scheme ? colors.brandPrimary : colors.border }]}><Text style={muted}>{scheme.toUpperCase()}</Text></FocusButton>)}
              </View>
              <Text style={muted}>Bu tür, yalnız türü yazılmamış satırlara uygulanır. HTTPS türü proxy sunucusuna TLS bağlantısı içindir.</Text>
              <TextInput testID="scan-proxy-manual" value={cfg.manualText} onChangeText={t => patch({ manualText: t })}
                placeholder="scheme://kullanici:sifre@host:port" placeholderTextColor={colors.onSurfaceTertiary}
                multiline scrollEnabled autoCapitalize="none" autoCorrect={false}
                style={{ color: colors.onSurface, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: RADIUS.sm, padding: SPACING.md, height: 180, textAlignVertical: "top", fontSize: FONT.size.sm }} />
            </View>
          )}

          {cfg.source === "auto" && (
            <View style={card}>
              <Text style={label}>Kaynaklar ve türleri</Text>
              <Text style={[muted, { marginBottom: SPACING.sm }]}>Her kaynaktan hangi türü indireceğinizi seçin. Ücretsiz listelerin çoğu kısa ömürlüdür; canlılık testi ayıklar.</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm }}>
                {(["all", ...PROTOS, "none"] as const).map(kind => <FocusButton key={kind} focusKey={`sp-global-${kind}`} onPress={() => setCfg(prev => ({ ...prev,
                  autoSelections: Object.fromEntries(PROXY_SOURCE_CATALOG.map(src => [src.id, PROTOS.filter(proto => !!src.urls[proto] && (kind === "all" || kind === proto))])) }))}
                  style={[styles.miniChip, { borderColor: colors.border }]}><Text style={muted}>{kind === "all" ? "Tümünü seç" : kind === "none" ? "Temizle" : `${kind.toUpperCase()} seç`}</Text></FocusButton>)}
              </View>
              <Text style={[muted, { marginVertical: SPACING.sm }]}>Bütün sağlayıcılarda uygulanır. Ardından aşağıdaki seçimleri tek tek değiştirebilirsiniz.</Text>
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
                    {!src.fresh && <Text style={[muted, { marginTop: SPACING.xs }]}>Güncelliği garanti edilmeyen liste · canlılık testi uygulayın.</Text>}
                    {!!pst?.sources?.[src.id] && <TouchableOpacity disabled={testing || busy} onPress={() => Alert.alert("Kaynağı havuzdan çıkar", "Başka kaynakta da bulunan proxy'ler korunur.", [
                      { text: "Vazgeç", style: "cancel" }, { text: "Çıkar", onPress: () => { void removeProxySource(src.id).then(setPst).catch(error => setStatus(String(error?.message || error))); } }
                    ])}><Text style={{ color: colors.error, fontSize: FONT.size.xs }}>{human(pst.sources[src.id])} aday · havuzdan çıkar</Text></TouchableOpacity>}
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

          <View style={card}>
            <Text style={label}>Proxy rotasyonu</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.sm }}>
              {(["round_robin", "random", "gateway"] as const).map(mode => <FocusButton key={mode} focusKey={`sp-rotation-${mode}`} onPress={() => {
                patch({ rotation: mode }); void saveScanProxyConfig({ ...cfg, rotation: mode }).catch(error => setStatus(String(error?.message || error)));
              }} style={[styles.miniChip, { borderColor: cfg.rotation === mode ? colors.brandPrimary : colors.border }]}>
                <Text style={muted}>{mode === "round_robin" ? "Sırayla" : mode === "random" ? "Rastgele" : "Sağlayıcı gateway"}</Text>
              </FocusButton>)}
            </View>
            <Text style={[muted, { marginTop: SPACING.sm }]}>Gateway modunda ilk kullanılabilir adres korunur; IP değişimini sağlayıcınız yapar. Kullanıcı adındaki oturum/bölge parametreleri değiştirilmez.</Text>
          </View>

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
                    {prog.phase === "running" ? "Test ediliyor…" : prog.phase === "paused" ? "Duraklatıldı" : prog.phase === "interrupted" ? "Kesildi; kalan testler korunuyor" : prog.phase === "failed" ? "Test tamamlanamadı" : prog.phase === "stopped" ? "Durduruldu" : "Bitti"}
                  </Text>
                  <Text style={muted}>1/2 Hızlı bağlantı elemesi · {human(prog.tcpTested || 0)}/{human(prog.tcpTotal || 0)} · açık port {human(prog.tcpAlive || 0)}</Text>
                  <Bar colors={colors} ratio={prog.tcpTotal ? (prog.tcpTested || 0) / prog.tcpTotal : 0} />
                  <Text style={[muted, { marginTop: SPACING.xs }]}>2/2 Doğrulama + anonimlik · {human(prog.tested)}/{human(prog.total)}</Text>
                  <Bar colors={colors} ratio={prog.stage === "verify" && prog.total ? prog.tested / prog.total : 0} />
                  <Text style={[muted, { marginTop: SPACING.xs }]}>
                    {`✔ Kullanılabilir ${prog.working}  ·  Doğrulanamadı ${prog.dead} · Filtrelendi ${prog.filtered || 0}\n`}
                    {`🛡 Elite ${prog.elite || 0} · Anonim ${prog.anonymous || 0} · Şeffaf ${prog.transparent} · Bilinmiyor ${prog.unknownAnon || 0}\n`}
                    {`HTTP ${prog.http} · SOCKS4 ${prog.socks4} · SOCKS5 ${prog.socks5}  ·  ${prog.ratePerSec}/sn${prog.etaMs > 0 ? `  ·  ~${Math.ceil(prog.etaMs / 1000)} sn` : ""}`}
                  </Text>
                  <Text style={muted}>HTTP yanıtı: {prog.httpUsable || 0} · HTTPS yanıtı: {prog.httpsUsable || 0}{"\n"}TCP açık port, çalışan proxy demek değildir. Doğrulama en çok 16 paralel istekle çalışır.</Text>
                  {!prog.ownIp && cfg.test.mode === "system" && <Text style={muted}>Doğrudan çıkış IP'si belirlenemedi; anonimlik bilinmiyor olarak tutulur.</Text>}
                  {!!prog.error && <Text style={{ color: colors.error }}>{prog.error}</Text>}
                  {Object.entries(prog.reasons || {}).map(([reason, count]) => <Text key={reason} style={muted}>{({ "proxy-auth": "Proxy parolası reddedildi", protocol: "Protokol uyuşmazlığı", tls: "TLS/sertifika", timeout: "Zaman aşımı", "rate-limit": "Test adresi hız sınırı", "not-ip": "Yanıtta geçerli IP yok", "elite-filter": "Elite filtresi", "transparent-filter": "Şeffaf filtresi", connection: "Bağlantı kurulamadı", "body-limit": "Yanıt çok büyük", "content-mismatch": "Beklenen içerik yok" } as Record<string, string>)[reason] || reason}: {count}</Text>)}
                </View>
              )}

              <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md, flexWrap: "wrap" }}>
                {!testing ? (
                  <FocusButton focusKey="sp-test-start" onPress={() => { haptic.medium(); void onStartTest(prog?.phase === "interrupted"); }}
                    style={{ flexGrow: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.sm, alignItems: "center", backgroundColor: colors.brandPrimary }}>
                    <Text style={{ color: colors.onBrandPrimary, fontWeight: FONT.weight.bold }}>{prog?.phase === "interrupted" ? "Kalan testleri devam ettir" : "Testi Başlat"}</Text>
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
