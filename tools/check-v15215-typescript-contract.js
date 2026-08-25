#!/usr/bin/env node
/** v15.2.15 — Stalker Series lookup TypeScript contract regression gate. */
const fs = require('fs');
const path = require('path');
const ts = require('./_ts');
const root = process.cwd();
const file = path.join(root, 'src/utils/stalker.ts');
const src = fs.readFileSync(file, 'utf8');
let problems = 0;
function problem(m){ console.error('  V15.2.15  '+m); problems++; }
if (!/const\s+seriesLookupVariants\s*:\s*Record\s*<\s*string\s*,\s*string\s*>\s*\[\s*\]/.test(src)) problem('seriesLookupVariants explicit Record<string,string>[] sözleşmesi yok');
if (!/for\s*\(\s*const\s+extra\s+of\s+seriesLookupVariants\s*\)/.test(src)) problem('stalkerSeriesInfo typed lookup varyantlarını kullanmıyor');
if (!src.includes('{series_id:String(seriesId)}') || !src.includes('{movie_id:String(seriesId)}')) problem('series_id/movie_id lookup varyantlarından biri eksik');
// Asıl CI blocker sınıfını lokal transpile/type-check ile yeniden üret: stalker.ts semantik diagnostics.
const options={target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,strict:false,skipLibCheck:true,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX,moduleResolution:ts.ModuleResolutionKind.NodeJs};
const host=ts.createCompilerHost(options); const orig=host.getSourceFile;
host.getSourceFile=(f,lang,onErr,newFile)=> path.resolve(f)===path.resolve(file) ? ts.createSourceFile(f,src,lang,true,ts.ScriptKind.TS) : orig(f,lang,onErr,newFile);
const program=ts.createProgram([file],options,host);
const diagnostics=ts.getPreEmitDiagnostics(program).filter(d=>d.file && path.resolve(d.file.fileName)===path.resolve(file));
const blocker=diagnostics.filter(d=>d.code===2345 && d.start!=null && d.file.text.slice(Math.max(0,d.start-300),d.start+300).includes('stalkerOrderedList'));
if (blocker.length) problem('TS2345 stalkerOrderedList Record<string,string> blocker devam ediyor');
if (problems) { console.error(`HATA — ${problems} v15.2.15 TypeScript contract problemi`); process.exit(1); }
console.log('TEMIZ — v15.2.15 Stalker Series TypeScript contract kapisi');
