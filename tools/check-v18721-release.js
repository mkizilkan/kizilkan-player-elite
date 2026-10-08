#!/usr/bin/env node
/**
 * v18.7.21 — A (ekleme-anında kullanıcı adı) + B (Xtream combo özel paralellik) + C (M3U link/test) + D (arka plan servisi):
 * A) stalkerPrimeStreamCredentials — eklemede ilk kanalın create_link'inden kullanıcı adı/şifre türetir (oynatmasız).
 * B) Xtream combo'da kullanıcı özel paralellik (1–250, girilen=çalışan; boş→mod).
 * C) hesap kartında Xtream M3U get.php linki üret + kopyala + "görüntü var/yok" testi.
 * D) genel "canlı tut" ön plan servisi (ForegroundKeepAliveService) — MAG tarama/ekleme/güncelleme arka planda sürer.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const ex = f => fs.existsSync(path.join(root, f));
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const stalker = rd('frontend/src/utils/stalker.ts');
const addPl = rd('frontend/app/add-playlist.tsx');
const magBulkUi = rd('frontend/app/mag-bulk.tsx');
const settings = rd('frontend/app/(tabs)/settings.tsx');
const plCtx = rd('frontend/src/store/PlaylistContext.tsx');
const nativeIdx = rd('frontend/modules/kizilkan-native-core/index.ts');
const manifest = rd('frontend/modules/kizilkan-native-core/android/src/main/AndroidManifest.xml');
const nativeMod = rd('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt');
const app = JSON.parse(rd('frontend/app.json'));

const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180721, `expo.version (${ver}) >= 18.7.21 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// A — ekleme-anında kullanıcı adı
need(/export async function stalkerPrimeStreamCredentials/.test(stalker), 'A: stalkerPrimeStreamCredentials yok');
need(/stalkerPrimeStreamCredentials\(cred, session, catalog\.channels/.test(addPl), 'A: tekli ekleme prime çağrısı yok');
need(/stalkerPrimeStreamCredentials\(cred, session, catalog\.channels/.test(magBulkUi), 'A: çoklu ekleme prime çağrısı yok');
need(/server: u\.origin/.test(stalker), 'A/C: yayın sunucusu (server) depolanmıyor');

// B — Xtream combo paralellik
need(/comboParallelText/.test(addPl) && /combo-parallel-input/.test(addPl), 'B: Xtream combo paralellik girişi yok');
need(/manual \? \{ \.\.\.base, requestedConcurrency: manual \}/.test(addPl), 'B: girilen paralellik uygulanmıyor');

// C — M3U link + test
need(/const m3uLink = /.test(settings) && /get\.php\?username=/.test(settings), 'C: M3U linki üretilmiyor');
need(/copy-m3u-link/.test(settings) && /test-m3u-link/.test(settings), 'C: M3U kopyala/test butonu yok');
need(/get_live_streams/.test(settings) && /katalog/i.test(settings) && /ilk kare sınanmadı/i.test(settings), 'C: katalog testi / ilk kare ayrımı yok');

// D — arka plan servisi
need(ex('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/ForegroundKeepAliveService.kt'), 'D: ForegroundKeepAliveService.kt yok');
need(/ForegroundKeepAliveService/.test(manifest) && /foregroundServiceType="dataSync"/.test(manifest), 'D: manifest servis kaydı/dataSync yok');
need(/Function\("startForegroundKeepAlive"\)/.test(nativeMod) && /Function\("stopForegroundKeepAlive"\)/.test(nativeMod), 'D: native keep-alive fonksiyonları yok');
need(/startForegroundKeepAlive:/.test(nativeIdx) && /stopForegroundKeepAlive:/.test(nativeIdx), 'D: JS köprüsü yok');
need(/startForegroundKeepAlive\(/.test(magBulkUi) && /stopForegroundKeepAlive\(keepAliveOwner\)/.test(magBulkUi), 'D: mag-bulk sahipli keep-alive çağrısı yok');
need(/startForegroundKeepAlive\(/.test(plCtx) && /stopForegroundKeepAlive\(keepAliveOwner\)/.test(plCtx), 'D: güncelleme sahipli keep-alive çağrısı yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.21 A ekleme-anında kullanıcı adı + B Xtream combo paralellik + C M3U link/test + D arka plan keep-alive servisi TEMİZ');
