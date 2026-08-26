#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..', 'frontend');
let bad = 0;
const need = (file, text, label) => {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) { console.log(`HATA — ${label}: dosya yok ${file}`); bad++; return; }
  const s = fs.readFileSync(p, 'utf8');
  if (!s.includes(text)) { console.log(`HATA — ${label}: '${text}' yok`); bad++; }
};
const forbid = (file, text, label) => {
  const p = path.join(root, file); if (!fs.existsSync(p)) return;
  if (fs.readFileSync(p,'utf8').includes(text)) { console.log(`HATA — ${label}: yasak '${text}'`); bad++; }
};
{ const d=fs.readFileSync(path.join(root,'src/utils/diagnostics.ts'),'utf8'); if(!/KIZILKAN_(?:DIAGNOSTICS_V1|BLACK_BOX_V2)/.test(d)){ console.log('HATA — kalıcı tanılama raporu formatı yok'); bad++; } }
need('src/utils/diagnostics.ts', 'SENSITIVE_KEY', 'tanılama gizli alan redaksiyonu');
{ const d=fs.readFileSync(path.join(root,'src/utils/diagnostics.ts'),'utf8'); const m=d.match(/MAX_EVENTS\s*=\s*(\d+)/); if(!m || Number(m[1]) < 400){ console.log(`HATA — bounded ring buffer kapasitesi yetersiz: ${m?.[1] || 'yok'}`); bad++; } }
need('src/player/PlayerHost.tsx', 'CHANNEL_SELECTED', 'player seçim başlangıç telemetrisi');
need('src/player/PlayerHost.tsx', 'PLAYER_SESSION_START', 'player prepare telemetrisi');
need('src/player/PlayerHost.tsx', 'totalFromSelectionMs', 'uçtan uca first-frame süresi');
need('src/utils/stalker.ts', 'stalkerSessionCache', 'MAG session cache');
need('src/utils/stalker.ts', 'STALKER_RESOLVE_DONE', 'MAG resolve süre telemetrisi');
need('src/utils/stalker.ts', 'forceFresh: true', '401/403 sonrası fresh login');
need('src/utils/stalker.ts', 'MAG250-legacy-minimal', 'MAG profile legacy uyumluluk varyanti');
need('src/utils/stalker.ts', 'MAG250-derived-identity', 'MAG profile derived identity uyumluluk varyanti');
need('src/utils/stalker.ts', 'STALKER_PROFILE_VARIANT_ERROR', 'MAG profile asama diagnostigi');
forbid('src/utils/stalker.ts', 'stalkerProfile(cred, session).catch(() => null)', 'sessiz MAG profile hatası');
need('modules/kizilkan-native-core/index.ts', 'getExitHistory', 'process exit geçmişi bridge');
need('modules/panel-scan/index.ts', 'getDiagnosticEvents', 'scan flight recorder bridge');
need('app/stats.tsx', 'Tanılama Raporunu Paylaş', 'tanılama paylaşım UI');
need('app/stats.tsx', 'Player Tanılama', 'player tanılama UI');
need('app/stats.tsx', 'Tarama Tanılama', 'scan tanılama UI');
const kt = path.join(root, 'modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt');
if (fs.existsSync(kt)) {
  const s=fs.readFileSync(kt,'utf8');
  for (const x of ['KEY_EVENTS','appendDiagnosticEvent','Debug.getPss()']) if(!s.includes(x)){console.log(`HATA — scan native recorder eksik: ${x}`);bad++;}
  const recorder = s.slice(s.indexOf('@Synchronized private fun appendDiagnosticEvent'), s.indexOf('@Synchronized private fun writeSnapshot'));
  for (const secret of ['username','password','currentServer']) if(recorder.includes(`put(\"${secret}\"`)){console.log(`HATA — scan flight recorder gizli alan kaydediyor: ${secret}`);bad++;}
}

function compile(rel) {
  const source = fs.readFileSync(path.join(root, rel), 'utf8');
  return ts.transpileModule(source, { compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020, esModuleInterop:true } }).outputText;
}
function response(body, status=200){ return { ok:status>=200&&status<300, status, text:async()=>JSON.stringify(body) }; }
function query(url){ return Object.fromEntries(new URL(url).searchParams.entries()); }
async function sessionCacheFixture(){
  const js=compile('src/utils/stalker.ts');
  let handshakes=0, profiles=0, creates=0;
  const fetch=async url=>{ const q=query(url);
    if(q.action==='handshake'){handshakes++;return response({js:{token:'t'+handshakes}});}
    if(q.action==='get_profile'){profiles++;return response({js:{status:'Active'}});}
    if(q.action==='create_link'){creates++;return response({js:{cmd:'ffmpeg http://stream/'+creates}});}
    throw new Error('Beklenmeyen endpoint '+url);
  };
  const req=id=>id==='@/src/utils/diagnostics'?{recordDiagnostic:async()=>{}}:require(id);
  const box={module:{exports:{}},exports:{},require:req,console,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,fetch}; box.exports=box.module.exports;
  vm.runInNewContext(js,box,{filename:'stalker.ts'}); const m=box.module.exports;
  const c={portal:'http://portal.test',mac:'00:11:22:33:44:55'};
  await m.stalkerResolveStream(c,null,'ffmpeg http://cmd/1');
  await m.stalkerResolveStream(c,null,'ffmpeg http://cmd/2');
  if(handshakes!==1||profiles!==1||creates!==2) throw new Error(`session cache yanlış: handshake=${handshakes} profile=${profiles} create=${creates}`);
}
(async()=>{
  try { await sessionCacheFixture(); }
  catch(e){ console.log('HATA — MAG session cache fixture:', e.message); bad++; }
  if (bad) { console.log(`\n❌ ${bad} v15.2.16 TANILAMA SÖZLEŞMESİ HATASI`); process.exit(1); }
  console.log('TEMIZ — v15.2.16 diagnostics/session-cache contract');
})();
