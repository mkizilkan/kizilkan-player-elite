#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(R,p),'utf8');
const ok=(c,m)=>{if(!c){console.error('✗ '+m);process.exitCode=1;}else console.log('✓ '+m)};
const pkg=JSON.parse(read('frontend/package.json')), app=JSON.parse(read('frontend/app.json'));
ok(pkg.version==='16.14.2'&&app.expo.version==='16.14.2'&&app.expo.android.versionCode===161402,'current metadata');
const pm=read('frontend/src/utils/playlistManagement.ts');
ok(pm.includes("'max_users_desc'")&&pm.includes("'max_users_asc'"),'v16.13.10 max-user sort preserved');
ok(pm.includes('pref.pinnedFirst'),'v16.13.10 pinned-first preserved');
const ps=read('frontend/app/playlist-select.tsx');
ok(ps.includes('visible={sortModal}')&&ps.includes('ReorderPlaylistsModal'),'playlist sort/reorder UI preserved');
ok(ps.includes('playlist-select-action-')&&ps.includes('"SEÇ"'),'playlist SEÇ action preserved');
ok(ps.includes('if (managementMode) return'),'management mode no-auto-redirect preserved');
const settings=read('frontend/app/(tabs)/settings.tsx');
ok(settings.includes('settings-playlist-management')&&settings.includes('manage: "1"'),'in-app playlist management entry preserved');
const rf=read('frontend/src/utils/refreshPlaylist.ts');
ok(rf.includes('CAPABILITY-AWARE PARTIAL COMMIT')&&rf.includes('isUnsupported404'),'Xtream partial 404 commit preserved');
const ctx=read('frontend/src/store/PlaylistContext.tsx');
ok(ctx.includes('PLAYLIST_SELF_REPAIR_THROTTLED')&&ctx.includes('repairAttemptAt'),'repair storm guard preserved');
const add=read('frontend/app/add-playlist.tsx');
ok(add.includes('deviceModel: "MAG320"')&&add.includes('MAG320 Exact profili'),'MAG320 exact UI/default preserved');
const ph=read('frontend/src/player/PlayerHost.tsx');
ok(ph.includes('XTREAM_PLAYBACK_PROVENANCE')&&ph.includes('<user>/<pass>'),'safe Xtream playback provenance preserved');
if(process.exitCode){console.error('REGRESYON CONTRACT FAIL');process.exit(process.exitCode)}
console.log('TEMIZ — v16.13.10 functional contract preserved in v16.14.2');
