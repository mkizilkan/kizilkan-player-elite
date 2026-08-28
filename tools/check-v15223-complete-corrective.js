#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..');
const front = path.join(root, 'frontend');
let bad = 0;
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const need = (rel, token, label) => {
  if (!read(rel).includes(token)) { console.log(`HATA — ${label}: ${token}`); bad++; }
};
const forbid = (rel, token, label) => {
  if (read(rel).includes(token)) { console.log(`HATA — ${label}: yasak desen bulundu: ${token}`); bad++; }
};
const order = (rel, first, second, label) => {
  const s = read(rel); const a = s.indexOf(first), b = s.indexOf(second, Math.max(0, a));
  if (a < 0 || b < 0 || a >= b) { console.log(`HATA — ${label}: sıra doğrulanamadı`); bad++; }
};
const compile = rel => ts.transpileModule(fs.readFileSync(path.join(front, rel), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  reportDiagnostics: true,
});

const pkg = JSON.parse(fs.readFileSync(path.join(front, 'package.json'),'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(front, 'app.json'),'utf8'));
const _sv=v=>{const m=String(v||'').match(/^(\d+)\.(\d+)\.(\d+)/);return m?Number(m[1])*1000000+Number(m[2])*1000+Number(m[3]):-1;};
const _code=v=>{const m=String(v||'').match(/^(\d+)\.(\d+)\.(\d+)/);return m?Number(m[1])*10000+Number(m[2])*100+Number(m[3]):-1;};
// v16.1.0: 15.2 serisine KİLİTLİYDİ. Amaç korunuyor: en az 15.2.23 + üçlü tutarlılık.
if (_sv(pkg.version) < _sv('15.2.23') || String(app.expo.version) !== String(pkg.version) ||
    Number(app.expo.android.versionCode) !== _code(pkg.version)) {
  console.log('HATA — sürüm üçlüsü tutarsız veya asgari sürümün altında'); bad++;
}

// P0 gesture/worklet crash
need('frontend/src/player/PlayerHost.tsx', '.runOnJS(true)', 'Gesture callback JS-thread authority');
forbid('frontend/src/player/PlayerHost.tsx', 'runOnJS(toggleControls)', 'eski Reanimated runOnJS gesture yolu');
forbid('frontend/src/player/PlayerHost.tsx', 'Dimensions.get("window").width', 'UI worklet içinden Dimensions çağrısı');

// P0 codec / black-screen terminal recovery
need('frontend/src/player/PlayerHost.tsx', 'MEDIA3_FATAL_FALLBACK', 'Media3 fatal codec fallback telemetrisi');
need('frontend/src/player/PlayerHost.tsx', 'VLC_VIDEO_OUTPUT_TIMEOUT', 'VLC siyah ekran watchdog');
need('frontend/src/player/PlayerHost.tsx', 'VLC HW+SW video-output timeout', 'VLC terminal fallback');

// P0 Xtream/Room atomic consistency
need('frontend/src/store/PlaylistContext.tsx', 'PLAYLIST_COMMIT_START', 'playlist commit başlangıç telemetrisi');
need('frontend/src/store/PlaylistContext.tsx', 'PLAYLIST_COMMIT_READY', 'playlist commit hazır telemetrisi');
need('frontend/src/store/PlaylistContext.tsx', 'PLAYLIST_SWITCH_INDEX_RECOVERY', 'playlist index recovery');
order('frontend/src/store/PlaylistContext.tsx', 'const ok = await bigStore.write(id, {', 'setPlaylists(next);', 'canonical write React publish öncesi olmalı');

// P0 main-thread stall: no 50k AsyncStorage rewrite per event
need('frontend/src/utils/diagnostics.ts', 'MAX_JS_FALLBACK_EVENTS = 5000', 'bounded JS fallback cache');
need('frontend/src/utils/diagnostics.ts', 'JS_STORAGE_FLUSH_EVERY = 64', 'batched AsyncStorage flush');
need('frontend/src/utils/diagnostics.ts', 'nativeSnapshotEvents', 'Native Room primary read');
need('frontend/src/utils/diagnostics.ts', 'jsJournalSequence % JS_JOURNAL_SAMPLE_EVERY', 'sampled JS journal');
need('frontend/src/utils/diagnostics.ts', 'if (depth > 8)', 'deep native stack export');

// P0 main-thread stall: large Xtream/MAG catalog normalization must cooperatively yield
need('frontend/src/utils/iptv.ts', 'async function catalogYield', 'Xtream cooperative catalog yield helper');
need('frontend/src/utils/iptv.ts', 'await catalogYield(i)', 'Xtream catalog normalization yield');
need('frontend/src/utils/stalker.ts', 'async function stalkerCatalogYield', 'MAG cooperative catalog yield helper');
need('frontend/src/utils/stalker.ts', 'await stalkerCatalogYield(i)', 'MAG catalog normalization yield');

// Full reset incl panel scan snapshot when idle
need('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt', 'editor.remove(PanelScanService.KEY_SNAPSHOT)', 'PanelScan snapshot clear');
need('frontend/app/stats.tsx', 'if (PanelScan.available) PanelScan.clearDiagnostics();', 'stats total reset PanelScan clear');
need('frontend/app/stats.tsx', 'setScanDiagnostics([]);', 'stats scan UI clear');
need('frontend/app/stats.tsx', 'setExitHistory([]);', 'stats exit UI clear');

for (const rel of [
  'src/player/PlayerHost.tsx',
  'src/store/PlaylistContext.tsx',
  'src/utils/diagnostics.ts',
  'src/utils/iptv.ts',
  'src/utils/stalker.ts',
  'app/stats.tsx',
  'modules/panel-scan/index.ts',
]) {
  try {
    const r = compile(rel);
    const errs = (r.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
    if (errs.length) { console.log(`HATA — TS transpile ${rel}: ${errs.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join(' | ')}`); bad += errs.length; }
  } catch (e) { console.log(`HATA — TS transpile ${rel}: ${e.message}`); bad++; }
}

if (bad) { console.log(`\n❌ ${bad} v15.2.23 COMPLETE-CORRECTIVE HARD-GATE HATASI`); process.exit(1); }
console.log('TEMIZ — v15.2.23 RC2 complete corrective: reset + codec fallback + gesture + Room atomicity + stall hardening');
