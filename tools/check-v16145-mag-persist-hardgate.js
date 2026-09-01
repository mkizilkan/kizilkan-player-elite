#!/usr/bin/env node
const fs=require('fs'),path=require('path'); const R=path.resolve(__dirname,'..'); const read=p=>fs.readFileSync(path.join(R,p),'utf8');
let bad=0; const ok=(c,m)=>{console.log(`${c?'PASS':'FAIL'}: ${m}`);if(!c)bad++};
const pkg=JSON.parse(read('frontend/package.json')),app=JSON.parse(read('frontend/app.json')), add=read('frontend/app/add-playlist.tsx'), st=read('frontend/src/utils/stalker.ts'), kt=read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt');
const [M,m,p]=pkg.version.split('.').map(Number); const expected=M*10000+m*100+p;
const semver=v=>{const m=String(v||'').match(/^(\d+)\.(\d+)\.(\d+)/);return m?Number(m[1])*1000000+Number(m[2])*1000+Number(m[3]):-1;};
ok(semver(pkg.version)>=semver('16.14.5')&&app.expo.version===pkg.version&&app.expo.android.versionCode===expected,'v16.14.5+ metadata synchronized');
ok(app.expo.ios.buildNumber===pkg.version&&String(app.expo.extra?.kizilkanReleaseLabel||'').includes(pkg.version),'iOS/release label synchronized');
ok(add.includes('STALKER_ACCOUNT_PERSIST_START')&&add.includes('STALKER_ACCOUNT_PERSIST_OK'),'verified MAG account persists before catalog bootstrap');
ok(add.indexOf('commitPlaylist(shell)')<add.indexOf('stalkerCatalog(cred, session'),'shell commit precedes live catalog download');
ok(/liveOnly:\s*true/.test(add),'MAG add always uses live-first catalog');
ok(add.includes('stalkerCategoryPreview')&&st.includes('export async function stalkerCategoryPreview'),'category selection no longer requires full VOD/Series item download');
ok(add.includes('void bootstrap(false)'),'default MAG catalog bootstrap is non-blocking');
ok(add.includes('STALKER_INITIAL_SYNC_PARTIAL_ERROR')&&add.includes('initialSyncState:"partial_error"'),'catalog failure preserves persisted account with explicit partial state');
ok(add.includes('applyContentSelection({channels:[],vod:enrich.vod,series:enrich.series}') ,'background enrichment preserves category selection');
ok(kt.includes('gzipByMagic')&&kt.includes('GZIPInputStream(ByteArrayInputStream(rawBody))'),'native MAG body handles gzip magic/header explicitly');
ok(kt.includes('"gzipDecoded"'),'gzip decode telemetry exposed');
if(bad){console.error(`FAIL — v16.14.5+ MAG persistence hard-gate: ${bad}`);process.exit(1)} console.log('TEMIZ — v16.14.5+ verified-account persistence / async catalog / gzip hardening');
