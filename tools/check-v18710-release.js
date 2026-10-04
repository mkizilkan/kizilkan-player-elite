#!/usr/bin/env node
/**
 * v18.7.10 — Çoklu MAC handshake yedeği + redirect-no-kill + version.js tanıma + alternatif scheme +
 * sınırlı unknown fallback + kullanıcı adı name/fname + handshake-adayının seçilebilir olması.
 * Cihaz kanıtı: weko çoklu MAC'te bulunamıyordu (pasif keşif tanımıyor, handshake yedeği yok);
 * tekli ekleme handshake yedeğiyle 21266 kanal buldu.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const bulk = rd('frontend/src/utils/magBulkScan.ts');
const disc = rd('frontend/src/utils/magPortalDiscovery.ts');
const magBulk = rd('frontend/src/utils/magBulk.ts');
const stalker = rd('frontend/src/utils/stalker.ts');
const addPl = rd('frontend/app/add-playlist.tsx');
const app = JSON.parse(rd('frontend/app.json'));

const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180710, `expo.version (${ver}) >= 18.7.10 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// #1 handshake yedeği (çoklu MAC)
need(/discoverMagPortal/.test(bulk) && /MAG_BULK_HANDSHAKE_FALLBACK_OK/.test(bulk), '#1: çoklu MAC handshake yedeği yok');
need(/discovered-by-handshake/.test(bulk) && /selectable: true/.test(bulk), '#1/#7: handshake-adayı seçilebilir aday olarak eklenmiyor');

// #2 redirect bir host'u öldürmesin
need(/FOREIGN_REDIRECT"\) \{ void recordDiagnostic\("scan", "MAG_DISCOVERY_FOREIGN_REDIRECT"/.test(disc), '#2: FOREIGN_REDIRECT hâlâ host\'u error+stop yapıyor');

// #3 version.js
need(/MAG_DISCOVERY_VERSION_JS/.test(disc) && /stalker-version-js/.test(disc), '#3: version.js tanıma yok');

// #4 alternatif scheme (TLS noktası)
need(/ALTERNATİF scheme/.test(disc) && /schemes\?: Record<string, string>/.test(magBulk), '#4: alternatif scheme öğrenme yok');

// #5 sınırlı unknown fallback
need(/\.slice\(0, 96\)/.test(disc), '#5: bilinmeyen-port fallback sınırlanmamış');

// #6 kullanıcı adı name/fname
need(/loginCandidate\(p\.fname\) \|\| loginCandidate\(p\.name\)/.test(stalker), '#6: kullanıcı adı name/fname fallback yok');

// UX
need(/handshake \$\{i \+ 1\}\/\$\{t\}/.test(addPl), 'UX: tekli eklemede handshake ilerlemesi yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.10 çoklu MAC handshake yedeği + redirect/version.js/scheme/kullanıcı adı kapısı TEMİZ');
