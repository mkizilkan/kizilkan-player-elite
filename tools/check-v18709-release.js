#!/usr/bin/env node
/**
 * v18.7.9 — İki aşamalı keşif (önce açık portlar, sonra yollar; bilinmeyen portlar fallback) +
 * keşif sonucu telemetrisi + get_profile kullanıcı adı alan telemetrisi.
 * Cihaz kanıtı: v18.7.8'de yol denemesi 54 portun hepsinde yapılıyordu (~757, 8.8 dk, valid:0,
 * görünürlük yok); kullanıcı adı get_main_info'da yoktu (mac/phone), get_profile'da olabilir.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const disc = rd('frontend/src/utils/magPortalDiscovery.ts');
const stalker = rd('frontend/src/utils/stalker.ts');
const app = JSON.parse(rd('frontend/app.json'));

const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180709, `expo.version (${ver}) >= 18.7.9 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// İki aşamalı keşif
need(/const classifyPorts = async/.test(disc) && /\{ open: string\[\]; unknown: string\[\] \}/.test(disc), 'classifyPorts {open,unknown} yok');
need(/const twoPhaseExpand = async/.test(disc), 'iki aşamalı genişleme fonksiyonu yok');
need(/Aşama 2a: yalnız AÇIK portlarda yollar/.test(disc), 'aşama 2a (açık portlarda yol) yok');
need(/Aşama 2b: açıkta bulunamazsa bilinmeyen portlar/.test(disc), 'aşama 2b (bilinmeyen fallback) yok');
need(/const hasSelectable = \(\)/.test(disc), 'hasSelectable kontrolü yok');

// Keşif telemetrisi
need(/MAG_DISCOVERY_RESULT/.test(disc) && /const emitDiscoveryResult/.test(disc), 'keşif sonucu telemetrisi (MAG_DISCOVERY_RESULT) yok');
need(/openPorts:/.test(disc), 'telemetride açık port listesi yok');

// Kullanıcı adı: get_profile alan telemetrisi
need(/profileFields:/.test(stalker), 'get_profile alan adı telemetrisi yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.9 iki aşamalı keşif + keşif/profil telemetrisi kapısı TEMİZ');
