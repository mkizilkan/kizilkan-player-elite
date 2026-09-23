#!/usr/bin/env node
/**
 * KIZILKAN PLAYER v17.9.10 RC1
 * Empty-shell recovery / visible progress / memory-safe staged Room commit hard-gate.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let failed = 0;
const ok = (cond, label) => {
  if (cond) console.log(`PASS: ${label}`);
  else { failed++; console.log(`FAIL: ${label}`); }
};

const app = JSON.parse(read('frontend/app.json'));
const pkg = JSON.parse(read('frontend/package.json'));
const refresh = read('frontend/src/utils/refreshPlaylist.ts');
const ctx = read('frontend/src/store/PlaylistContext.tsx');
const overlay = read('frontend/src/components/PlaylistRepairOverlay.tsx');
const layout = read('frontend/app/_layout.tsx');
const settings = read('frontend/app/(tabs)/settings.tsx');
const select = read('frontend/app/playlist-select.tsx');
const cards = read('frontend/src/components/CatalogProgressCards.tsx');

ok(pkg.version === '17.9.10', 'package version is 17.9.10');
ok(app.expo.version === '17.9.10' && app.expo.ios?.buildNumber === '17.9.10', 'Expo/iOS version synchronized');
ok(app.expo.android?.versionCode === 170910, 'Android versionCode is 170910');
ok(app.expo.extra?.kizilkanReleaseLabel === 'GPT ELITE v17.9.10 RC1', 'release label synchronized');

ok(refresh.includes('CatalogProgressState') && refresh.includes("'saving'"), 'catalog progress exposes waiting/saving/done/error/skipped');
ok(refresh.includes('formatRefreshProgress') && refresh.includes('Canlı ${mark') && refresh.includes('Film ${mark') && refresh.includes('Dizi ${mark'), 'shared Canlı/Film/Dizi formatter exists');
ok(refresh.includes('incrementalDelivery') && refresh.includes("for(const kind of ['live','vod','series']"), 'empty-shell Xtream recovery is staged live->vod->series');
ok(refresh.includes('await options.incrementalDelivery') && ctx.includes('PLAYLIST_REPAIR_KIND_COMMITTED'), 'each recovered kind is committed to Room before next kind');
ok(refresh.includes('CAPABILITY-AWARE PARTIAL COMMIT') && refresh.includes('isUnsupported404'), 'legacy Xtream partial-404 contract preserved');
ok(ctx.includes('forceUnconditional:true'), 'blank-shell recovery forces real source fetch (no stale M3U 304 shortcut)');
ok(ctx.includes('PLAYLIST_SWITCH_SINGLEFLIGHT_JOIN') && ctx.includes('activeSwitchInFlight'), 'same-target singleflight preserved');
ok(ctx.includes('PLAYLIST_SELF_REPAIR_THROTTLED') && ctx.includes('cooldownMs:2500') && !ctx.includes('Date.now()-lastRepair<30000'), 'repair storm guard retained without old 30-second penalty');
ok(ctx.includes('repairMissingPlaylist') && ctx.includes("mode: \"primary\" | \"fallback\""), 'primary/fallback repair uses one centralized engine');
ok(ctx.includes('PLAYLIST_REPAIR_PROGRESS') && ctx.includes('liveElapsedMs') && ctx.includes('seriesElapsedMs'), 'per-stage telemetry records catalog timings');
ok(ctx.includes('PLAYLIST_SELF_REPAIR_PARTIAL') && ctx.includes('allowPartialRecovery:true'), 'usable partial recovery is explicit and diagnosed');

ok(layout.includes('PlaylistRepairOverlay') && /<PlaylistRepairOverlay\s*\/>/.test(layout), 'global repair overlay is mounted at root layout');
ok(overlay.includes('playlist-repair-catalog-progress') && overlay.includes('formatRefreshProgress'), 'global overlay displays shared catalog progress');
ok(overlay.includes('silentFor>=30000') && overlay.includes('silentFor>=15000'), 'overlay reports slow/stalled-looking server waits');
ok(overlay.includes('Geçen süre:'), 'overlay displays elapsed time');
ok(settings.includes('selectPlaylistFromSettings') && settings.includes('await setActivePlaylist(id)'), 'Settings SEÇ awaits selection and surfaces failure');
ok(select.includes('await setActivePlaylist(only.id)') && select.includes('await setActivePlaylist(last.id)') && select.includes('await setActivePlaylist(id)'), 'profile auto/manual entry always re-verifies canonical Room state');
ok(!select.includes("if (activePlaylist?.id !== id) await setActivePlaylist(id)"), 'same activeId no longer bypasses Room verification');
ok(cards.includes("state==='saving'?'Kaydediliyor'"), 'manual progress cards understand staged saving state');

if (failed) {
  console.log(`\nFAIL — v17.9.10 empty-shell hard-gate: ${failed}`);
  process.exit(1);
}
console.log('\nPASS: v17.9.10 empty-shell recovery / visible progress / staged Room commit hard-gate');
