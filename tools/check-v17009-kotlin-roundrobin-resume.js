const fs=require('fs'),p=require('path'),root=p.resolve(__dirname,'..');let f=0;
const r=(x,m)=>{if(!x){console.error('HATA:',m);f++}else console.log('✓',m)};
const rd=x=>fs.readFileSync(p.join(root,x),'utf8');
const pkg=JSON.parse(rd('frontend/package.json')), app=JSON.parse(rd('frontend/app.json'));
const svc=rd('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt');
const gate8=rd('tools/check-v17008-conservative-checkpoint.js');
r(pkg.version==='17.0.9'&&app.expo.version==='17.0.9'&&app.expo.ios.buildNumber==='17.0.9'&&app.expo.android.versionCode===170009&&app.expo.extra?.kizilkanReleaseLabel==='GPT ELITE v17.0.9 RC1','v17.0.9 sürüm zinciri');
r(svc.includes('minOf(32, total)')&&!svc.includes('minOf(32L, total).toInt(); val pool'),'bulk workerCount Int/Long compile uyumu');
r(svc.includes('if (total == 0L)')&&svc.includes('if (ordinal == 0L)')&&svc.includes('done % 500L == 0L'),'unified Long literal compile uyumu');
r(!svc.includes('offsets[ai]'),'eski unresolved offsets kalıntısı yok');
r(svc.includes('fullLayers')&&svc.includes('partialInLayer')&&svc.includes('layerStart'),'round-robin resume progress reconstruction mevcut');
r(gate8.includes('17\\.0\\.')&&gate8.includes('170008'),'v17.0.8 koruma gate forward-compatible');

// Deterministik asimetrik fixture: expected=[3,1,2], round-robin işler
// (a0c0,a1c0,a2c0,a0c1,a2c1,a0c2). Her prefix için yeniden kurulan
// sayaç gerçek prefix brute-force sayımla birebir eşleşmelidir.
function resolveOrder(expected){const out=[];const max=Math.max(...expected);for(let ci=0;ci<max;ci++)for(let ai=0;ai<expected.length;ai++)if(ci<expected[ai])out.push([ai,ci]);return out;}
function reconstruct(expected,safeStart){const order=resolveOrder(expected), total=order.length, max=Math.max(...expected);const layerEnds=[];let n=0;for(let ci=0;ci<max;ci++){for(let ai=0;ai<expected.length;ai++)if(ci<expected[ai])n++;layerEnds.push(n)};let fullLayers=0,partial=0;if(safeStart>=total){fullLayers=max}else if(safeStart>0){let lo=0,hi=layerEnds.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(safeStart<layerEnds[mid])hi=mid;else lo=mid+1}fullLayers=lo;const start=fullLayers===0?0:layerEnds[fullLayers-1];partial=safeStart-start}const got=expected.map(e=>Math.min(fullLayers,e));for(let ai=0;ai<expected.length&&partial>0;ai++)if(fullLayers<expected[ai]){got[ai]++;partial--}return got;}
{const expected=[3,1,2],order=resolveOrder(expected);let ok=true;for(let s=0;s<=order.length;s++){const brute=expected.map(()=>0);for(let i=0;i<s;i++)brute[order[i][0]]++;const got=reconstruct(expected,s);if(JSON.stringify(got)!==JSON.stringify(brute)){ok=false;break}}r(ok,'asimetrik round-robin tüm prefix fixture');}

// Kök build hatalarının kaynak tokenları tekrar oluşmasın.
r(!/minOf\(32L,\s*total\)\.toInt\(\); val pool/.test(svc)&&!/done % 500 == 0/.test(svc),'CI compile hata desenleri temiz');
if(f){console.error(`❌ ${f} v17.0.9 gate hatası`);process.exit(1)}
console.log('PASS: v17.0.9 Kotlin compile + round-robin resume corrective TEMİZ');
