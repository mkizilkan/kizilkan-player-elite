#!/usr/bin/env node
const fs=require('fs'),path=require('path'); const R=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(R,p),'utf8'); const stalker=read('frontend/src/utils/stalker.ts');
if(!/type ReqOptions = \{[^}]*postForm\?: boolean/s.test(stalker)) throw new Error('ReqOptions.postForm eksik');
for(const f of ['check-v15214-hardening.js','check-v15216-diagnostics.js','check-v15224-mag-room-stall.js','check-v15225-mag-architecture.js','check-v15227-mag-playback-pagination-ui.js','check-v16121-pcap-mag-player-controls.js']){
 const s=read('tools/'+f); if(!s.includes("@/modules/kizilkan-native-core")||!s.includes('available:false')) throw new Error(f+' native bridge fixture mock eksik');
}
const old=read('tools/check-v16137-build-corrective.js'); if(old.includes("pkg.version!=='16.13.7'")) throw new Error('v16.13.7 gate exact-version kilidi devam ediyor');
const pkg=JSON.parse(read('frontend/package.json')), app=JSON.parse(read('frontend/app.json'));
if(pkg.version!=='16.13.9'||app.expo.version!=='16.13.9'||app.expo.android.versionCode!==161309) throw new Error('v16.13.9 metadata yanlış');
console.log('TEMIZ — v16.13.9 CI native-module fixture compatibility + ReqOptions + forward gate');
