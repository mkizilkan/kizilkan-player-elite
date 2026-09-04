#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=JSON.parse(read('frontend/package.json'));
const app=JSON.parse(read('frontend/app.json'));
const add=read('frontend/app/add-playlist.tsx');
const theme=read('frontend/src/theme/themes.ts');
const denetle=read('tools/denetle.js');
function ok(c,m){if(!c){console.error('FAIL — '+m);process.exit(1)}console.log('✓ '+m)}
function extractObjectKeys(src, marker){
  const start=src.indexOf(marker); if(start<0)return [];
  const open=src.indexOf('{',start); if(open<0)return [];
  let depth=0,end=-1;
  for(let i=open;i<src.length;i++){
    if(src[i]==='{')depth++; else if(src[i]==='}'&&--depth===0){end=i;break;}
  }
  if(end<0)return [];
  return [...src.slice(open+1,end).matchAll(/\b([A-Za-z_$][\w$]*)\s*:/g)].map(m=>m[1]);
}
const fontSizeMatch=theme.match(/export const FONT\s*=\s*\{[\s\S]*?size\s*:\s*\{([^}]*)\}/);
const fontSizeKeys=fontSizeMatch?[...fontSizeMatch[1].matchAll(/\b([A-Za-z_$][\w$]*)\s*:/g)].map(m=>m[1]):[];
const spacingMatch=theme.match(/export const SPACING\s*=\s*\{([^}]*)\}/);
const spacingKeys=spacingMatch?[...spacingMatch[1].matchAll(/\b([A-Za-z_$][\w$]*)\s*:/g)].map(m=>m[1]):[];
const usedFont=[...add.matchAll(/FONT\.size\.([A-Za-z_$][\w$]*)/g)].map(m=>m[1]);
const usedSpacing=[...add.matchAll(/SPACING\.([A-Za-z_$][\w$]*)/g)].map(m=>m[1]);
const invalidFont=[...new Set(usedFont.filter(k=>!fontSizeKeys.includes(k)))];
const invalidSpacing=[...new Set(usedSpacing.filter(k=>!spacingKeys.includes(k)))];
ok(pkg.version==='17.0.15'&&app.expo.version==='17.0.15'&&app.expo.ios.buildNumber==='17.0.15'&&app.expo.android.versionCode===170015&&app.expo.extra?.kizilkanReleaseLabel==='GPT ELITE v17.0.15 RC1','v17.0.15 sürüm zinciri');
ok(fontSizeKeys.includes('base')&&!fontSizeKeys.includes('md'),'FONT.size gerçek tema sözleşmesi doğrulandı');
ok(!add.includes('FONT.size.md'),'TS2339 oluşturan FONT.size.md kaldırıldı');
ok(add.includes('fontSize:FONT.size.base'),'TXT dosya adı alanı geçerli FONT.size.base kullanıyor');
ok(invalidFont.length===0,'add-playlist geçersiz FONT.size token içermiyor: '+invalidFont.join(','));
ok(invalidSpacing.length===0,'add-playlist geçersiz SPACING token içermiyor: '+invalidSpacing.join(','));
ok(add.includes('BULK_TXT_EXPORT_VERIFIED')&&add.includes('bulkArchiveFileName'),'v17.0.14 TXT export ve özel dosya adı korunuyor');
ok(read('frontend/src/utils/diagnostics.ts').includes('databaseHealth: databaseHealth'),'v17.0.14 DB-health sözleşmesi korunuyor');
ok(denetle.includes('check-v17015-typescript-theme-token.js'),'v17.0.15 gate denetle zincirine bağlı');
console.log('PASS: v17.0.15 TypeScript theme-token corrective contract TEMİZ');
