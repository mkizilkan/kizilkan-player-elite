#!/usr/bin/env node
/**
 * v18.7.11 — MAG profil-uyumluluk çekirdeği (cihaz 18.7.10 logu + protokol araştırması):
 *  A/M07+M08: MAG320 get_profile minimal BOŞ dönerse DOLU-parametreli (sn/stb_type/image_version/ver)
 *             MAG254/MAG250 varyantlarına + türetilmiş kimliğe düşer (panel-c gibi portaller böyle açılır).
 *  B/M08:     stalkerVerifyAccount kimlik yoksa HEMEN unverified demez; canlı/VOD/dizi erişimi varsa verified.
 *  C/T02:     snapshot telemetrisi `usernamePresent/passwordPresent/usernameFieldKind` (redaksiyona takılmaz)
 *             + aday alan varlıkları → panel-a kullanıcı adının hangi alanda olduğu değer açılmadan görünür.
 *  M09:       discoverMagPortal DUVAR-SAATİ bütçesi (cihaz: keşif ~19 dk) → BUDGET_STOP (tamamlanamadı).
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const stalker = rd('frontend/src/utils/stalker.ts');
const app = JSON.parse(rd('frontend/app.json'));

// Sürüm (ileri uyumlu)
const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180711, `expo.version (${ver}) >= 18.7.11 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// A (M07/M08) — MAG320 minimal + dolu varyant zinciri
need(/MAG320-pcap-minimal"[^]*?\.\.\.mag254Variants,\s*\.\.\.mag250Variants/.test(stalker), 'A: MAG320 minimal sonrası dolu MAG254/MAG250 varyantlarına düşmüyor');
need(/preferredModel === "MAG320" \? \["MAG254","MAG250"\]/.test(stalker), 'M07/M08: derivedProfileVariants MAG320 için türetilmiş varyant üretmiyor');

// B (M08) — kimlik yoksa canlı erişime devam
need(/missing-account-identity-proceed-to-access/.test(stalker), 'B: kimlik yoksa canlı erişime devam etmiyor (hâlâ erken unverified)');
need(!/return finish\("unverified", "missing-account-identity"\)/.test(stalker), 'B: eski erken "missing-account-identity" dönüşü hâlâ var');

// C (T02) — güvenli varlık telemetrisi
need(/usernamePresent:/.test(stalker) && /passwordPresent:/.test(stalker), 'C/T02: usernamePresent/passwordPresent yok (hâlâ hasUsername/hasPassword)');
need(/usernameFieldKind:/.test(stalker) && /usernameSourceKind:/.test(stalker), 'C: kullanıcı adı alan/kaynak telemetrisi yok');
need(!/hasUsername:\s*!!merged\.username/.test(stalker), 'C: eski redakte edilen hasUsername alanı hâlâ var');
need(/function pickUsernameField/.test(stalker), 'C: ortak pickUsernameField yardımcısı yok');

// M09 — keşif duvar-saati bütçesi
need(/wallBudgetMs/.test(stalker) && /STALKER_PORTAL_DISCOVERY_BUDGET_STOP/.test(stalker), 'M09: discoverMagPortal duvar-saati bütçesi/telemetrisi yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.11 MAG profil-uyumluluk (dolu-parametre varyant + canlı-erişim geçerliliği) + kullanıcı adı telemetrisi + keşif bütçesi kapısı TEMİZ');
