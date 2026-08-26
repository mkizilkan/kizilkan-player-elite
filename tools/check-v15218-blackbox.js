#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const projectRoot = path.resolve(__dirname, '..');
const frontendRoot = path.join(projectRoot, 'frontend');
const read = rel => fs.readFileSync(path.join(projectRoot, rel), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(frontendRoot, 'package.json'), 'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(frontendRoot, 'app.json'), 'utf8'));
const parts = String(pkg.version || '').split('.').map(Number);
const expectedCode = parts.length===3 && parts.every(Number.isFinite) ? parts[0]*10000 + parts[1]*100 + parts[2] : null;
const diagnostics = read('frontend/src/utils/diagnostics.ts');
const player = read('frontend/src/player/PlayerHost.tsx');
const playlist = read('frontend/src/store/PlaylistContext.tsx');
const checks=[
 ['version-consistency', app?.expo?.version === pkg.version && expectedCode !== null && Number(app?.expo?.android?.versionCode) === expectedCode],
 ['blackbox-v2', diagnostics.includes('KIZILKAN_BLACK_BOX_V2')],
 ['legacy-reader', diagnostics.includes('LEGACY_KEY')],
 ['capacity>=1500', (()=>{const m=diagnostics.match(/MAX_EVENTS\s*=\s*(\d+)/); return !!m && Number(m[1])>=1500;})()],
 ['playlist-switch-ready', playlist.includes('PLAYLIST_SWITCH_READY')],
 ['playlist-switch-generation', playlist.includes('activeSwitchGeneration')],
 ['seek-telemetry', player.includes('SEEK_RELATIVE_REQUEST')],
 ['appstate-live-refs', player.includes('playerTelemetryContextRef.current')],
 ['stale-spinner-state-recovery', player.includes('STALE_BUFFERING_CLEARED')],
 ['binder-staging-preserved', read('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt').includes('stagingKey')],
];
let bad=0; for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`); if(!ok)bad++;}
if (bad) { console.log(`\n❌ ${bad} v15.2.18 BLACK BOX SÖZLEŞMESİ HATASI`); process.exit(1); }
console.log('TEMIZ — v15.2.18 state consistency / Black Box V2 contract');
