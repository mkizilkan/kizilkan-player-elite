#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let bad = 0;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const need = (rel, token, label) => { if (!read(rel).includes(token)) { console.error('HATA:', label); bad++; } };
const forbid = (rel, token, label) => { if (read(rel).includes(token)) { console.error('HATA:', label); bad++; } };

const tv = 'frontend/app/tv-home.tsx';
const diag = 'frontend/src/utils/diagnostics.ts';
const layout = 'frontend/app/_layout.tsx';
const refresh = 'frontend/src/utils/refreshPlaylist.ts';
const stalker = 'frontend/src/utils/stalker.ts';
const addPlaylist = 'frontend/app/add-playlist.tsx';
const scanNative = 'frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt';
const player = 'frontend/src/player/PlayerHost.tsx';
const index = 'frontend/app/(tabs)/index.tsx';

// TV memory fix must be more complete than the Claude patch: no native heavy hydrate,
// and the TV grid/list actually queries Room pages instead of staying empty.
need(tv, '!KizilkanNativeCore.available && activePlaylist?.id', 'TV heavy hydrate Native Core guard');
need(tv, 'KizilkanNativeCore.queryItems<any>', 'TV native Room paging');
need(tv, 'KizilkanNativeCore.getCategories', 'TV native category source');
need(tv, 'nativeSummary?.channels ?? activePlaylist.channelsCount', 'TV canonical Room/meta live count');
forbid(tv, 'if (activePlaylist?.id) void ensureHeavyLoaded(activePlaylist.id);', 'TV unconditional heavy hydrate must stay removed');

// Telemetry envelope + bounded memory timeline + concurrency-safe task ownership.
need(diag, 'const activeTasks = new Map<string, DiagnosticTask>()', 'token-owned concurrent task registry');
need(diag, 'export function setDiagnosticAppState', 'central AppState telemetry setter');
need(diag, 'export function startMemorySampling', 'memory timeline sampler');
need(diag, 'MEMORY_SERIES_MAX = 240', 'bounded memory timeline');
need(diag, 'javaCommittedMb', 'Java committed memory sampling');
need(diag, 'nativePssMb', 'native PSS sampling');
need(diag, 'systemAvailMb', 'system available memory sampling');
need(diag, '_fg: diagnosticForeground', 'foreground marker on every diagnostic event');
need(diag, '_task: task.label', 'active task marker on every diagnostic event');
need(diag, "BACKGROUND_STALL_OR_DOZE", 'background/doze stall classification');
need(diag, 'memorySeries: getMemorySeries()', 'memorySeries export');
need(diag, 'memorySeries.splice(0, memorySeries.length)', 'total reset clears memory timeline');

need(layout, 'setDiagnosticAppState(AppState.currentState', 'initial AppState seed');
need(layout, 'startMemorySampling(30000)', '30 second memory sampler startup');
need(layout, 'setDiagnosticAppState(state)', 'existing root AppState listener updates diagnostics');

// Expensive work labels must extend beyond refresh.
need(refresh, 'markTask(`refresh:', 'refresh task label');
need(stalker, 'mag:handshake', 'MAG handshake task');
need(stalker, 'mag:catalog-live', 'MAG live task');
need(stalker, 'mag:catalog-vod', 'MAG VOD task');
need(stalker, 'mag:catalog-series', 'MAG series task');
need(addPlaylist, 'scan:panel-single', 'single panel scan task');
need(addPlaylist, 'scan:panel-unified', 'unified panel scan task');
need(player, 'markTask(`player:${v2ProfileKey}`', 'player task');

// Claude package must not reintroduce regressions already fixed by our RC2/RC3.
forbid(index, 'canlı sayfa sorgusu başarısız; legacy hydrate', 'main live Room failure must not hydrate full JS catalog');
forbid(index, 'VOD/Series sayfa sorgusu başarısız; legacy hydrate', 'main library Room failure must not hydrate full JS catalog');
forbid(scanNative, 'val work = ArrayList<Work>()', 'scan Work matrix regression');
need(scanNative, 'val start = (matches.size - 200).coerceAtLeast(0)', 'bounded scan snapshot retained');
need(stalker, 'STALKER_CATALOG_SINGLEFLIGHT_JOIN', 'MAG single-flight retained');
need(stalker, 'STALKER_COMPAT_ATTEMPT', 'MAG compatibility profiles retained');
need(player, 'PLAYER_BACKGROUND_TIME_UPDATE_MS', 'adaptive Media3 timeUpdate retained');

if (bad) {
  console.error(`❌ ${bad} v15.2.24 RC3 Claude-memory/telemetry integration gate hatası`);
  process.exit(1);
}
console.log('TEMIZ — v15.2.24 RC3 Claude memory/telemetry + no-regression integration contract');
