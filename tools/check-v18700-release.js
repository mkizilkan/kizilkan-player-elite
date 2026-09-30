#!/usr/bin/env node
/**
 * v18.7.0 — Sürüm kapısı:
 *  P1 tekrar (MPV yeniden yükleme), P2 tek-öğe/tümü tekrar, P3 kısayol gelen kutusu + telemetri,
 *  P4 bitmap kısayol simgesi, P5 Medya Merkezi hızı (tek Collator + önbellek),
 *  P6 çoklu-MAC (portal keşfi, çoklu DNS, proxy köprüsü, tarama orkestratörü, UI).
 *  + 5 sürüm alanı v18.7.0 ve etiket RC1.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const NC = 'frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/';
const PS = 'frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/';
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const player = rd('frontend/src/player/PlayerHost.tsx');
const mod = rd(NC + 'KizilkanNativeCoreModule.kt');
const inbox = rd(NC + 'ShortcutInbox.kt');
const pkg = rd(NC + 'KizilkanShortcutPackage.kt');
const layout = rd('frontend/app/_layout.tsx');
const model = rd('frontend/src/utils/deviceMediaModel.ts');
const magBulk = rd('frontend/src/utils/magBulk.ts');
const magScan = rd('frontend/src/utils/magBulkScan.ts');
const stalker = rd('frontend/src/utils/stalker.ts');
const proxyPool = rd(PS + 'ScanProxyPool.kt');
const psModule = rd(PS + 'PanelScanModule.kt');
const psIndex = rd('frontend/modules/panel-scan/index.ts');
const magUi = rd('frontend/app/mag-bulk.tsx');
const app = rd('frontend/app.json');
const pkgJson = rd('frontend/package.json');

// Sürüm alanları — İLERİ UYUMLU (CLAUDE.md §4: sabit sürüm yazılmaz). v18.7.1: eski sabit
// `=== '18.7.0'` kontrolleri 18.7.1'de kapıyı kıracaktı; artık beş alanın TUTARLILIĞI ve >= 18.7.0.
const appObj = JSON.parse(app);
const ver = String(appObj.expo.version || '');
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : 0;
need(!!m && code >= 180700, `app.json expo.version (${ver}) >= 18.7.0 değil`);
need(appObj.expo.ios.buildNumber === ver, 'ios.buildNumber expo.version ile aynı değil');
need(Number(appObj.expo.android.versionCode) === code, `android.versionCode (${appObj.expo.android.versionCode}) formülle (${code}) uyuşmuyor`);
need(appObj.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'releaseLabel "GPT ELITE v<sürüm> RC1" değil');
need(JSON.parse(pkgJson).version === ver, 'package.json version expo.version ile aynı değil');

// P1/P2 — tekrar motor-farkında + tek öğe/tümü
need(/restartCurrentPlayback/.test(player) && /mpvRef\.current\?\.reload\?\.\(\)/.test(player), 'P1: MPV tekrar yeniden yükleme yok');
need(/rep === "all" && nextIsSelf/.test(player), 'P2: tek öğe "tümünü tekrarla" başa dönmüyor');
need(/items\.length < 2 && localRepeat === "off"/.test(player), 'P2: tek öğeli kuyruk repeat modunda komşu üretmiyor');

// P3 — kısayol gelen kutusu + telemetri
need(/object ShortcutInbox/.test(inbox) && /SHORTCUT_INTENT_RECEIVED/.test(inbox), 'P3: ShortcutInbox / native telemetri yok');
need(/class KizilkanShortcutPackage : Package/.test(pkg) && /ReactActivityLifecycleListener/.test(pkg), 'P3: yaşam döngüsü paketi yok');
need(/ShortcutInbox\.capture/.test(pkg) && /"cold"/.test(pkg), 'P3: soğuk açılışta yakalama yok');
need(/SHORTCUTS_INSTALLED/.test(layout) && /lastShortcutVia/.test(layout), 'P3: kurulum/telemetri yol bilgisi yok');
// v18.7.1 — AÇILIŞ ÇÖKÜŞÜ SINIFI: dinleyiciler Activity YAPICISINDA oluşturulur; bağlama dokunmak
// NullPointerException → uygulama hiç açılmaz. Paket/dinleyici oluşturulurken applicationContext YASAK.
{
  const createBody = (/createReactActivityLifecycleListeners\([^)]*\)[^=]*=\s*([\s\S]*?)\n\}/.exec(pkg) || [])[1] || '';
  need(createBody.length > 0 && !/applicationContext|baseContext|getSystemService|resources/.test(createBody), 'v18.7.1: createReactActivityLifecycleListeners içinde bağlam kullanılıyor (açılış çöküşü)');
  const ctorArgs = (/class ShortcutLifecycleListener\(([^)]*)\)/.exec(pkg) || [])[1] || '';
  need(!/applicationContext/.test(ctorArgs), 'v18.7.1: dinleyici yapıcısında applicationContext (açılış çöküşü)');
  need(/try \{ ShortcutInbox\.capture\(activity\.applicationContext/.test(pkg) && /try \{ ShortcutInbox\.capture\(activityContext\.applicationContext/.test(pkg), 'v18.7.1: kısayol yakalama try/catch içinde değil');
}
// v18.7.1: stalker.ts açılışta statik yüklenmez (mag-bulk açılışta yüklenen bir rota).
need(!/^import \{[^}]*\} from "@\/src\/utils\/stalker"/m.test(magScan), 'v18.7.1: magBulkScan stalker.ts\'i statik içe aktarıyor');

// P4 — bitmap simge
need(/createWithAdaptiveBitmap/.test(mod) && /createWithBitmap/.test(mod), 'P4: kısayol bitmap simgesi yok');
need(/getIdentifier\("ksc_\$\{iconName\}_fg", "drawable"/.test(mod), 'P4: kendi glif kaynağı kullanılmıyor');

// P5 — Medya Merkezi hızı
need(/export function trCompare/.test(model) && /new Intl\.Collator/.test(model), 'P5: tek Türkçe Collator yok');
need(/ASCII_ONLY/.test(model), 'P5: ASCII hızlı yolu yok');
need(/itemsCacheRef/.test(rd('frontend/app/media-center.tsx')) && /rowsCacheRef/.test(rd('frontend/app/media-center.tsx')), 'P5: sekme görünüm önbelleği yok');

// P6 — çoklu-MAC
need(/export function parseMacList/.test(magBulk) && /export function expandMacRange/.test(magBulk) && /export function parsePortalHosts/.test(magBulk) && /export function portalDiscoveryCandidates/.test(magBulk), 'P6: magBulk ayrıştırıcıları eksik');
need(/export async function discoverMagPortal/.test(stalker), 'P6: portal keşif fonksiyonu yok');
need(/export function setMagProxyRouting/.test(stalker) && /magProxyHosts/.test(stalker), 'P6: MAG proxy yönlendirme yok');
need(/fun proxiedRequest/.test(proxyPool) && /instanceFollowRedirects = false/.test(proxyPool), 'P6: başlık taşıyan proxy isteği yok');
need(/AsyncFunction\("proxiedRequest"\)/.test(psModule) && /proxiedRequest:/.test(psIndex), 'P6: proxiedRequest köprüsü yok');
need(/export async function runMagBulkScan/.test(magScan) && /discoverMagPortal/.test(magScan), 'P6: tarama orkestratörü yok');
need(/mag-bulk/.test(layout), 'P6: mag-bulk ekranı Stack\'e kayıtlı değil');
need(/runMagBulkScan/.test(magUi) && /Çoklu MAC/.test(magUi), 'P6: çoklu-MAC ekranı yok');
need(/stalker-bulk-btn/.test(rd('frontend/app/add-playlist.tsx')), 'P6: MAG bölümünde çoklu-MAC girişi yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.0 tekrar/kısayol/medya-hızı/çoklu-MAC sürüm kapısı TEMİZ');
