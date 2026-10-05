#!/usr/bin/env node
/**
 * v18.7.14 — GPT v18.7.13 incelemesi (G01-G06) + back-trap iptal:
 * A) MAG ekleme modalı iptal edilebilir (onRequestClose abort + "İptal" butonu + stalkerAddAbortRef, signal).
 * G01) çoklu doğrulama get_ordered_list boşsa sınırlı get_all_channels dener.
 * G02) snapshot'ta main-info görünen-adı profildeki gerçek login'i ezmez.
 * G03) pickUsernameField base64 MAC'i decode'dan ÖNCE eler (base64-MAC login seçilmez).
 * G04) kullanıcı adı zenginleştirmede gerçek bütçe (best sonrası her deneme sayılır + deadline).
 * G05) "Yalnız girilen" (exact) portsuz girişte bile kati; HTML-link/soft-404 exact'te kapalı.
 * G06) snapshot main-info yalnız MAC eşleşiyor + boş değilse otoriter.
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

const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180714, `expo.version (${ver}) >= 18.7.14 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// A — back-trap iptal
need(/stalkerAddAbortRef/.test(addPl) && /testID="stalker-add-cancel"/.test(addPl), 'A: MAG ekleme iptal butonu/ref yok');
need(/onRequestClose=\{\(\) => \{ stalkerAddAbortRef\.current\?\.abort\(\)/.test(addPl), 'A: onRequestClose hâlâ boş (hardware back iptal etmiyor)');
need(/stLogin\(cred, \{ signal: stalkerAddAbortRef\.current\?\.signal \}\)/.test(addPl), 'A: stLogin signal almıyor (iptal edilemez)');

// G01 — get_all_channels yedeği
need(/action: "get_all_channels"/.test(stalker) && /live-all-channels-sample/.test(stalker), 'G01: get_all_channels doğrulama yedeği yok');

// G02 — gerçek login korunur
need(/keepProfileLogin/.test(stalker) && /REAL_LOGIN_FIELDS\.has/.test(stalker), 'G02: main-info görünen-adı gerçek login\'i koruma mantığı yok');

// G03 — base64 MAC decode'dan önce elenir
need(/const decoded = String\(decodeMacIfBase64\(t\) \|\| t\);[\s\S]{0,80}MAC_SHAPE\.test\(decoded\)/.test(stalker), 'G03: pickUsernameField decode-önce-MAC elemesi yok');

// G04 — gerçek bütçe
need(/ENRICH_MAX_AFTER_BEST/.test(stalker) && /ENRICH_DEADLINE_MS/.test(stalker) && /afterBest\+\+/.test(stalker), 'G04: enrichment gerçek bütçe/deadline yok');

// G05 — exact kati (portsuz dahil) + HTML-link kapalı
need(/opts\.scope === "exact" \? "exact"/.test(disc), 'G05: portsuz+exact hâlâ fallback\'a yükseliyor');
need(/scope !== "exact" && fingerprint\.length/.test(disc), 'G05: HTML-link/soft-404 exact\'te kapatılmamış');

// G06 — snapshot MAC + boş-değil otorite
need(/const mainAuthoritative = !!main && accountMatchesMac\(main, suppliedMac\) && Object\.keys\(main\)\.length > 0/.test(stalker), 'G06: snapshot main-info MAC/boş otorite kontrolü yok');
need(/STALKER_MAIN_INFO_REJECTED/.test(stalker), 'G06: reddedilen main-info telemetrisi yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.14 back-trap iptal + G01 all_channels + G02 login koruma + G03 base64 + G04 bütçe + G05 kati exact + G06 snapshot MAC kapısı TEMİZ');
