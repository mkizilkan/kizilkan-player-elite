#!/usr/bin/env node
/**
 * v18.7.22 — "Filmler kayboldu" düzeltmesi (kanıta dayalı):
 * Cihaz telemetrisi STALKER_VOD_PARTITION: hkpremium'da TÜM film öğeleri `bySeriesArray` ile diziye
 * sınıflanıyordu çünkü portal filmlere de BOŞ `series: []` koyuyor. Boş dizi "dizi" değildir →
 * rowLooksSeries artık yalnız DOLU series dizisini (v.series.length > 0) dizi işareti sayar.
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
need(code >= 180722, `expo.version (${ver}) >= 18.7.22 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');
need(/Array\.isArray\(v\?\.series\) && v\.series\.length > 0/.test(stalker), 'boş series dizisi hâlâ dizi sayılıyor (filmler kaybolur)');
need(!/\|\| Array\.isArray\(v\?\.series\) \|\|/.test(stalker), 'eski koşulsuz Array.isArray(series) hâlâ var');
if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.22 filmler kayboldu düzeltmesi (boş series dizisi dizi sayılmaz) TEMİZ');
