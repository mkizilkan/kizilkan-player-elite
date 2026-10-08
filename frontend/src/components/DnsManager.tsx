/**
 * KIZILKAN PLAYER — Yedek DNS Yöneticisi (v18.2.0)
 *
 * Liste düzenleme ekranında (Xtream) kullanılır:
 *  • Listenin bildiği tüm adresler: birincil (xtreamServer), panelin doğruladığı
 *    DNS'ler (serverCodeBinding.validatedHosts) ve kullanıcının eklediği yedekler.
 *  • Ekle / Sil / Birincil yap / Tek tek veya toplu TEST (mevcut kullanıcı adı ve
 *    şifreyle gerçek Xtream girişi; süre ölçülür).
 *  • "Doğrudan DNS" ile eklenen hesaplarda da yedek DNS tutulabilir (eskiden
 *    yalnız sunucu koduyla bağlanan listelerde vardı).
 *
 * Kaydetme, ekranın kendi "Kaydet" akışıyla yapılır (onChange ile üst bileşene
 * bildirilir); birincil adres değişikliği mevcut SUNUCU alanına yazılır.
 */
import React, { useCallback, useState, useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { FocusButton } from "@/src/components/FocusButton";
import { normalizeHost } from "@/src/player/hostFailover";
import { xtreamLogin } from "@/src/utils/iptv";
import { recordDiagnostic } from "@/src/utils/diagnostics";
import { canonicalEndpointUrl, endpointProofLabel } from '@/src/utils/playlistEndpoints';
import type { PlaylistEndpoint } from '@/src/types';
import { EndpointPlaybackTest } from './EndpointPlaybackTest';

type TestState = { status: "idle" | "testing" | "ok" | "auth" | "fail"; ms?: number; note?: string };

type Props = {
  primary: string;
  hosts: string[];
  username: string;
  password: string;
  onChange: (hosts: string[]) => void;
  onMakePrimary: (host: string) => void;
  kind?: 'xtream' | 'stalker';
  mac?: string;
  serial?: string;
  profileId?: string;
  endpoints?: PlaylistEndpoint[];
  onEvidence?: (evidence: PlaylistEndpoint) => void;
};

const TEST_TIMEOUT_MS = 9000;

export function DnsManager({ primary, hosts, username, password, onChange, onMakePrimary, kind = 'xtream', mac, serial, profileId, endpoints = [], onEvidence }: Props) {
  const { colors } = useTheme();
  const [input, setInput] = useState("");
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [inputError, setInputError] = useState("");
  const [probeHost, setProbeHost] = useState<string | null>(null);
  const normalize = kind === 'stalker' ? canonicalEndpointUrl : normalizeHost;
  const primaryNorm = normalize(primary);
  const all = [primaryNorm, ...hosts.filter(h => h && h !== primaryNorm)].filter(Boolean);
  const requests = useRef(new Set<AbortController>());
  const generation = useRef(0);
  useEffect(() => { generation.current++; setTests({}); setProbeHost(null); return () => { generation.current++; requests.current.forEach(c => c.abort()); requests.current.clear(); }; }, [username, password, mac, serial, primary, profileId]);

  const testOne = useCallback(async (host: string) => {
    const owner = generation.current;
    setTests(t => ({ ...t, [host]: { status: "testing" } }));
    const ctrl = new AbortController();
    requests.current.add(ctrl);
    const timer = setTimeout(() => ctrl.abort(), TEST_TIMEOUT_MS);
    const started = Date.now();
    let state: TestState;
    try {
      let auth = false;
      let resolvedPortal: PlaylistEndpoint['resolvedPortal'];
      if (kind === 'stalker') {
        const { stalkerLogin, stalkerVerifyAccount } = await import('@/src/utils/stalker');
        const cred = { portal: host, mac: mac || '', serial, profileId, endpointPolicy: 'exact' as const, requestScope: { transport: 'direct' as const, signal: ctrl.signal } };
        const login = await stalkerLogin(cred, { signal: ctrl.signal });
        const verified = await stalkerVerifyAccount(cred, login.session, login.profile, { signal: ctrl.signal });
        auth = verified.state === 'verified'; resolvedPortal = login.session.resolvedPortal;
      } else {
        const res = await xtreamLogin({ server: host, username, password }, ctrl.signal);
        auth = [1, '1', true, 'true'].includes((res?.user_info as any)?.auth);
      }
      const ms = Date.now() - started;
      state = auth ? { status: "ok", ms, note: "Hesap doğrulandı; ilk kare sınanmadı" } : { status: "auth", ms, note: "Hesap doğrulanamadı" };
      if (auth && owner === generation.current && !ctrl.signal.aborted) onEvidence?.({ url: canonicalEndpointUrl(host), kind, source: 'manual', lastTestAt: new Date().toISOString(), accountVerifiedAt: new Date().toISOString(), contentMapping: 'unverified', resolvedPortal, lastError: undefined });
    } catch (e: any) {
      const ms = Date.now() - started;
      const aborted = ctrl.signal.aborted;
      state = { status: "fail", ms, note: aborted ? "Zaman aşımı" : String(e?.message || e).slice(0, 60) };
    } finally {
      clearTimeout(timer);
      requests.current.delete(ctrl);
    }
    if (owner !== generation.current) return;
    if (state.status !== 'ok') onEvidence?.({ url: canonicalEndpointUrl(host), kind, source: 'manual', lastTestAt: new Date().toISOString(), lastError: state.note || 'Test tamamlanamadı' });
    setTests(t => ({ ...t, [host]: state }));
    void recordDiagnostic("network", "DNS_MANAGER_TEST", { host: host.replace(/\/\/([^/:]+)/, "//<host>"), status: state.status, ms: state.ms, primary: host === primaryNorm }, { stage: "dns-manager", outcome: state.status });
  }, [username, password, primaryNorm, kind, mac, serial, profileId, onEvidence]);

  const testAll = useCallback(async () => {
    // Sağlayıcıyı yormamak için sırayla (paralel değil).
    const owner = generation.current;
    for (const h of all) {
      if (owner !== generation.current) break;
      await testOne(h);
    }
  }, [all, testOne]);

  const add = () => {
    const h = normalize(input);
    if (!h) { setInputError("Geçerli bir adres yazın (ör. http://ornek.com:8080)"); return; }
    if (all.includes(h)) { setInputError("Bu adres zaten listede."); return; }
    setInputError("");
    setInput("");
    onChange([...hosts.filter(x => x !== primaryNorm), h]);
    void testOne(h);
  };

  const remove = (h: string) => onChange(hosts.filter(x => x !== h && x !== primaryNorm));

  const badge = (h: string) => {
    const t = tests[h];
    if (!t || t.status === "idle") { const proof = endpoints.find(e => canonicalEndpointUrl(e.url) === canonicalEndpointUrl(h)); return proof ? <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs }}>{endpointProofLabel(proof)}</Text> : null; }
    if (t.status === "testing") return <ActivityIndicator size="small" color={colors.brandPrimary} />;
    const color = t.status === "ok" ? colors.success : t.status === "auth" ? "#F59E0B" : colors.error;
    const text = t.status === "ok" ? `Hesap doğrulandı · ${t.ms} ms · ilk kare sınanmadı` : t.status === "auth" ? `${t.note} · ${t.ms} ms` : (t.note || "Yanıt yok");
    return <Text style={{ color, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }} numberOfLines={1}>{text}</Text>;
  };

  return (
    <View style={{ marginTop: SPACING.lg }}>
      {probeHost && <EndpointPlaybackTest key={`${profileId}|${kind}|${probeHost}|${username}|${mac}`} endpoint={probeHost} kind={kind} username={username} password={password} mac={mac} serial={serial} profileId={profileId}
        onEvidence={e => onEvidence?.(e)} onClose={() => setProbeHost(null)} />}
      <View style={styles.headRow}>
        <Text style={[styles.label, { color: colors.onSurfaceSecondary }]}>SUNUCU ADRESLERİ (YEDEK DNS)</Text>
        <FocusButton testID="dns-test-all" onPress={() => void testAll()} focusRadius={RADIUS.pill} style={[styles.smallBtn, { borderColor: colors.brandPrimary }]}>
          <Ionicons name="pulse" size={14} color={colors.brandPrimary} />
          <Text style={{ color: colors.brandPrimary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>Tümünü test et</Text>
        </FocusButton>
      </View>
      {all.map(h => {
        const isPrimary = h === primaryNorm;
        return (
          <View key={h} style={[styles.row, { backgroundColor: colors.surfaceSecondary, borderColor: isPrimary ? colors.brandPrimary : colors.border }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.onSurface, fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold }} numberOfLines={1}>{h}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {isPrimary ? <Text style={{ color: colors.brandPrimary, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }}>BİRİNCİL</Text> : null}
                {badge(h)}
              </View>
            </View>
            <FocusButton testID={`dns-test-${h}`} onPress={() => void testOne(h)} hitSlop={8} focusRadius={16} style={styles.iconBtn}>
              <Ionicons name="pulse-outline" size={18} color={colors.onSurfaceSecondary} />
            </FocusButton>
            <FocusButton testID={`dns-frame-${h}`} onPress={() => setProbeHost(h)} hitSlop={8} focusRadius={16} style={styles.iconBtn}>
              <Text style={{ color: colors.brandPrimary, fontSize: FONT.size.xs }}>İlk kare</Text>
            </FocusButton>
            {!isPrimary ? (
              <>
                <FocusButton testID={`dns-primary-${h}`} onPress={() => onMakePrimary(h)} hitSlop={8} focusRadius={16} style={styles.iconBtn}>
                  <Ionicons name="star-outline" size={18} color={colors.onSurfaceSecondary} />
                </FocusButton>
                <FocusButton testID={`dns-remove-${h}`} onPress={() => remove(h)} hitSlop={8} focusRadius={16} style={styles.iconBtn}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </FocusButton>
              </>
            ) : null}
          </View>
        );
      })}
      <View style={styles.addRow}>
        <TextInput
          testID="dns-add-input"
          value={input}
          onChangeText={v => { setInput(v); if (inputError) setInputError(""); }}
          autoCapitalize="none" autoCorrect={false} keyboardType="url"
          placeholder="Yedek DNS ekle (ör. http://ornek.com:8080)"
          placeholderTextColor={colors.onSurfaceTertiary}
          onSubmitEditing={add}
          style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: inputError ? colors.error : colors.border }]}
        />
        <FocusButton testID="dns-add-btn" onPress={add} focusRadius={RADIUS.md} style={[styles.addBtn, { backgroundColor: colors.brandPrimary }]}>
          <Ionicons name="add" size={20} color={colors.onBrandPrimary} />
        </FocusButton>
      </View>
      {inputError ? <Text style={{ color: colors.error, fontSize: FONT.size.xs, marginTop: 4 }}>{inputError}</Text> : null}
      <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, marginTop: 6 }}>
        {kind === 'stalker' ? 'MAC portalında yol ve oturum her adres için ayrı doğrulanır. ' : 'Kanal açılmazsa oynatıcı yedek adresleri dener; en son çalışan adres hatırlanır. '}
        ★ ile birincil yapılan adres "Kaydet"e basınca geçerli olur.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.sm },
  label: { fontSize: FONT.size.xs, fontWeight: FONT.weight.bold, letterSpacing: 1.5 },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm, paddingVertical: 8, marginBottom: 6 },
  iconBtn: { padding: 6 },
  addRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: 4 },
  input: { flex: 1, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 10, fontSize: FONT.size.base },
  addBtn: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
});
