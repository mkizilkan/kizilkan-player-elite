#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..'); const read=p=>fs.readFileSync(path.join(R,p),'utf8');
let fail=0; const ok=(c,m)=>{console.log(`${c?'✓':'✗'} ${m}`);if(!c)fail++};
const pkg=JSON.parse(read('frontend/package.json')),app=JSON.parse(read('frontend/app.json'));
const semverAtLeast=(v,min)=>{const a=String(v).split('.').map(Number),b=String(min).split('.').map(Number);if(a.length!==3||a.some(Number.isNaN))return false;for(let i=0;i<3;i++){if(a[i]>b[i])return true;if(a[i]<b[i])return false;}return true;};
const expectedCode=(()=>{const [M,m,p]=String(pkg.version).split('.').map(Number);return M*10000+m*100+p;})();
ok(semverAtLeast(pkg.version,'16.14.3')&&app.expo.version===pkg.version&&app.expo.android.versionCode===expectedCode,'current metadata preserves v16.14.3+');
const pm=read('frontend/src/utils/playlistManagement.ts');
ok(pm.includes("'max_users_desc'")&&pm.includes("'max_users_asc'"),'v16.13.10 max-user sort preserved');
ok(pm.includes('pref.pinnedFirst'),'v16.13.10 pinned-first preserved');
const ps=read('frontend/app/playlist-select.tsx');
ok(ps.includes('visible={sortModal}')&&ps.includes('ReorderPlaylistsModal'),'playlist sort/reorder UI preserved');
ok(ps.includes('playlist-select-action-')&&ps.includes('"SEÇ"'),'playlist SEÇ action preserved');
ok(ps.includes('if (managementMode) return'),'management mode no-auto-redirect preserved');
const settings=read('frontend/app/(tabs)/settings.tsx');
ok(settings.includes('settings-playlist-management')&&settings.includes('manage: "1"'),'playlist management entry preserved');
const rf=read('frontend/src/utils/refreshPlaylist.ts');
ok(rf.includes('CAPABILITY-AWARE PARTIAL COMMIT')&&rf.includes('isUnsupported404'),'Xtream partial 404 commit preserved');
const ctx=read('frontend/src/store/PlaylistContext.tsx');
ok(ctx.includes('PLAYLIST_SELF_REPAIR_THROTTLED')&&ctx.includes('repairAttemptAt'),'repair storm guard preserved');
ok(ctx.includes('Map<string, Promise<void>>')&&ctx.includes('PLAYLIST_SWITCH_SINGLEFLIGHT_JOIN'),'v16.14.2 Promise single-flight preserved');
const add=read('frontend/app/add-playlist.tsx');
ok(add.includes('deviceModel: "MAG320"')&&add.includes('MAG320 Exact profili'),'MAG320 exact UI/default preserved');
const ph=read('frontend/src/player/PlayerHost.tsx');
ok(ph.includes('XTREAM_PLAYBACK_PROVENANCE')&&ph.includes('<user>/<pass>'),'safe Xtream playback provenance preserved');
ok(ph.includes('playbackOwnerRef')&&ph.includes('ownsCurrentRender'),'stale-frame ownership preserved');
if(fail){console.error(`REGRESYON CONTRACT FAIL — ${fail}`);process.exit(1)}
console.log('TEMIZ — v16.13.10 + v16.14.2 functional contract preserved in v16.14.3+');
