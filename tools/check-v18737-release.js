#!/usr/bin/env node
/**
 * v18.7.37 — Hesap ekleme UX + hız paketi (7 madde). Kaynak: 13.11.2026 cihaz
 * oturumu (kullanıcı combo taramada "Liste ekleniyor"da takıldı; 13 hesap bulundu
 * ama listeye yazılamadı). Kök nedenler koddan kanıtlandı:
 *  #1 HitFileImport modalının alt "Seçilenleri doğrula ve ekle" butonu edge-to-edge
 *     cihazda gezinme çubuğunun ALTINDA kalıyordu (safe-area yok).
 *  #2 add-playlist'teki 12 TextInput'ta onFocus kaydırması yoktu → odaklanınca klavye
 *     altında kalıyordu (en kötüsü MAG MAC/seri no).
 *  #3 Native scan retry (ikinci tur) fazında poll döngüsü her 350 ms dev progress
 *     string'ini çizip JS thread'i gereksiz meşgul ediyordu → retry'da ~900 ms.
 *  #4 "Doğrula ve Ekle" butonu !bulkScanFinished / nativeScanRunning ile DEVRE DIŞIydı;
 *     bulunan (zaten doğrulanmış) hesaplar 56 dk'lık ikinci tur bitene kadar eklenemiyordu.
 *  #5 Ekrandan çıkınca forceExit taramayı defer+pause ediyor; re-entry'de deferred
 *     tarama PROCESS_RESTARTED yolundan diriltilip ikinci turu yeniden koşturuyordu.
 *  #6 startStreamingFileScanV172 tüm panel dizinini `sources` ile gönderiyordu →
 *     Binder ~1 MB sınırı aşılıyor (TransactionTooLargeException), tarama reddediliyor,
 *     0 bulunuyordu. Dizin sıkıştırılarak gönderilir (§5).
 *  #7 Dosyadan toplu içe aktarmada overlay yalnız o anki tek listenin "0/1 liste
 *     tamamlandı"sını gösteriyordu; kullanıcı 13'ten kaçının bittiğini göremiyordu.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

// --- Beş sürüm alanı (ileri uyumlu, formül) ---
const app = JSON.parse(rd('frontend/app.json'));
const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180737, `expo.version (${ver}) >= 18.7.37 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code
  && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

const add = rd('frontend/app/add-playlist.tsx');
const hit = rd('frontend/src/components/HitFileImport.tsx');

// --- #1: HitFileImport modalı safe-area kullanıyor ---
need(/useSafeAreaInsets/.test(hit), '#1: HitFileImport useSafeAreaInsets kullanmıyor');
need(/insets\.bottom/.test(hit), '#1: HitFileImport alt safe-area inset uygulanmamış');

// --- #2: MAG + Xtream sunucu + liste adı alanlarında onFocus kaydırması ---
// Kritik alanların her biri onFocus={revealCredentialFields} almalı.
for (const id of ['stalker-portal-input', 'stalker-mac-input', 'stalker-serial-input',
                  'xtream-server-input', 'code-value-input', 'code-source-input']) {
  const re = new RegExp(`testID="${id}"[\\s\\S]{0,160}?onFocus=\\{revealCredentialFields\\}`);
  need(re.test(add), `#2: ${id} onFocus kaydırması yok (klavye altında kalır)`);
}

// --- #3: retry fazında poll aralığı gevşetildi (iki poll döngüsünde de) ---
need((add.match(/snap\.phase==='retry' \? 900 : 350/g) || []).length >= 2,
  '#3: retry poll throttle (snap.phase===retry ? 900 : 350) iki döngüde yok');

// --- #4: "Doğrula ve Ekle" artık bulkScanFinished / nativeScanRunning ile kilitli değil ---
need(/disabled=\{bulkAdding \|\| selectedBulkCandidateKeys\.length===0\} onPress=\{addSelectedBulkCandidates\}/.test(add),
  '#4: bulk ekleme butonu hâlâ !bulkScanFinished ile kilitli');
need(/disabled=\{bulkAdding \|\| selectedDiscoveryKeys\.length===0\} onPress/.test(add),
  '#4: keşif ekleme butonu hâlâ nativeScanRunning ile kilitli');
need(!/\!bulkScanFinished \? "Taramanın Bitmesini Bekleyin"/.test(add),
  '#4: "Taramanın Bitmesini Bekleyin" kilit etiketi hâlâ var (bulk)');

// --- #5: deferred tarama auto-recovery'den muaf ---
need(/scanDeferredByUser/.test(add), '#5: scanDeferredByUser değişkeni yok');
need(/PROCESS_RESTARTED_RECOVERABLE[\s\S]{0,120}?&& !scanDeferredByUser/.test(add),
  '#5: auto-recovery !scanDeferredByUser ile korunmuyor');

// --- #6: compactDirectory native çağrıya gidiyor (sources köprüden geçmez) ---
need(/const compactDirectory = directory\.map/.test(add), '#6: compactDirectory oluşturulmuyor');
need(/startStreamingFileScanV172\(source\.uri, compactDirectory,/.test(add),
  '#6: startStreamingFileScanV172 hâlâ ham directory gönderiyor (Binder taşması)');

// --- #7: genel içe-aktarma ilerlemesi ---
need(/const \[hitImportOverall, setHitImportOverall\]/.test(add), '#7: hitImportOverall state yok');
need(/testID="hit-import-overall"/.test(add), '#7: genel ilerleme satırı (Hesap X/N) yok');
need(/visible=\{\(loading \|\| !!hitImportOverall\) && method !== "stalker"\}/.test(add),
  '#7: overlay hit-import boyunca görünür değil');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.37 hesap ekleme UX + hız (7 madde) TEMİZ');
