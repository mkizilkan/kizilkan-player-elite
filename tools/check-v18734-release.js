#!/usr/bin/env node
/**
 * v18.7.34 — Yapışık ekran öğeleri + ANR ölçüm düzeltmesi + çıkış telemetrisi.
 *
 * CİHAZ KANITI (13.10.2026, OnePlus 7 Pro, 18.7.33 kurulu, uçuş kaydı
 * kizilkan-diagnostics-2026-10-13T07-46-47):
 *  - Bomboş "Oynatma Listesi Ekle" ekranında kırmızı "Yarım kalan görüntü
 *    testlerini devam ettir" bandı duruyordu; buton HİÇBİR koşula bağlı
 *    değildi (kardeşi `catalogRecoveryCount>0` ile korunuyordu).
 *  - Aynı ekranda "Emniyet TXT hazırlanıyor · DB: 0 sonuç" yazısı yapışıktı;
 *    durum yalnız set ediliyor, hiç temizlenmiyordu.
 *  - autoSummary `anrOnPlan: 265` diyordu; kayıtların lag'leri 77 sn ile 43 DK
 *    arasındaydı ve yığınların tepesinde uygulama kodu değil looper/OEM izleme
 *    çerçeveleri vardı. Gerçek ön plan bloğu TEK taneydi (4346 ms).
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

// --- Beş sürüm alanı (ileri uyumlu: sabit sürüm yazılmaz) ---
const app = JSON.parse(rd('frontend/app.json'));
const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180734, `expo.version (${ver}) >= 18.7.34 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code
  && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// --- 1) Yapışık bant: her İKİ kod yolunda da gerçek sayıya bağlı olmalı ---
const addPlaylist = rd('frontend/app/add-playlist.tsx');
const magBulk = rd('frontend/app/mag-bulk.tsx');
for (const [file, src] of [['add-playlist.tsx', addPlaylist], ['mag-bulk.tsx', magBulk]]) {
  need(/playbackRecoveryCount>0 && <FocusButton/.test(src),
    `${file}: görüntü testi bandı hâlâ koşulsuz çiziliyor`);
  need(/const \[playbackRecoveryCount,setPlaybackRecoveryCount\]/.test(src),
    `${file}: playbackRecoveryCount durumu yok`);
  need(/refreshPlaybackRecovery/.test(src),
    `${file}: bekleyen test sayısı yenileyicisi yok (iş bitince bant kaybolmaz)`);
  need(!/>Yarım kalan görüntü testlerini devam ettir</.test(src),
    `${file}: eski koşulsuz bant metni hâlâ duruyor`);
}

// --- 2) Yapışık "Emniyet TXT hazırlanıyor" ---
need(/if \(!backup\) setScanSafetyStatus\(""\)/.test(addPlaylist),
  'add-playlist.tsx: safetyBackup yokken durum temizlenmiyor (metin yapışık kalır)');
need(/else if \(!scanTerminal\) setScanSafetyStatus\(`Emniyet TXT hazırlanıyor/.test(addPlaylist),
  'add-playlist.tsx: "hazırlanıyor" yalnız tarama sürerken gösterilmiyor');
need(/BULK_TXT_EXPORT_INDETERMINATE/.test(addPlaylist),
  'add-playlist.tsx: terminal+belirsiz emniyet TXT durumu telemetriye yazılmıyor');
need(/setSafetyStatus\(''\);/.test(magBulk),
  'mag-bulk.tsx: yeni tarama başlarken eski emniyet TXT metni temizlenmiyor');

// --- 3) ANR ölçümü: donmuş süreç ile ana-thread bloğu ayrımı ---
const blackbox = rd('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeBlackBox.kt');
need(/lastWatchdogTickUptime/.test(blackbox), 'NativeBlackBox: bekçinin kendi tik anı ölçülmüyor');
need(/val watchdogLate =/.test(blackbox), 'NativeBlackBox: watchdogLate hesaplanmıyor');
need(/val processFrozen =/.test(blackbox), 'NativeBlackBox: processFrozen kararı yok');
need(/\.put\("watchdogLateMs", watchdogLate\)/.test(blackbox), 'NativeBlackBox: watchdogLateMs yüke yazılmıyor');
need(/\.put\("processFrozen", processFrozen\)/.test(blackbox), 'NativeBlackBox: processFrozen yüke yazılmıyor');
need(/if \(!processFrozen\) writeCriticalSync/.test(blackbox),
  'NativeBlackBox: dondurulmuş kayıt hâlâ kritik dosyayı dolduruyor (gerçek kayıtları dışarı iter)');
need(/critical = !processFrozen/.test(blackbox), 'NativeBlackBox: dondurulmuş kayıt hâlâ critical işaretli');
// Uydurma süre eşiği KULLANILMAMALI — ölçüt iki thread'in göreli gecikmesidir.
need(!/lagUptime >= 30000|lagUptime > 60000/.test(blackbox), 'NativeBlackBox: keyfi süre eşiği eklenmiş');

const diagnostics = rd('frontend/src/utils/diagnostics.ts');
need(/function anrLooksFrozen/.test(diagnostics), 'diagnostics.ts: donmuş süreç ayrımı yok');
need(/typeof data\?\.processFrozen === "boolean"/.test(diagnostics),
  'diagnostics.ts: native processFrozen ölçümü tercih edilmiyor');
need(/anrDonmusSurec_yanlisPozitif/.test(diagnostics), 'diagnostics.ts: donmuş süreç sayacı yayınlanmıyor');
need(/anrOlcumGuvenilir/.test(diagnostics), 'diagnostics.ts: ölçüm güvenilirlik bayrağı yok');
need(/anrToplamKayit/.test(diagnostics), 'diagnostics.ts: toplam kayıt sayacı yok (bilgi gizlenmemeli)');
need(!/if \(e\?\.data\?\._fg === false\) anrBg\+\+; else anrFg\+\+;/.test(diagnostics),
  'diagnostics.ts: eski iki-kovalı yanlış sınıflandırma hâlâ duruyor');

// --- 5) Çıkış telemetrisi (düzeltme değil, kanıt toplama) ---
need(/ADD_PLAYLIST_EXIT_IGNORED/.test(addPlaylist),
  'add-playlist.tsx: yok sayılan çıkış denemesi kaydedilmiyor');
need(/leavingSinceRef/.test(addPlaylist) && /leavingReasonRef/.test(addPlaylist),
  'add-playlist.tsx: leavingRef bayrağının ne zaman/neden kalktığı işaretlenmiyor');
need(/teardownMs: Date\.now\(\) - startedAt/.test(addPlaylist),
  'add-playlist.tsx: çıkış süresi ölçülmüyor');
need(/forceExit\('hardware-back'\)/.test(addPlaylist),
  'add-playlist.tsx: geri tuşu tetikleyicisi etiketlenmiyor');
// forceExit artık parametre alıyor; Modal/onExit'e ÇIPLAK verilirse TS kırılır.
need(!/onRequestClose=\{forceExit\}/.test(addPlaylist) && !/onExit=\{forceExit\}/.test(addPlaylist),
  'add-playlist.tsx: forceExit bir olay işleyicisine çıplak bağlanmış');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.34 yapışık bant/TXT metni + ANR donmuş-süreç ayrımı + çıkış telemetrisi TEMİZ');
