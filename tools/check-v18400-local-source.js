#!/usr/bin/env node
/**
 * v18.4.0 — Yerel dosya kaynak ayrımı kapısı.
 * Cihaz logu: yerel mp3/mp4, MAG listesi aktifken create_link'e gidip 404 alıyordu.
 * Kural: PlayerHost oynatma kararlarında `activePlaylist?.source` DOĞRUDAN kullanılmaz;
 * yerel dosyada "local" dönen `playlistSource` kullanılır. MAG film/catch-up (ext=true)
 * dosya şeması taşımadığı için create_link'e gitmeye devam eder.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'frontend/src/player/PlayerHost.tsx'), 'utf8');
const fail = [];
const need = (cond, msg) => { if (!cond) fail.push(msg); };

need(src.includes("const directFileSession = isSynthetic && (isLocalMediaId(params.id) || /^(content|file):") && src.includes(".test(String(channel?.url || \"\")));"),
  "directFileSession: local- kimliği veya content://|file:// şeması koşulu yok");
need(/const playlistSource: string \| undefined = directFileSession \? "local" : activePlaylist\?\.source;/.test(src),
  'playlistSource yerel dosyada "local" dönmüyor');
need(/const playbackPlaylist = directFileSession \? undefined : activePlaylist;/.test(src),
  'playbackPlaylist yerel dosyada liste başlıklarını taşımamalı');
const direct = src.split('\n').filter(l => /activePlaylist\?\.source/.test(l) && !/const playlistSource/.test(l) && !/activePlaylistSource:/.test(l));
need(direct.length === 0, 'oynatma kararlarında korumasız activePlaylist?.source kaldı:\n  ' + direct.map(s => s.trim().slice(0, 140)).join('\n  '));
need(/if \(!channel\?\.url \|\| playlistSource !== "stalker"(?: \|\| !channelAllowed)?\)/.test(src), 'Stalker çözüm efekti playlistSource ile korunmuyor');
need(/const playUrl = playlistSource === "stalker"/.test(src), 'playUrl playlistSource ile seçilmiyor');
need(/playlist: playbackPlaylist,/.test(src), 'buildPlaybackRequest playbackPlaylist almıyor');
need(/LOCAL_MEDIA_SOURCE_ROUTED/.test(src), 'LOCAL_MEDIA_SOURCE_ROUTED telemetrisi yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.4.0 yerel dosya kaynak ayrımı TEMİZ');
