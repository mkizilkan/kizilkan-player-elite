import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { storage } from "@/src/utils/storage";

const EPISODE_URL_KEY = "kizilkan.episode.url.";
const LAST_DIR_KEY = "kizilkan.localmedia.lastDir.v1";
const VIDEO_EXT = /\.(mp4|mkv|avi|mov|m4v|webm|ts|m2ts|mts|mpg|mpeg|3gp|flv|wmv)$/i;

type Entry = { uri: string; name: string; isDirectory: boolean };

function hashText(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function uriName(uri: string): string {
  try {
    const clean = decodeURIComponent(String(uri).split("?")[0]);
    const raw = clean.split("/").filter(Boolean).pop() || "Dosya";
    const colon = raw.lastIndexOf(":");
    return (colon >= 0 ? raw.slice(colon + 1) : raw) || "Dosya";
  } catch { return "Dosya"; }
}

export default function LocalMediaScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [directoryUri, setDirectoryUri] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const SAF: any = (FileSystem as any).StorageAccessFramework;

  const inspectEntries = useCallback(async (dir: string) => {
    if (!dir || !SAF?.readDirectoryAsync) return;
    setBusy(true);
    try {
      const uris: string[] = await SAF.readDirectoryAsync(dir);
      const out: Entry[] = [];
      for (const uri of uris) {
        let isDirectory = false;
        try {
          // SAF child dizinleri için readDirectoryAsync en güvenilir ayrım. Dosyada hızlıca hata verir.
          await SAF.readDirectoryAsync(uri);
          isDirectory = true;
        } catch { isDirectory = false; }
        const name = uriName(uri);
        if (isDirectory || VIDEO_EXT.test(name)) out.push({ uri, name, isDirectory });
      }
      out.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name, "tr"));
      setEntries(out);
      setDirectoryUri(dir);
      await storage.setItem(LAST_DIR_KEY, dir);
    } catch (e: any) {
      Alert.alert("Klasör açılamadı", String(e?.message || e));
    } finally { setBusy(false); }
  }, [SAF]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    storage.getItem<string>(LAST_DIR_KEY, "").then(last => {
      if (last) void inspectEntries(last);
    }).catch(() => {});
  }, [inspectEntries]);

  const chooseDirectory = useCallback(async () => {
    if (Platform.OS !== "android" || !SAF?.requestDirectoryPermissionsAsync) {
      Alert.alert("Klasör seçimi", "USB/SD klasör tarama Android'de kullanılabilir. Tek video seçimi bu cihazda yine çalışır.");
      return;
    }
    try {
      const p = await SAF.requestDirectoryPermissionsAsync(directoryUri || undefined);
      if (!p?.granted || !p?.directoryUri) return;
      setHistory([]);
      await inspectEntries(p.directoryUri);
    } catch (e: any) { Alert.alert("Klasör seçilemedi", String(e?.message || e)); }
  }, [SAF, directoryUri, inspectEntries]);

  const playUri = useCallback(async (uri: string, name: string) => {
    const ext = (name.split(".").pop() || "mp4").replace(/[^a-zA-Z0-9]/g, "") || "mp4";
    const id = `local-${hashText(uri)}`;
    await storage.setItem(EPISODE_URL_KEY + id, JSON.stringify({ id, url: uri, name, group: "Yerel Medya", container_ext: ext }));
    router.push({ pathname: "/player", params: { id, ext: "true", navOrigin: "local-media", focusKey: `local:${id}` } });
  }, [router]);

  const chooseFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "video/*", copyToCacheDirectory: false, multiple: false });
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      await playUri(a.uri, a.name || uriName(a.uri));
    } catch (e: any) { Alert.alert("Video açılamadı", String(e?.message || e)); }
  }, [playUri]);

  const openEntry = useCallback(async (entry: Entry) => {
    if (!entry.isDirectory) return playUri(entry.uri, entry.name);
    setHistory(prev => [...prev, directoryUri]);
    await inspectEntries(entry.uri);
  }, [directoryUri, inspectEntries, playUri]);

  const goParent = useCallback(async () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory(h => h.slice(0, -1));
    await inspectEntries(prev);
  }, [history, inspectEntries]);

  const subtitle = useMemo(() => directoryUri ? `${entries.length} video/klasör` : "Telefon, tablet, USB veya SD karttan video açın", [directoryUri, entries.length]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top"]} testID="local-media-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}><Ionicons name="close" size={26} color={colors.onSurface} /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.onSurface }]}>Yerel Medya</Text><Text style={[styles.sub, { color: colors.onSurfaceSecondary }]}>{subtitle}</Text></View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity testID="local-pick-file" onPress={() => void chooseFile()} style={[styles.action, { backgroundColor: colors.brandPrimary }]}>
          <Ionicons name="videocam-outline" size={20} color={colors.onBrandPrimary} /><Text style={{ color: colors.onBrandPrimary, fontWeight: "800" }}>Video seç</Text>
        </TouchableOpacity>
        {Platform.OS === "android" && <TouchableOpacity testID="local-pick-dir" onPress={() => void chooseDirectory()} style={[styles.action, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 }]}>
          <Ionicons name="folder-open-outline" size={20} color={colors.brandPrimary} /><Text style={{ color: colors.onSurface, fontWeight: "800" }}>Klasör / USB / SD</Text>
        </TouchableOpacity>}
      </View>
      {history.length > 0 && <TouchableOpacity onPress={() => void goParent()} style={styles.parent}><Ionicons name="arrow-up" size={18} color={colors.brandPrimary}/><Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Üst klasör</Text></TouchableOpacity>}
      {busy ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary}/><Text style={{ color: colors.onSurfaceSecondary }}>Klasör okunuyor…</Text></View> : (
        <ScrollView contentContainerStyle={styles.list}>
          {entries.map(e => <TouchableOpacity key={e.uri} onPress={() => void openEntry(e)} style={[styles.row, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Ionicons name={e.isDirectory ? "folder" : "film-outline"} size={23} color={e.isDirectory ? colors.brandPrimary : colors.onSurfaceSecondary}/>
            <Text style={{ flex: 1, color: colors.onSurface }} numberOfLines={2}>{e.name}</Text>
            <Ionicons name={e.isDirectory ? "chevron-forward" : "play-circle-outline"} size={21} color={colors.onSurfaceSecondary}/>
          </TouchableOpacity>)}
          {!!directoryUri && entries.length === 0 && <View style={styles.center}><Ionicons name="folder-open-outline" size={50} color={colors.onSurfaceSecondary}/><Text style={{ color: colors.onSurfaceSecondary, textAlign: "center" }}>Bu klasörde desteklenen video görünmüyor.</Text></View>}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:{flex:1}, header:{flexDirection:"row",alignItems:"center",gap:SPACING.md,padding:SPACING.lg}, title:{fontSize:FONT.size.lg,fontWeight:FONT.weight.bold}, sub:{fontSize:FONT.size.xs,marginTop:2}, actions:{flexDirection:"row",gap:SPACING.sm,paddingHorizontal:SPACING.lg,paddingBottom:SPACING.md}, action:{flex:1,minHeight:48,borderRadius:RADIUS.md,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:SPACING.sm,paddingHorizontal:SPACING.sm}, parent:{flexDirection:"row",alignItems:"center",gap:SPACING.sm,paddingHorizontal:SPACING.lg,paddingVertical:SPACING.sm}, list:{padding:SPACING.lg,paddingTop:SPACING.sm,gap:SPACING.sm,paddingBottom:SPACING.xxxl}, row:{minHeight:56,borderWidth:1,borderRadius:RADIUS.md,flexDirection:"row",alignItems:"center",gap:SPACING.md,paddingHorizontal:SPACING.md}, center:{alignItems:"center",justifyContent:"center",gap:SPACING.md,padding:SPACING.xxxl}
});
