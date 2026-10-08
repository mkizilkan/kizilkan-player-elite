#!/usr/bin/env node
/**
 * v18.7.16 — toplu UX + portal keşfi + kullanıcı adı:
 * A) "probable" kategorisi: kimlik+bitiş var, içerik örneği yok → eklenebilir.
 * B) toplu ekleme görsel CatalogPreparationModal.
 * C) küresel otomatik yenileme ana anahtarı (kapalıyken hiçbir liste güncellenmez).
 * D) katalog sayfalama hız ölçümü (STALKER_PAGINATION_STOP elapsedMs/avgPageMs).
 * E) portal keşfi: version.js API yolları öne (unshift), "all" aile-önce, deadline'da keşif telemetrisi.
 * U1) kullanıcı adı alanında dolgulu base64 çözme. U2) alan biçim telemetrisi (değer yok).
 * U3) yayın URL yapı telemetrisi. U4) Xtream-şekilli URL'den kullanıcı adı/şifre (kartta).
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const stalker = rd('frontend/src/utils/stalker.ts');
const disc = rd('frontend/src/utils/magPortalDiscovery.ts');
const bulkScan = rd('frontend/src/utils/magBulkScan.ts');
const magBulkUi = rd('frontend/app/mag-bulk.tsx');
const settings = rd('frontend/app/(tabs)/settings.tsx');
const plCtx = rd('frontend/src/store/PlaylistContext.tsx');
const app = JSON.parse(rd('frontend/app.json'));

const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180716, `expo.version (${ver}) >= 18.7.16 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// A — probable kategorisi
need(/"probable"/.test(bulkScan) && /accountIdentity \|\| verification\.expiryValid/.test(bulkScan), 'A: "probable" kategorisi (kimlik/bitiş) yok');
need(/accountIdentity\?: boolean/.test(stalker) && /expiryValid\?: boolean/.test(stalker), 'A: doğrulama tipinde accountIdentity/expiryValid yok');
need(/const probableOk = verification\.state === "unverified" && \(verification\.accountIdentity \|\| verification\.expiryValid\)/.test(magBulkUi), 'A: ekleme "muhtemel geçerli"yi kabul etmiyor');
need(/selectedAddable/.test(magBulkUi), 'A: selectedAddable (geçerli+muhtemel) yok');

// B — görsel modal
need(/<CatalogPreparationModal[\s\S]{0,200}visible=\{adding\}/.test(magBulkUi) && /applyCatalogProgress/.test(magBulkUi), 'B: toplu ekleme görsel modal/ilerleme yok');

// C — küresel yenileme anahtarı
need(/autoRefreshGlobalRef\.current/.test(plCtx) && /FRESHNESS_SKIP_GLOBAL_OFF/.test(plCtx), 'C: küresel yenileme kapısı yok');
need(/auto-refresh-global-toggle/.test(settings) && /setAutoRefreshGlobal/.test(settings), 'C: ayarlarda küresel yenileme anahtarı yok');

// D — sayfalama hız ölçümü
need(/avgPageMs:pagesFetched\?/.test(stalker) && /paginationStartMs/.test(stalker), 'D: katalog sayfalama hız ölçümü yok');

// E — portal keşfi
need(/queue\.unshift\(apiUrl\)/.test(disc), 'E2a: version.js API yolları öne alınmıyor (unshift)');
need(/if \(scope === "all"\) \{[\s\S]{0,1100}await sweep\(family\(host\)\);\s*\n\s*if \(!stop\) await twoPhaseExpand\(\);/.test(disc), 'E2b: "all" aile-önce taramıyor');
need(/emitDiscoveryResult\(\); \/\/ v18\.7\.16 \(E1\)/.test(disc), 'E1: deadline/normal yolda keşif telemetrisi çağrılmıyor');

// U1 — base64 kullanıcı adı
need(/function decodeBase64Username/.test(stalker) && /const b64 = decodeBase64Username\(t\);/.test(stalker), 'U1: base64 kullanıcı adı çözme yok');
// U2 — alan biçim telemetrisi
need(/profileFieldShapes:/.test(stalker) && /mainInfoFieldShapes:/.test(stalker), 'U2: alan biçim telemetrisi yok');
// U3 — yayın URL yapısı
need(/function streamUrlShape/.test(stalker) && /streamShape: streamUrlShape\(url/.test(stalker), 'U3: yayın URL yapı telemetrisi yok');
// U4 — kimlik çıkarma + kart
need(/function extractStreamCredentials/.test(stalker) && /export function getStreamDerivedCredentials/.test(stalker), 'U4: stream kimlik çıkarma/getter yok');
need(/getStreamDerivedCredentials\(playlist\.stalkerMac, playlist\.stalkerPortal, activeProfile.id\)/.test(settings), 'U4: kart profil/portal kapsamlı stream kimliğini okumuyor');
// GÜVENLİK: U4 değerleri loglanmaz (yalnız uzunluk)
need(/streamUsernameLen: derived\?\.username\.length/.test(stalker) && !/streamUsername: derived\.username/.test(stalker), 'GÜVENLİK: U4 kimlik DEĞERİ loglanıyor olabilir');

// §7 — stalker.ts üst düzey platform importu yok
need(!/^import [^\n]*from ["']@\/modules\/panel-scan["']/m.test(stalker), '§7: stalker.ts üst düzey panel-scan importu');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.16 A probable + B görsel ekleme + C küresel yenileme + D sayfalama ölçümü + E portal keşfi + U1-U4 kullanıcı adı/base64/stream kimliği TEMİZ');
