#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const ui=read('frontend/app/playlist-select.tsx');
const magGate=read('tools/check-v15225-mag-architecture.js');
const pkg=JSON.parse(read('frontend/package.json'));
const app=JSON.parse(read('frontend/app.json'));
function need(src,re,msg){if(!re.test(src))throw new Error(msg)}
for(const k of ['manageBar','manageSearch','manageBtn','manageOverlay','manageModal','manageTitle','closeBtn']) need(ui,new RegExp('\\b'+k+'\\s*:'),'eksik StyleSheet anahtarı: '+k);
need(magGate,/liveOnly:\\s\*\(\?:true\|!chooseCategories\)/,'eski MAG live-first gate yeni seçmeli kategori akışını tanımıyor');
need(magGate,/commitPlaylist/,'eski MAG enrichment gate commitPlaylist katmanını tanımıyor');
const semverAtLeast=(v,min)=>{const a=String(v).split('.').map(Number),b=String(min).split('.').map(Number); if(a.length!==3||a.some(Number.isNaN))return false; for(let i=0;i<3;i++){if(a[i]>b[i])return true;if(a[i]<b[i])return false;}return true;};
if(!semverAtLeast(pkg.version,'16.13.7'))throw new Error('package version v16.13.7+ değil');
if(app.expo.version!==pkg.version||Number(app.expo.android.versionCode)<161307)throw new Error('app version/versionCode v16.13.7+ ile uyumsuz');
console.log('TEMIZ — v16.13.7 CI build corrective: playlist styles + MAG legacy gate compatibility');
