#!/usr/bin/env node
/**
 * v18.7.2 — Çoklu-MAC UX sürüm kapısı:
 *  A tema (ThemePalette tip + surface), B keşif hızı (düz fetch + kısa timeout + akıllı/geniş port),
 *  C canlı bilgilendirme, D analiz modları, E dosyadan MAC, F TXT+katalog kaydı, G portsuz normal ekleme.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const ui = rd('frontend/app/mag-bulk.tsx');
const bulk = rd('frontend/src/utils/magBulk.ts');
const scan = rd('frontend/src/utils/magBulkScan.ts');
const stalker = rd('frontend/src/utils/stalker.ts');
const add = rd('frontend/app/add-playlist.tsx');
const discovery = rd('frontend/src/utils/magPortalDiscovery.ts');
const app = JSON.parse(rd('frontend/app.json'));

// Sürüm (ileri uyumlu)
const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180702, `expo.version (${ver}) >= 18.7.2 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// A — tema: background YOK; surface kullanılır; makeStyles tipli (any değil)
need(!/backgroundColor: c\.background\b/.test(ui) && /backgroundColor: c\.surface\b/.test(ui), 'A: mag-bulk kökü surface kullanmıyor');
need(/function makeStyles\(c: ThemePalette\)/.test(ui), 'A: makeStyles ThemePalette tipli değil (any tema hatasını gizler)');

// B — keşif hızı
need(/setMagBulkRouting/.test(stalker) && /magBulkHosts/.test(stalker) && /!magBulkHosts\.has\(hostnameOf/.test(stalker), 'B: toplu taramada düz fetch yolu yok');
need(/timeoutMs = opts\.timeoutMs \?\? 6000/.test(stalker), 'B: keşif kısa zaman aşımı yok');
need(/guard\.networkAttempts = 0; guard\.authRejects = 0;/.test(stalker), 'B: keşifte aday başına bütçe sıfırlama yok');
need(/YOL-ÖNCELİKLİ SÜPÜRME/.test(bulk), 'B: akıllı aday sıralaması yok');
need(/8081, 8082, 8083/.test(bulk) && /25462, 25463/.test(bulk) && /9090/.test(bulk), 'B: geniş port listesi eksik');

// C — canlı bilgilendirme
need(/onStage\?:/.test(scan) && /Portal keşfi ·/.test(discovery) && /onPortalDiscovery/.test(scan), 'C: keşif canlı bilgilendirme yok');
need(/stageMsg/.test(ui), 'C: ekranda canlı satır yok');

// D — analiz modları + elle paralel sayı
need(/SCAN_MODES/.test(ui) && /Turbo/.test(ui) && /Güvenli/.test(ui) && /maxCandidatesPerHost: mode\.maxCandidates/.test(ui), 'D: analiz modları yok');
need(/mag-parallel-input/.test(ui) && /parallelText/.test(ui), 'D: elle paralel sayı girişi yok');
// Genişletilmiş portal yolları
need(/\/stalker_portal\/c\//.test(bulk) && /\/ministra\//.test(bulk) && /\/portal\//.test(bulk), 'B: genişletilmiş portal yolları eksik');

// E — dosyadan MAC
need(/expo-document-picker/.test(ui) && /parseMacList\(text\)/.test(ui), 'E: dosyadan MAC seçme yok');

// F — TXT + katalog kaydı
need(/writePublicTextFile\("MAG Hesap Arşivi"/.test(ui) && /stalkerCategoryPreview/.test(ui) && /MAG_BULK_SAVED/.test(ui), 'F: TXT+katalog kaydı yok');
need(/mag-katalog-/.test(ui), 'F: katalog özeti kaydı yok');

// G — portsuz normal MAG eklemede keşif
need(/if \(!u\.port\)/.test(add) && /discoverMagPortal\(cred, cands/.test(add) && /stalkerPortal: cred\.portal/.test(add), 'G: portsuz normal MAG eklemede port keşfi yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.2 çoklu-MAC UX (tema/keşif/mod/dosya/kayıt/portsuz) sürüm kapısı TEMİZ');
