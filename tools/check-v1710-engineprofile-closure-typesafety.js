#!/usr/bin/env node
const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..');const r=p=>fs.readFileSync(path.join(root,p),'utf8');const s=r('frontend/src/player/PlayerHost.tsx');let bad=0;const ok=(c,m)=>{console.log(`${c?'PASS':'FAIL'}: ${m}`);if(!c)bad++};
ok(/let profile: EngineProfile/.test(s)||/let profile =/.test(s),'EngineProfile async closure local profile var');
ok(/selectedProfileKey/.test(s),'selected EngineProfile key closure capture');
ok(/if \(!alive \|\| !sessionGateRef\.current\.isActive\(sid\)\) return/.test(s),'async closure stale-session guard');
ok(/setV2Profile\(profile\)/.test(s)&&/setUseVLC\(profile\.engine === "vlc"\)/.test(s),'profile applied only after guard');
if(bad)process.exit(1);console.log('PASS: v17.1.0 EngineProfile async-closure TypeScript corrective contract');
