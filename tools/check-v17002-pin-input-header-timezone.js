#!/usr/bin/env node
/** KIZILKAN PLAYER v17.0.2 RC1 — PIN/input safety + header profile + MAG timezone hard-gate. */
const fs=require('fs'),path=require('path'),cp=require('child_process');
const R=path.resolve(__dirname,'..'); const read=p=>fs.readFileSync(path.join(R,p),'utf8'); let bad=0;
const ok=(c,m)=>{console.log(`${c?'PASS':'FAIL'}: ${m}`);if(!c)bad++;};
const pkg=JSON.parse(read('frontend/package.json')),app=JSON.parse(read('frontend/app.json'));
const [M,m,p]=pkg.version.split('.').map(Number), expected=M*10000+m*100+p;
ok(expected>=170002,'frontend/package.json preserves v17.0.2+ contract');
ok(app.expo.version===pkg.version&&app.expo.ios.buildNumber===pkg.version,'Expo/iOS metadata synchronized');
ok(app.expo.android.versionCode===expected&&expected>=170002,'Android versionCode is formula-consistent and v17.0.2+');
ok(String(app.expo.extra?.kizilkanReleaseLabel||'').includes(`v${pkg.version} RC1`),'release label synchronized');

const plugin=read('frontend/plugins/withTvRemoteKeys.js');
ok(plugin.includes('val isDigit = keyCode == android.view.KeyEvent.KEYCODE_0')&&plugin.includes('KEYCODE_NUMPAD_9'),'native remote bridge recognizes digit/numpad keys');
ok(plugin.includes('if (!isDigit) return true')&&/emit\("KizilkanRemoteKey", params\)[\s\S]*if \(!isDigit\) return true/.test(plugin),'digit events are emitted for numeric zap but not consumed before Android input chain');

const profile=read('frontend/app/profile-select.tsx');
ok(profile.includes('testID="pin-input"')&&profile.includes('onChangeText={t => { setPinInput(t.replace(/\\D/g, "").slice(0, 10));'),'profile PIN TextInput and numeric state update preserved');
const pinFiles=['frontend/app/profile-setup.tsx','frontend/app/pin-entry.tsx','frontend/app/hidden-pin.tsx','frontend/app/playlist-select.tsx','frontend/app/welcome.tsx'];
for(const f of pinFiles) ok(read(f).includes('keyboardType="number-pad"'),`${f} numeric PIN input preserved`);

const types=read('frontend/src/types/index.ts');
ok(types.includes('playbackHeaders?: {')&&types.includes('userAgent?: string;')&&types.includes('referer?: string;')&&types.includes('origin?: string;'),'playlist/account UA/Referer/Origin contract exists');
ok(types.includes("stalkerTimezoneMode?: 'auto' | 'portal' | 'device' | 'manual';")&&types.includes('stalkerPortalTimezone?: string;'),'MAG timezone mode + verified portal timezone contract exists');

const request=read('frontend/src/player/v2/request.ts');
ok(request.includes('item override > playlist/account default > provider/protocol > engine default'),'header precedence is documented in executable request builder');
ok(/override\?\.userAgent[\s\S]*playlistHeaders\?\.userAgent[\s\S]*protocolHeaders\["User-Agent"\][\s\S]*providerHeaders\["User-Agent"\][\s\S]*DEFAULT_USER_AGENT/.test(request),'User-Agent precedence is item > playlist > protocol > provider > engine');
ok(/override\?\.referer[\s\S]*playlistHeaders\?\.referer[\s\S]*protocolHeaders\["Referer"\][\s\S]*providerHeaders\["Referer"\]/.test(request),'Referer precedence is item > playlist > protocol > provider');
ok(/override\?\.origin[\s\S]*playlistHeaders\?\.origin[\s\S]*protocolHeaders\["Origin"\][\s\S]*providerHeaders\["Origin"\]/.test(request),'Origin precedence is item > playlist > protocol > provider');

const edit=read('frontend/app/edit-playlist.tsx');
ok(edit.includes('edit-playback-ua-input')&&edit.includes('edit-playback-referer-input')&&edit.includes('edit-playback-origin-input'),'account playback header UI exists');
ok(edit.includes('["auto", "Otomatik"]')&&edit.includes('["portal", "Portal"]')&&edit.includes('["device", "Cihaz"]')&&edit.includes('["manual", "Manuel"]')&&edit.includes('testID={`edit-st-timezone-${mode}`}'),'MAG timezone mode UI exposes all four modes');
ok(edit.includes('Europe/Istanbul')&&edit.includes('IANA biçiminde'),'manual timezone validation/help exists');

const stalker=read('frontend/src/utils/stalker.ts');
ok(stalker.includes('function explicitTimezone(cred: StalkerCreds)')&&stalker.includes('function tzWire('),'timezone policy resolves into MAG wire cookie');
ok(stalker.includes('return undefined; // auto: preserve proven per-profile wire defaults exactly.'),'auto timezone preserves proven MAG profile defaults');
ok(stalker.includes('STALKER_PORTAL_TIMEZONE_DISCOVERED')&&stalker.includes('session.portalTimezone = portalTimezone'),'portal-reported timezone is verified/discovered and carried in session');
ok(stalker.includes('stalkerCredsFromPlaylist'),'playlist timezone policy is centralized for playback/catalog callers');

for(const gate of ['check-v17000-tv-navigation-focus-player.js','check-v17001-forward-semver-regression.js']){
  try{cp.execFileSync(process.execPath,[path.join(__dirname,gate)],{stdio:'pipe'});ok(true,`${gate} preservation gate passes`)}
  catch(e){ok(false,`${gate} preservation gate passes`);if(e.stdout)process.stdout.write(String(e.stdout));if(e.stderr)process.stderr.write(String(e.stderr));}
}
if(bad){console.error(`FAIL — v17.0.2 RC1 hard-gate: ${bad}`);process.exit(1)}
console.log('TEMIZ — v17.0.2 RC1 PIN/input safety + header profile + MAG timezone hard-gate');
