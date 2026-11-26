/**
 * KIZILKAN PLAYER — Aynı Hesapları Birleştir (önizleme + onay) (v18.7.42, #1)
 * ==========================================================================
 * Combo/yedek/çoklu eklemeden gelen AYNI hesabın kopya listelerini tek hesapta toplar.
 * SEÇENEK A (güvenli): otomatik silme YOK — kullanıcı grupları görür, hangi
 * üyelerin birleşeceğini seçer, onaylayınca birleşir. Farklı DNS'ler YEDEK olur
 * (oynatıcı biri ölünce sırayla dener). Favori/izlendi/kaldığın yer KORUNUR
 * (korunan hesaba taşınır). Kopya katalogları silinir → DB küçülür.
 *
 * v18.7.42:
 *  - Her panelin SUNUCU KODU korunur: birincilin serverCodeBinding.sources tüm
 *    üyelerin kaynaklarının birleşimi olur (buildMergedServerCodeBinding) → DNS
 *    ölünce tüm panellerden taze adres çekilir.
 *  - Net istatistik (birleştirilen/silinen/kalan) + ilerleme çubuğu.
 *  - Safe-area alt boşluk + sabit alt bar → "Birleştir" butonu navigasyon çubuğunun
 *    altında kalmaz, hep görünür.
 */
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { FocusButton } from "@/src/components/FocusButton";
import type { Playlist } from "@/src/types";
import { findDuplicateGroups, hostsOf, mergedBackupHosts, buildMergedServerCodeBinding } from "@/src/utils/playlistMerge";
import { mergeLibraryScopes } from "@/src/utils/libraryMerge";
import { recordDiagnostic } from "@/src/utils/diagnostics";

type Props = {
  visible: boolean;
  onClose: () => void;
  playlists: Playlist[];
  profileId: string;
  updatePlaylist: (id: string, patch: Partial<Playlist>) => Promise<void>;
  removePlaylist: (id: string) => Promise<void>;
};

