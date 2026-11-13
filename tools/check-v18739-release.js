#!/usr/bin/env node
/**
 * v18.7.39 — "İkinci tur bir türlü bitmiyor" + bulunan-kutu örtülmesi + klavye.
 * CİHAZ KANITI (13.11.2026, canlı izleme): Çoklu hesap taramasında ilk tur çalışıyor ama
 * İKİNCİ TUR (drainDeferredProbes) sonsuza takılıyordu; ayrıca ilk hesap bulununca bloke
 * "Liste ekleniyor" perdesi "Bulunan Çoklu Hesaplar" kutusunun üstünü kaplıyordu.
 *
 * KOD KANITI (kök neden):
 *  - scanBackoffDeadline (ScanWorkCoordinator.kt) + host backoff (PanelScanService.kt) ÜST SINIRSIZDI →
 *    panel 429/503 + büyük Retry-After gönderince ikinci tur saatlerce erteleniyordu.
 *  - drainDeferredProbes'un duvar-saati bütçesi yoktu → süresiz.
 *  - Bloke loading modalı sonuç kutusu açıkken de gösteriliyordu.
 *  - edit-playlist klavye düzeltmesi (v18.7.38) tek başına scrollResponder... ile tutmadı.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

// --- Beş sürüm alanı (ileri uyumlu) ---
const app = JSON.parse(rd('frontend/app.json'));
const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180739, `expo.version (${ver}) >= 18.7.39 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code
  && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

const NAT = 'frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan';
const coord = rd(`${NAT}/ScanWorkCoordinator.kt`);
const svc = rd(`${NAT}/PanelScanService.kt`);
const journal = rd(`${NAT}/ScanJournalStore.kt`);

// --- #1 Native backoff ÜST SINIR ---
need(/const val SCAN_MAX_BACKOFF_MS\s*=\s*\d/.test(coord), '#1: SCAN_MAX_BACKOFF_MS sabiti yok');
need(/scanBackoffDeadline[\s\S]{0,120}coerceIn\(0L,\s*SCAN_MAX_BACKOFF_MS\)/.test(coord),
  '#1: scanBackoffDeadline hâlâ sınırsız (SCAN_MAX_BACKOFF_MS ile coerce edilmiyor)');
need(/scanRetryAfterMillis[\s\S]{0,80}\.coerceAtMost\(SCAN_MAX_BACKOFF_MS\)/.test(svc),
  '#1: host backoff retryMs SCAN_MAX_BACKOFF_MS ile sınırlanmıyor');

// --- #2 Native ikinci tur BÜTÇESİ ---
need(/const val RETRY_PHASE_BUDGET_MS\s*=\s*\d/.test(coord), '#2: RETRY_PHASE_BUDGET_MS sabiti yok');
need(/retryPhaseDeadline[\s\S]{0,200}RETRY_PHASE_BUDGET_MS/.test(svc) && /System\.currentTimeMillis\(\)\s*>\s*retryPhaseDeadline/.test(svc),
  '#2: drainDeferredProbes duvar-saati bütçesi kontrolü yok');
need(/fun markAllPendingUnresolved/.test(journal) && /markAllPendingUnresolved\(currentRunId\)/.test(svc),
  '#2: markAllPendingUnresolved eklenmedi/çağrılmıyor');

// --- #4 Bloke modal sonuç kutusu açıkken gösterilmez ---
const add = rd('frontend/app/add-playlist.tsx');
need(/visible=\{\(loading \|\| !!hitImportOverall\) && method !== "stalker" && !showBulkCandidates && !showDiscoveryMatches\}/.test(add),
  '#4: bloke modal hâlâ sonuç kutusunu örtebilir (!showBulkCandidates/!showDiscoveryMatches yok)');

// --- #6 edit-playlist klavye: klavye yüksekliği kadar alt boşluk ---
const edit = rd('frontend/app/edit-playlist.tsx');
need(/const \[keyboardHeight, setKeyboardHeight\]/.test(edit), '#6: keyboardHeight state yok');
need(/keyboardDidShow/.test(edit) && /paddingBottom:\s*SPACING\.xxxl \+ \(keyboardHeight/.test(edit),
  '#6: ScrollView alt boşluğu klavye yüksekliğini içermiyor');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.39 ikinci-tur bütçesi + backoff sınırı + modal + klavye TEMİZ');
