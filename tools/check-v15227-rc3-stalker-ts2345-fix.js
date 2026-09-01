#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),ts=require('./_ts');
const ROOT=path.resolve(__dirname,'..');
const file=path.join(ROOT,'frontend/src/utils/stalker.ts');
const src=fs.readFileSync(file,'utf8');
function need(re,msg){ if(!re.test(src)){ console.error('HATA — '+msg); process.exit(1); } }
function forbid(re,msg){ if(re.test(src)){ console.error('HATA — '+msg); process.exit(1); } }
need(/const recoveryParams:\s*Record<string, string>\s*=\s*\{\}/,'recoveryParams açık string map değil');
need(/if \(serial\) recoveryParams\.sn = serial/,'opsiyonel serial güvenli eklenmiyor');
need(/if \(token\) recoveryParams\.token = token/,'token güvenli eklenmiyor');
need(/recoveryParams\.long_lived = "1"/,'recovery long_lived eksik');
forbid(/const recoveryParams\s*=\s*opts\.recovery\s*\?\s*\{/,'TS2345 üreten ternary recovery map geri gelmiş');
const out=ts.transpileModule(src,{fileName:'stalker.ts',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
const fatal=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
if(fatal.length){ console.error('HATA — stalker.ts transpile: '+fatal.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join(' | ')); process.exit(1); }
console.log('TEMIZ — v15.2.27 RC3 Stalker create_link TS2345 type-safety gate');
