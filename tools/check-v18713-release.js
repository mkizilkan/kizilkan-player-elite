#!/usr/bin/env node
/**
 * v18.7.13 — (1) manuel portal seçiminde "portal izi" de seçilebilir + seçim fazı her zaman açılır;
 * (2) kullanıcı adı zenginleştirme (login boşsa dolu-parametre get_profile ile gerçek login);
 * (3) A01: accountMatchesMac base64 MAC çözer; (4) "Yalnız girilen" (exact) KATİ kapsam.
 * Cihaz kanıtı: goldensm32 "ben seçeyim"de seçilemiyordu; hkpremium login=1787 (gerçek ud3B3yRH); base64 mac-mismatch.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const stalker = rd('frontend/src/utils/stalker.ts');
const disc = rd('frontend/src/utils/magPortalDiscovery.ts');
const bulk = rd('frontend/src/utils/magBulkScan.ts');
const ui = rd('frontend/app/mag-bulk.tsx');
const app = JSON.parse(rd('frontend/app.json'));

const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180713, `expo.version (${ver}) >= 18.7.13 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// #1 manuel portal seçimi
need(/portalChoiceMode !== "manual" && \(report\.state !== "ready" \|\| !candidate\.selectable\)/.test(ui), '#1: manuel modda iz seçilebilir yapılmamış (UI disabled)');
need(/const pickableReport =/.test(bulk) && /reports\.some\(pickableReport\)/.test(bulk), '#1: seçim fazı iz-içeren (terminal-olmayan) raporlarda açılmıyor');
need(/rep\.state === "error" \|\| rep\.state === "protected"/.test(bulk) && /c\.endpoint === endpoint && c\.confidence !== "protected"/.test(bulk), '#1: seçim doğrulaması (terminal/koruma dışı bulunan aday) yok');

// #2 kullanıcı adı zenginleştirme
need(/REAL_LOGIN_FIELDS/.test(stalker) && /const hasRealLogin =/.test(stalker), '#2: hasRealLogin / gerçek login alanları yok');
need(/if \(best\) return best;/.test(stalker), '#2: login\'siz yedek profil (eski davranış) korunmuyor');

// #3 A01 base64 MAC
need(/function accountMatchesMac[\s\S]*?decodeMacIfBase64\(p\[field\]\.trim\(\)\)/.test(stalker), '#3/A01: accountMatchesMac base64 MAC çözmüyor');

// #4 "Yalnız girilen" (exact) kati kapsam
need(/scope === "exact"\) \{[\s\S]*?await sweep\(\[entered\]\)/.test(disc), '#4: exact kapsamda yalnız girilen endpoint denenmiyor (discovery)');
// v18.7.17 (P2): exact + ARAYÜZ yolu (`/c`) API çözümüne izin verir; literal .php yol hâlâ kati. version.js
// gate artık `(scope !== "exact" || exactUiResolve)` — exact literal yolda genişleme YOK (exactUiResolve=false).
need(/\(scope !== "exact" \|\| exactUiResolve\) && response\.status >= 200/.test(disc) && /const exactUiResolve = scope === "exact" && uiPath;/.test(disc), '#4: exact version.js genişletmesi yalnız arayüz yolunda açık değil');
need(/\(scope === "exact" \|\| isLiteralPhp\) \? \[hostEntry\.host\]/.test(bulk), '#4: bulk handshake yedeği exact kapsamda yalnız girilen endpoint denemiyor');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.13 manuel portal seçimi + kullanıcı adı zenginleştirme + A01 base64 MAC + exact kati kapsam kapısı TEMİZ');
