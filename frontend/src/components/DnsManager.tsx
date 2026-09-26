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
import React, { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { FocusButton } from "@/src/components/FocusButton";
import { normalizeHost } from "@/src/player/hostFailover";
import { xtreamLogin } from "@/src/utils/iptv";
import { recordDiagnostic } from "@/src/utils/diagnostics";

type TestState = { status: "idle" | "testing" | "ok" | "auth" | "fail"; ms?: number; note?: string };

type Props = {
  primary: string;
  hosts: string[];
  username: string;
  password: string;
  onChange: (hosts: string[]) => void;
  onMakePrimary: (host: string) => void;
};

const TEST_TIMEOUT_MS = 9000;

export function DnsManager({ primary, hosts, username, password, onChange, onMakePrimary }: Props) {
  const { colors } = useTheme();
  const [input, setInput] = useState("");
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [inputError, setInputError] = useState("");
  const primaryNorm = normalizeHost(primary);
  const all = [primaryNorm, ...hosts.filter(h => h && h !== primaryNorm)].filter(Boolean);

  const testOne = useCallback(async (host: string) => {
    setTests(t => ({ ...t, [host]: { status: "testing" } }));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TEST_TIMEOUT_MS);
    const started = Date.now();
    let state: TestState;
    try {
      const res = await xtreamLogin({ server: host, username, password }, ctrl.signal);
      const ms = Date.now() - started;
      const auth = Number((res?.user_info as any)?.auth ?? 1);
      state = auth === 1 ? { status: "ok", ms, note: String((res?.user_info as any)?.status || "") } : { status: "auth", ms, note: "Giriş reddedildi" };
    } catch (e: any) {
      const ms = Date.now() - started;
      const aborted = ctrl.signal.aborted;
      state = { status: "fail", ms, note: aborted ? "Zaman aşımı" : String(e?.message || e).slice(0, 60) };
    } finally {
      clearTimeout(timer);
    }
    setTests(t => ({ ...t, [host]: state }));
    void recordDiagnostic("network", "DNS_MANAGER_TEST", { host: host.replace(/\/\/([^/:]+)/, "//<host>"), status: state.status, ms: state.ms, primary: host === primaryNorm }, { stage: "dns-manager", outcome: state.status });
  }, [username, password, primaryNorm]);

  const testAll = useCallback(async () => {
    // Sağlayıcıyı yormamak için sırayla (paralel değil).
    for (const h of all) await testOne(h);
  }, [all, testOne]);

  const add = () => {
    const h = normalizeHost(input);
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
    if (!t || t.status === "idle") return null;
    if (t.status === "testing") return <ActivityIndicator size="small" color={colors.brandPrimary} />;
    const color = t.status === "ok" ? colors.success : t.status === "auth" ? "#F59E0B" : colors.error;
    const text = t.status === "ok" ? `Çalışıyor · ${t.ms} ms` : t.status === "auth" ? `${t.note} · ${t.ms} ms` : (t.note || "Yanıt yok");
    return <Text style={{ color, fontSize: FONT.size.xs, fontWeight: FONT.weight.bold }} numberOfLines={1}>{text}</Text>;
  };

  return (
    <View style={{ marginTop: SPACING.lg }}>
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
        Kanal açılmazsa oynatıcı sırayla bu adresleri dener; en son çalışan adres bir sonraki açılışta önce denenir.
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
