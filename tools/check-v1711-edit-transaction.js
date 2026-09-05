const fs=require('fs'), path=require('path'); const ROOT=path.resolve(__dirname,'..'); const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8'); const s=read('frontend/app/edit-playlist.tsx'); const a=read('frontend/app.json');
function ok(c,m){if(!c){console.error('FAIL:',m);process.exit(1)} console.log('✓',m)}
ok(a.includes('"version": "17.1.1"')&&a.includes('"versionCode": 170101'),'v17.1.1 sürüm zinciri');
ok(s.includes('Keyboard.dismiss()'),'save keyboard kapatıyor'); ok(s.includes('behavior={Platform.OS === "ios" ? "padding" : undefined}'),'Android height keyboard layout kaldırıldı');
const i=s.indexOf('await updatePlaylist(pl.id, { ...patch });'), j=s.indexOf('if (reloadContent)',i); ok(i>0&&j>i,'Xtream metadata refresh öncesi commit'); ok(s.includes('metadataCommittedEarly = true'),'erken commit durumu izleniyor');
console.log('PASS: v17.1.1 Xtream edit transaction/layout TEMİZ');
