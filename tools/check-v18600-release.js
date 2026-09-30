#!/usr/bin/env node
/**
 * v18.6.0 — Sürüm kapısı: kayıt (3 motor), parçalı indirme, kısayollar, tarama paralelliği,
 * TXT görünür klasör, Medya Merkezi aşamalı yükleme, Cast fotoğraf/slayt, sürekli çal, izlendi işaretleri.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const NC = 'frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/';
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const mod = rd(NC + 'KizilkanNativeCoreModule.kt');
const app = rd('frontend/app.json');
const layout = rd('frontend/app/_layout.tsx');
const svc = rd('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt');
const add = rd('frontend/app/add-playlist.tsx');
const player = rd('frontend/src/player/PlayerHost.tsx');
const ts = rd(NC + 'LiveTimeshiftManager.kt');
const mpvView = rd('frontend/modules/mpv-player/android/src/main/java/expo/modules/kizilkanmpv/KizilkanMpvView.kt');
const mpvIdx = rd('frontend/modules/mpv-player/index.tsx');
const dl = rd(NC + 'DownloadEngine.kt');
const dlg = rd('frontend/src/components/DownloadDialog.tsx');
const detail = rd('frontend/app/detail.tsx');
const lib = rd('frontend/src/store/LibraryContext.tsx');
const poster = rd('frontend/src/components/PosterGrid.tsx');
const pv = rd('frontend/app/photo-viewer.tsx');
const mc = rd('frontend/app/media-center.tsx');
const lml = rd(NC + 'LocalMediaLibrary.kt');

// Kısayollar
need(/Intent\("\$\{ctx\.packageName\}\.SHORTCUT_\$\{id\.uppercase\(\)\}"\)/.test(mod), 'kısayol kendi eylemini kullanmıyor (Android isteği iletmez)');
// v18.7.0+: kendi simgeler bitmap olarak çizilir (ksc_<ad>_fg) — mipmap kaynağı da kabul (ileri uyumlu).
need(/getIdentifier\("ksc_\$iconName", "mipmap"/.test(mod) || /getIdentifier\("ksc_\$\{iconName\}_fg", "drawable"/.test(mod), 'kısayol kendi simgelerini kullanmıyor');
need(/"\.\/plugins\/withShortcutIcons"/.test(app), 'withShortcutIcons eklentisi kayıtlı değil');
need(/APP_SHORTCUT_WAITING/.test(layout) && /APP_SHORTCUT_UNKNOWN/.test(layout), 'kısayol telemetrisi eksik');

// Tarama paralelliği
need(/val workerCap = computeEffectiveConcurrency\(applicationContext, requested, 250\)/.test(svc) && /"BATCH_PLAN"/.test(svc), 'parti işçileri doyuracak kadar büyümüyor');
need(/ScanProxyToggleRow/.test(add) && (add.match(/<ScanProxyToggleRow/g) || []).length >= 2, 'proxy anahtarı iki tarama bölümünde değil');

// TXT
need(/writePublicTextFile\("Hesap Arşivi"/.test(add), 'TXT varsayılanı görünür klasör değil');
need(fs.existsSync(path.join(root, NC + 'PublicStorage.kt')), 'PublicStorage.kt yok');

// Kayıt (3 motor)
need(!/Kayıt için VLC gerekiyor/.test(player), 'kayıt hâlâ yalnız VLC');
need(/mpvRef\.current\?\.startRecord\(path\)/.test(player) && /stream-record/.test(mpvView) && /startRecord:/.test(mpvIdx), 'MPV kaydı yok');
need(/liveTimeshiftStartRecord\(/.test(player) && /fun startRecord\(id: String, path: String\)/.test(ts) && /teeWrite\(packet\)/.test(ts), 'Media3 canlı (tee) kaydı yok');
need(/recordForcesTimeshift\)/.test(player), 'kayıt zaman kaydırmayı zorunlu açmıyor');
need(/reason: "record-vod"/.test(player), 'film/dizi kaydı indirme motoruna bağlı değil');

// İndirme
need(/setRequestProperty\("Range"/.test(dl) && /coerceIn\(1, 16\)/.test(dl), 'parçalı indirme motoru eksik');
need(/relaunchSingle\(/.test(dl), 'çok parça reddedilince tek parçaya düşme yok');
need(/PART_CHOICES = \[1, 2, 4, 8, 16\]/.test(dlg) && /maxConnections/.test(dlg), 'indirme diyaloğu parça/bağlantı sınırı yok');
need(/episode-\$\{ep\.id\}-dl/.test(detail), 'bölüm indirme düğmesi yok');

// İzlendi
need(/const WATCHED_KEY = "kizilkan\.watched\."/.test(lib) && /markWatched\(id, true\)/.test(lib), 'izlendi kaydı yok');
need(/SERIES_LAST_KEY/.test(lib) && /setSeriesLast\(String\(item\.id\)/.test(detail), 'dizide kalınan bölüm kaydı yok');
need(/watchedTag/.test(poster) && /S\$\{last\.season\}·B\$\{last\.episode\}/.test(poster), 'afiş işaretleri yok');
need(/isWatched\(String\(ep\.id\)\)/.test(detail) && /allSeen/.test(detail), 'bölüm/sezon işaretleri yok');

// Cast + sürekli + medya
need(/<CastButton testID="pv-cast"/.test(pv) && /slideLoop/.test(pv), 'fotoğraf Cast / slayt döngüsü yok');
need(/localRepeat/.test(player) && /LOCAL_REPEAT_ONE/.test(player), 'sürekli çal / tekrar yok');
need(/pageCache/.test(lml) && /onPage\?\.\(/.test(rd('frontend/src/utils/deviceMedia.ts')), 'Medya Merkezi aşamalı yükleme yok');
need(/computeMs: computeMsRef\.current/.test(mc), 'sekme hesap süresi telemetrisi yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.6.0 kayıt/indirme/kısayol/tarama/medya/izlendi sürüm kapısı TEMİZ');
