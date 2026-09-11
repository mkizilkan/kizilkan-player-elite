#!/usr/bin/env node
const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..');const r=p=>fs.readFileSync(path.join(root,p),'utf8');
const player=r('frontend/src/player/PlayerHost.tsx'), diag=r('frontend/src/utils/diagnostics.ts'), mpv=r('frontend/modules/mpv-player/android/src/main/java/expo/modules/kizilkanmpv/KizilkanMpvView.kt');
const checks=[
 ['Media3 hidden cadence 60s',/!visible\s*\?\s*60_000/.test(player)&&/visible, deduped/.test(player)],
 ['diagnostics export single-flight',/diagnosticExportInFlight/.test(diag)&&/EXPORT_SINGLE_FLIGHT_REUSED/.test(diag)],
 ['diagnostics export fast health',/getDatabaseHealthFast/.test(diag)&&/databaseHealthMode: 'fast'/.test(diag)],
 ['MPV TextureView render target',/TextureView\.SurfaceTextureListener/.test(mpv)&&/Surface\(surfaceTexture\)/.test(mpv)&&/attachSurface\(renderSurface\)/.test(mpv)],
 ['MPV visible compositor frame telemetry',/TEXTURE_FIRST_VISIBLE_FRAME/.test(mpv)&&/textureFrameSeen/.test(mpv)],
 ['MPV single audio owner revoke',/AUDIO_OWNER_CLAIM/.test(mpv)&&/AUDIO_OWNER_REVOKED/.test(mpv)&&/revokeAudioOwnership/.test(mpv)],
 ['MPV native link classification preserved',/MPV_NATIVE_LINK_ERROR_MISSING_CXX_SYMBOL/.test(mpv)],
];let bad=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${n}`);if(!ok)bad++;}if(bad)process.exit(1);console.log('PASS: v17.2.0 player/diagnostics hardening');
