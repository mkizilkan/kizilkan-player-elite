#!/usr/bin/env node
const fs=require('fs'), path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=JSON.parse(read('frontend/package.json'));
const app=JSON.parse(read('frontend/app.json'));
const mpv=read('frontend/modules/mpv-player/android/src/main/java/expo/modules/kizilkanmpv/KizilkanMpvView.kt');
const checks=[
 ['version 17.2.2', pkg.version==='17.2.2' && app.expo.version==='17.2.2' && app.expo.android.versionCode===170202 && app.expo.ios.buildNumber==='17.2.2' && app.expo.extra?.kizilkanReleaseLabel==='GPT ELITE v17.2.2 RC1'],
 ['TextureView architecture preserved', /TextureView\.SurfaceTextureListener/.test(mpv) && /private val textureView = TextureView\(context\)/.test(mpv)],
 ['lifecycle Surface remains nullable', /private var renderSurface: Surface\? = null/.test(mpv)],
 ['non-null local Surface created', /val surface = Surface\(surfaceTexture\)/.test(mpv)],
 ['local Surface stored for lifecycle cleanup', /renderSurface = surface/.test(mpv)],
 ['MPV attach receives non-null local Surface', /mpv\?\.attachSurface\(surface\)/.test(mpv)],
 ['nullable Surface is never passed to attachSurface', !/attachSurface\(renderSurface\)/.test(mpv)],
 ['surface release/detach lifecycle preserved', /renderSurface\?\.release\(\)/.test(mpv) && /mpv\?\.detachSurface\(\)/.test(mpv)],
 ['one-shot TextureView frame telemetry preserved', /if \(!textureFrameSeen\)/.test(mpv) && /TEXTURE_FIRST_VISIBLE_FRAME/.test(mpv)],
 ['MPV audio ownership preserved', /AUDIO_OWNER_CLAIM/.test(mpv) && /AUDIO_OWNER_REVOKED/.test(mpv)],
];
let bad=0;
for(const [name,ok] of checks){ console.log(`${ok?'PASS':'FAIL'}: ${name}`); if(!ok) bad++; }
if(bad){ console.error(`FAIL: ${bad} v17.2.2 MPV Surface Kotlin check(s)`); process.exit(1); }
console.log('PASS: v17.2.2 MPV TextureView non-null Surface Kotlin corrective contract');
