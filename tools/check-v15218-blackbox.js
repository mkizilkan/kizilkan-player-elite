const fs=require('fs');
const read=p=>fs.readFileSync(p,'utf8');
const checks=[
 ['version',read('frontend/package.json').includes('"version": "15.2.18"')],
 ['versionCode',read('frontend/app.json').includes('"versionCode": 150218')],
 ['blackbox-v2',read('frontend/src/utils/diagnostics.ts').includes('KIZILKAN_BLACK_BOX_V2')],
 ['capacity-1500',read('frontend/src/utils/diagnostics.ts').includes('MAX_EVENTS = 1500')],
 ['playlist-switch-ready',read('frontend/src/store/PlaylistContext.tsx').includes('PLAYLIST_SWITCH_READY')],
 ['seek-telemetry',read('frontend/src/player/PlayerHost.tsx').includes('SEEK_RELATIVE_REQUEST')],
 ['stale-spinner-guard',read('frontend/src/player/PlayerHost.tsx').includes('successfulSessionRef.current === activeSessionId && isPlaying')],
 ['binder-staging-preserved',read('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt').includes('stagingKey')],
];
let bad=0; for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`); if(!ok)bad++;} process.exitCode=bad?1:0;
