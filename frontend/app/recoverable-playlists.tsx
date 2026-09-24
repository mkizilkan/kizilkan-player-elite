import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { KizilkanNativeCore } from "@/modules/kizilkan-native-core";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { recordDiagnostic } from "@/src/utils/diagnostics";

type Snapshot = { playlistId:string; channels:number; vod:number; series:number; total:number; importedAt:number; sourceSize:number };

export default function RecoverablePlaylistsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { playlists } = usePlaylists();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const inv = KizilkanNativeCore.available ? await KizilkanNativeCore.getSnapshotInventory() : [];
      setSnapshots(inv || []);
    } catch (e: any) {
      Alert.alert("Snapshot envanteri okunamadı", String(e?.message || e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const metaIds = useMemo(() => new Set(playlists.map(p => String(p.id))), [playlists]);
  const orphans = useMemo(() => snapshots.filter(s => !metaIds.has(String(s.playlistId))).sort((a,b) => (b.importedAt || 0) - (a.importedAt || 0)), [snapshots, metaIds]);

  useEffect(() => {
    if (loading) return;
    void recordDiagnostic("database", "RECOVERABLE_LISTS_SCREEN", {
      metadataPlaylists: metaIds.size,
      roomSnapshots: snapshots.length,
      recoverableSnapshots: orphans.length,
    });
  }, [loading, metaIds.size, snapshots.length, orphans.length]);

  return (
    <SafeAreaView style={[styles.safe,{backgroundColor:colors.surface}]} edges={["top"]} testID="recoverable-playlists-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}><Ionicons name="close" size={26} color={colors.onSurface}/></TouchableOpacity>
        <View style={{flex:1}}><Text style={[styles.title,{color:colors.onSurface}]}>Kurtarılabilir Listeler</Text><Text style={[styles.sub,{color:colors.onSurfaceSecondary}]}>Room'da durup mevcut profil metadata'sında görünmeyen snapshot'lar</Text></View>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary}/>} contentContainerStyle={styles.content}>
        {loading && snapshots.length === 0 ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary}/></View> : null}
        {!loading && orphans.length === 0 ? <View style={styles.center}><Ionicons name="shield-checkmark-outline" size={56} color={colors.brandPrimary}/><Text style={[styles.emptyTitle,{color:colors.onSurface}]}>Yetim snapshot yok</Text><Text style={[styles.emptySub,{color:colors.onSurfaceSecondary}]}>Mevcut Room snapshot'ları playlist metadata'sıyla bağlı görünüyor.</Text></View> : null}
        {orphans.map(s => (
          <View key={s.playlistId} style={[styles.card,{backgroundColor:colors.surfaceSecondary,borderColor:colors.border}]}>
            <View style={{flexDirection:"row",alignItems:"center",gap:SPACING.sm}}><Ionicons name="archive-outline" size={22} color={colors.brandPrimary}/><Text style={[styles.id,{color:colors.onSurface}]} numberOfLines={1}>{s.playlistId}</Text></View>
            <View style={styles.counts}>
              <Text style={[styles.count,{color:colors.onSurfaceSecondary}]}>Canlı <Text style={{color:colors.onSurface,fontWeight:"800"}}>{s.channels || 0}</Text></Text>
              <Text style={[styles.count,{color:colors.onSurfaceSecondary}]}>Film <Text style={{color:colors.onSurface,fontWeight:"800"}}>{s.vod || 0}</Text></Text>
              <Text style={[styles.count,{color:colors.onSurfaceSecondary}]}>Dizi <Text style={{color:colors.onSurface,fontWeight:"800"}}>{s.series || 0}</Text></Text>
            </View>
            <Text style={[styles.note,{color:colors.onSurfaceTertiary}]}>Bu snapshot otomatik silinmez. Kimlik bilgileri Room snapshot'ında tutulmadığı için güvenli yeniden bağlama için aynı kaynak hesabını tekrar ekleyin.</Text>
            <TouchableOpacity onPress={() => router.push("/add-playlist")} style={[styles.button,{borderColor:colors.brandPrimary}]}><Ionicons name="link-outline" size={18} color={colors.brandPrimary}/><Text style={{color:colors.brandPrimary,fontWeight:"800"}}>Kaynağı yeniden bağla</Text></TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({safe:{flex:1},header:{flexDirection:"row",alignItems:"center",gap:SPACING.md,padding:SPACING.lg},title:{fontSize:FONT.size.lg,fontWeight:FONT.weight.bold},sub:{fontSize:FONT.size.xs,marginTop:2},content:{padding:SPACING.lg,paddingTop:0,gap:SPACING.md,paddingBottom:SPACING.xxxl},center:{alignItems:"center",justifyContent:"center",gap:SPACING.md,padding:SPACING.xxxl},emptyTitle:{fontSize:FONT.size.lg,fontWeight:FONT.weight.bold},emptySub:{fontSize:FONT.size.sm,textAlign:"center"},card:{borderWidth:1,borderRadius:RADIUS.md,padding:SPACING.md,gap:SPACING.sm},id:{flex:1,fontSize:FONT.size.sm,fontWeight:FONT.weight.bold},counts:{flexDirection:"row",flexWrap:"wrap",gap:SPACING.lg},count:{fontSize:FONT.size.sm},note:{fontSize:FONT.size.xs,lineHeight:17},button:{alignSelf:"flex-start",height:42,borderRadius:RADIUS.pill,borderWidth:1,paddingHorizontal:SPACING.md,flexDirection:"row",alignItems:"center",gap:SPACING.sm}});
