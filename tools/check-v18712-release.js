#!/usr/bin/env node
/**
 * v18.7.12 — MAG çoklu-IP DNS failover (cihaz kanıtı: goldensm32.xyz 5 A kaydı, 4'ü ÖLÜ; sistem DNS
 * ölü IP veriyor → istek 6 sn timeout, diğer IP'ler denenmiyor). Oynatıcıda host failover vardı, MAG
 * ekleme/tarama yolunda YOKTU. Çözüm: DoH ile tüm A kayıtları, canlı IP sabitlenir, bağlantı o IP'ye
 * (Host hostname), finalUrl mantıksal hostname'e çevrilir (origin kontrolleri bozulmaz). Yalnız HTTP.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const failover = fs.existsSync(path.join(root, 'frontend/src/utils/magHostFailover.ts')) ? rd('frontend/src/utils/magHostFailover.ts') : '';
const stalker = rd('frontend/src/utils/stalker.ts');
const disc = rd('frontend/src/utils/magPortalDiscovery.ts');
const app = JSON.parse(rd('frontend/app.json'));

const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180712, `expo.version (${ver}) >= 18.7.12 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// Failover modülü
need(!!failover, 'magHostFailover.ts yok');
need(/dns\.google\/resolve/.test(failover) && /cloudflare-dns\.com/.test(failover), 'DoH sağlayıcıları (dns.google + cloudflare) yok');
need(/export async function ensureLiveHostIp/.test(failover) && /export function connectInfo/.test(failover) && /export function logicalUrl/.test(failover), 'failover API (ensureLiveHostIp/connectInfo/logicalUrl) eksik');
need(/u\.protocol !== "http:"/.test(failover), 'HTTPS (SNI) koruması yok — failover https\'e de uygulanıyor');
need(/MAG_HOST_IP_FAILOVER/.test(failover), 'failover telemetrisi yok');

// CLAUDE §7 tuzağı: stalker.ts / magPortalDiscovery.ts'e ÜST DÜZEY failover importu YASAK (sahte-require kapıları).
need(!/^import[^\n]*magHostFailover/m.test(stalker), 'stalker.ts üst düzey magHostFailover importu var (tembel olmalı)');
need(!/^import[^\n]*magHostFailover/m.test(disc), 'magPortalDiscovery.ts üst düzey magHostFailover importu var (tembel olmalı)');
need(/_setHostFailoverEnabled/.test(failover) && /navigator\?\.product === "ReactNative"/.test(failover), 'failover yalnız RN ortamında aktif değil (testleri etkiler)');

// stalker.ts wiring: tembel yükleyici + düz fetch + exactFetch + finalUrl çevirisi + proaktif pin
need(/async function loadHostFailover/.test(stalker) && /await import\("@\/src\/utils\/magHostFailover"\)/.test(stalker), 'stalker tembel failover yükleyicisi yok');
need(/hostFailover\.connectInfo\(url\)[\s\S]*?Host: conn\.host/.test(stalker), 'stalker düz fetch failover bağlanmamış');
need(/hostFailover\.connectInfo\(target\)/.test(stalker), 'stalker exactFetch failover bağlanmamış');
need(/hostFailover\.logicalUrl\(rawFinalUrl\)/.test(stalker), 'stalker finalUrl mantıksal çeviri yok');
need(/sameApi\(hostFailover \? hostFailover\.logicalUrl\(responseUrl\)/.test(stalker), 'exactFetch sameApi mantıksal çeviri yok');
need((stalker.match(/hf\?\.ensureLiveHostIp\(/g) || []).length >= 2, 'stalker proaktif pin (discoverMagPortal + handshake) eksik');

// magPortalDiscovery wiring
need(/async function loadHostFailover/.test(disc), 'discovery tembel failover yükleyicisi yok');
need(/hf\.connectInfo\(url\)/.test(disc) && /hfBack\.logicalUrl\(rawFinal\)/.test(disc), 'discovery raw() failover bağlanmamış');
need(/hf\?\.ensureLiveHostIp\(entered/.test(disc), 'discovery proaktif pin yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.12 MAG çoklu-IP DNS failover (DoH + canlı IP pin + IP-sınırında connect/logical çeviri) kapısı TEMİZ');
