#!/usr/bin/env node
const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..');const r=p=>fs.readFileSync(path.join(root,p),'utf8');const s=r('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt');let bad=0;const ok=(c,m)=>{console.log(`${c?'PASS':'FAIL'}: ${m}`);if(!c)bad++};
ok(/writeUnifiedSnapshot\(/.test(s),'unified snapshot writer present');
ok(/extra: JSONObject\?/.test(s)||/JSONObject\(\)\.put\("streamingFile"/.test(s),'snapshot extra payload path present');
ok(/requestedConcurrency/.test(s)&&/effectiveConcurrency/.test(s),'snapshot concurrency fields in scope');
ok(/sourceFingerprint/.test(s),'snapshot source fingerprint in scope');
if(bad)process.exit(1);console.log('PASS: v17.1.0 PanelScan snapshot extra-scope Kotlin corrective contract');
