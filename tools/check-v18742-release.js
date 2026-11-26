#!/usr/bin/env node
/**
 * v18.7.42 — Aynı hesap birleştirme yeniden tasarımı:
 *  #1 Kimlik ölçütü artık panelName DEĞİL, hesabın gerçek kimliği
 *     (Xtream exp_date+created_at, MAG MAC+exp_date). Aynı user:pass farklı panelde
 *     farklı hesap olabilir → ayırt edici bu. Kimlik yoksa user+pass'e düşer.
 *  #1 Birleştirmede her panelin SUNUCU KODU korunur: serverCodeBinding.sources
 *     tüm üyelerin birleşimi (buildMergedServerCodeBinding) → DNS ölünce tüm
 *     panellerden taze adres çekilir.
 *  #1 Birincil = en zengin katalog (dizi=0 kopya birincil kalıp içerik kaybetmesin).
 *  #2 Modal UI: safe-area + sabit alt bar (buton navigasyon çubuğu altında kalmaz) +
 *     net istatistik (birleştirilen/silinen/kalan) + ilerleme çubuğu.
 *  #3 Ayarlar: "Aynı Hesap Analizi" her zaman görünür + kopya varsa kapatılabilir uyarı.
 *  Ayrıca v18.7.41 (#2 ses→MPV, #3 Link Test async, #5 buton taşma) korunur (regresyon kapısı).
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
need(code >= 180742, `expo.version (${ver}) >= 18.7.42 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code
  && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

// --- #1 kimlik ölçütü (panelName DEĞİL, gerçek kimlik) ---
const pm = rd('frontend/src/utils/playlistMerge.ts');
need(/export function accountIdentitySig/.test(pm), 'playlistMerge: accountIdentitySig yok');
need(/export function credentialKey/.test(pm), 'playlistMerge: credentialKey yok');
need(/export function accountMergeKey/.test(pm), 'playlistMerge: accountMergeKey yok');
need(/export function findDuplicateGroups/.test(pm), 'playlistMerge: findDuplicateGroups yok');
need(/export function hostsOf/.test(pm), 'playlistMerge: hostsOf yok');
need(/export function mergedBackupHosts/.test(pm), 'playlistMerge: mergedBackupHosts yok');
// KRİTİK: kimlik imzası exp_date + created_at'e dayanmalı.
need(/exp_date/.test(pm) && /created_at/.test(pm), 'playlistMerge: kimlik imzası exp_date/created_at içermiyor');
// KRİTİK: accountMergeKey panelName'e dayanMAmalı; kimlik imzasını kullanmalı.
const amk = (pm.match(/export function accountMergeKey[\s\S]{0,400}?\n\}/) || [''])[0];
need(/accountIdentitySig/.test(amk) && !/panelName/.test(amk), 'playlistMerge: accountMergeKey hâlâ panelName kullanıyor (kimliğe geçmeli)');
// Birincil seçimi en zengin katalogu tutmalı.
need(/catalogScore/.test(pm), 'playlistMerge: birincil katalog-zenginliği (catalogScore) yok');

// --- #1 sunucu kodu birleşimi ---
need(/export function mergedServerCodeSources/.test(pm), 'playlistMerge: mergedServerCodeSources (kod birleşimi) yok');
need(/export function buildMergedServerCodeBinding/.test(pm), 'playlistMerge: buildMergedServerCodeBinding yok');

// --- #1 kütüphane taşıma (favori/izlendi korunur) ---
need(/export async function mergeLibraryScopes/.test(rd('frontend/src/utils/libraryMerge.ts')), 'libraryMerge: mergeLibraryScopes yok');

// --- #1/#2 modal: kod birleşimi yazılıyor + safe-area + istatistik ---
const modal = rd('frontend/src/components/DuplicateMergeModal.tsx');
need(/buildMergedServerCodeBinding/.test(modal), 'DuplicateMergeModal: sunucu kodu birleşimi bağlı değil');
need(/serverCodeBinding\s*=\s*mergedBinding|serverCodeBinding\b/.test(modal), 'DuplicateMergeModal: serverCodeBinding yazılmıyor');
need(/useSafeAreaInsets/.test(modal), 'DuplicateMergeModal: safe-area (buton görünürlüğü) yok');
need(/testID="merge-stats"/.test(modal), 'DuplicateMergeModal: net istatistik (merge-stats) yok');
need(/testID="merge-run"/.test(modal), 'DuplicateMergeModal: birleştir butonu (merge-run) yok');
need(/testID="merge-close"/.test(modal), 'DuplicateMergeModal: kapat (merge-close) yok');

// --- #3 Ayarlar: her zaman görünür buton + uyarı şeridi ---
const set = rd('frontend/app/(tabs)/settings.tsx');
need(/import \{ DuplicateMergeModal \}/.test(set), 'settings: DuplicateMergeModal import yok');
need(/findDuplicateGroups/.test(set), 'settings: dupGroups sayımı yok');
need(/testID="merge-duplicates-btn"/.test(set), 'settings: analiz butonu (merge-duplicates-btn) yok');
need(/testID="merge-banner"/.test(set), 'settings: kopya uyarı şeridi (merge-banner) yok');
need(/<DuplicateMergeModal[\s\S]{0,200}removePlaylist=\{removePlaylist\}/.test(set), 'settings: modal mount/prop eksik');

// --- Regresyon: v18.7.41 işlevleri korunmalı ---
const ph = rd('frontend/src/player/PlayerHost.tsx');
need(/audioFallbackTriedRef/.test(ph) && /MEDIA3_AUDIO_FALLBACK_MPV/.test(ph), 'regresyon: v18.7.41 #2 Media3 ses→MPV kaybolmuş');
need(/export async function extractXtreamLinksAsync/.test(rd('frontend/src/utils/linkTest.ts')), 'regresyon: v18.7.41 #3 extractXtreamLinksAsync kaybolmuş');
need(/numberOfLines=\{1\}>Flight Recorder Raporunu Paylaş/.test(rd('frontend/app/stats.tsx')), 'regresyon: v18.7.41 #5 stats buton taşma düzeltmesi kaybolmuş');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.42 kimlik ölçütü + sunucu kodu birleşimi + birincil katalog + UI/istatistik + uyarı şeridi TEMİZ');
