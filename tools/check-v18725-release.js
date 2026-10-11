#!/usr/bin/env node
/**
 * v18.7.25 — Combo tarama TS düzeltmeleri (B+C+A+E-MAG; native YOK):
 *  B) Görüntü testi hızı: paralellik 6→20, timeout 15→10 sn, ön plan keep-alive sargısı (arka planda throttle olmaz).
 *  C) Paralellik UI birleştirme: "Paralel analiz sayısı" ve "İstenen paralellik" TEK değer (comboParallelText); bulkRequestedConcurrency kaldırıldı.
 *  A) TXT UX: kayıttan sonra "Son kaydedilen: <ad> · N kayıt" net gösterilir (eski dosyayla karışmasın).
 *  E-MAG) MAC tarama emniyet sibobu: bulunanlar düzenli olarak görünür klasöre yedek TXT'ye yazılır (app ölse de kayıp yok).
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const addPl = rd('frontend/app/add-playlist.tsx');
const magBulk = rd('frontend/app/mag-bulk.tsx');
const app = JSON.parse(rd('frontend/app.json'));

const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180725, `expo.version (${ver}) >= 18.7.25 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// B — görüntü testi hızı
need(/const CONC = 20/.test(addPl), 'B: içerik testi paralelliği 20 değil');
need(/per\.abort\(\), 30000\)/.test(addPl), 'B: içerik testi timeout 30 sn (hafif katalog probe dış bütçesi) değil');
need(/startForegroundKeepAlive\("Katalog testi"/.test(addPl) && /stopForegroundKeepAlive\(keepAliveOwner\); \} catch \{\}\s*\n\s*void recordDiagnostic\("scan", "BULK_CONTENT_TEST_DONE"/.test(addPl), 'B: içerik testi sahipli keep-alive sargısı yok');

// C — paralellik birleştirme
need(/Number\.parseInt\(comboParallelText, 10\) \|\| 32/.test(addPl), 'C: requestedCustom comboParallelText kullanmıyor');
need(!/setBulkRequestedConcurrency/.test(addPl), 'C: bulkRequestedConcurrency hâlâ var (birleştirilmedi)');
need(/testID="bulk-requested-concurrency-input"[\s\S]{0,80}value=\{comboParallelText\}/.test(addPl), 'C: İstenen paralellik comboParallelText\'e bağlı değil');

// A — TXT UX
need(/const \[lastSavedArchive, setLastSavedArchive\]/.test(addPl), 'A: lastSavedArchive state yok');
need(/setLastSavedArchive\(\{ name: fileName, count: records\.length \}\)/.test(addPl), 'A: kayıt başarısında set edilmiyor');
need(/Son kaydedilen:/.test(addPl), 'A: "Son kaydedilen" göstergesi yok');

// E-MAG — MAC emniyet sibobu
need(/const writeMagSafetyBackup = useCallback/.test(magBulk), 'E-MAG: writeMagSafetyBackup yok');
need(/allFoundRef/.test(magBulk) && /backupNameRef/.test(magBulk), 'E-MAG: yedek birikim ref\'leri yok');
const nativeBackup = rd('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanSafetyBackup.kt');
need(/flushResultArchive/.test(magBulk) && /Canlı Tarama Yedeği/.test(nativeBackup) && /uri:\$runId/.test(nativeBackup) && /contentEquals/.test(nativeBackup), 'E-MAG: tek native dosya / geri okuma doğrulaması yok');
  need(/allFoundRef\.current\s*=\s*mergeResults\(allFoundRef\.current\)/.test(magBulk) || /allFoundRef\.current\.push\(\.\.\.batch\)/.test(magBulk), 'E-MAG: bulunanlar biriktirilmiyor');
need(/await writeMagSafetyBackup\(archiveId\)/.test(magBulk), 'E-MAG: tarama bitişinde son yedek beklenmiyor');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.25 B görüntü testi hızı + C paralellik birleştirme + A TXT UX + E-MAG emniyet sibobu TEMİZ');
