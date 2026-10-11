import React, { useEffect, useRef, useState } from 'react';
import { Modal, Text, View, Button } from 'react-native';
import { createVideoPlayer, VideoView } from 'expo-video';
import { usePlayer } from '@/src/player/PlayerContext';
import { acquirePlaybackProbe } from '@/src/player/playbackProbeLease';
import { canonicalEndpointUrl } from '@/src/utils/playlistEndpoints';
import { canTryDnsAlternative } from '@/src/utils/panelDnsFailover';
import type { PlaylistEndpoint } from '@/src/types';

type Props = { endpoint: string; kind: 'xtream' | 'stalker'; username?: string; password?: string; mac?: string; serial?: string; profileId?: string;
  onEvidence: (value: PlaylistEndpoint) => void; onClose: () => void };
/** One renderer, up to three sequential channels; evidence is delivered only after upstream stop. */
export function EndpointPlaybackTest(props: Props) {
  const { visible } = usePlayer();
  const [player] = useState(() => createVideoPlayer(null));
  const [channelIndex,setChannelIndex] = useState(0);
  const [message, setMessage] = useState('Hesap ve örnek kanal doğrulanıyor…');
  const finishRef = useRef<(error?: string, expectedAttempt?:number) => void>(() => {});
  const callbacks = useRef(props); callbacks.current = props;
  useEffect(() => {
    const ctrl = new AbortController(); let alive = true, done = false, released = false, loading = true, attempt = 0;
    const startedAt = Date.now(); let channelTimer: ReturnType<typeof setTimeout> | undefined;
    let releaseLease: (() => void) | undefined; let catalogAt: string | undefined;
    let xtreamSamples:string[]|undefined;
    const stop = () => { if (!released) { released = true; try { player.pause(); } catch {} try { player.release(); } catch {} } releaseLease?.(); releaseLease = undefined; };
    const timer = setTimeout(() => finishRef.current('45 saniyede ilk kare alınamadı; görüntü sonucu belirsiz.'), 45000);
    const finish = async (error?: string) => {
      if (done || !alive) return; done = true; ctrl.abort(); clearTimeout(timer); clearTimeout(channelTimer);
      const observedAt=new Date().toISOString(), frameElapsedMs=Date.now()-startedAt;
      try { player.pause(); await player.replaceAsync(null); } catch { stop(); }
      releaseLease?.(); releaseLease = undefined;
      if(!alive)return;
      const now = new Date().toISOString();
      callbacks.current.onEvidence({ url: canonicalEndpointUrl(props.endpoint), kind: props.kind, source: 'playback', lastTestAt: now,
        ...(catalogAt ? { accountVerifiedAt: catalogAt, catalogVerifiedAt: catalogAt } : {}),
        ...(error ? { lastError: error } : { firstFrameAt: observedAt, firstFrameElapsedMs: frameElapsedMs, lastError: '' }) });
      setMessage(error || 'İlk kare görüldü. Test bağlantısı kapatıldı.');
    };
    finishRef.current = (error,expectedAttempt) => { if(!error && (loading || expectedAttempt!==attempt))return;void finish(error); };
    const startSample = async () => {
      if(!alive||done)return; loading=true;clearTimeout(channelTimer);
      try {
        player.pause(); await player.replaceAsync(null);
        if(!alive||done)return;
        setChannelIndex(attempt);setMessage(`${attempt+1}/3 · örnek kanal doğrulanıyor…`);
        let source: {uri:string;headers?:Record<string,string>};
        if(props.kind==='xtream') {
          const {xtreamLiveSample}=await import('@/src/utils/iptv');
          if(!xtreamSamples){const sample=await xtreamLiveSample({server:props.endpoint,username:props.username||'',password:props.password||''},ctrl.signal);xtreamSamples=sample.alternatives;}
          if(!xtreamSamples[attempt])throw Object.assign(new Error('Başka test kanalı bulunamadı; görüntü belirlenemedi.'),{kind:'NO_SAMPLE'});
          source={uri:xtreamSamples[attempt]};
        } else {
          const {stalkerLiveSample}=await import('@/src/utils/stalker');
          const sample=await stalkerLiveSample({portal:props.endpoint,mac:props.mac||'',serial:props.serial,profileId:props.profileId},ctrl.signal,attempt);source={uri:sample.url,headers:sample.headers};
        }
        if(!alive||done||ctrl.signal.aborted)return;
        catalogAt=new Date().toISOString();await player.replaceAsync(source);
        if(!alive||done)return;loading=false;player.play();
        setMessage(`${attempt+1}/3 · ilk görüntü bekleniyor…`);
        channelTimer=setTimeout(()=>void nextSample(),12000);
      } catch(e:any) { if(alive&&!done){ if(!canTryDnsAlternative(e))void finish(String(e?.message||e));else void nextSample(); } }
    };
    const nextSample = async () => {
      if(!alive||done)return;loading=true;clearTimeout(channelTimer);
      if(++attempt>=3){await finish('Deneme kanallarından ilk kare alınamadı; hesap geçersiz sayılmadı.');return;}
      await startSample();
    };
    const listener=player.addListener('statusChange',({status})=>{if(status==='error'&&!loading&&!done)void nextSample();});
    void (async()=>{try{
      if(visible)throw new Error('Önce açık oynatıcıyı kapatın.');
      releaseLease=await acquirePlaybackProbe();
      if(!alive||done){releaseLease?.();releaseLease=undefined;return;}
      await startSample();
    }catch(e:any){if(alive&&!done)void finish(String(e?.message||e));}})();
    return ()=>{alive=false;done=true;ctrl.abort();clearTimeout(timer);clearTimeout(channelTimer);listener.remove();stop();};
  },[]);
  useEffect(()=>{if(visible)finishRef.current('Oynatıcı açıldığı için test durduruldu.');},[visible]);
  return <Modal visible transparent onRequestClose={props.onClose}><View style={{flex:1,backgroundColor:'#000D',justifyContent:'center',padding:24}}><View style={{backgroundColor:'#171717',padding:16,borderRadius:12,gap:12}}>
    <Text style={{color:'white',fontWeight:'bold'}}>Gerçek ilk kare testi</Text><Text selectable style={{color:'#ccc'}}>{props.endpoint}</Text>
    <VideoView key={channelIndex} player={player} style={{height:180}} nativeControls={false} allowsPictureInPicture={false} onFirstFrameRender={()=>finishRef.current(undefined,channelIndex)}/>
    <Text style={{color:'white'}}>{message}</Text><Button title="Kapat / iptal et" onPress={props.onClose}/>
  </View></View></Modal>;
}
