import React, { useCallback, useState, useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/theme/ThemeContext';
import { SPACING, RADIUS, FONT } from '@/src/theme/themes';
import { FocusButton } from './FocusButton';
import { normalizeHost } from '@/src/player/hostFailover';
import { xtreamLogin } from '@/src/utils/iptv';
import { recordDiagnostic } from '@/src/utils/diagnostics';
import { canonicalEndpointUrl, endpointProofLabel, mergeEndpointEvidence } from '@/src/utils/playlistEndpoints';
import { bestPlaybackEndpoint } from '@/src/utils/playlistDnsManagement';
import { canTryPlaylistDnsAlternative } from '@/src/utils/panelDnsFailover';
import type { PlaylistEndpoint } from '@/src/types';
import { EndpointPlaybackTest } from './EndpointPlaybackTest';

type TestState = { status: 'testing' | 'ok' | 'fail'; ms?: number; note?: string };
type Props = {
  primary: string; hosts: string[]; username: string; password: string;
  onChange: (hosts: string[]) => void; onMakePrimary: (host: string) => void;
  kind?: 'xtream' | 'stalker'; mac?: string; serial?: string; profileId?: string;
  endpoints?: PlaylistEndpoint[]; onEvidence?: (evidence: PlaylistEndpoint) => void;
  saveHint?: string;
};
const TEST_TIMEOUT_MS = 9000;
const EMPTY_ENDPOINTS: PlaylistEndpoint[] = [];

/** Shared account/DNS UI. Video tests use one renderer and one DNS at a time. */
export function DnsManager({ primary, hosts, username, password, onChange, onMakePrimary, kind = 'xtream', mac, serial, profileId, endpoints = EMPTY_ENDPOINTS, onEvidence, saveHint = 'Aktif adres ve DNS değişiklikleri Kaydet ile uygulanır.' }: Props) {
  const { colors } = useTheme();
  const [input, setInput] = useState('');
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [inputError, setInputError] = useState('');
  const [message, setMessage] = useState('');
  const [probeHost, setProbeHost] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [proofs, setProofs] = useState<PlaylistEndpoint[]>(endpoints);
  const proofRef = useRef(proofs);
  const batchRef = useRef<{ pending: string[]; results: PlaylistEndpoint[]; chooseBest: boolean } | null>(null);
  const busyRef = useRef(false);
  const probeDone = useRef(false);
  const activeProbe = useRef<string | null>(null);
  const requests = useRef(new Set<AbortController>());
  const generation = useRef(0);
  const normalize = (h: string) => canonicalEndpointUrl(kind === 'xtream' ? normalizeHost(h) : h);
  const primaryNorm = normalize(primary);
  const all = [...new Set([primaryNorm, ...hosts.map(normalize)].filter(Boolean))];

  useEffect(() => {
    generation.current++; requests.current.forEach(c => c.abort()); requests.current.clear();
    batchRef.current = null; activeProbe.current = null; busyRef.current = false; setBusy(false); setProbeHost(null); setTests({});
    return () => { generation.current++; requests.current.forEach(c => c.abort()); requests.current.clear(); };
  }, [username, password, kind, mac, serial, primary, profileId]);
  useEffect(() => { proofRef.current = endpoints; setProofs(endpoints); }, [endpoints]);
  const accept = (e: PlaylistEndpoint) => {
    if (e.source === 'playback' && activeProbe.current !== canonicalEndpointUrl(e.url)) return;
    proofRef.current = mergeEndpointEvidence(proofRef.current, e); setProofs(proofRef.current); onEvidence?.(e);
  };
  const cancel = () => {
    if (probeHost && !probeDone.current) accept({ url: probeHost, kind, source: 'playback',
      playbackTestAt: new Date().toISOString(), playbackTestState: 'cancelled', lastError: 'Kullanıcı testi iptal etti.' });
    generation.current++; requests.current.forEach(c => c.abort()); batchRef.current = null; activeProbe.current = null; setProbeHost(null); setTests({}); setMessage('DNS testi iptal edildi.');
    busyRef.current = false; setBusy(false);
  };
  const testOne = useCallback(async (host: string) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const owner = generation.current;
    setTests(t => ({ ...t, [host]: { status: 'testing' } }));
    const ctrl = new AbortController(); requests.current.add(ctrl);
    const timer = setTimeout(() => ctrl.abort(), TEST_TIMEOUT_MS); const started = Date.now();
    let state: TestState; let resolvedPortal: PlaylistEndpoint['resolvedPortal']; let errorKind = '';
    try {
      let auth = false;
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
      if (ctrl.signal.aborted) throw Object.assign(new Error('DNS testi zaman aşımına uğradı.'), { kind: 'TIMEOUT' });
      state = { status: auth ? 'ok' : 'fail', ms: Date.now() - started, note: auth ? 'Hesap doğrulandı' : 'Hesap doğrulanamadı' };
    } catch (e: any) {
      errorKind = String(e?.kind || '');
      state = { status: 'fail', ms: Date.now() - started, note: ctrl.signal.aborted ? 'Zaman aşımı' : String(e?.message || e).slice(0, 100) };
    } finally { clearTimeout(timer); requests.current.delete(ctrl); }
    if (owner !== generation.current) return;
    const now = new Date().toISOString();
    accept({ url: host, kind, source: 'manual', lastTestAt: now, accountLatencyMs: state.ms,
      ...(state.status === 'ok' && !ctrl.signal.aborted ? { accountVerifiedAt: now, resolvedPortal, lastError: '', lastErrorKind: '' }
        : { lastError: state.note, lastErrorKind: errorKind }) });
    setTests(t => ({ ...t, [host]: state })); busyRef.current = false; setBusy(false);
    void recordDiagnostic('network', 'DNS_MANAGER_TEST', { status: state.status, ms: state.ms, primary: host === primaryNorm }, { stage: 'dns-manager', outcome: state.status });
    return errorKind;
  }, [username, password, primaryNorm, kind, mac, serial, profileId, onEvidence]);

  const testAccounts = async () => {
    if (busyRef.current) return;
    const owner = generation.current;
    for (const host of all) {
      if (owner !== generation.current) return;
      const errorKind = await testOne(host);
      if (!canTryPlaylistDnsAlternative({ kind: errorKind })) { setMessage('Koruma / bekleme sinyali nedeniyle diğer hesap testleri durduruldu.'); break; }
    }
  };

  const startVideo = (urls: string[], chooseBest = false, single = false) => {
    if (busyRef.current || !urls.length) return;
    busyRef.current = true; setBusy(true); probeDone.current = false;
    batchRef.current = single ? null : { pending: urls.slice(1), results: [], chooseBest };
    activeProbe.current = urls[0]; setMessage(single ? '' : `${urls.length} DNS sırayla hesap ve görüntü testinden geçecek.`); setProbeHost(urls[0]);
  };
  const complete = (e: PlaylistEndpoint) => {
    if (activeProbe.current !== canonicalEndpointUrl(e.url)) return;
    probeDone.current = true;
    const batch = batchRef.current; if (!batch) return;
    batch.results.push(e);
    if (!canTryPlaylistDnsAlternative({ kind: e.lastErrorKind }) || e.lastErrorKind === 'PLAYER_ACTIVE') {
      batch.pending = []; batch.chooseBest = false; setMessage(e.lastError || 'Test durduruldu.');
    }
    const next = batch.pending.shift();
    if (next) { activeProbe.current = next; probeDone.current = false; setProbeHost(next); return; }
    const best = bestPlaybackEndpoint(batch.results);
    if (batch.chooseBest && best) {
      onMakePrimary(best.url); setMessage(`En hızlı görüntü veren DNS seçildi: ${best.url} · ${(best.firstFrameElapsedMs! / 1000).toFixed(1)} sn`);
    } else if (batch.chooseBest) setMessage('Hiçbir DNS için görüntü doğrulanamadı; aktif adres değiştirilmedi.');
    else if (!e.lastErrorKind || canTryPlaylistDnsAlternative({ kind: e.lastErrorKind })) setMessage(`${batch.results.filter(v => v.playbackTestState === 'frame').length}/${batch.results.length} DNS testte görüntü verdi.`);
    batchRef.current = null; activeProbe.current = null; setProbeHost(null); busyRef.current = false; setBusy(false);
  };
  const add = () => {
    const h = normalize(input);
    if (!h) { setInputError('Geçerli HTTP/HTTPS adresi yazın. MAG için portal yolunu da ekleyin.'); return; }
    if (all.includes(h)) { setInputError('Bu adres zaten listede.'); return; }
    setInputError(''); setInput(''); onChange([...all.filter(x => x !== primaryNorm), h]);
    void testOne(h);
  };
  const button = (id: string, label: string, action: () => void) => <FocusButton testID={id} disabled={busy} onPress={action} focusRadius={RADIUS.md} style={[styles.button, { borderColor: colors.border, opacity: busy ? 0.45 : 1 }]}>
    <Text style={{ color: colors.brandPrimary, fontSize: FONT.size.sm }}>{label}</Text>
  </FocusButton>;
  return <View style={{ marginTop: SPACING.lg }}>
    {probeHost && <EndpointPlaybackTest key={`${profileId}|${kind}|${probeHost}|${username}|${mac}`} endpoint={probeHost} kind={kind} username={username} password={password} mac={mac} serial={serial} profileId={profileId} onEvidence={accept} onComplete={complete} onClose={cancel} />}
    <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.sm, fontWeight: FONT.weight.bold }}>SUNUCU ADRESLERİ (DNS / PORTAL)</Text>
    <View style={styles.actions}>
      {button('dns-test-all', 'DNS adreslerini test et', () => startVideo(all))}
      {button('dns-select-best', 'En iyi çalışanı seç', () => startVideo(all, true))}
      {button('dns-test-accounts', 'Tüm hesapları test et', () => void testAccounts())}
      {busy && <FocusButton testID="dns-cancel" onPress={cancel} style={[styles.button, { borderColor: colors.error }]}><Text style={{ color: colors.error }}>Testi iptal et</Text></FocusButton>}
    </View>
    {message ? <Text style={{ color: colors.onSurfaceSecondary, marginVertical: 8 }}>{message}</Text> : null}
    {all.map(h => {
      const isPrimary = h === primaryNorm; const t = tests[h];
      const proof = proofs.find(e => e.url === h); const confirmed = !!proof?.accountVerifiedAt || !!proof?.firstFrameAt;
      return <View key={h} style={[styles.row, { backgroundColor: colors.surfaceSecondary, borderColor: isPrimary ? colors.brandPrimary : colors.border }]}>
        <Text selectable style={{ color: colors.onSurface, fontSize: FONT.size.sm }}>{h}</Text>
        {isPrimary && <Text style={{ color: colors.brandPrimary, fontWeight: FONT.weight.bold }}>AKTİF</Text>}
        {t?.status === 'testing' ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : t ? <Text style={{ color: t.status === 'ok' ? colors.success : colors.error }}>{t.note} · {t.ms} ms</Text> : null}
        {proof && <Text style={{ color: proof.playbackTestState === 'frame' ? colors.success : colors.onSurfaceSecondary }}>{endpointProofLabel(proof)}</Text>}
        {proof?.lastError ? <Text style={{ color: colors.error }}>Son test: {proof.lastError}</Text> : null}
        {proof?.accountLatencyMs != null && <Text style={{ color: colors.onSurfaceTertiary }}>Hesap yanıtı: {proof.accountLatencyMs} ms</Text>}
        <View style={styles.actions}>
          {button(`dns-test-${h}`, 'Hesap testi', () => void testOne(h))}
          {button(`dns-frame-${h}`, 'Görüntü test et', () => startVideo([h], false, true))}
          {!isPrimary && <FocusButton testID={`dns-primary-${h}`} disabled={busy || !confirmed} onPress={() => onMakePrimary(h)} style={[styles.button, { borderColor: colors.border, opacity: busy || !confirmed ? 0.45 : 1 }]}><Text style={{ color: colors.brandPrimary }}>Aktif yap</Text></FocusButton>}
          {!isPrimary && button(`dns-remove-${h}`, 'Sil', () => onChange(all.filter(x => x !== h && x !== primaryNorm)))}
        </View>
      </View>;
    })}
    <View style={styles.actions}>
      <TextInput testID="dns-add-input" editable={!busy} value={input} onChangeText={v => { setInput(v); setInputError(''); }} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder={kind === 'stalker' ? 'Ek portal URL + yol' : 'Ek DNS (http://ornek.com:8080)'} placeholderTextColor={colors.onSurfaceTertiary} onSubmitEditing={add} style={[styles.input, { color: colors.onSurface, borderColor: inputError ? colors.error : colors.border }]} />
      <FocusButton testID="dns-add-btn" disabled={busy} onPress={add} style={styles.button}><Ionicons name="add" size={22} color={colors.brandPrimary} /></FocusButton>
    </View>
    {inputError && <Text style={{ color: colors.error }}>{inputError}</Text>}
    <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs, marginTop: 8 }}>{saveHint} En iyi seçim gerçek ilk görüntünün açılış süresine göre yapılır. Testte görüntü alınamaması tüm kanalların çalışmadığını kanıtlamaz.</Text>
  </View>;
}
const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, alignItems: 'center' },
  button: { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 8 },
  row: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, marginTop: 8, gap: 4 },
  input: { flex: 1, minWidth: 180, borderWidth: 1, borderRadius: RADIUS.md, padding: 10, fontSize: FONT.size.base },
});
