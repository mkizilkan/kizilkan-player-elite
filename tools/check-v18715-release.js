#!/usr/bin/env node
/**
 * v18.7.15 — GPT DEV1 (D01-D15) + Opus tamamlama:
 * D01/D02) kullanıcı adı yalnız gerçek login alanlarından; MAC'e düşmez; görünen ad ayrı satır.
 * D03) toplu doğrulama mergeInfo ortak mergeStalkerAccountInfo kullanır.
 * D04) MAG active_cons / max_connections / allowed_output_formats normalize edilir.
 * D07) ortak katalog hazırlama görünümü (CatalogPreparationModal); düzenleme modalı iptal edilebilir.
 * D08) tekli ekleme resolveMagInput → çözülen endpoint exact politikayla kilitlenir.
 * D11) alternatif scheme (http↔https) genişletmesi yalnız seçilebilir API yokken (Opus).
 * D12) reqTransport biterken taşıma tutamacı kapatılır (iptal edilen oturumda canlı sinyal kalmaz, Opus).
 * D13) ortak host keşif bütçesi (MagDiscoveryBudget). Güvenlik: istemci JS yalnız metin olarak okunur.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const stalker = rd('frontend/src/utils/stalker.ts');
const disc = rd('frontend/src/utils/magPortalDiscovery.ts');
const addPl = rd('frontend/app/add-playlist.tsx');
const editPl = rd('frontend/app/edit-playlist.tsx');
const settings = rd('frontend/app/(tabs)/settings.tsx');
const resolver = rd('frontend/src/utils/magClientJsResolver.ts');
const repair = rd('frontend/src/components/PlaylistRepairOverlay.tsx');
const app = JSON.parse(rd('frontend/app.json'));

const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180715, `expo.version (${ver}) >= 18.7.15 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// D01/D02 — kullanıcı adı MAC'e düşmez, görünen ad ayrı
need(!/acc\.username \|\| acc\.mac/.test(settings), 'D01: kart kullanıcı adı yerine MAC gösteriyor');
need(/label="Görünen Ad"/.test(settings), 'D02: görünen ad satırı kaldırılmış (özellik kaybı)');
need(/if \(!REAL_LOGIN_FIELDS\.has\(f\)\) continue;/.test(stalker), 'D02: name/fname hâlâ kullanıcı adı sayılıyor');

// D03/D04
need(/const mergeInfo = \(value: unknown\) => \{\s*info = mergeStalkerAccountInfo\(/.test(stalker), 'D03: toplu mergeInfo ortak birleştiriciyi kullanmıyor');
need(/active_cons: count\(/.test(stalker) && /max_connections: count\(/.test(stalker) && /allowed_output_formats:/.test(stalker), 'D04: MAG bağlantı/format alanları normalize edilmiyor');

// D07 — ortak hazırlama görünümü; düzenleme iptal edilebilir; onarım null-güvenli
need(/<CatalogPreparationModal[\s\S]{0,400}onCancel=\{\(\) => editAbortRef\.current\?\.abort\(\)\}/.test(editPl), 'D07: düzenleme hazırlama modalı iptal edilemiyor (geri tuşu tuzağı)');
need(/if \(!repairProgress\) return null;/.test(repair), 'D07: onarım katmanı repairProgress null iken çöker');

// D08 — tekli ekleme çözülen endpoint'i kilitler
need(/await resolveMagInput\(cred, \{ signal: stalkerAddAbortRef\.current\?\.signal/.test(addPl), 'D08: tekli ekleme ortak resolveMagInput kullanmıyor / iptal edilemiyor');
need(/cred\.portal = resolved\.endpoint; cred\.resolvedPortal = resolved; cred\.endpointPolicy = 'exact';/.test(addPl), 'D08: çözülen endpoint exact politikayla kilitlenmiyor');

// D11 — alternatif scheme yalnız seçilebilir API yokken
need(/if \(allowAlternateScheme && !hasSelectable\(\) && /.test(disc), 'D11: çalışan API varken https/http varyantları yine yoklanıyor (origin taşması)');

// D12 — istek bitince taşıma kapatılır
need(/budget\?\.signal\.removeEventListener\('abort', abortFromScope\);[\s\S]{0,600}c\.abort\(\);\s*\}\s*\}/.test(stalker), 'D12: reqTransport finally taşıma denetleyicisini kapatmıyor');

// D13 — ortak bütçe
need(fs.existsSync(path.join(root, 'frontend/src/utils/magDiscoveryBudget.ts')) && /class MagDiscoveryBudget/.test(rd('frontend/src/utils/magDiscoveryBudget.ts')), 'D13: MagDiscoveryBudget yok');

// Güvenlik — uzak istemci JS çalıştırılmaz, yabancı host'a yönlendirme kabul edilmez
need(!/\beval\s*\(|new Function\s*\(/.test(resolver), 'GÜVENLİK: istemci JS çalıştırılıyor');
need(/xpcom-foreign-host-rejected/.test(resolver) && /u\.origin !== from\.origin/.test(resolver), 'GÜVENLİK: yabancı origin/portal_ip reddi yok');

// CLAUDE §7 — stalker.ts / magPortalDiscovery.ts üst düzey platform importu eklenmez
need(!/^import [^\n]*from ["']@\/modules\/panel-scan["']/m.test(stalker) && !/^import [^\n]*magHostFailover/m.test(stalker), '§7: stalker.ts üst düzey panel-scan/failover importu');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.15 D01-D04 hesap alanları + D07 iptal edilebilir hazırlama + D08 endpoint kilidi + D11 scheme kapısı + D12 taşıma kapanışı + D13 bütçe + istemci-JS güvenliği TEMİZ');
