#!/usr/bin/env node
/**
 * v18.7.5 — Media3 ses durumu TELEMETRİSİ kapısı (kanıt toplama; düzeltme değil).
 * Cihaz: "bazen Media3'te ses gelmiyor". Kök neden kanıtlanmadan düzeltme yapılmaz; önce
 * her aşamada (readyToPlay / sourceLoad / ilk-kare sonrası) ses parça durumu kaydedilir.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const player = rd('frontend/src/player/PlayerHost.tsx');
const app = JSON.parse(rd('frontend/app.json'));

// Sürüm (ileri uyumlu)
const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180705, `expo.version (${ver}) >= 18.7.5 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// Telemetri yardımcısı ve üç aşama
need(/const emitMedia3Audio = \(stage: string\)/.test(player), 'emitMedia3Audio yardımcısı yok');
need(/"MEDIA3_AUDIO_STATE"/.test(player), 'MEDIA3_AUDIO_STATE olayı yok');
need(/suspectSilent:/.test(player) && /audioCount:/.test(player) && /hasActiveAudio:/.test(player), 'ses durumu alanları eksik');
need(/emitMedia3Audio\("readyToPlay"\)/.test(player), 'readyToPlay aşaması kaydedilmiyor');
need(/emitMedia3Audio\("sourceLoad"\)/.test(player), 'sourceLoad aşaması kaydedilmiyor');
need(/emitMedia3Audio\("post-first-frame"\)/.test(player), 'ilk-kare sonrası aşama kaydedilmiyor');
// İlk-kare telemetrisi timeshift moduyla etiketli (Kapalı vs Her zaman ilk-kare kıyası).
need(/timeshiftMode: liveTimeshiftModeRef\.current,\n\s*\}, \{ sessionId: playerDiagnosticSessionRef\.current \}\);/.test(player) || /FIRST_FRAME[\s\S]{0,400}timeshiftMode: liveTimeshiftModeRef\.current/.test(player), 'FIRST_FRAME timeshift moduyla etiketlenmiyor');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.5 Media3 ses telemetrisi (readyToPlay/sourceLoad/post-first-frame) kapısı TEMİZ');
