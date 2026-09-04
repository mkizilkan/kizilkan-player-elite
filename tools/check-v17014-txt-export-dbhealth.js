#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=JSON.parse(read('frontend/package.json'));
const app=JSON.parse(read('frontend/app.json'));
const add=read('frontend/app/add-playlist.tsx');
const diag=read('frontend/src/utils/diagnostics.ts');
const denetle=read('tools/denetle.js');
function ok(c,m){if(!c){console.error('FAIL — '+m);process.exit(1)}console.log('✓ '+m)}
const semverAtLeast=(v,min)=>{const a=String(v).split('.').map(Number),b=String(min).split('.').map(Number);for(let i=0;i<3;i++){if((a[i]||0)>(b[i]||0))return true;if((a[i]||0)<(b[i]||0))return false}return true};
ok(semverAtLeast(pkg.version,'17.0.14')&&semverAtLeast(app.expo.version,'17.0.14')&&semverAtLeast(app.expo.ios.buildNumber,'17.0.14')&&Number(app.expo.android.versionCode)>=170014,'v17.0.14+ sürüm zinciri');
ok(diag.includes('databaseHealth: databaseHealth'),'v16.13.0 database health açık property export sözleşmesi korundu');
ok(diag.includes('Promise.all([eventsPromise, nativePromise, databasePromise])'),'v17.0.13 paralel Flight Recorder snapshot optimizasyonu korundu');
ok(add.includes('normalizeBulkArchiveBaseName')&&add.includes('defaultBulkArchiveBaseName'),'TXT dosya adı normalizasyonu mevcut');
ok(add.includes('bulkArchiveNameOpen')&&add.includes('bulkArchiveFileName')&&add.includes('Klasör Seç ve Kaydet'),'kullanıcı düzenlenebilir TXT dosya adı UI mevcut');
ok(add.includes('createFileAsync(perm.directoryUri,baseName,"text/plain")'),'SAF createFileAsync uzantısız baseName ile çağrılıyor');
ok(!add.includes('createFileAsync(perm.directoryUri,fileName,"text/plain")'),'eski .txt dahil SAF createFileAsync çağrısı kaldırıldı');
ok(add.includes('const readBack=await FileSystem.readAsStringAsync(target')&&add.includes('if (readBack !== text)'),'SAF write-readback doğrulaması mevcut');
ok(add.includes('BULK_TXT_EXPORT_VERIFIED')&&add.includes('BULK_TXT_EXPORT_FAILED'),'TXT export başarı/hata telemetry mevcut');
ok(add.includes('Güvenli Rapor')&&add.includes('Tam Arşiv'),'güvenli rapor ve tam arşiv seçenekleri korundu');
ok(denetle.includes('check-v17014-txt-export-dbhealth.js'),'v17.0.14 gate denetle zincirine bağlı');
console.log('PASS: v17.0.14 TXT export + DB-health regression corrective contract TEMİZ');
