#!/usr/bin/env node
/**
 * v18.7.41 — Aynı hesapları birleştir (#1) + Media3 sessiz→MPV (#2) + Toplu Test
 * dosya donması (#3) + tanılama butonu yazı taşması (#5 UI).
 *
 * Kaynak (25.11.2026 cihaz oturumu + kullanıcı ekran görüntüleri):
 *  #1 Combo'dan defalarca eklenen AYNI hesabın kopya listeleri DB'yi şişiriyor (2.5 GB).
 *     Önizleme + onay (SEÇENEK A) ile birleştir; farklı DNS'ler YEDEK olur (sınırsız);
 *     favori/izlendi korunur; kopya katalog silinir. "Tamamen aynı" = kaynak+kimlik+PANEL
 *     (yalnız user:pass'e bakılmaz — aynı creds farklı panelde olabilir).
 *  #2 Media3 bazı dizilerde ses parçası yok (AC3/DTS) → kanal başına bir kez MPV'ye geç.
 *  #3 Link Test büyük dosya ayıklanırken JS bloklanıp donuyordu → async chunked ayıklama.
 *  #5 Tanılama ekranı 4 butonu tek satıra sığmayıp yazılar taşıyordu → iki satır + numberOfLines.
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
need(code >= 180741, `expo.version (${ver}) >= 18.7.41 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code
  && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// --- #1 birleştirme motoru (saf util) ---
const pm = rd('frontend/src/utils/playlistMerge.ts');
need(/export function accountMergeKey/.test(pm), 'playlistMerge: accountMergeKey yok');
need(/export function findDuplicateGroups/.test(pm), 'playlistMerge: findDuplicateGroups yok');
need(/export function hostsOf/.test(pm), 'playlistMerge: hostsOf yok');
need(/export function mergedBackupHosts/.test(pm), 'playlistMerge: mergedBackupHosts yok');
// KRİTİK: birleştirme anahtarı PANEL kimliğini içermeli (yalnız user:pass'e bakmaz).
need(/panelName/.test(pm), 'playlistMerge: kopya ölçütü panel kimliğini içermiyor (user:pass-only riski)');

// --- #1 kütüphane taşıma (favori/izlendi korunur) ---
const lm = rd('frontend/src/utils/libraryMerge.ts');
need(/export async function mergeLibraryScopes/.test(lm), 'libraryMerge: mergeLibraryScopes yok');

// --- #1 önizleme + onay modalı (SEÇENEK A: butona basmadan birleştirmez) ---
const modal = rd('frontend/src/components/DuplicateMergeModal.tsx');
need(/findDuplicateGroups/.test(modal) && /mergeLibraryScopes/.test(modal), 'DuplicateMergeModal: motor/taşıma bağlı değil');
need(/testID="merge-run"/.test(modal), 'DuplicateMergeModal: onaylı birleştir butonu (merge-run) yok');
need(/testID="merge-close"/.test(modal), 'DuplicateMergeModal: kapat (merge-close) yok');

// --- #1 Ayarlar bağlama ---
const set = rd('frontend/app/(tabs)/settings.tsx');
need(/import \{ DuplicateMergeModal \}/.test(set), 'settings: DuplicateMergeModal import yok');
need(/findDuplicateGroups/.test(set), 'settings: dupGroups sayımı yok');
need(/testID="merge-duplicates-btn"/.test(set), 'settings: birleştir butonu (merge-duplicates-btn) yok');
need(/<DuplicateMergeModal[\s\S]{0,200}removePlaylist=\{removePlaylist\}/.test(set), 'settings: modal mount/prop eksik');

// --- #2 Media3 sessiz → MPV (kanal başına bir kez) ---
const ph = rd('frontend/src/player/PlayerHost.tsx');
need(/audioFallbackTriedRef/.test(ph), 'PlayerHost: audioFallbackTriedRef yok (bir-kez koruması)');
need(/MEDIA3_AUDIO_FALLBACK_MPV/.test(ph), 'PlayerHost: ses→MPV telemetrisi yok');
need(/audioFallbackTriedRef\.current !== chId && mpvEngineUsable\(\)/.test(ph), 'PlayerHost: MPV geçişi guard/usable koşulu eksik');

// --- #3 Toplu Test (Link Test) büyük dosya donması → async chunked ---
const lt = rd('frontend/src/utils/linkTest.ts');
need(/export async function extractXtreamLinksAsync/.test(lt), 'linkTest: extractXtreamLinksAsync (async chunked) yok');
need(/export function extractXtreamLinks\b/.test(lt), 'linkTest: eski senkron extractXtreamLinks kaldırılmış (kapı uyumu)');
const scr = rd('frontend/app/link-test.tsx');
need(/extractXtreamLinksAsync/.test(scr), 'link-test: async ayıklama kullanılmıyor');
need(/setExtracting/.test(scr), 'link-test: ayıklama durum göstergesi yok');

// --- #5 Tanılama butonları taşma düzeltmesi ---
const stats = rd('frontend/app/stats.tsx');
need(/numberOfLines=\{1\}>Flight Recorder Raporunu Paylaş/.test(stats), 'stats: paylaş butonu tek satır değil (taşma)');
need(/numberOfLines=\{2\}>Geçmişi Temizle/.test(stats), 'stats: temizle butonu numberOfLines yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.41 birleştir(#1) + Media3→MPV(#2) + Toplu Test donma(#3) + buton taşma(#5) TEMİZ');
