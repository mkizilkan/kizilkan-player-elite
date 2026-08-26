#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const froot = path.join(root, 'frontend');
let bad = 0;
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const need = (rel, token, label) => { const s=read(rel); if(!s.includes(token)){ console.log(`HATA — ${label}: ${token}`); bad++; } };
const forbid = (rel, token, label) => { const s=read(rel); if(s.includes(token)){ console.log(`HATA — ${label}: yasak ${token}`); bad++; } };
const pkg = JSON.parse(fs.readFileSync(path.join(froot,'package.json'),'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(froot,'app.json'),'utf8'));
if(pkg.version !== '15.2.19') { console.log(`HATA — package ${pkg.version}`); bad++; }
if(app?.expo?.version !== '15.2.19' || Number(app?.expo?.android?.versionCode)!==150219){ console.log('HATA — app version/versionCode 15.2.19/150219 değil'); bad++; }
need('tools/denetle.js', 'check-v15218-blackbox.js', 'v15.2.18 gate ana zincirde');
need('tools/denetle.js', 'check-v15219-corrective.js', 'v15.2.19 gate ana zincirde');
forbid('tools/checkplayercore.js', "app?.expo?.version !== '15.2.17'", 'playercore sabit eski sürüm kilidi');
forbid('tools/check-v15217-scan-transport.js', "pkg.version !== '15.2.17'", 'scan gate sabit eski sürüm kilidi');
need('tools/check-v15216-diagnostics.js', 'BLACK_BOX_V2', 'v15.2.16 gate ileri uyumlu diagnostics');
need('tools/check-v15218-blackbox.js', "path.resolve(__dirname, '..')", 'v15.2.18 gate cwd bağımsız');
need('frontend/src/store/PlaylistContext.tsx', 'activeSwitchGeneration', 'playlist switch generation');
need('frontend/src/store/PlaylistContext.tsx', 'PLAYLIST_SWITCH_STALE_DISCARDED', 'stale playlist switch telemetrisi');
need('frontend/app/(tabs)/index.tsx', 'nativePageOwnerId', 'native page playlist ownership');
need('frontend/app/(tabs)/index.tsx', 'PLAYLIST_UI_INVALIDATED', 'playlist UI invalidation telemetrisi');
need('frontend/src/player/PlayerHost.tsx', 'playerTelemetryContextRef.current', 'AppState canlı bağlam ref');
need('frontend/src/player/PlayerHost.tsx', 'STALE_BUFFERING_CLEARED', 'stale buffering state düzeltmesi');
need('frontend/src/utils/diagnostics.ts', 'JOURNAL_NAME', 'persistent blackbox journal');
need('frontend/src/utils/diagnostics.ts', 'Paths.document', 'blackbox kalıcı belge alanı');
need('frontend/src/utils/diagnostics.ts', 'MAX_JOURNAL_BYTES', 'blackbox bounded file segment');
need('frontend/src/utils/diagnostics.ts', 'critical', 'kritik olay export özeti');
if (bad) { console.log(`\n❌ ${bad} v15.2.19 CORRECTIVE HATASI`); process.exit(1); }
console.log('TEMIZ — v15.2.19 corrective gates / state consistency / persistent Black Box V2');
