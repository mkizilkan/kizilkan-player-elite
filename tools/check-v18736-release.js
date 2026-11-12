#!/usr/bin/env node
/**
 * v18.7.36 — Oynatıcı hazırlanma bekçisi (P1) + yükleme kurtarma kontrolleri (P2)
 * + TV box odak düzeltmeleri (T1).
 *
 * CİHAZ KANITI (13.10.2026 uçuş kaydı, 47 oynatma oturumu): 7 oturum görüntü
 * GELMEDEN 9–61 sn bekleyip terk edildi. Mevcut ilk-kare bekçisi yalnız Media3
 * `readyToPlay` SONRASI çalışıyordu; readyToPlay hiç gelmezse hiçbir bekçi
 * tetiklenmiyor, ekran sonsuz yükleniyordu. 35 "acil kontrol" dokunuşunun hepsi
 * görüntü gelmeden yapılmıştı — yükleme sırasında kullanıcının kontrolü yoktu.
 *
 * KOD İNCELEME BULGUSU (T1): EPG, EPG zaman çizelgesi, catch-up, çoklu izleme,
 * indirmeler, liste düzenleme, gizli kanal yönetimi ham TouchableOpacity
 * kullanıyordu → kumandayla odak göstergesi yoktu.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

// --- Beş sürüm alanı (ileri uyumlu) ---
const app = JSON.parse(rd('frontend/app.json'));
const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180736, `expo.version (${ver}) >= 18.7.36 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code
  && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// --- P1: hazırlanma (readyToPlay-öncesi) bekçisi ---
const controller = rd('frontend/src/player/v2/controller.ts');
need(/export const PREPARE_TIMEOUT_LIVE_MS = \d+/.test(controller), 'PREPARE_TIMEOUT_LIVE_MS sabiti yok');
need(/export const PREPARE_TIMEOUT_VOD_MS = \d+/.test(controller), 'PREPARE_TIMEOUT_VOD_MS sabiti yok');
// Cömert olmalı: ilk-kare eşiklerinden büyük (yavaş ama sağlıklı yayını kesmesin).
const prepLive = Number(/PREPARE_TIMEOUT_LIVE_MS = (\d+)/.exec(controller)[1]);
const ffLive = Number(/FIRST_FRAME_TIMEOUT_LIVE_MS = (\d+)/.exec(controller)[1]);
need(prepLive > ffLive, 'hazırlanma eşiği ilk-kare eşiğinden büyük olmalı (cömert)');

const host = rd('frontend/src/player/PlayerHost.tsx');
need(/PREPARE_TIMEOUT_LIVE_MS/.test(host) && /PREPARE_TIMEOUT_VOD_MS/.test(host), 'PlayerHost hazırlanma eşiklerini kullanmıyor');
need(/HAZIRLANMA \(readyToPlay-ÖNCESİ\) BEKÇİSİ/.test(host), 'hazırlanma bekçisi bloğu yok');
// §5 tek bağlantı: yeni motor açılmadan Media3 durdurulmalı. Bekçi bloğunda
// pause + replace(null) bulunmalı.
need((host.match(/\(player as any\)\?\.replace\?\.\(null\)/g) || []).length >= 2,
  'hazırlanma bekçisinde Media3 replace(null) ile durdurma yok (§5 tek bağlantı)');

// --- P2: yükleme kurtarma kontrolleri ---
need(/const \[showRescueControls, setShowRescueControls\]/.test(host), 'showRescueControls durumu yok');
need(/testID="player-rescue-close-btn"/.test(host), 'kurtarma "Kapat" butonu yok');
need(/testID="player-rescue-engine-btn"/.test(host), 'kurtarma "Motoru Değiştir" butonu yok');
need(/PLAYER_RESCUE_CLOSE/.test(host) && /PLAYER_RESCUE_ENGINE/.test(host), 'kurtarma telemetrisi yok');
// Hızlı açılan kanalları rahatsız etmesin: gecikmeyle gösterilmeli.
need(/RESCUE_DELAY_MS = \d+/.test(host), 'kurtarma kontrolleri gecikmesi yok');

// --- T1: TV odak — 7 ekranda ham TouchableOpacity kalmamalı ---
for (const f of [
  'frontend/app/epg.tsx',
  'frontend/app/epg-timeline.tsx',
  'frontend/app/catchup.tsx',
  'frontend/app/multi-view.tsx',
  'frontend/app/downloads.tsx',
  'frontend/app/edit-playlist.tsx',
  'frontend/app/hidden-manager.tsx',
]) {
  const src = rd(f);
  const base = path.basename(f);
  need(!/TouchableOpacity/.test(src), `${base}: hâlâ ham TouchableOpacity var (TV'de odak görünmez)`);
  need(/FocusButton/.test(src), `${base}: FocusButton kullanmıyor`);
  need(/autoFocus/.test(src), `${base}: açılışta ilk odak (autoFocus) tanımlı değil`);
}

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.36 hazırlanma bekçisi (P1) + yükleme kurtarma kontrolleri (P2) + TV odak (T1) TEMİZ');
