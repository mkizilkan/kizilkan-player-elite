#!/usr/bin/env node
/** KIZILKAN PLAYER v17.0.0+ — TV navigation/focus/player stability preservation hard-gate. */
const fs=require('fs'),path=require('path'),cp=require('child_process');
const R=path.resolve(__dirname,'..'); const read=p=>fs.readFileSync(path.join(R,p),'utf8'); let bad=0;
const ok=(c,m)=>{console.log(`${c?'PASS':'FAIL'}: ${m}`);if(!c)bad++;};
const pkg=JSON.parse(read('frontend/package.json')),app=JSON.parse(read('frontend/app.json'));
const [M,m,p]=pkg.version.split('.').map(Number), expected=M*10000+m*100+p;
const semverAtLeast=(v,min)=>{const a=String(v).split('.').map(Number),b=String(min).split('.').map(Number);for(let i=0;i<3;i++){if((a[i]||0)!==(b[i]||0))return (a[i]||0)>(b[i]||0);}return true;};
ok(semverAtLeast(pkg.version,'17.0.0'),'frontend/package.json preserves v17.0.0+');
ok(app.expo.version===pkg.version&&app.expo.ios.buildNumber===pkg.version,'Expo/iOS version synchronized');
ok(app.expo.android.versionCode===expected&&app.expo.android.versionCode>=170000,'Android versionCode preserves v17.0.0+ and is formula-consistent');
ok(String(app.expo.extra?.kizilkanReleaseLabel||'').includes(`v${pkg.version} RC1`),'release label synchronized');
try { cp.execFileSync(process.execPath,[path.join(__dirname,'check-v16149-tv-navigation-focus.js')],{stdio:'pipe'}); ok(true,'v16.14.9+ TV/navigation/focus feature contract preserved'); }
catch(e){ ok(false,'v16.14.9+ TV/navigation/focus feature contract preserved'); if(e.stdout) process.stdout.write(String(e.stdout)); if(e.stderr) process.stderr.write(String(e.stderr)); }
const host=read('frontend/src/player/PlayerHost.tsx');
const remote=read('frontend/plugins/withTvRemoteKeys.js');
const scope=read('frontend/src/player/navigationScope.ts');
const focus=read('frontend/src/store/TvFocusMemoryContext.tsx');
ok(host.includes('PLAYER_NEIGHBOR_ROOM_LOOKUP')&&host.includes('PLAYER_SCOPED_NEIGHBOR_LOOKUP'),'native/scoped neighbor navigation retained');
ok(!host.includes('const channelList = useMemo(() => activePlaylist?.channels || []'),'full JS catalog zapping regression remains blocked');
ok(remote.includes('KEYCODE_CHANNEL_UP -> "channelUp"')&&remote.includes('KEYCODE_CHANNEL_DOWN -> "channelDown"'),'CH+/- semantic actions retained');
ok(remote.includes('KEYCODE_MEDIA_NEXT -> "contentNext"')&&remote.includes('KEYCODE_MEDIA_PREVIOUS -> "contentPrevious"'),'media next/previous semantic actions retained');
ok(scope.includes('PLAYER_NAV_SCOPE_MAX_IDS = 100_000')&&focus.includes('TvFocusMemoryProvider'),'bounded navigation scope + central focus memory retained');
ok(host.includes('REBUFFER_START')&&host.includes('REBUFFER_END')&&host.includes('PLAYER_RESOURCE_RELEASE'),'player lifecycle/rebuffer telemetry retained');
if(bad){console.error(`FAIL — v17.0.0+ preservation hard-gate: ${bad}`);process.exit(1)}
console.log('TEMIZ — v17.0.0+ TV navigation + focus + player stability preservation hard-gate');
