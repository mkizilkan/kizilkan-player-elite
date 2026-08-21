import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { createBackup, restoreBackup, BackupPayload, isKizilkanBackup } from "@/src/utils/backup";
import { authenticateGoogleDrive, uploadJsonToDrive, isGoogleDriveConfigured } from "@/src/utils/googleDrive";

export default function BackupScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const doExport = async () => {
    setBusy("export"); setMsg(null);
    try {
      const payload = await createBackup();
      const json = JSON.stringify(payload, null, 2);
      const fileName = `kizilkan-player-elite-backup-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(json);
        setMsg({ type: "ok", text: `Yedek panoya kopyalandı (${Math.round(json.length / 1024)} KB) · ${payload.summary?.playlists || 0} playlist dahil.` });
      } else {
        const uri = (FileSystem as any).cacheDirectory + fileName;
        await (FileSystem as any).writeAsStringAsync(uri, json);
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "KIZILKAN PLAYER ELITE Yedeğini Paylaş" });
          setMsg({ type: "ok", text: `Yedek dosyası hazırlandı: ${payload.summary?.playlists || 0} playlist · ${payload.summary?.profiles || 0} profil dahil.` });
        } else {
          await Clipboard.setStringAsync(json);
          setMsg({ type: "ok", text: "Paylaşım kullanılamıyor - yedek panoya kopyalandı." });
        }
      }
    } catch (e: any) {
      setMsg({ type: "err", text: "Yedek oluşturulamadı: " + e.message });
    } finally {
      setBusy(null);
    }
  };

  const doImport = async () => {
    setBusy("import"); setMsg(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) { setBusy(null); return; }
      const asset = res.assets[0];
      const response = await fetch(asset.uri);
      const text = await response.text();
      let payload: BackupPayload;
      try { payload = JSON.parse(text); }
      catch { throw new Error("Geçersiz JSON dosyası"); }
      if (!isKizilkanBackup(payload)) throw new Error("Bu bir KIZILKAN PLAYER ELITE yedek dosyası değil");
      const result = await restoreBackup(payload);
      const warningText = result.warnings.length ? `\n\n⚠️ ${result.warnings.join("\n⚠️ ")}` : "";
      setMsg({
        type: "ok",
        text: `Yedek geri yüklendi: ${result.playlists} playlist · ${result.profiles} profil · ${result.restored} ayar/kayıt · ${result.heavyPlaylists} playlist içerik dosyası.${warningText}\n\nDeğişikliklerin tam etkin olması için uygulamayı yeniden başlatın.`,
      });
    } catch (e: any) {
      setMsg({ type: "err", text: e.message || "Yedek yüklenemedi" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={["top", "bottom"]} testID="backup-screen">
      <View style={styles.header}>
        <TouchableOpacity testID="backup-close-btn" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.onSurface }]}>Yedekleme</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.lg }}>
        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: colors.brandPrimary + "22", borderColor: colors.brandPrimary }]}>
            <Ionicons name="cloud-upload-outline" size={28} color={colors.brandPrimary} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Yedek Oluştur</Text>
          <Text style={[styles.cardText, { color: colors.onSurfaceSecondary }]}>
            Playlist hesaplarıyla birlikte kanal/film/dizi içerik verileri, profiller, favoriler, tema ve PIN ayarları JSON dosyasına yedeklenir.
            Yedek tamamlanmadan önce playlist dosyaları doğrulanır; eksik playlist varsa uygulama başarı mesajı vermez.
          </Text>
          <TouchableOpacity
            testID="do-export-btn"
            onPress={doExport}
            disabled={busy !== null}
            style={[styles.action, { backgroundColor: colors.brandPrimary, opacity: busy ? 0.5 : 1 }]}
          >
            {busy === "export" ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <>
                <Ionicons name="share-outline" size={20} color={colors.onBrandPrimary} />
                <Text style={[styles.actionText, { color: colors.onBrandPrimary }]}>Dışa Aktar ve Paylaş</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: colors.brandPrimary + "22", borderColor: colors.brandPrimary }]}>
            <Ionicons name="cloud-download-outline" size={28} color={colors.brandPrimary} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Yedek Yükle</Text>
          <Text style={[styles.cardText, { color: colors.onSurfaceSecondary }]}>
            Daha önce dışa aktardığınız JSON yedek dosyasını seçin. Mevcut verileriniz üzerine yazılır.
          </Text>
          <TouchableOpacity
            testID="do-import-btn"
            onPress={doImport}
            disabled={busy !== null}
            style={[styles.action, { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.brandPrimary, opacity: busy ? 0.5 : 1 }]}
          >
            {busy === "import" ? <ActivityIndicator color={colors.brandPrimary} /> : (
              <>
                <Ionicons name="folder-open-outline" size={20} color={colors.brandPrimary} />
                <Text style={[styles.actionText, { color: colors.brandPrimary }]}>Dosyadan Yükle</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {msg && (
          <View testID="backup-msg" style={[styles.msg, { backgroundColor: msg.type === "ok" ? colors.success + "22" : colors.error + "22", borderColor: msg.type === "ok" ? colors.success : colors.error }]}>
            <Ionicons name={msg.type === "ok" ? "checkmark-circle" : "alert-circle"} size={18} color={msg.type === "ok" ? colors.success : colors.error} />
            <Text style={[styles.msgText, { color: msg.type === "ok" ? colors.success : colors.error }]}>{msg.text}</Text>
          </View>
        )}

        <View style={[styles.driveCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Ionicons name="logo-google" size={22} color={colors.brandPrimary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.driveTitle, { color: colors.onSurface }]}>Google Drive Yedeği</Text>
            <Text style={[styles.driveSub, { color: colors.onSurfaceSecondary }]}>
              {isGoogleDriveConfigured()
                ? "Yedeği doğrudan Google Drive'ınıza yükleyin."
                : "Aktif etmek için Publish sonrası Deployment → Secrets bölümüne EXPO_PUBLIC_GOOGLE_CLIENT_ID ekleyin."}
            </Text>
          </View>
          <TouchableOpacity
            testID="drive-upload-btn"
            disabled={busy !== null}
            onPress={async () => {
              setBusy("export"); setMsg(null);
              try {
                const auth = await authenticateGoogleDrive();
                const payload = await createBackup();
                const json = JSON.stringify(payload, null, 2);
                const fileName = `kizilkan-player-elite-backup-${new Date().toISOString().slice(0, 10)}.json`;
                const uploaded = await uploadJsonToDrive(auth.accessToken, fileName, json);
                setMsg({ type: "ok", text: `Drive'a yüklendi: ${uploaded.name}` });
              } catch (e: any) {
                setMsg({ type: "err", text: e.message });
              } finally {
                setBusy(null);
              }
            }}
            style={[styles.driveBtn, { backgroundColor: colors.brandPrimary, opacity: busy ? 0.5 : 1 }]}
          >
            <Text style={{ color: colors.onBrandPrimary, fontSize: FONT.size.sm, fontWeight: FONT.weight.bold }}>Yükle</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  title: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  card: { padding: SPACING.lg, borderRadius: RADIUS.md, borderWidth: 1, gap: SPACING.md },
  iconWrap: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  cardText: { fontSize: FONT.size.sm, lineHeight: 20 },
  action: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm,
    height: 52, borderRadius: RADIUS.pill,
  },
  actionText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  msg: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1,
  },
  msgText: { flex: 1, fontSize: FONT.size.sm, lineHeight: 18 },
  driveCard: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1,
  },
  driveTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold },
  driveSub: { fontSize: FONT.size.sm, marginTop: 2, lineHeight: 18 },
  driveBtn: { paddingHorizontal: SPACING.md, height: 36, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
});
