/**
 * KIZILKAN PLAYER v18.3.0 — Taramaya özel proxy ayarları.
 * ===========================================================================
 * Yalnız TARAMA trafiği proxy'den geçer (çoklu hesap/panel keşfi). Oynatma,
 * liste yenileme, EPG, timeshift ETKİLENMEZ. Varsayılan KAPALI (isteğe bağlı).
 * Proxy adres/şifresi cihazda ŞİFRELİ saklanır (native Keystore AES-GCM).
 */
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { FocusButton } from "@/src/components/FocusButton";
import { haptic } from "@/src/utils/haptic";
import {
  loadScanProxyConfig,
  applyScanProxyConfig,
  testScanProxy,
  CURATED_PROXY_SOURCES,
  DEFAULT_SCAN_PROXY_CONFIG,
  type ScanProxyConfig,
} from "@/src/utils/scanProxy";

export default function ScanProxyScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [cfg, setCfg] = useState<ScanProxyConfig>(DEFAULT_SCAN_PROXY_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [statusText, setStatusText] = useState("");

  useEffect(() => {
    let alive = true;
    loadScanProxyConfig().then(c => { if (alive) { setCfg(c); setLoaded(true); } });
    return () => { alive = false; };
  }, []);

  const patch = (p: Partial<ScanProxyConfig>) => setCfg(prev => ({ ...prev, ...p }));

  const toggleAutoUrl = (url: string) => {
    setCfg(prev => {
      const has = prev.autoUrls.includes(url);
      return { ...prev, autoUrls: has ? prev.autoUrls.filter(u => u !== url) : [...prev.autoUrls, url] };
    });
  };

  const onSave = async () => {
    setBusy(true); setStatusText("");
    try {
      const res = await applyScanProxyConfig(cfg);
      if (!cfg.enabled) { setStatusText("Proxy kapalı. Tarama doğrudan bağlanır."); return; }
      const srcLines = res.sources.map(s => `• ${s.url}: ${s.error ? "HATA (" + s.error + ")" : s.count + " proxy"}`).join("\n");
      setStatusText(`${res.entryCount} proxy yüklendi.\n${srcLines}\n\nTest için "Test et"e basın.`);
    } catch (e: any) {
      setStatusText("Kaydetme hatası: " + String(e?.message || e));
    } finally { setBusy(false); }
  };

  const onTest = async () => {
    setBusy(true); setStatusText("Proxy test ediliyor…");
    try {
      const r = await testScanProxy();
      if (r.ok) setStatusText(`✔ Proxy çalışıyor.\nDış IP: ${r.ip}\nÇalışan/toplam: ${r.working}/${r.total}\nProxy: ${r.proxy || "-"}`);
      else setStatusText(`✖ Proxy testi başarısız.\n${r.error || ""}\nÇalışan/toplam: ${r.working ?? 0}/${r.total ?? 0}`);
    } catch (e: any) {
      setStatusText("Test hatası: " + String(e?.message || e));
    } finally { setBusy(false); }
  };

  const card = { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md } as const;
  const label = { color: colors.onSurface, fontSize: FONT.size.base, fontWeight: FONT.weight.semibold } as const;
  const muted = { color: colors.onSurfaceTertiary, fontSize: FONT.size.sm } as const;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top"]} testID="scan-proxy-screen">
      <View style={styles.header}>
        <TouchableOpacity testID="scan-proxy-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.onSurface }]}>Tarama Proxy'si</Text>
        <View style={{ width: 26 }} />
      </View>

      {!loaded ? (
        <ActivityIndicator style={{ marginTop: SPACING.xxl }} color={colors.brandPrimary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl, gap: SPACING.md }}>
          {/* Açıklama */}
          <View style={card}>
            <Text style={muted}>
              Proxy YALNIZ çoklu hesap/panel taramasında kullanılır. Sağlayıcı tarama yüzünden IP'nizi engellerse
              engel proxy'ye düşer; izlemeniz (oynatma, yenileme, EPG) etkilenmez.
            </Text>
          </View>

          {/* Aç/kapa */}
          <View style={[card, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
            <View style={{ flex: 1, paddingRight: SPACING.md }}>
              <Text style={label}>Taramada proxy kullan</Text>
              <Text style={muted}>Kapalıyken tarama doğrudan sizin bağlantınızdan yapılır.</Text>
            </View>
            <Switch
              testID="scan-proxy-enabled"
              value={cfg.enabled}
              onValueChange={v => { haptic.light(); patch({ enabled: v }); }}
              trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }}
            />
          </View>

          {/* Güvenlik uyarısı */}
          <View style={[card, { borderColor: colors.error }]}>
            <Text style={{ color: colors.error, fontWeight: FONT.weight.bold, fontSize: FONT.size.sm }}>⚠ Güvenlik</Text>
            <Text style={[muted, { marginTop: SPACING.xs }]}>
              Panel adresi <Text style={{ fontWeight: FONT.weight.bold }}>http://</Text> ile başlıyorsa kullanıcı adı/şifre
              proxy sahibine GÖRÜNÜR (https:// ise şifrelidir). Ücretsiz public proxy'ler trafiği kaydedebilir;
              güvenilir/ödemeli proxy önerilir.
            </Text>
          </View>

          {/* Kaynak seçimi */}
          <View style={{ flexDirection: "row", gap: SPACING.sm }}>
            {(["manual", "auto"] as const).map(src => {
              const active = cfg.source === src;
              return (
                <FocusButton
                  key={src}
                  focusKey={`scan-proxy-src-${src}`}
                  onPress={() => { haptic.light(); patch({ source: src }); }}
                  style={{
                    flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: "center",
                    backgroundColor: active ? colors.brandPrimary : colors.surfaceSecondary,
                    borderWidth: 1, borderColor: active ? colors.brandPrimary : colors.border,
                  }}
                >
                  <Text style={{ color: active ? colors.onBrandPrimary : colors.onSurface, fontWeight: FONT.weight.semibold }}>
                    {src === "manual" ? "Elle gir" : "Otomatik liste"}
                  </Text>
                </FocusButton>
              );
            })}
          </View>

          {/* Elle giriş */}
          {cfg.source === "manual" && (
            <View style={card}>
              <Text style={label}>Proxy satırları</Text>
              <Text style={[muted, { marginBottom: SPACING.sm }]}>
                Her satıra bir proxy. Örnekler:{"\n"}
                socks5://kullanici:sifre@gw.saglayici.com:7777{"\n"}
                http://1.2.3.4:8080{"\n"}
                1.2.3.4:1080  (şema yoksa http)
              </Text>
              <TextInput
                testID="scan-proxy-manual"
                value={cfg.manualText}
                onChangeText={t => patch({ manualText: t })}
                placeholder="scheme://kullanici:sifre@host:port"
                placeholderTextColor={colors.onSurfaceTertiary}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  color: colors.onSurface, backgroundColor: colors.surface, borderColor: colors.border,
                  borderWidth: 1, borderRadius: RADIUS.sm, padding: SPACING.md, minHeight: 120, textAlignVertical: "top",
                  fontSize: FONT.size.sm,
                }}
              />
            </View>
          )}

          {/* Otomatik liste */}
          {cfg.source === "auto" && (
            <View style={card}>
              <Text style={label}>Kaynaklar</Text>
              <Text style={[muted, { marginBottom: SPACING.sm }]}>
                Seçili kaynaklar indirilir, birleştirilir ve test edilir. Ücretsiz listelerin çoğu kısa ömürlüdür.
              </Text>
              {CURATED_PROXY_SOURCES.map(s => {
                const on = cfg.autoUrls.includes(s.url);
                return (
                  <FocusButton
                    key={s.id}
                    focusKey={`scan-proxy-source-${s.id}`}
                    onPress={() => { haptic.light(); toggleAutoUrl(s.url); }}
                    style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.sm }}
                  >
                    <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? colors.brandPrimary : colors.onSurfaceTertiary} />
                    <Text style={{ color: colors.onSurface, fontSize: FONT.size.sm, flex: 1 }}>{s.label}</Text>
                  </FocusButton>
                );
              })}
              <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm }}>
                <TextInput
                  testID="scan-proxy-custom-url"
                  value={customUrl}
                  onChangeText={setCustomUrl}
                  placeholder="Özel liste URL'i ekle (txt)"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    flex: 1, color: colors.onSurface, backgroundColor: colors.surface, borderColor: colors.border,
                    borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: FONT.size.sm,
                  }}
                />
                <FocusButton
                  focusKey="scan-proxy-add-url"
                  onPress={() => {
                    const u = customUrl.trim();
                    if (!/^https?:\/\//i.test(u)) { Alert.alert("Geçersiz URL", "http(s):// ile başlamalı."); return; }
                    if (!cfg.autoUrls.includes(u)) patch({ autoUrls: [...cfg.autoUrls, u] });
                    setCustomUrl("");
                  }}
                  style={{ paddingHorizontal: SPACING.md, justifyContent: "center", backgroundColor: colors.surfaceTertiary, borderRadius: RADIUS.sm }}
                >
                  <Ionicons name="add" size={22} color={colors.onSurface} />
                </FocusButton>
              </View>
              {cfg.autoUrls.filter(u => !CURATED_PROXY_SOURCES.some(s => s.url === u)).map(u => (
                <View key={u} style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.xs }}>
                  <Ionicons name="link" size={16} color={colors.onSurfaceTertiary} />
                  <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs, flex: 1 }} numberOfLines={1}>{u}</Text>
                  <TouchableOpacity onPress={() => patch({ autoUrls: cfg.autoUrls.filter(x => x !== u) })} hitSlop={8}>
                    <Ionicons name="trash" size={16} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Durum */}
          {!!statusText && (
            <View style={card}>
              <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.sm }}>{statusText}</Text>
            </View>
          )}

          {/* Eylemler */}
          <View style={{ flexDirection: "row", gap: SPACING.sm }}>
            <FocusButton
              focusKey="scan-proxy-save"
              autoFocus
              disabled={busy}
              onPress={() => { haptic.medium(); void onSave(); }}
              style={{ flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: "center", backgroundColor: colors.brandPrimary, opacity: busy ? 0.6 : 1 }}
            >
              <Text style={{ color: colors.onBrandPrimary, fontWeight: FONT.weight.bold }}>Kaydet & Uygula</Text>
            </FocusButton>
            <FocusButton
              focusKey="scan-proxy-test"
              disabled={busy || !cfg.enabled}
              onPress={() => { haptic.medium(); void onTest(); }}
              style={{ flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: "center", backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, opacity: (busy || !cfg.enabled) ? 0.6 : 1 }}
            >
              <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold }}>Test et</Text>
            </FocusButton>
          </View>
          {busy && <ActivityIndicator color={colors.brandPrimary} />}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  title: { fontSize: FONT.size.xl, fontWeight: "700" },
});
