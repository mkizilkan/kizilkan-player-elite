#!/usr/bin/env node
/**
 * v18.7.24 — Çoklu ekleme seçim ekranında "görüntü var/yok" + süzme:
 *  • MAG çoklu (mag-bulk.tsx): her sonuç kartında liveCount tabanlı görüntü satırı (ücretsiz, doğrulama anındaki
 *    gerçek canlı içerik örneği); "Görüntü olanlar" süzme chip'i + "Görüntü olanları seç" butonu (liveCount>0).
 *  • Xtream combo (add-playlist.tsx): İSTEK ÜZERİNE görüntü testi — bulunan her hesaba get_live_streams probe'u
 *    (buton; otomatik değil → ban/hız riski yok); kartta "görüntü var · N / yok" rozeti + "Görüntü Olanları Seç".
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const magBulk = rd('frontend/app/mag-bulk.tsx');
const addPl = rd('frontend/app/add-playlist.tsx');
const app = JSON.parse(rd('frontend/app.json'));

const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180724, `expo.version (${ver}) >= 18.7.24 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// MAG tarafı (ücretsiz, liveCount)
need(/"has-content"/.test(magBulk), 'MAG: ResultFilter has-content yok');
need(/const contentResults = useMemo\(\(\) => results\.filter\(r => \(r\.liveCount \|\| 0\) > 0\)/.test(magBulk), 'MAG: contentResults (liveCount>0) yok');
need(/resultFilter === "has-content" \? \(r\.liveCount \|\| 0\) > 0/.test(magBulk), 'MAG: has-content süzme filtresi yok');
need(/mag-select-has-content/.test(magBulk), 'MAG: "görüntü olanları seç" butonu yok');
need(/Katalog(?: örneği)?: \$\{n\} kanal/.test(magBulk) && /ilk kare sınanmadı/.test(magBulk), 'MAG: katalog örneği / ilk kare ayrı gösterilmiyor');

// Xtream combo tarafı (istek üzerine probe)
need(/const \[bulkContentTest, setBulkContentTest\]/.test(addPl), 'Xtream: bulkContentTest state yok');
need(/const testBulkContent = React\.useCallback/.test(addPl), 'Xtream: testBulkContent yok');
need(/xtreamLiveCatalogProbe\(\{\s*server:\s*c\.server,\s*username:\s*c\.username,\s*password:\s*c\.password\s*\},\s*(?:per\.signal|signal)(?:,\s*catalogProxy)?\)/.test(addPl), 'Xtream: hafif canlı katalog probe çağrısı yok');
need(/bulk-content-test-btn/.test(addPl), 'Xtream: "Görüntü Test Et" butonu yok');
need(/bulk-select-content-btn/.test(addPl) && /bulkContentYesKeys/.test(addPl), 'Xtream: "Görüntü Olanları Seç" butonu/anahtar seti yok');
need(/const ct = bulkContentTest\[c\.key\]/.test(addPl) && /Katalog var · \$\{ct\.count\} kanal/.test(addPl), 'Xtream: dürüst katalog rozeti yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.24 çoklu ekleme seçim ekranı görüntü var/yok + süzme (MAG liveCount ücretsiz · Xtream istek-üzerine probe) TEMİZ');
