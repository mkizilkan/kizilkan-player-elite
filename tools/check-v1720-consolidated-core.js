#!/usr/bin/env node
const fs=require('fs'), path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=JSON.parse(read('frontend/package.json')); const app=JSON.parse(read('frontend/app.json'));
const core=read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt');
const dao=read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeDataDao.kt');
const diag=read('frontend/src/utils/diagnostics.ts'); const screen=read('frontend/app/diagnostic.tsx'); const player=read('frontend/src/player/PlayerHost.tsx');
const checks=[
 ['version 17.2.0+',(p=>p.length===3&&p.every(Number.isFinite)&&(p[0]>17||(p[0]===17&&p[1]>=2)))(String(pkg.version).split('.').map(Number))&&pkg.version===app.expo.version&&app.expo.android.versionCode>=170200],
 ['DB cleanup native preview/execute',/previewPlaylistContentCleanup/.test(core)&&/executePlaylistContentCleanup/.test(core)],
 ['DB cleanup transaction',/db\.runInTransaction/.test(core)],
 ['DB delete row counts',/fun deleteKind\([^)]*\): Int/.test(dao)&&/fun deletePlaylist\([^)]*\): Int/.test(dao)],
 ['DB cleanup post verification',/Live temizleme doğrulaması başarısız/.test(core)&&/EPG temizleme doğrulaması başarısız/.test(core)],
 ['canonical cleanup snapshot retained',/db.snapshotDao\(\).put\(PlaylistSnapshotEntity\(playlistId, 0L, 0L/.test(core)&&!/snapshotDao\(\)\.delete\(playlistId\)/.test(core)],
 ['diagnostics fast DB health',/getDatabaseHealthFast/.test(diag)&&/databaseHealthMode/.test(diag)],
 ['cleanup center UI',/<CatalogManagement/.test(screen)&&/cleanupPlaylistContent/.test(read('frontend/src/components/CatalogManagement.tsx'))&&/GÜNCELLE/.test(read('frontend/src/components/CatalogManagement.tsx'))],
 ['canonical Room nav fallback',/fallback: "canonical-room"/.test(player)&&/getPlaybackNeighbors/.test(player)],
];
let bad=0; for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${n}`); if(!ok) bad++;} if(bad){console.error(`FAIL: ${bad} v17.2 core check(s)`);process.exit(1)} console.log('PASS: v17.2.0+ consolidated DB/diagnostics/navigation core');
