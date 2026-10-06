#!/usr/bin/env node
/**
 * v18.7.18 — yedekleme dayanıklılığı + Google Drive runtime yapılandırma:
 * B1) Tam yedek: yetim/boş-kabuk playlist (queryItems IllegalStateException) TÜM yedeği düşürmez;
 *     o tür atlanır (chunk-error), yedeğe devam edilir.
 * G1) Google Drive OAuth Client ID kullanıcı tarafından uygulama içinde girilir (env zorunlu değil);
 *     storage'dan hidratlanır; redirect scheme hardcode edilmez (uygulama scheme'i kullanılır).
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const backup = rd('frontend/src/utils/backupV3.ts');
const drive = rd('frontend/src/utils/googleDrive.ts');
const backupUi = rd('frontend/app/backup.tsx');
const layout = rd('frontend/app/_layout.tsx');
const app = JSON.parse(rd('frontend/app.json'));

const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180718, `expo.version (${ver}) >= 18.7.18 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// B1 — yedek dayanıklılığı
need(/try \{[\s\S]{0,400}await KizilkanNativeCore\.queryItems<any>\(id, kind/.test(backup), 'B1: queryItems try/catch ile sarılmadı');
need(/chunk-error/.test(backup) && /BACKUP_KIND_SKIPPED/.test(backup), 'B1: yetim playlist atlama (chunk-error) yok');
// abort hâlâ yedeği durdurur (yutulmaz)
need(/İşlem iptal\|aborted\|AbortError[\s\S]{0,80}\)\) throw e;/.test(backup), 'B1: abort yutulmamalı (yedeği durdurmalı)');

// G1 — Google Drive runtime client ID
need(/export async function hydrateGoogleDriveConfig/.test(drive) && /export async function setGoogleDriveClientId/.test(drive) && /export function getGoogleDriveClientId/.test(drive), 'G1: runtime client ID fonksiyonları yok');
need(/isGoogleDriveConfigured\(\): boolean \{\s*return !!getGoogleDriveClientId\(\);/.test(drive), 'G1: isGoogleDriveConfigured runtime ID kullanmıyor');
need(/export function getGoogleDriveRedirectUri/.test(drive), 'G1: redirect URI gösterimi yok');
need(!/scheme: 'frontend'/.test(drive), 'G1: redirect scheme hâlâ hardcode "frontend"');
need(/clientId,\s*\n\s*scopes: \[DRIVE_SCOPE/.test(drive), 'G1: authenticate runtime clientId kullanmıyor');
need(/hydrateGoogleDriveConfig\(\)/.test(layout), 'G1: açılışta hydrate çağrısı yok');
// UI
need(/drive-client-id-input/.test(backupUi) && /drive-save-client-id/.test(backupUi) && /drive-copy-redirect/.test(backupUi), 'G1: Google Drive client ID girişi/UI yok');
need(/Giriş yap ve Yükle/.test(backupUi), 'G1: giriş+yükle butonu yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.18 B1 yedek yetim-playlist dayanıklılığı + G1 Google Drive runtime client ID/OAuth TEMİZ');
