import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform, Modal, FlatList, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONT } from "@/src/theme/themes";
import { createBackupMetadata, restoreBackup, restoreBackupMetadata, restoreSelectedBackup, inspectBackupLists, BackupPayload, isKizilkanBackup, type BackupScope, type BackupListEntry } from "@/src/utils/backup";
import { exportFullBackupV3, restoreFullBackupV3, previewFullBackupV3, isFullBackupV3Name } from "@/src/utils/backupV3";
import { authenticateGoogleDrive, uploadJsonToDrive, isGoogleDriveConfigured } from "@/src/utils/googleDrive";
import { useProfiles } from "@/src/store/ProfileContext";
import { usePlaylists } from "@/src/store/PlaylistContext";
import { FocusButton } from "@/src/components/FocusButton";
import { KizilkanNativeCore } from '@/modules/kizilkan-native-core';
import { encryptBackupFile, decryptBackupFile, isEncryptedBackupName, removeTemporaryBackup, cleanupExpiredBackupExports } from '@/src/utils/encryptedBackup';

type ImportPreview = { asset: { uri: string; name?: string }; fullV3: boolean; payload: BackupPayload; lists: BackupListEntry[] };

export default function BackupScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { profiles, activeProfile } = useProfiles();
  const { beginExternalRestore, reloadAfterRestore } = usePlaylists();
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [scope, setScope] = useState<BackupScope>("quick");
  const [progress, setProgress] = useState("");
  const exportAbortRef = React.useRef<AbortController | null>(null);
  const importAbortRef = React.useRef<AbortController | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importMode, setImportMode] = useState<'all' | 'selected'>('all');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [targetProfileId, setTargetProfileId] = useState(activeProfile.id);
  const [filter, setFilter] = useState('');
  const encryptionAvailable = Platform.OS === 'android' && KizilkanNativeCore.available;
  const [encryptedExport, setEncryptedExport] = useState(Platform.OS === 'android');
  const [exportPassword, setExportPassword] = useState('');
  const [encryptedAsset, setEncryptedAsset] = useState<{ uri: string; name?: string } | null>(null);
  const [importPassword, setImportPassword] = useState('');
  const mountedRef = React.useRef(true);
  const operationRef = React.useRef(0);
  const busyRef = React.useRef(false);
  const previewRef = React.useRef(preview); previewRef.current = preview;
  const profileRef = React.useRef(activeProfile.id); profileRef.current = activeProfile.id;
  const temporaryUrisRef = React.useRef(new Set<string>());
  const importUrisRef = React.useRef(new Set<string>());
  const selectedSet = React.useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const visibleLists = React.useMemo(() => (preview?.lists || []).filter(item => `${item.name} ${item.profileName} ${item.source}`.toLocaleLowerCase('tr-TR').includes(filter.toLocaleLowerCase('tr-TR'))), [preview, filter]);
  const selectedCount = importMode === 'all' ? preview?.lists.length || 0 : selectedKeys.length;
  const trackTemporary = (uri: string, importing = false) => { temporaryUrisRef.current.add(uri); if (importing) importUrisRef.current.add(uri); return uri; };
  const cleanTemporary = async (uris: Iterable<string>) => {
    const files = Array.from(uris), results = await Promise.allSettled(files.map(removeTemporaryBackup));
    results.forEach((result, index) => { if (result.status === 'fulfilled') { temporaryUrisRef.current.delete(files[index]); importUrisRef.current.delete(files[index]); } });
    return results.filter(result => result.status === 'rejected').length;
  };
  const clearImport = async () => {
    previewRef.current = null;
    if (mountedRef.current) { setPreview(null); setEncryptedAsset(null); setImportPassword(''); setFilter(''); }
    if (await cleanTemporary(importUrisRef.current)) {
      if (mountedRef.current) setMsg({ type: 'err', text: 'Geçici yedek dosyalarının bir kısmı temizlenemedi. Uygulamanın önbelleğini temizleyin.' });
    }
  };
  const closePreview = () => { if (!busyRef.current) void clearImport(); };
  const beginOperation = (kind: 'export' | 'import') => {
    if (!mountedRef.current || busyRef.current) return null;
    busyRef.current = true; const token = ++operationRef.current; const abort = new AbortController();
    if (kind === 'export') exportAbortRef.current = abort; else importAbortRef.current = abort;
    setBusy(kind); setMsg(null); setProgress(''); return { token, abort };
  };
  const owns = (token: number) => mountedRef.current && operationRef.current === token;
  const checkOwned = (token: number, signal: AbortSignal) => { if (!owns(token) || signal.aborted) throw new Error('Yedek işlemi durduruldu.'); };
  const finishOperation = (token: number) => {
    if (!owns(token)) return;
    exportAbortRef.current = null; importAbortRef.current = null; busyRef.current = false;
    setBusy(null); setProgress('');
  };
  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; operationRef.current += 1; exportAbortRef.current?.abort(); importAbortRef.current?.abort(); void cleanTemporary(temporaryUrisRef.current); };
  }, []);

  const doExport = async () => {
    const work = beginOperation('export'); if (!work) return;
    const { token, abort } = work; const files = new Set<string>();
    const shareFile = async (uri: string, mimeType: string, dialogTitle: string) => {
      // Android chooser completion does not mean a receiver finished reading.
      files.delete(uri); temporaryUrisRef.current.delete(uri);
      try { await Sharing.shareAsync(uri, { mimeType, dialogTitle }); }
      catch (error) { files.add(trackTemporary(uri)); throw error; }
    };
    try {
      await cleanupExpiredBackupExports(abort.signal); checkOwned(token, abort.signal);
      if (encryptedExport && !encryptionAvailable) throw new Error('Şifreli yedek için Android Native Core gerekli. Şifresiz yedek için ilgili seçeneği açıkça seçin.');
      if (encryptedExport && exportPassword.length < 8) throw new Error('Yedek parolası en az 8 karakter olmalı.');
      if (scope === "full" && Platform.OS !== "web") {
        const result = await exportFullBackupV3({
          signal: abort.signal,
          onProgress: p => { if (owns(token)) setProgress(p.message); },
        });
        files.add(trackTemporary(result.uri)); checkOwned(token, abort.signal);
        const uri = encryptedExport ? await encryptBackupFile(result.uri, exportPassword, abort.signal) : result.uri;
        files.add(trackTemporary(uri)); checkOwned(token, abort.signal);
        if (encryptedExport && await cleanTemporary([result.uri])) throw new Error('Şifreleme tamamlandı, ancak açık yedek kaynağı temizlenemedi.');
        const canShare = await Sharing.isAvailableAsync();
        checkOwned(token, abort.signal);
        if (!canShare) throw new Error("Bu cihazda dosya paylaşımı kullanılamıyor.");
        await shareFile(uri, encryptedExport ? 'application/octet-stream' : "application/x-ndjson", "KIZILKAN PLAYER ELITE Tam Yedeğini Paylaş");
        checkOwned(token, abort.signal);
        setMsg({ type:"ok", text:`${encryptedExport ? 'Şifreli tam' : 'Tam'} yedek hazır: ${result.playlists} playlist · ${result.items} medya kaydı · ${(result.bytes/1024/1024).toFixed(1)} MB.` });
        return;
      }
      const effectiveScope: BackupScope = scope === "full" ? "quick" : scope;
      const payload = await createBackupMetadata(effectiveScope);
      checkOwned(token, abort.signal);
      const json = JSON.stringify(payload);
      const label = effectiveScope === "personal" ? "personal" : "quick";
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(json);
        checkOwned(token, abort.signal);
        setMsg({ type:"ok", text:`${effectiveScope === "personal" ? "Kişisel" : "Hızlı"} yedek panoya kopyalandı (${Math.round(json.length/1024)} KB).` });
      } else {
        if (!FileSystem.cacheDirectory) throw new Error('Geçici yedek klasörü kullanılamıyor.');
        const plainUri = trackTemporary(`${FileSystem.cacheDirectory}kizilkan-player-elite-export-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`); files.add(plainUri);
        await FileSystem.writeAsStringAsync(plainUri, json); checkOwned(token, abort.signal);
        const uri = encryptedExport ? await encryptBackupFile(plainUri, exportPassword, abort.signal) : plainUri;
        files.add(trackTemporary(uri)); checkOwned(token, abort.signal);
        if (encryptedExport && await cleanTemporary([plainUri])) throw new Error('Şifreleme tamamlandı, ancak açık yedek kaynağı temizlenemedi.');
        if (await Sharing.isAvailableAsync()) {
          checkOwned(token, abort.signal);
          await shareFile(uri, encryptedExport ? 'application/octet-stream' : "application/json", "KIZILKAN PLAYER ELITE Yedeğini Paylaş");
          checkOwned(token, abort.signal);
          setMsg({ type:"ok", text:`${encryptedExport ? 'Şifreli yedek' : 'Yedek'} hazır: ${payload.summary?.playlists || 0} playlist tanımı · ${payload.summary?.profiles || 0} profil.` });
        } else {
          checkOwned(token, abort.signal);
          if (encryptedExport) throw new Error('Bu cihazda şifreli dosyayı paylaşma kullanılamıyor.');
          await Clipboard.setStringAsync(json); checkOwned(token, abort.signal); setMsg({type:"ok", text:"Paylaşım kullanılamıyor; küçük yedek panoya kopyalandı."});
        }
      }
    } catch (e:any) {
      if (owns(token)) setMsg({ type:"err", text:"Yedek oluşturulamadı: " + (e?.message || e) });
    } finally { const failed = await cleanTemporary(files); if (owns(token)) { setExportPassword(''); if (failed) setMsg({ type: 'err', text: 'Geçici yedek dosyaları temizlenemedi. Uygulamanın önbelleğini temizleyin.' }); } finishOperation(token); }
  };

  const preparePreview = async (asset: { uri: string; name?: string }, fullV3: boolean, token: number, abort: AbortController) => {
    let payload: BackupPayload;
    if (fullV3) payload = await previewFullBackupV3(asset);
    else {
      const response = await fetch(asset.uri, { signal: abort.signal }); const text = await response.text();
      try { payload = JSON.parse(text); } catch { throw new Error('Geçersiz JSON dosyası'); }
    }
    checkOwned(token, abort.signal);
    if (!isKizilkanBackup(payload)) throw new Error("Bu bir KIZILKAN PLAYER ELITE yedek dosyası değil");
    const lists = inspectBackupLists(payload), next = { asset, fullV3, payload, lists };
    previewRef.current = next; setPreview(next); setEncryptedAsset(null); setImportPassword('');
    setSelectedKeys(lists.map(item => item.key)); setImportMode('all'); setTargetProfileId(profileRef.current); setFilter('');
  };
  const doImport = async () => {
    const work = beginOperation('import'); if (!work) return;
    const { token, abort } = work;
    try {
      await clearImport(); checkOwned(token, abort.signal);
      const res = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      trackTemporary(asset.uri, true); checkOwned(token, abort.signal);
      if (isEncryptedBackupName(asset.name)) {
        if (!encryptionAvailable) throw new Error('Şifreli yedek açmak için Android Native Core gerekli.');
        setEncryptedAsset(asset); return;
      }
      await preparePreview(asset, isFullBackupV3Name(asset.name), token, abort);
    } catch (e:any) { await clearImport(); if (owns(token)) setMsg({type:"err", text:e?.message || "Yedek yüklenemedi"}); }
    finally { finishOperation(token); }
  };
  const unlockEncryptedImport = async () => {
    if (!encryptedAsset) return;
    const asset = encryptedAsset, work = beginOperation('import'); if (!work) return;
    const { token, abort } = work;
    let plainUri: string | undefined;
    try {
      setProgress('Şifreli yedek doğrulanıyor');
      const decrypted = await decryptBackupFile(asset.uri, importPassword, abort.signal);
      plainUri = trackTemporary(decrypted.uri, true); checkOwned(token, abort.signal);
      await preparePreview({ uri: decrypted.uri, name: asset.name }, decrypted.fullV3, token, abort);
    } catch (error: any) { if (plainUri) await cleanTemporary([plainUri]); if (owns(token)) { setImportPassword(''); setMsg({ type: 'err', text: error?.message || 'Şifreli yedek açılamadı.' }); } }
    finally { finishOperation(token); }
  };

  const applySelection = async () => {
    if (!preview || !selectedCount) return;
    const incoming = preview, authorizedProfileId = activeProfile.id;
    const work = beginOperation('import'); if (!work) return;
    const { token, abort } = work; setProgress('Seçilen listeler hazırlanıyor');
    let release: (() => void) | undefined;
    let restoreStarted = false;
    try {
      release = await beginExternalRestore();
      restoreStarted = true;
      checkOwned(token, abort.signal);
      if (profileRef.current !== authorizedProfileId) throw new Error('İşlem sırasında profil değişti. Yedeği yeniden seçin.');
      const keys = importMode === 'all' ? incoming.lists.map(item => item.key) : selectedKeys;
      const onProgress = (text: string) => { if (owns(token)) setProgress(text); };
      const result = incoming.fullV3
        ? await restoreFullBackupV3(incoming.asset, { selectedKeys: keys, targetProfileId, authorizedProfileId, signal: abort.signal, onProgress: p => onProgress(p.message) })
        : await restoreSelectedBackup(incoming.payload, { selectedKeys: keys, targetProfileId, authorizedProfileId, signal: abort.signal, onProgress });
      checkOwned(token, abort.signal);
      setMsg({ type: 'ok', text: `${result.playlists} liste ve ${result.heavyPlaylists} katalog geri yüklendi. Mevcut listeleriniz, profilleriniz ve ayarlarınız korundu.${result.warnings.length ? '\n\n' + result.warnings.join('\n') : ''}` });
    } catch (error: any) { if (owns(token)) setMsg({ type: 'err', text: error?.message || 'Seçilen listeler geri yüklenemedi.' }); }
    finally {
      release?.();
      // Recovery may keep an already-finalized native commit even when cleanup
      // throws. Reload after both success and error so providers match storage.
      if (restoreStarted) try { await reloadAfterRestore(); } catch (error: any) { if (owns(token)) setMsg({ type: 'err', text: error?.message || 'Geri yüklenen bilgiler ekrana alınamadı; uygulamayı yeniden açın.' }); }
      await clearImport(); finishOperation(token);
    }
  };

  // Explicit separate action retains full-profile/settings restore for personal and older backups.
  const applyDeviceBackup = () => {
    if (!preview || busyRef.current) return;
    const incoming = preview, requestedProfile = activeProfile.id;
    Alert.alert('Profil ve ayar yedeğini geri yükle', 'Bu işlem yedekteki profilleri ve ayarları yükler. Liste içeren yedeklerde mevcut liste düzeniniz yedekteki düzenle değiştirilir. Mevcut listeleri korumak için liste seçimini kullanın.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Yedeği uygula', onPress: async () => {
        if (previewRef.current !== incoming || profileRef.current !== requestedProfile) return;
        const work = beginOperation('import'); if (!work) return;
        const { token, abort } = work; let release: (() => void) | undefined;
        let restoreStarted = false;
        try {
          release = await beginExternalRestore();
          restoreStarted = true;
          checkOwned(token, abort.signal);
          if (profileRef.current !== requestedProfile) throw new Error('İşlem sırasında profil değişti. Yedeği yeniden seçin.');
          const result = incoming.fullV3 ? await restoreFullBackupV3(incoming.asset, { signal: abort.signal, onProgress: p => { if (owns(token)) setProgress(p.message); } })
            : String(incoming.payload.version || '').startsWith('2.1') || String(incoming.payload.version || '').includes('meta') ? await restoreBackupMetadata(incoming.payload, { signal: abort.signal }) : await restoreBackup(incoming.payload, { signal: abort.signal });
          checkOwned(token, abort.signal);
          setMsg({ type: 'ok', text: `Yedek uygulandı: ${result.profiles} profil · ${result.playlists} liste.${result.warnings.length ? '\n\n' + result.warnings.join('\n') : ''}` });
        } catch (error: any) { if (owns(token)) setMsg({ type: 'err', text: error?.message || 'Yedek uygulanamadı.' }); }
        finally {
          release?.();
          if (restoreStarted) try { await reloadAfterRestore(); } catch (error: any) { if (owns(token)) setMsg({ type: 'err', text: error?.message || 'Geri yüklenen bilgiler ekrana alınamadı; uygulamayı yeniden açın.' }); }
          await clearImport(); finishOperation(token);
        }
      } },
    ]);
  };

  const doDriveExport = async () => {
    const work = beginOperation('export'); if (!work) return;
    const { token, abort } = work;
    try {
      if (encryptedExport) throw new Error('Şifreli dosyaları Drive ekranından yükleme henüz desteklenmiyor. .kzbe dosyasını Paylaş ile Drive’a gönderin veya şifresiz yedeği açıkça seçin.');
      const auth = await authenticateGoogleDrive(); checkOwned(token, abort.signal);
      const payload = await createBackupMetadata('quick'); checkOwned(token, abort.signal);
      const fileName = `kizilkan-player-elite-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const uploaded = await uploadJsonToDrive(auth.accessToken, fileName, JSON.stringify(payload), abort.signal);
      checkOwned(token, abort.signal); setMsg({ type: 'ok', text: `Drive'a yüklendi: ${uploaded.name}` });
    } catch (error: any) { if (owns(token)) setMsg({ type: 'err', text: error?.message || 'Drive yüklemesi başarısız.' }); }
    finally { finishOperation(token); }
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
            Hızlı yedek hesap ve liste tanımlarını, kişisel yedek profil, favori ve ayarları saklar. Tam yedek kanal, film ve dizi kataloglarını da içerir.
          </Text>
          <View style={styles.scopeRow}>
            {([['quick','Hızlı'],['personal','Kişisel'],['full','Tam']] as const).map(([k,label]) => (
              <TouchableOpacity key={k} testID={`backup-scope-${k}`} disabled={busy!==null} onPress={()=>setScope(k)} style={[styles.scopeBtn,{borderColor:scope===k?colors.brandPrimary:colors.border,backgroundColor:scope===k?colors.brandPrimary+'22':colors.surface}]}>
                <Text style={{color:scope===k?colors.brandPrimary:colors.onSurface,fontWeight:FONT.weight.bold}}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.scopeRow}>
            <FocusButton testID="backup-encryption-on" disabled={!!busy || !encryptionAvailable} onPress={() => setEncryptedExport(true)} style={[styles.scopeBtn, { borderColor: encryptedExport ? colors.brandPrimary : colors.border }]}><Text style={{ color: colors.onSurface }}>Şifreli .kzbe</Text></FocusButton>
            <FocusButton testID="backup-encryption-off" disabled={!!busy} onPress={() => { setEncryptedExport(false); setExportPassword(''); }} style={[styles.scopeBtn, { borderColor: !encryptedExport ? colors.brandPrimary : colors.border }]}><Text style={{ color: colors.onSurface }}>Şifresiz yedek</Text></FocusButton>
          </View>
          {encryptedExport ? <>
            <Text style={[styles.cardText, { color: colors.onSurfaceSecondary }]}>{encryptionAvailable ? 'Yedeği açmak için bu parola gerekir. Parolanızı güvenli bir yerde saklayın.' : 'Şifreli yedek için Android Native Core gerekli. Şifresiz dışa aktarmak için seçeneği açıkça değiştirin.'}</Text>
            <TextInput testID="backup-export-password" value={exportPassword} onChangeText={setExportPassword} editable={!busy && encryptionAvailable} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={1024} placeholder="Yedek parolası (en az 8 karakter)" placeholderTextColor={colors.onSurfaceTertiary} style={[styles.filterInput, { color: colors.onSurface, backgroundColor: colors.surface, borderColor: colors.border }]} />
          </> : <Text style={[styles.cardText, { color: colors.onSurfaceSecondary }]}>Şifresiz dosyada hesap bilgileri okunabilir. Dosyayı yalnız güvendiğiniz yere kaydedin.</Text>}
          {!!progress && <Text style={[styles.cardText,{color:colors.brandPrimary}]}>{progress}</Text>}
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
          {busy === "export" && (
            <TouchableOpacity testID="backup-cancel-btn" onPress={()=>exportAbortRef.current?.abort()} style={[styles.action,{borderWidth:1,borderColor:colors.error}]}>
              <Text style={[styles.actionText,{color:colors.error}]}>Yedeklemeyi Durdur</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: colors.brandPrimary + "22", borderColor: colors.brandPrimary }]}>
            <Ionicons name="cloud-download-outline" size={28} color={colors.brandPrimary} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Yedek Yükle</Text>
          <Text style={[styles.cardText, { color: colors.onSurfaceSecondary }]}>
            JSON, tam .kzb veya şifreli .kzbe yedeğini seçin; listeleri önce görün, ardından hepsini veya seçtiklerinizi yükleyin. Şifreli yedeğin parolası dosyayı açarken istenir.
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
          {busy === 'import' && !preview && !encryptedAsset && <FocusButton testID="backup-import-cancel" onPress={() => importAbortRef.current?.abort()} style={styles.action}><Text style={{ color: colors.error }}>Yüklemeyi durdur</Text></FocusButton>}
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
              {encryptedExport ? 'Şifreli .kzbe dosyasını Dışa Aktar ve Paylaş ile Drive’a gönderin. Buradan doğrudan yükleme şifresiz yedek seçilince kullanılabilir.' : isGoogleDriveConfigured()
                ? "Hızlı (katalogsuz) yedeği doğrudan Google Drive'ınıza yükleyin."
                : "Aktif etmek için Publish sonrası Deployment → Secrets bölümüne EXPO_PUBLIC_GOOGLE_CLIENT_ID ekleyin."}
            </Text>
          </View>
          <TouchableOpacity
            testID="drive-upload-btn"
            disabled={busy !== null || encryptedExport}
            onPress={doDriveExport}
            style={[styles.driveBtn, { backgroundColor: colors.brandPrimary, opacity: busy || encryptedExport ? 0.5 : 1 }]}
          >
            <Text style={{ color: colors.onBrandPrimary, fontSize: FONT.size.sm, fontWeight: FONT.weight.bold }}>Yükle</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <Modal visible={!!encryptedAsset} animationType="slide" onRequestClose={closePreview}>
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]}>
          <View style={styles.header}><FocusButton testID="backup-password-close" disabled={!!busy} onPress={closePreview} style={{ padding: SPACING.sm }}><Ionicons name="close" size={26} color={colors.onSurface} /></FocusButton><Text style={[styles.title, { color: colors.onSurface }]}>Şifreli Yedeği Aç</Text></View>
          <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
            <Text style={[styles.cardText, { color: colors.onSurfaceSecondary }]}>{encryptedAsset?.name || 'Şifreli .kzbe dosyası'}</Text>
            <TextInput testID="backup-import-password" value={importPassword} onChangeText={setImportPassword} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={1024} placeholder="Yedek parolası" placeholderTextColor={colors.onSurfaceTertiary} style={[styles.filterInput, { color: colors.onSurface, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]} />
            {!!progress && <Text style={[styles.cardText, { color: colors.brandPrimary }]}>{progress}</Text>}
            {!!msg && <Text style={[styles.cardText, { color: msg.type === 'err' ? colors.error : colors.success }]}>{msg.text}</Text>}
            <FocusButton testID="backup-unlock-encrypted" disabled={!!busy || importPassword.length < 8} onPress={unlockEncryptedImport} style={[styles.action, { backgroundColor: colors.brandPrimary, opacity: busy || importPassword.length < 8 ? 0.5 : 1 }]}>{busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={[styles.actionText, { color: colors.onBrandPrimary }]}>Doğrula ve Listeleri Göster</Text>}</FocusButton>
            {busy === 'import' && <FocusButton testID="backup-decrypt-cancel" onPress={() => importAbortRef.current?.abort()} style={styles.action}><Text style={{ color: colors.error }}>İşlemi durdur</Text></FocusButton>}
          </View>
        </SafeAreaView>
      </Modal>
      <Modal visible={!!preview} animationType="slide" onRequestClose={closePreview}>
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <FocusButton testID="backup-preview-close" onPress={closePreview} disabled={busy === 'import'} style={{ padding: SPACING.sm }}><Ionicons name="close" size={26} color={colors.onSurface} /></FocusButton>
            <Text style={[styles.title, { color: colors.onSurface }]}>Yedekten Liste Yükle</Text>
          </View>
          <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.sm }}>
            <Text style={[styles.cardText, { color: colors.onSurfaceSecondary }]}>{preview?.asset.name || 'Yedek dosyası'} · {preview?.lists.length || 0} liste</Text>
            {!!preview?.lists.length && <>
              <View style={styles.scopeRow}>{([['all', 'Hepsini yükle'], ['selected', 'Seçtiklerimi yükle']] as const).map(([mode, label]) => <FocusButton testID={`backup-import-${mode}`} key={mode} disabled={!!busy} onPress={() => setImportMode(mode)} style={[styles.scopeBtn, { borderColor: importMode === mode ? colors.brandPrimary : colors.border, backgroundColor: importMode === mode ? colors.brandPrimary + '22' : colors.surface }]}><Text style={{ color: colors.onSurface }}>{label}</Text></FocusButton>)}</View>
              <Text style={[styles.cardText, { color: colors.onSurfaceSecondary }]}>Yüklenecek profil</Text>
              <ScrollView horizontal contentContainerStyle={{ gap: SPACING.sm }}>{profiles.map(profile => <FocusButton testID={`backup-target-${profile.id}`} key={profile.id} disabled={!!busy || (!!profile.hasPin && profile.id !== activeProfile.id)} onPress={() => setTargetProfileId(profile.id)} style={[styles.scopeBtn, { borderColor: targetProfileId === profile.id ? colors.brandPrimary : colors.border, opacity: profile.hasPin && profile.id !== activeProfile.id ? 0.4 : 1 }]}><Text style={{ color: colors.onSurface }}>{profile.name}</Text></FocusButton>)}</ScrollView>
              <Text style={[styles.cardText, { color: colors.onSurfaceSecondary }]}>PIN ile korunan başka bir profile yüklemek için önce o profile giriş yapın.</Text>
              <TextInput value={filter} onChangeText={setFilter} editable={!busy} placeholder="Yedekte liste ara" placeholderTextColor={colors.onSurfaceTertiary} style={[styles.filterInput, { color: colors.onSurface, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]} />
              {importMode === 'selected' && <View style={styles.scopeRow}>
                <FocusButton disabled={!!busy} testID="backup-select-all" onPress={() => setSelectedKeys(preview!.lists.map(item => item.key))} style={styles.scopeBtn}><Text style={{ color: colors.brandPrimary }}>Tümünü seç</Text></FocusButton>
                <FocusButton disabled={!!busy} testID="backup-select-none" onPress={() => setSelectedKeys([])} style={styles.scopeBtn}><Text style={{ color: colors.brandPrimary }}>Seçimi kaldır</Text></FocusButton>
              </View>}
            </>}
          </View>
          <FlatList data={visibleLists} keyExtractor={item => item.key} contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.sm }}
            ListEmptyComponent={<Text style={[styles.cardText, { color: colors.onSurfaceSecondary }]}>{preview?.lists.length ? 'Aramaya uygun liste yok.' : 'Bu kişisel yedekte playlist bulunmuyor. Profil ve ayar yedeği aşağıdaki ayrı seçenekle yüklenebilir.'}</Text>}
            renderItem={({ item }) => {
              const checked = importMode === 'all' || selectedSet.has(item.key);
              return <FocusButton focusKey={`backup-list:${item.key}`} accessibilityRole="checkbox" accessibilityState={{ checked, disabled: !!busy }} disabled={!!busy} onPress={() => { setImportMode('selected'); setSelectedKeys(prev => prev.includes(item.key) ? prev.filter(key => key !== item.key) : [...prev, item.key]); }} style={[styles.listRow, { borderColor: checked ? colors.brandPrimary : colors.border, backgroundColor: colors.surfaceSecondary }]}>
                <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? colors.brandPrimary : colors.onSurfaceSecondary} />
                <View style={{ flex: 1 }}><Text style={{ color: colors.onSurface, fontWeight: FONT.weight.bold }}>{item.name}</Text><Text style={[styles.cardText, { color: colors.onSurfaceSecondary }]}>{item.profileName} · {item.source} · {item.channels} canlı / {item.vod} film / {item.series} dizi</Text></View>
              </FocusButton>;
            }} />
          <View style={{ padding: SPACING.lg, gap: SPACING.sm }}>
            {!!progress && <Text style={[styles.cardText, { color: colors.brandPrimary }]}>{progress}</Text>}
            {!!msg && <Text style={[styles.cardText, { color: msg.type === 'err' ? colors.error : colors.success }]}>{msg.text}</Text>}
            {!!preview?.lists.length && <FocusButton testID="backup-apply-selected" disabled={!!busy || !selectedCount} onPress={applySelection} style={[styles.action, { backgroundColor: colors.brandPrimary, opacity: busy || !selectedCount ? 0.5 : 1 }]}>{busy === 'import' ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={[styles.actionText, { color: colors.onBrandPrimary }]}>{selectedCount} listeyi yükle</Text>}</FocusButton>}
            {busy === 'import' && importAbortRef.current && <FocusButton onPress={() => importAbortRef.current?.abort()} style={styles.action}><Text style={{ color: colors.error }}>Geri yüklemeyi durdur</Text></FocusButton>}
            <FocusButton testID="backup-apply-device" disabled={!!busy} onPress={applyDeviceBackup} style={[styles.action, { borderWidth: 1, borderColor: colors.border }]}><Text style={{ color: colors.onSurfaceSecondary }}>Profil ve ayar yedeğini ayrıca uygula</Text></FocusButton>
          </View>
        </SafeAreaView>
      </Modal>
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
  scopeRow: { flexDirection:"row", gap:SPACING.sm, flexWrap:"wrap" },
  scopeBtn: { paddingHorizontal:SPACING.md, height:40, borderRadius:RADIUS.pill, borderWidth:1, alignItems:"center", justifyContent:"center" },
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
  filterInput: { height: 44, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, minHeight: 76 },
});
