#!/usr/bin/env node
/**
 * v18.7.7 — MAG hesap kartı doğruluğu + oynatma/senkron düzeltmeleri kapısı.
 * Cihaz kanıtı (tanı 2026-10-03T05-13): phone'da gelen bitiş, gzip'li get_main_info,
 * status 0'ın "SÜRESİ DOLDU" sanılması, base64 MAC, motor geçişinde bayat play_token,
 * ekleme sırasında çift katalog işi, sade ilerleme.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const stalker = rd('frontend/src/utils/stalker.ts');
const expiry = rd('frontend/src/utils/accountExpiry.ts');
const player = rd('frontend/src/player/PlayerHost.tsx');
const ctx = rd('frontend/src/store/PlaylistContext.tsx');
const settings = rd('frontend/app/(tabs)/settings.tsx');
const types = rd('frontend/src/types/index.ts');
const idx = rd('frontend/app/(tabs)/index.tsx');
const app = JSON.parse(rd('frontend/app.json'));

// Sürüm (ileri uyumlu)
const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180707, `expo.version (${ver}) >= 18.7.7 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// P1 — phone→bitiş + gün-ay-yıl / Türkçe ay biçimi
need(/phoneIsExpiry/.test(stalker), 'P1: phone→bitiş son-çare mantığı yok');
need(/dmy = raw\.match/.test(expiry) && /monthIndex/.test(expiry), 'P1: gün-ay-yıl / çok-dilli ay ayrıştırma yok');
need(/mayıs|aralık/.test(expiry), 'P1: Türkçe ay adları yok');

// P2 — gzip (önceki oturumda eklendi, korunmalı)
need(/Accept-Encoding/.test(stalker) && /GZIP_UNDECODED/.test(stalker), 'P2: gzip düzeltmesi/telemetrisi yok');
need(/exactEndpoint ZORLANMAZ/.test(stalker), 'P2: snapshot exactEndpoint zorlamayı bırakmamış');

// P3 — Stalker status 0 = aktif
need(!/\/\^\(\?:0\|false\)\$\/\.test\(status\)/.test(stalker), 'P3: sayısal status 0 hâlâ "bloklu" sayılıyor');
need(/SAYISAL status 0 = AKTİF/.test(stalker), 'P3: status semantiği notu/yok');

// P4 — base64 MAC/login + password
need(/function decodeMacIfBase64/.test(stalker) && /base64DecodeAscii/.test(stalker), 'P4: base64 MAC çözücü yok');
need(/password\?: string/.test(types), 'P4: AccountInfo.password yok');
need(/primitiveString\(p\.password/.test(stalker), 'P4: snapshot/normalize password okumuyor');
need(/label="Şifre"/.test(settings), 'P4: kartta şifre gösterimi yok');

// P5 — motor geçişinde taze create_link
need(/STALKER_ENGINE_SWITCH_REFRESH/.test(player), 'P5: motor geçişinde taze create_link yok');

// P6 — ilk senkronda otomatik güncellik atla
need(/FRESHNESS_SKIP_INITIAL_SYNC/.test(ctx) && /initialSyncState/.test(ctx), 'P6: ilk senkron guard yok');

// P7 — Media3 geç açılma ölçümü
need(/media3SourceSetAtRef/.test(player) && /sinceSourceSetMs/.test(player), 'P7: kaynak-sonrası süre ölçümü yok');

// P8 — ortada simgeli ilerleme kutusu
need(/freshnessStatus\?\.active/.test(idx), 'P8: aktif ilerleme overlay kullanılmıyor');
need(/active\?:boolean/.test(ctx), 'P8: freshnessStatus.active alanı yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.7 MAG hesap kartı doğruluğu + oynatma/senkron düzeltmeleri kapısı TEMİZ');
