/**
 * KIZILKAN PLAYER — Aynı Hesapları Birleştir (önizleme + onay) (v18.7.41, #1)
 * ==========================================================================
 * Combo'dan defalarca eklenen AYNI hesabın kopya listelerini tek hesapta toplar.
 * SEÇENEK A (güvenli): otomatik silme YOK — kullanıcı grupları görür, hangi
 * üyelerin birleşeceğini seçer, onaylayınca birleşir. Farklı DNS'ler YEDEK olur
 * (oynatıcı biri ölünce sırayla dener). Favori/izlendi/kaldığın yer KORUNUR
 * (korunan hesaba taşınır). Kopya katalogları silinir → DB küçülür.
 */
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { FocusButton } from "@/src/components/FocusButton";
import type { Playlist } from "@/src/types";
import { findDuplicateGroups, hostsOf, mergedBackupHosts, type MergeGroup } from "@/src/utils/playlistMerge";
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
  const groups = useMemo(() => (visible ? findDuplicateGroups(playlists) : []), [visible, playlists]);
  // Her grup için SİLİNECEK (birincil olmayan) üye id'leri — varsayılan: hepsi seçili.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [done, setDone] = useState<{ merged: number; removed: number } | null>(null);

  const toggle = (id: string) => setExcluded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const mergeAll = async () => {
    if (busy) return;
    setBusy(true); setDone(null);
    let mergedGroups = 0, removed = 0;
    try {
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        const dups = g.members.filter(m => m.id !== g.primary.id && !excluded.has(m.id));
        if (!dups.length) continue;
        setProgress(`Birleştiriliyor ${gi + 1}/${groups.length} · ${g.primary.name}`);
        // 1) Yedek DNS'leri birincile yaz (sınırsız).
        const backups = mergedBackupHosts({ ...g, members: [g.primary, ...dups] });
        if (g.primary.source === "stalker") {
          const cur = new Set((g.primary.stalkerBackupPortals || []));
          backups.forEach(h => cur.add(h));
          await updatePlaylist(g.primary.id, { stalkerBackupPortals: Array.from(cur) });
        } else {
          const cur = new Set((g.primary.backupHosts || []));
          backups.forEach(h => cur.add(h));
          await updatePlaylist(g.primary.id, { backupHosts: Array.from(cur) });
        }
        // 2) Favori/izlendi/kaldığın yer → birincile taşı (silmeden ÖNCE).
        await mergeLibraryScopes(profileId, dups.map(d => d.id), g.primary.id);
        // 3) Kopya listeleri (katalog dahil) sil.
        for (const d of dups) { await removePlaylist(d.id); removed++; }
        mergedGroups++;
      }
      void recordDiagnostic("database", "DUPLICATE_MERGE_DONE", { groups: mergedGroups, removed });
      setDone({ merged: mergedGroups, removed });
      setProgress("");
    } catch (e: any) {
      void recordDiagnostic("database", "DUPLICATE_MERGE_ERROR", { message: String(e?.message || e).slice(0, 160) });
      setProgress("Hata: " + String(e?.message || e).slice(0, 100));
    } finally { setBusy(false); }
  };

  const totalDups = groups.reduce((n, g) => n + g.members.filter(m => m.id !== g.primary.id && !excluded.has(m.id)).length, 0);
  const s = makeStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => !busy && onClose()}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <View style={s.head}>
            <Text style={s.title}>Aynı Hesapları Birleştir</Text>
            <FocusButton testID="merge-close" disabled={busy} onPress={onClose} style={s.iconBtn}><Ionicons name="close" size={22} color={colors.onSurface} /></FocusButton>
          </View>

          {done ? (
            <View style={{ padding: SPACING.lg, gap: SPACING.sm }}>
              <Text style={{ color: colors.success || "#2ecc71", fontWeight: FONT.weight.bold, fontSize: FONT.size.lg }}>✓ Tamamlandı</Text>
              <Text style={{ color: colors.onSurface }}>{done.merged} hesap grubu birleştirildi · {done.removed} kopya liste silindi. Favori/izlendi korundu; farklı DNS'ler yedek olarak eklendi.</Text>
              <FocusButton testID="merge-done" onPress={onClose} style={[s.primaryBtn, { backgroundColor: colors.brandPrimary }]}><Text style={s.primaryBtnText}>Kapat</Text></FocusButton>
            </View>
          ) : groups.length === 0 ? (
            <View style={{ padding: SPACING.lg }}><Text style={{ color: colors.onSurfaceSecondary }}>Birleştirilecek çift hesap bulunamadı. (Aynı kaynak + aynı kullanıcı adı/şifre veya MAC + aynı panel olan 2+ liste aranır.)</Text></View>
          ) : (
            <>
              <Text style={s.sub}>Aşağıdaki hesaplar aynı görünüyor. Kopyaların tikini kaldırarak birleştirmeden çıkarabilirsin (farklı panel olabilir). Birincil (korunacak) işaretli; favori/izlendi ona taşınır, diğer DNS'ler yedek olur.</Text>
              <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: SPACING.sm, padding: SPACING.sm }}>
                {groups.map(g => (
                  <View key={g.key} style={s.group}>
                    {g.members.map(m => {
                      const isPrimary = m.id === g.primary.id;
                      const willMerge = !isPrimary && !excluded.has(m.id);
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
                              {hostsOf(m)[0] || "?"}{(m as any).serverCodeBinding?.panelName ? ` · ${(m as any).serverCodeBinding.panelName}` : ""} · {hostsOf(m).length} DNS
                            </Text>
                          </View>
                        </FocusButton>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
              {!!progress && <Text style={{ color: colors.onSurfaceSecondary, fontSize: FONT.size.xs, paddingHorizontal: SPACING.sm }}>{progress}</Text>}
              <FocusButton testID="merge-run" disabled={busy || totalDups === 0} onPress={mergeAll} style={[s.primaryBtn, { backgroundColor: colors.brandPrimary, opacity: totalDups ? 1 : 0.5 }]}>
                {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="git-merge" size={18} color={colors.onBrandPrimary} />}
                <Text style={s.primaryBtnText}>{busy ? "Birleştiriliyor…" : `${totalDups} kopyayı birleştir`}</Text>
              </FocusButton>
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
    card: { backgroundColor: c.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, paddingBottom: SPACING.lg, maxHeight: "88%" },
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: c.border },
    title: { color: c.onSurface, fontWeight: FONT.weight.bold, fontSize: FONT.size.lg },
    sub: { color: c.onSurfaceSecondary, fontSize: FONT.size.xs, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, lineHeight: 17 },
    iconBtn: { padding: 6 },
    group: { borderWidth: 1, borderColor: c.border, borderRadius: RADIUS.md, padding: 6, gap: 6, backgroundColor: c.surfaceSecondary },
    member: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 8, backgroundColor: c.surface },
    primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: SPACING.md, marginTop: SPACING.sm, paddingVertical: 12, borderRadius: RADIUS.md },
    primaryBtnText: { color: c.onBrandPrimary, fontWeight: FONT.weight.bold },
  });
}