export function DuplicateMergeModal({ visible, onClose, playlists, profileId, updatePlaylist, removePlaylist }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const groups = useMemo(() => (visible ? findDuplicateGroups(playlists) : []), [visible, playlists]);
  // Her grup için SİLİNECEK (birincil olmayan) üye id'leri — varsayılan: hepsi seçili.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  // Canlı istatistik: işlenen kopya / toplam, birleştirilen hesap, silinen liste.
  const [stat, setStat] = useState<{ accounts: number; removed: number; processed: number; total: number } | null>(null);
  const [done, setDone] = useState<{ merged: number; removed: number } | null>(null);

  const toggle = (id: string) => setExcluded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const totalDups = groups.reduce((n, g) => n + g.members.filter(m => m.id !== g.primary.id && !excluded.has(m.id)).length, 0);

  const mergeAll = async () => {
    if (busy) return;
    setBusy(true); setDone(null);
    let mergedAccounts = 0, removed = 0, processed = 0;
    const total = totalDups;
    setStat({ accounts: 0, removed: 0, processed: 0, total });
    try {
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        const dups = g.members.filter(m => m.id !== g.primary.id && !excluded.has(m.id));
        if (!dups.length) continue;
        const group = { ...g, members: [g.primary, ...dups] };
        setProgress(`Birleştiriliyor: ${g.primary.name}`);
        // 1) Birincile yaz: yedek DNS (sınırsız) + TÜM panellerin sunucu kodları (birleşik).
        const backups = mergedBackupHosts(group);
        if (g.primary.source === "stalker") {
          const cur = new Set((g.primary.stalkerBackupPortals || []));
          backups.forEach(h => cur.add(h));
          await updatePlaylist(g.primary.id, { stalkerBackupPortals: Array.from(cur) });
        } else {
          const cur = new Set((g.primary.backupHosts || []));
          backups.forEach(h => cur.add(h));
          const patch: Partial<Playlist> = { backupHosts: Array.from(cur) };
          const mergedBinding = buildMergedServerCodeBinding(group);
          if (mergedBinding) (patch as any).serverCodeBinding = mergedBinding;
          await updatePlaylist(g.primary.id, patch);
        }
        // 2) Favori/izlendi/kaldığın yer → birincile taşı (silmeden ÖNCE).
        await mergeLibraryScopes(profileId, dups.map(d => d.id), g.primary.id);
        // 3) Kopya listeleri (katalog dahil) sil — her birinde istatistiği güncelle.
        for (const d of dups) {
          await removePlaylist(d.id);
          removed++; processed++;
          setStat({ accounts: mergedAccounts, removed, processed, total });
        }
        mergedAccounts++;
        setStat({ accounts: mergedAccounts, removed, processed, total });
      }
      void recordDiagnostic("database", "DUPLICATE_MERGE_DONE", { groups: mergedAccounts, removed });
      setDone({ merged: mergedAccounts, removed });
      setProgress("");
    } catch (e: any) {
      void recordDiagnostic("database", "DUPLICATE_MERGE_ERROR", { message: String(e?.message || e).slice(0, 160) });
      setProgress("Hata: " + String(e?.message || e).slice(0, 100));
    } finally { setBusy(false); }
  };

  const s = makeStyles(colors);
  const pct = stat && stat.total > 0 ? Math.round((stat.processed / stat.total) * 100) : 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => !busy && onClose()}>
      <View style={s.backdrop}>
        <View style={[s.card, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}>
          <View style={s.head}>
            <Text style={s.title}>Aynı Hesapları Birleştir</Text>
            <FocusButton testID="merge-close" disabled={busy} onPress={onClose} style={s.iconBtn}><Ionicons name="close" size={22} color={colors.onSurface} /></FocusButton>
          </View>

          {done ? (
            <View style={{ padding: SPACING.lg, gap: SPACING.sm }}>
              <Text style={{ color: colors.success || "#2ecc71", fontWeight: FONT.weight.bold, fontSize: FONT.size.lg }}>✓ Tamamlandı</Text>
              <Text style={{ color: colors.onSurface }}>{done.merged} hesap birleştirildi · {done.removed} kopya liste silindi. Favori/izlendi korundu; farklı DNS'ler ve tüm panel sunucu kodları yedek olarak eklendi.</Text>
              <FocusButton testID="merge-done" onPress={onClose} style={[s.primaryBtn, { backgroundColor: colors.brandPrimary }]}><Text style={s.primaryBtnText}>Kapat</Text></FocusButton>
            </View>
          ) : groups.length === 0 ? (
            <View style={{ padding: SPACING.lg }}><Text style={{ color: colors.onSurfaceSecondary }}>Birleştirilecek çift hesap bulunamadı. (Aynı kaynak + aynı kullanıcı adı/şifre veya MAC + aynı hesap kimliği olan 2+ liste aranır; sunucu/DNS farkı önemli değildir.)</Text></View>
          ) : (
            <>
              <Text style={s.sub}>Aşağıdaki hesaplar aynı görünüyor. Kopyaların tikini kaldırarak birleştirmeden çıkarabilirsin (farklı hesap olabilir). Birincil (korunacak) işaretli; favori/izlendi ona taşınır, diğer DNS'ler ve sunucu kodları yedek olur.</Text>
              <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: SPACING.sm, padding: SPACING.sm }}>
                {groups.map(g => (
                  <View key={g.key} style={s.group}>
                    {g.members.map(m => {
                      const isPrimary = m.id === g.primary.id;
                      const willMerge = !isPrimary && !excluded.has(m.id);
                      const items = (Number((m as any).channelsCount) || 0) + (Number((m as any).vodCount) || 0) + (Number((m as any).seriesCount) || 0);
                      return (
                        <FocusButton key={m.id} testID={`merge-member-${m.id}`} disabled={busy || isPrimary} onPress={() => toggle(m.id)}
                          style={[s.member, { borderColor: isPrimary ? colors.brandPrimary : willMerge ? colors.success || "#2ecc71" : colors.border }]}>
                          <Ionicons name={isPrimary ? "star" : willMerge ? "checkbox" : "square-outline"} size={20}
                            color={isPrimary ? colors.brandPrimary : willMerge ? colors.success || "#2ecc71" : colors.onSurfaceTertiary} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.onSurface, fontWeight: FONT.weight.semibold }} numberOfLines={1}>
                              {m.name}{isPrimary ? "  (korunacak)" : ""}
                            </Text>
                            <Text style={{ color: colors.onSurfaceTertiary, fontSize: FONT.size.xs }} numberOfLines={1}>
                              {hostsOf(m)[0] || "?"}{(m as any).serverCodeBinding?.panelName ? ` · ${(m as any).serverCodeBinding.panelName}` : ""} · {hostsOf(m).length} DNS · {items.toLocaleString("tr")} içerik
                            </Text>
                          </View>
                        </FocusButton>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>

              {/* Sabit alt bar — buton + istatistik + ilerleme (hep görünür). */}
              <View style={s.footer}>
                {busy && stat ? (
                  <>
                    <View style={s.track}><View style={[s.fill, { width: `${pct}%`, backgroundColor: colors.brandPrimary }]} /></View>
                    <Text testID="merge-stats" style={s.statText} numberOfLines={1}>
                      {stat.accounts} hesap birleştirildi · {stat.removed} kopya silindi · {Math.max(stat.total - stat.processed, 0)} kaldı
                    </Text>
                    {!!progress && <Text style={s.progText} numberOfLines={1}>{progress}</Text>}
                  </>
                ) : (
                  <Text style={s.statText} numberOfLines={1}>{groups.length} hesap · {totalDups} kopya birleştirilecek</Text>
                )}
                <FocusButton testID="merge-run" disabled={busy || totalDups === 0} onPress={mergeAll} style={[s.primaryBtn, { backgroundColor: colors.brandPrimary, opacity: totalDups ? 1 : 0.5 }]}>
                  {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="git-merge" size={18} color={colors.onBrandPrimary} />}
                  <Text style={s.primaryBtnText}>{busy ? "Birleştiriliyor…" : `${totalDups} kopyayı birleştir`}</Text>
                </FocusButton>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: any) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "#000a", justifyContent: "flex-end" },
    card: { backgroundColor: c.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, maxHeight: "90%" },
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: c.border },
    title: { color: c.onSurface, fontWeight: FONT.weight.bold, fontSize: FONT.size.lg },
    sub: { color: c.onSurfaceSecondary, fontSize: FONT.size.xs, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, lineHeight: 17 },
    iconBtn: { padding: 6 },
    group: { borderWidth: 1, borderColor: c.border, borderRadius: RADIUS.md, padding: 6, gap: 6, backgroundColor: c.surfaceSecondary },
    member: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 8, backgroundColor: c.surface },
    footer: { borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, gap: 6, backgroundColor: c.surface },
    track: { height: 6, borderRadius: 3, backgroundColor: c.surfaceSecondary, overflow: "hidden" },
    fill: { height: 6, borderRadius: 3 },
    statText: { color: c.onSurfaceSecondary, fontSize: FONT.size.xs, textAlign: "center" },
    progText: { color: c.onSurfaceTertiary, fontSize: FONT.size.xs, textAlign: "center" },
    primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: RADIUS.md },
    primaryBtnText: { color: c.onBrandPrimary, fontWeight: FONT.weight.bold },
  });
}
