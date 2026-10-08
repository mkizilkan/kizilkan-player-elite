import React, { useEffect, useRef, useState } from 'react';
import { Modal, Text, View, Button } from 'react-native';
import { createVideoPlayer, VideoView } from 'expo-video';
import { usePlayer } from '@/src/player/PlayerContext';
import { acquirePlaybackProbe } from '@/src/player/playbackProbeLease';
import { canonicalEndpointUrl } from '@/src/utils/playlistEndpoints';
import type { PlaylistEndpoint } from '@/src/types';

type Props = { endpoint: string; kind: 'xtream' | 'stalker'; username?: string; password?: string; mac?: string; serial?: string; profileId?: string;
  onEvidence: (value: PlaylistEndpoint) => void; onClose: () => void };

/** Only VideoView's renderer event proves an image. API/login/clock events do not. */
export function EndpointPlaybackTest(props: Props) {
  const { visible } = usePlayer();
  const [player] = useState(() => createVideoPlayer(null));
  const [message, setMessage] = useState('Hesap ve örnek kanal doğrulanıyor…');
  const finishRef = useRef<(error?: string) => void>(() => {});
  const callbacks = useRef(props); callbacks.current = props;
  useEffect(() => {
    const ctrl = new AbortController(); let alive = true; let done = false; let released = false;
    const startedAt = Date.now();
    let releaseLease: (() => void) | undefined; let catalogAt: string | undefined;
    const stop = () => { if (!released) { released = true; try { player.pause(); } catch {} try { player.release(); } catch {} } releaseLease?.(); releaseLease = undefined; };
    const timer = setTimeout(() => finishRef.current('45 saniyede ilk kare alınamadı; bu sonuç kesin görüntü yok anlamına gelmez.'), 45000);
    const finish = (error?: string) => {
      if (done || !alive) return; done = true; ctrl.abort(); clearTimeout(timer);
      try { player.pause(); void player.replaceAsync(null).catch(() => {}); } catch {}
      const now = new Date().toISOString();
      callbacks.current.onEvidence({ url: canonicalEndpointUrl(props.endpoint), kind: props.kind, source: 'playback', lastTestAt: now,
        ...(catalogAt ? { accountVerifiedAt: catalogAt, catalogVerifiedAt: catalogAt } : {}),
        ...(error ? { lastError: error } : { firstFrameAt: now, firstFrameElapsedMs: Date.now() - startedAt, lastError: '' }) });
      setMessage(error || 'İlk kare gerçekten görüldü. Test bağlantısı kapatıldı. Kaydet ile adres kanıtını saklayabilirsiniz.');
    };
    finishRef.current = finish;
    const listener = player.addListener('statusChange', ({ status }) => { if (status === 'error') finish('Motor örnek yayını açamadı; adres yeniden test edilebilir.'); });
    void (async () => {
      try {
        if (visible) throw new Error('Tek bağlantıyı korumak için önce açık oynatıcıyı kapatın.');
        releaseLease = await acquirePlaybackProbe();
        if (!alive || done) { releaseLease?.(); releaseLease = undefined; return; }
        let source: { uri: string; headers?: Record<string, string> };
        if (props.kind === 'xtream') {
          const { xtreamLiveSample } = await import('@/src/utils/iptv');
          const sample = await xtreamLiveSample({ server: props.endpoint, username: props.username || '', password: props.password || '' }, ctrl.signal);
          source = { uri: sample.url };
        } else {
          const { stalkerLiveSample } = await import('@/src/utils/stalker');
          const sample = await stalkerLiveSample({ portal: props.endpoint, mac: props.mac || '', serial: props.serial, profileId: props.profileId }, ctrl.signal);
          source = { uri: sample.url, headers: sample.headers };
        }
        if (!alive || done || ctrl.signal.aborted) return;
        catalogAt = new Date().toISOString(); setMessage('Katalog alındı; motorun ilk kareyi çizmesi bekleniyor…');
        await player.replaceAsync(source);
        if (alive && !done && !ctrl.signal.aborted) player.play();
      } catch (e: any) { if (alive && !done) finish(ctrl.signal.aborted ? 'Test iptal edildi / süre doldu.' : String(e?.message || 'Test tamamlanamadı').slice(0, 240)); }
    })();
    return () => { alive = false; done = true; ctrl.abort(); clearTimeout(timer); listener.remove(); stop(); };
  }, []);
  useEffect(() => { if (visible) finishRef.current('Oynatıcı açıldığı için test durduruldu.'); }, [visible]);
  return <Modal visible transparent onRequestClose={props.onClose}>
    <View style={{ flex: 1, backgroundColor: '#000D', justifyContent: 'center', padding: 24 }}>
      <View style={{ backgroundColor: '#171717', padding: 16, borderRadius: 12, gap: 12 }}>
        <Text style={{ color: 'white', fontWeight: 'bold' }}>Gerçek ilk kare testi</Text>
        <Text selectable style={{ color: '#ccc' }}>{props.endpoint}</Text>
        <VideoView player={player} style={{ height: 180 }} nativeControls={false} allowsPictureInPicture={false} onFirstFrameRender={() => finishRef.current()} />
        <Text style={{ color: 'white' }}>{message}</Text>
        <Button title="Kapat / iptal et" onPress={props.onClose} />
      </View>
    </View>
  </Modal>;
}
