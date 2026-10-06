#!/usr/bin/env node
/**
 * v18.7.17 — portal keşfi + kopyala + güncelleme:
 * P1) portal version.js/xpcom doğrulanınca bütçeye grant (deadline öncesi API probe garantisi).
 * P2) "Yalnız girilen" (exact) + arayüz yolu `/c` → aynı kurulumda API çözülür.
 * P3) paralellik 1–100 (MAG_MAX_PARALLEL=100; girilen=çalışan; 3 haneli giriş).
 * K1) MAG kartında kullanıcı adı ÖNCE U4 stream değeri; bayat name(1787) gösterilmez.
 * K2) hesap kartı + düzenleme ekranı kopyala butonları (expo-clipboard).
 * E1) tekli MAG eklemede görsel CatalogPreparationModal.
 * G1) yıkıcı diff koruması (auto refresh'te eksik çekilen tür Room'u yarıdan aza düşüremez).
 * S1) Flight Recorder geçmişi silinince onay bildirimi.
 * M1) soğuk açılış ölçümü (APP_COLD_START).
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const disc = rd('frontend/src/utils/magPortalDiscovery.ts');
const budget = rd('frontend/src/utils/magDiscoveryBudget.ts');
const magBulk = rd('frontend/src/utils/magBulk.ts');
const magBulkUi = rd('frontend/app/mag-bulk.tsx');
const settings = rd('frontend/app/(tabs)/settings.tsx');
const editPl = rd('frontend/app/edit-playlist.tsx');
const addPl = rd('frontend/app/add-playlist.tsx');
const plCtx = rd('frontend/src/store/PlaylistContext.tsx');
const stats = rd('frontend/app/stats.tsx');
const layout = rd('frontend/app/_layout.tsx');
const app = JSON.parse(rd('frontend/app.json'));

const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180717, `expo.version (${ver}) >= 18.7.17 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// P1 — grant
need(/grant\(extraMs: number/.test(budget) && /this\.sharedBudget\?\.grant\(/.test(budget), 'P1: MagDiscoveryBudget.grant yok');
need(/if \(enqueued\) budget\.grant\(/.test(disc) && /resolved\.endpoints\.length\) budget\.grant\(/.test(disc), 'P1: portal doğrulanınca grant çağrısı yok');

// P2 — exact + /c API çöz
need(/const exactUiResolve = scope === "exact" && uiPath;/.test(disc) && /scope !== "exact" \|\| exactUiResolve/.test(disc), 'P2: exact + arayüz yolu API çözümü yok');

// P3 — paralellik 100
need(/MAG_MAX_PARALLEL = 100/.test(magBulk), 'P3: MAG_MAX_PARALLEL 100 değil');
need(/\.slice\(0, 3\)\)/.test(magBulkUi), 'P3: paralel giriş 3 hane değil (100 yazılamaz)');

// K1 — kullanıcı adı önceliği
need(/isStalker \? magDerived\?\.username : ""/.test(settings), 'K1: MAG kartı stream kullanıcı adını önceliklemiyor');
need(/accUsernameIsName/.test(settings), 'K1: bayat name=username ayıklaması yok');

// K2 — kopyala
need(/copyable \}: \{ label: string; value: string; accent\?/.test(settings) && /Clipboard\.setStringAsync\(value\)/.test(settings), 'K2: kart InfoField kopyala yok');
need(/<InfoField label="Kullanıcı Adı" copyable/.test(settings) && /<InfoField label="MAC" copyable/.test(settings), 'K2: kullanıcı adı/MAC kopyalanabilir değil');
need(/copy\?: string/.test(editPl) && /Clipboard\.setStringAsync\(copy!\)/.test(editPl) && /copy=\{stMac/.test(editPl), 'K2: düzenleme ekranı kopyala yok');

// E1 — tekli ekleme görsel modal
need(/<CatalogPreparationModal[\s\S]{0,200}visible=\{loading && method === "stalker"\}/.test(addPl), 'E1: tekli MAG eklemede görsel modal yok');
need(/setCatalogProgress\(prev => applyCatalogProgress\(prev, progress\)\)/.test(addPl), 'E1: tekli ekleme yapılandırılmış ilerleme beslemiyor');

// G1 — yıkıcı diff koruması
need(/MAG_REFRESH_SHRINK_GUARD/.test(plCtx) && /newCount < roomCount\*0\.5/.test(plCtx) && /!forceUnconditional/.test(plCtx), 'G1: shrink-guard yok');

// S1 — sil bildirimi
need(/Tanılama geçmişi silindi/.test(stats), 'S1: silme onay bildirimi yok');

// M1 — soğuk açılış ölçümü
need(/APP_COLD_START/.test(layout) && /MODULE_LOAD_MS/.test(layout), 'M1: soğuk açılış ölçümü yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.17 P1 grant + P2 exact-API + P3 paralellik-100 + K1 kullanıcı adı + K2 kopyala + E1 görsel ekleme + G1 shrink-guard + S1 bildirim + M1 ölçüm TEMİZ');
