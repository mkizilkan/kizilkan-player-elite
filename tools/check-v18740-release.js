#!/usr/bin/env node
/**
 * v18.7.40 — M3U/Xtream Link Test & Ekle aracı (HITHUNTER tarzı) + paralellik (1–50)
 * + katalog ekleme süre ölçümü (C teşhisi, uçuş kaydına).
 *
 * Kullanıcı isteği (13→25.11.2026): kirli/temiz TXT dosyasından veya yapıştırılan metinden
 * M3U get.php linklerini çıkar → hızlı test (durum/bitiş/bağlantı/kategori sayıları) → karta
 * tıklayınca tam Live/VOD/Series sayısı + kategori listeleri → tek/çoklu/tümü seç → ekle.
 * Erişim: Liste Ekle + Ayarlar + Ana ekran. Paralel test sayısı 1–50. MAC sekmesi mevcut
 * Çoklu MAC motorunu açar. C için commitPlaylist/native bulk import aşama süreleri uçuş kaydına.
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
need(code >= 180740, `expo.version (${ver}) >= 18.7.40 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code
  && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// --- Yeni util ---
const util = rd('frontend/src/utils/linkTest.ts');
need(/export function extractXtreamLinks/.test(util), 'linkTest: extractXtreamLinks yok');
need(/export async function fastTestXtream/.test(util), 'linkTest: fastTestXtream yok');
need(/export async function fullCountsXtream/.test(util), 'linkTest: fullCountsXtream yok');
const iptv = rd('frontend/src/utils/iptv.ts');
need(/export async function xtreamVodCatalogProbe/.test(iptv) && /export async function xtreamSeriesCatalogProbe/.test(iptv),
  'iptv: VOD/Series hafif sayaçları eklenmedi');

// --- Yeni ekran ---
const scr = rd('frontend/app/link-test.tsx');
need(/extractXtreamLinks|fastTestXtream/.test(scr), 'link-test ekranı util kullanmıyor');
need(/testID="link-test-pick"/.test(scr) && /testID="link-test-paste"/.test(scr), 'link-test: dosya/yapıştır girişleri yok');
need(/testID="link-test-parallel"/.test(scr), 'link-test: paralellik girişi yok');
need(/Math\.max\(1, Math\.min\(50,/.test(scr), 'link-test: paralellik 1–50 sınırı yok');
need(/detailTab|liveCats|category_id/.test(scr), 'link-test: kategori detay görünümü yok');
need(/importHitRecord/.test(scr), 'link-test: ekleme importHitRecord ile değil');
need(/router\.push\("\/mag-bulk"\)/.test(scr), 'link-test: MAC sekmesi Çoklu MAC motorunu açmıyor');

// --- 3 erişim noktası ---
need(/router\.push\("\/link-test"\)/.test(rd('frontend/app/add-playlist.tsx')), 'add-playlist: Link Test butonu yok');
need(/router\.push\("\/link-test"\)/.test(rd('frontend/app/(tabs)/settings.tsx')), 'settings: Link Test satırı yok');
need(/router\.push\("\/link-test"\)/.test(rd('frontend/app/(tabs)/index.tsx')), 'ana ekran: Link Test kısayolu yok');

// --- C: katalog ekleme süre ölçümü (uçuş kaydına) ---
const add = rd('frontend/app/add-playlist.tsx');
need(/trace\.stage\('catalog-fetch'/.test(add) && /trace\.stage\('room-sync'/.test(add),
  'C: add-playlist catalog-fetch/room-sync süre ölçümü yok');
const imp = rd('frontend/src/utils/importHitRecord.ts');
need(/trace\.stage\('live-ready'/.test(imp) && /trace\.stage\('catalog-complete'/.test(imp),
  'C: importHitRecord live-ready/catalog-complete süre ölçümü yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.40 Link Test aracı + paralellik + katalog süre ölçümü TEMİZ');
