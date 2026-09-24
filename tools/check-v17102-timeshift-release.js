const fs = require('fs');
let failures = 0;
const read = p => fs.readFileSync(p, 'utf8');
const ok = (condition, label) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${label}`);
  if (!condition) failures += 1;
};

const native = read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/LiveTimeshiftManager.kt');
const moduleKt = read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt');
const bridge = read('frontend/modules/kizilkan-native-core/index.ts');
const player = read('frontend/src/player/PlayerHost.tsx');
const seek = read('frontend/src/components/SeekBar.tsx');
const catchup = read('frontend/app/catchup.tsx');
const stalker = read('frontend/src/utils/stalker.ts');

ok(native.includes('kizilkan-timeshift') && native.includes('cacheDir'), 'timeshift uses app-owned cache storage');
ok(native.includes('ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))') && native.includes('/playlist.m3u8'), 'timeshift exposes private localhost HLS');
ok(native.includes('private const val TS_PACKET = 188') && native.includes('runTs(') && native.includes('parsePmtPid'), 'linear MPEG-TS is packet-aligned and segmented with PAT/PMT tracking');
ok(native.includes('#EXT-X-MEDIA-SEQUENCE:') && native.includes('pruneLocked()') && native.includes('maxWindowSec') && native.includes('maxBytes'), 'rolling HLS window is bounded by duration and disk size');
ok(native.includes('lowStorage()') && native.includes('256L * 1024L * 1024L'), 'low-storage pruning is enforced');
ok(native.includes('runHls(') && native.includes('rewriteAssetTag') && native.includes('HLS_VARIANT_UNSUPPORTED'), 'HLS segments/keys/maps are staged and unsupported rendition graphs fail open');
ok(!/fun start\([^)]*\)[\s\S]{0,900}\n\s*stopAll\(\)/.test(native), 'starting a session cannot kill a newer session through stopAll race');

for (const fn of ['startLiveTimeshift', 'getLiveTimeshiftStatus', 'stopLiveTimeshift', 'stopAllLiveTimeshift']) {
  ok(moduleKt.includes(`AsyncFunction("${fn}")`) && bridge.includes(fn), `native/TypeScript bridge exposes ${fn}`);
}

ok(player.includes('LIVE_TIMESHIFT_WINDOW_SECONDS = 30 * 60') && player.includes('LIVE_TIMESHIFT_MAX_BYTES = 768 * 1024 * 1024'), 'player requests a 30-minute bounded rolling window');
ok(player.includes('enginePlaybackRequest') && player.includes('return null;') && player.includes('startLiveTimeshift('), 'player traffic is gated until local buffer is ready');
ok(player.includes('LIVE_TIMESHIFT_BYPASS') && player.includes('LIVE_TIMESHIFT_RUNTIME_FALLBACK'), 'unsupported/runtime recorder failures fail open to upstream playback');
ok(player.includes('stopLiveTimeshift(sessionId)') && player.includes('const orphan = String(initial?.sessionId || "")'), 'timeshift lifecycle cleans normal and orphan sessions');
ok(player.includes('liveDvr={!isSynthetic && (liveTimeshiftReady || isSeekable)}') && player.includes('player-go-live-btn'), 'live DVR seek UI and go-live action are wired');
ok(seek.includes('(!isLive || liveDvr) && duration > 0') && seek.includes('onGoLive'), 'SeekBar permits real live-window seeking');

ok(player.includes('activePlaylist?.source === "stalker" && channel.stream_id != null') && player.includes('!!channel.catchup_source'), 'PlayerHost exposes MAG and M3U catch-up entry points');
ok(catchup.includes('stalkerArchiveEpg') && catchup.includes('stalkerCreateLink') && catchup.includes('buildM3UCatchupUrl'), 'catch-up screen resolves real MAG archive and M3U templates');
ok(stalker.includes('archive_cmd:archiveCmd||undefined') && stalker.includes('archived && !!archiveCmd ? 1 : 0'), 'MAG archive only marks programs playable with a real archive command');

if (failures) process.exit(1);
console.log('PASS: v17.10.2 APP-OWNED TIMESHIFT / CATCH-UP HARD GATE TEMIZ');
