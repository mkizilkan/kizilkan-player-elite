#!/usr/bin/env node
/**
 * v18.7.20 — katalog hızı + VOD sınıflama teşhisi:
 * S) katalog sayfalama hızlandırıldı: PAGE_CONCURRENCY 6→20, PAGE_BUDGET 75→100 sn, sayfa üst sınırı 600→2000
 *    (salt-okunur get_ordered_list; oynatma/create_link değil). Cihaz: hkpremium VOD 22905, 75sn/conc6 ile %27.
 * V) "Filmler kayboldu" teşhisi: STALKER_VOD_PARTITION telemetrisi — hangi ölçütle (is_series/seriesArray/
 *    kategori adı/tip) kaç öğenin diziye sınıflandığı + örnek kategori adları (DEĞER YOK). Kanıt sonrası düzeltme.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const stalker = rd('frontend/src/utils/stalker.ts');
const app = JSON.parse(rd('frontend/app.json'));

const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180720, `expo.version (${ver}) >= 18.7.20 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// S — hız
const pageConc = Number((/PAGE_CONCURRENCY\s*=\s*(\d+)/.exec(stalker) || [])[1] || 0);
need(pageConc >= 20, `S: PAGE_CONCURRENCY >=20 değil (${pageConc})`);
const pageBudget = Number((/PAGE_BUDGET_MS\s*=\s*(\d+)/.exec(stalker) || [])[1] || 0);
need(pageBudget >= 100000, `S: PAGE_BUDGET_MS >=100000 değil (${pageBudget})`);
const maxPages = Number((/ORDERED_LIST_ABSOLUTE_MAX_PAGES\s*=\s*(\d+)/.exec(stalker) || [])[1] || 0);
need(maxPages >= 2000, `S: sayfa üst sınırı >=2000 değil (${maxPages})`);

// V — VOD sınıflama teşhisi
need(/STALKER_VOD_PARTITION/.test(stalker), 'V: VOD partition telemetrisi yok');
need(/byIsSeriesFlag:cls\.isSeries/.test(stalker) && /byCategoryTitle:cls\.catTitle/.test(stalker) && /sampleCategories:/.test(stalker), 'V: sınıflama ölçüt kırılımı/örnek kategori yok');
// Güvenlik: yalnız sayı + kategori ADI; film/dizi ADI veya cmd loglanmaz
need(!/STALKER_VOD_PARTITION[\s\S]{0,200}v\?\.name/.test(stalker), 'GÜVENLİK: VOD partition telemetrisinde öğe adı olabilir');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.20 katalog hızı (conc 20 / bütçe 100s / sayfa 2000) + VOD sınıflama teşhis telemetrisi TEMİZ');
