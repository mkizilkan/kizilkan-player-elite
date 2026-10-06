#!/usr/bin/env node
/**
 * v18.7.23 — Hesap kartı oto-prime + oto-test:
 *  • Kart açılınca MAG hesabında kullanıcı adı yoksa Room'daki BİR kanalın create_link'i çözülüp
 *    kullanıcı adı/şifre OTOMATİK türetilir (oynatmasız, hesap başına bir kez: primeTriedRef).
 *    Cihaz kanıtı: v18.7.21 A yalnız yeni eklemede çalışıyordu; mevcut/manuel güncellenen hesapta kart boştu.
 *  • M3U linki hazır olunca "görüntü var/yok" testi OTOMATİK çalışır (autoTestedRef) — kullanıcı butona basmasın.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const settings = rd('frontend/app/(tabs)/settings.tsx');
const app = JSON.parse(rd('frontend/app.json'));

const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180723, `expo.version (${ver}) >= 18.7.23 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// Kart oto-prime
need(/primeTriedRef/.test(settings), 'oto-prime: primeTriedRef yok');
need(/useFocusEffect\(React\.useCallback/.test(settings), 'oto-prime: useFocusEffect yok');
need(/queryItems<any>\(playlist\.id, "live", \{ limit: 1 \}\)/.test(settings), 'oto-prime: Room canlı kanal okuma yok');
need(/stalker\.stalkerResolveStream\(/.test(settings), 'oto-prime: stalkerResolveStream çağrısı yok');
need(/setMagDerived\(readDerived\(\)\)/.test(settings), 'oto-prime: prime sonrası magDerived yeniden okunmuyor');

// M3U görüntü testi oto-çalışma
need(/autoTestedRef/.test(settings), 'oto-test: autoTestedRef yok');
need(/autoTestedRef\.current !== m3uLink && m3uTest\.state === "idle"/.test(settings) && /void testM3u\(\)/.test(settings), 'oto-test: m3uLink hazır olunca testM3u otomatik çalışmıyor');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.23 kart oto-prime (kullanıcı adı oynatmasız) + görüntü oto-testi TEMİZ');
