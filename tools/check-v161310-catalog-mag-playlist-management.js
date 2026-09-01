#!/usr/bin/env node
const fs=require('fs'),path=require('path'); const R=path.resolve(__dirname,'..'); const read=p=>fs.readFileSync(path.join(R,p),'utf8');
const pkg=JSON.parse(read('frontend/package.json')),app=JSON.parse(read('frontend/app.json')); const ok=(c,m)=>{if(!c)throw Error(m);console.log('✓ '+m)};
ok(pkg.version==='16.13.10'&&app.expo.version==='16.13.10'&&app.expo.android.versionCode===161310,'v16.13.10 metadata');
const pm=read('frontend/src/utils/playlistManagement.ts'); ok(pm.includes("'max_users_desc'")&&pm.includes("'max_users_asc'"),'max-user sort'); ok(pm.includes('pref.pinnedFirst'),'pinned-first');
const ps=read('frontend/app/playlist-select.tsx'); ok(ps.includes('visible={sortModal}')&&ps.includes('ReorderPlaylistsModal'),'sort/reorder rendered'); ok(ps.includes('playlist-select-action-')&&ps.includes('"SEÇ"'),'SEÇ action'); ok(ps.includes('if (managementMode) return'),'management mode no auto redirect');
const st=read('frontend/app/(tabs)/settings.tsx'); ok(st.includes('settings-playlist-management')&&st.includes('manage: "1"'),'in-app playlist management entry');
const rf=read('frontend/src/utils/refreshPlaylist.ts'); ok(rf.includes('CAPABILITY-AWARE PARTIAL COMMIT')&&rf.includes('isUnsupported404'),'Xtream partial 404 commit');
const ctx=read('frontend/src/store/PlaylistContext.tsx'); ok(ctx.includes('PLAYLIST_SELF_REPAIR_THROTTLED')&&ctx.includes('repairAttemptAt'),'repair storm guard');
const add=read('frontend/app/add-playlist.tsx'); ok(add.includes('deviceModel: "MAG320"')&&add.includes('MAG320 Exact profili'),'MAG320 exact UI/default');
const ph=read('frontend/src/player/PlayerHost.tsx'); ok(ph.includes('XTREAM_PLAYBACK_PROVENANCE')&&ph.includes('<user>/<pass>'),'safe playback provenance');
console.log('TEMIZ — v16.13.10 catalog lifecycle / MAG runtime / playlist management corrective');
