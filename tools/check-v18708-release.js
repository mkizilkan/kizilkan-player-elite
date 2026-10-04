#!/usr/bin/env node
/**
 * v18.7.8 — Katalog paralel sayfalama + keşif yanlış-negatif düzeltmeleri + tekli/çoklu motor
 * birleştirme + hesap kullanıcı adı telemetrisi kapısı.
 * Cihaz kanıtı: VOD 14/sayfa sıralı → %5; `/` timeout portu eliyordu; bir açık port diğerlerini düşürüyordu.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const stalker = rd('frontend/src/utils/stalker.ts');
const disc = rd('frontend/src/utils/magPortalDiscovery.ts');
const addPl = rd('frontend/app/add-playlist.tsx');
const app = JSON.parse(rd('frontend/app.json'));

// Sürüm (ileri uyumlu)
const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180708, `expo.version (${ver}) >= 18.7.8 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// B — paralel sayfalama
need(/PAGE_CONCURRENCY\s*=\s*6/.test(stalker), 'B: paralel sayfalama eşzamanlılığı yok');
need(/const fetchPage = async/.test(stalker) && /const processPage = async/.test(stalker), 'B: fetchPage/processPage ayrımı yok');
need(/PARALEL FAZ/.test(stalker), 'B: paralel faz yok');
need(/ORDERED_LIST_ABSOLUTE_MAX_PAGES = 600/.test(stalker), 'B: sayfa üst sınırı 600 değil');

// Keşif P0 — hiçbir portu yanlışlıkla eleme
need(/function portClosedByError/.test(disc), 'keşif: portClosedByError (kesin-kapalı) yok');
need(/"open" \| "unknown" \| "closed"/.test(disc), 'keşif: üç durumlu port modeli yok');
need(/Promise<"open" \| "unknown">/.test(disc), 'keşif: reachProbe üç durumlu değil');
need(/v\.error === "BODY_LIMIT"\) \? "open"/.test(disc), 'keşif: proxy body-limit açık port sayılmıyor');
need(/open-ÖNCE|OPEN önce, UNKNOWN sonra|open-first/i.test(disc) && /ports\.filter\(\(p: string\) => unknown\.includes\(p\)\)/.test(disc), 'keşif: unknown portlar düşürülüyor (yanlış-negatif)');
need(/MAG_DISCOVERY_PORT_CLOSED/.test(disc) && /MAG_DISCOVERY_PORT_SKIP/.test(disc), 'keşif: closed/skip telemetrisi yok');
need(/!host\.hasPort && \(!opts\.scope \|\| opts\.scope === "exact"\)\) \? "fallback"/.test(disc), 'keşif: portsuz auto scope yok');

// Tekli/çoklu motor birleştirme
need(/discoverMagHosts/.test(addPl) && /chooseMagPortals/.test(addPl), 'tekli ekleme MAC-siz keşif motorunu kullanmıyor');

// A — kullanıcı adı telemetrisi + geniş alan
need(/mainInfoFields/.test(stalker), 'A: main-info alan telemetrisi yok');
need(/p\.user_name.*p\.user.*p\.account|loginCandidate\(p\.user_name\)/.test(stalker), 'A: kullanıcı adı aday alanları genişletilmemiş');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.8 katalog paralel sayfalama + keşif yanlış-negatif + tekli/çoklu birleştirme + hesap telemetrisi kapısı TEMİZ');
