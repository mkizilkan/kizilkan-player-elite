#!/usr/bin/env node
const fs=require('fs'),path=require('path'),ts=require('./_ts');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'frontend/src/utils/stalker.ts'),'utf8');
function need(re,msg){if(!re.test(src)) throw new Error(msg)}
function forbid(re,msg){if(re.test(src)) throw new Error(msg)}
try {
  need(/type LearnedMagCompatStore = Record<string, LearnedMagCompat>/,'typed learned store yok');
  need(/storage\.getItem\(MAG_LEARNED_KEY, ""\)/,'learned store primitive string storage sözleşmesiyle okunmuyor');
  need(/storage\.setItem\(MAG_LEARNED_KEY, JSON\.stringify\(all\)\)/,'learned store JSON string olarak yazılmıyor');
  need(/function parseLearnedCompatStore\(/,'runtime cache doğrulaması yok');
  forbid(/storage\.getItem<Record<string, LearnedMagCompat>>/,'RC1 TS2344 üreten object generic geri geldi');
  forbid(/storage\.setItem\(MAG_LEARNED_KEY\s*,\s*(?:all|Object\.fromEntries)/,'RC1 TS2345 üreten object write geri geldi');
  const sf=ts.createSourceFile('stalker.ts',src,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);
  const syntactic=sf.parseDiagnostics||[];
  if(syntactic.length) throw new Error('stalker.ts syntax diagnostic: '+syntactic.map(d=>'TS'+d.code+' '+ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
  console.log('TEMIZ — v15.2.25 RC2 learned MAG storage primitive contract + RC1 TS2344/TS2345 regression gate');
} catch(e) { console.error('HATA — v15.2.25 RC2 storage contract:',e.message); process.exit(1); }
