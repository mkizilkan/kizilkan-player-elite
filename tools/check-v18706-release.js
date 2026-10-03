#!/usr/bin/env node
/**
 * v18.7.6 — MAG hesap doğrulama + bayat-oturum kurtarma + handshake bütçesi +
 * port-öncelikli keşif + canlı sonuç + tekli yenileme ilerlemesi kapısı.
 *
 * Kanıt (log 18.7.5 + v18.7.1 karşılaştırması):
 *  - D1: v18.7.4 `profilePayload`'ı katı `hasAccountIdentity` yaptı → bitiş kayboldu
 *        (v16.14.4–18.7.3 toleranslıydı). Geri getirildi + API doğrulaması eklendi.
 *  - C : bayat cache oturumu boş create_link üretince taze handshake'e düşülmüyordu.
 *  - D2: tek handshake 19 dk + 212 sn JS donması → duvar-saati bütçesi + katalog yield.
 *  - A4: port×yol kartezyeni (757) → ölü port budama (port-öncelikli).
 *  - A3: aday bulundukça canlı yayın (onHost upsert + emitLive).
 *  - B : tekli yenilemede ilerleme UI'a akmıyordu.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const stalker = rd('frontend/src/utils/stalker.ts');
const magBulk = rd('frontend/src/utils/magBulk.ts');
const disc = rd('frontend/src/utils/magPortalDiscovery.ts');
const bulkScan = rd('frontend/src/utils/magBulkScan.ts');
const refresh = rd('frontend/src/utils/refreshPlaylist.ts');
const ctx = rd('frontend/src/store/PlaylistContext.tsx');
const addPl = rd('frontend/app/add-playlist.tsx');
const editPl = rd('frontend/app/edit-playlist.tsx');
const magBulkUi = rd('frontend/app/mag-bulk.tsx');
const app = JSON.parse(rd('frontend/app.json'));

// Sürüm (ileri uyumlu)
const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180706, `expo.version (${ver}) >= 18.7.6 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// D1 — toleranslı profil kabulü geri + katı gate korunur + API doğrulama
need(/function hasDisplayableAccountFields\(/.test(stalker), 'hasDisplayableAccountFields yok (toleranslı gösterim kabulü)');
need(/return hasDisplayableAccountFields\(js\) \|\| accountDenial\(js\) !== null \? js : null;/.test(stalker), 'profilePayload toleranslı kabule dönmemiş');
need(/function hasAccountIdentity\(/.test(stalker), 'hasAccountIdentity (katı gate) kaldırılmamalı');
need(/export async function stalkerAccountSnapshot\(/.test(stalker), 'stalkerAccountSnapshot (API hesap doğrulama) yok');
need(/type: "account_info", action: "get_main_info"/.test(stalker), 'snapshot get_main_info çağrısı yok');
need(/stalkerAccountSnapshot/.test(addPl), 'ekleme akışı hesap doğrulamayı kullanmıyor');
need(/stalkerAccountSnapshot/.test(editPl), 'elle güncelleme hesap doğrulamayı kullanmıyor');

// C — bayat cache boş-link kurtarma
need(/staleCachedLink/.test(stalker) && /create_link boş\|yayın adresi vermedi/.test(stalker), 'boş-link bayat-oturum kurtarması yok');
need(/STALKER_RESOLVE_STALE_RETRY/.test(stalker), 'stale-retry telemetrisi yok');

// D2 — handshake duvar-saati bütçesi + katalog yield sıklığı
need(/HANDSHAKE_WALL_BUDGET_MS\s*=\s*90_000/.test(stalker), 'handshake duvar-saati bütçesi yok');
need(/STALKER_HANDSHAKE_BUDGET_STOP/.test(stalker), 'handshake bütçe-durdurma telemetrisi yok');
need(/async function stalkerCatalogYield\(index: number, every = 32\)/.test(stalker), 'katalog yield aralığı 32 değil');

// A4 — port-öncelikli keşif (ölü port budama)
need(/export function discoveryPortsFor\(/.test(magBulk), 'discoveryPortsFor yok');
need(/ports\?: string\[\]/.test(magBulk), 'portalDiscoveryCandidates ports filtresi yok');
need(/portState/.test(disc) && /MAG_DISCOVERY_PORT_(?:DEAD|CLOSED)/.test(disc) && /MAG_DISCOVERY_PORT_SKIP/.test(disc), 'port budama (dead/closed/skip) yok');
need(/reachableOpenPorts/.test(disc) && /MAG_DISCOVERY_PORT_SCAN/.test(disc), 'paralel port erişilebilirlik fazı yok');

// A3 — canlı sonuç yayını
need(/const emitLive = \(\)/.test(disc), 'emitLive canlı yayın yok');
need(/findIndex\(r => r\.host\.host === report\.host\.host\)/.test(bulkScan), 'onHost host-upsert değil (çift blok riski)');

// A2 — tarama sırasında keep-screen-on
need(/setKeepScreenOn\(true\)/.test(magBulkUi) && /setKeepScreenOn\(false\)/.test(magBulkUi), 'tarama keep-screen-on kullanmıyor');

// B — tekli yenileme ilerlemesi UI'a akar
need(/refreshPlaylistKinds\(id,kinds,\(p\)=>\{/.test(ctx), 'checkFreshness ilerleme geri-çağrısı vermiyor');

// refresh MAG accountInfo tazeler (boşla ezmeden)
need(/refreshedAccountInfo \? \{ accountInfo: refreshedAccountInfo \}/.test(refresh), 'MAG yenilemede accountInfo yaması yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.6 MAG hesap doğrulama + bayat-oturum + handshake bütçesi + port-öncelikli keşif + canlı sonuç + yenileme ilerlemesi kapısı TEMİZ');
