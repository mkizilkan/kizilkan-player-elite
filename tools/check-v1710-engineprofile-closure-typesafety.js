#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const player = read('frontend/src/player/PlayerHost.tsx');
const types = read('frontend/src/player/v2/types.ts');
const denetle = read('tools/denetle.js');
function ok(cond, msg) {
  if (!cond) { console.error('FAIL — ' + msg); process.exit(1); }
  console.log('✓ ' + msg);
}
ok(types.includes('| { engine: "media3"; surface: PlaybackSurface }') &&
   types.includes('| { engine: "vlc"; decoder: VlcDecoder }') &&
   types.includes('| { engine: "mpv"; decoder: "auto" }'),
   'EngineProfile discriminated-union sözleşmesi korunuyor');
const start = player.indexOf('v15.2.23-RC2 — VLC VIDEO OUTPUT WATCHDOG');
const end = player.indexOf('GPT ELITE v15.0.0 — RUNTIME STALL MONITOR', start);
ok(start >= 0 && end > start, 'VLC video-output watchdog bloğu bulundu');
const block = player.slice(start, end);
ok(block.includes('if (v2Profile.engine !== "vlc" || !useVLC || vlcVideoReady) return;'),
   'VLC discriminant guard korunuyor');
ok(block.includes('const vlcDecoder = v2Profile.decoder;'),
   'decoder async closure öncesinde VLC-only primitive olarak yakalanıyor');
ok(block.includes('decoder: vlcDecoder') && block.includes('if (vlcDecoder === "hw")'),
   'timeout callback yalnız yakalanmış VLC decoder değerini kullanıyor');
const directInCallback = /const timer\s*=\s*setTimeout\([\s\S]*?\},\s*timeoutMs\);/.exec(block)?.[0] || '';
ok(!/v2Profile\.decoder\b/.test(directInCallback),
   'async timeout içinde EngineProfile.decoder doğrudan erişimi yok');
ok(denetle.includes('check-v1710-engineprofile-closure-typesafety.js'),
   'EngineProfile closure gate denetle zincirine bağlı');
console.log('PASS: v17.1.0 EngineProfile async-closure TypeScript corrective contract TEMİZ');
