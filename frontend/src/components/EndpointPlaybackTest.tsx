import React, { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Text, View, Button } from 'react-native';
import { PanelScan } from '@/modules/panel-scan';
import { KizilkanNativeCore } from '@/modules/kizilkan-native-core';
import { createVideoPlayer, VideoView } from 'expo-video';
import { usePlayer } from '@/src/player/PlayerContext';
import { acquirePlaybackProbe } from '@/src/player/playbackProbeLease';
import { canonicalEndpointUrl } from '@/src/utils/playlistEndpoints';
import { canTryDnsAlternative } from '@/src/utils/panelDnsFailover';
import type { PlaylistEndpoint } from '@/src/types';

type Props = { endpoint: string; kind: 'xtream' | 'stalker'; username?: string; password?: string; mac?: string; serial?: string; profileId?: string;
  onEvidence: (value: PlaylistEndpoint) => void; onClose: () => void; onComplete?: (value: PlaylistEndpoint) => void };
/** One renderer, up to three sequential channels; evidence is delivered only after upstream stop. */
export function EndpointPlaybackTest(props: Props) {
  const { visible } = usePlayer();
  const [player] = useState(() => createVideoPlayer(null));
  const [channelIndex,setChannelIndex] = useState(0);
  const [message, setMessage] = useState('Hesap ve örnek kanal doğrulanıyor…');
  const finishRef = useRef<(error?: string, expectedAttempt?:number, errorKind?: string) => void>(() => {});
  const callbacks = useRef(props); callbacks.current = props;
  useEffect(() => {
    const ctrl = new AbortController(); let alive = true, done = false, released = false, loading = true, attempt = 0;
    const startedAt = Date.now(); let channelTimer: ReturnType<typeof setTimeout> | undefined;
    let releaseLease: (() => void) | undefined; let catalogAt: string | undefined;
    let xtreamSamples:string[]|undefined;
    let nativeMode = AppState.currentState !== 'active';
    let pendingNative: Promise<{frame:boolean;reason:string}> | undefined;
    const owner=`frame-test-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const releaseResources=()=>{releaseLease?.();releaseLease=undefined;try{KizilkanNativeCore.stopForegroundKeepAlive(owner);}catch{}};
    const heartbeat=setInterval(()=>{try{KizilkanNativeCore.updateForegroundKeepAlive('İlk kare doğrulanıyor…',attempt,3,owner);}catch{}},2000);
    const stop = () => { if (!released) { released = true; try { player.pause(); } catch {} try { player.release(); } catch {} }
      if(pendingNative)void pendingNative.finally(releaseResources).catch(()=>{});else releaseResources(); };
    const timer = setTimeout(() => finishRef.current('45 saniyede ilk kare alınamadı; görüntü sonucu belirsiz.'), 45000);
    const finish = async (error?: string, errorKind?: string) => {
      if (done || !alive) return; done = true; ctrl.abort(); clearTimeout(timer); clearTimeout(channelTimer);
      const observedAt=new Date().toISOString(), frameElapsedMs=Date.now()-startedAt;
      try { player.pause(); await player.replaceAsync(null); } catch { stop(); }
      if(pendingNative)try{await pendingNative;}catch{}
      clearInterval(heartbeat);
      releaseLease?.(); releaseLease = undefined;
      if(!alive)return;
      const now = new Date().toISOString();
      const evidence: PlaylistEndpoint = { url: canonicalEndpointUrl(props.endpoint), kind: props.kind, source: 'playback', lastTestAt: now,
        playbackTestAt: observedAt, playbackTestState: error ? (['PLAYER_ACTIVE','PLAYER_BUSY','DECODER_SETUP','CANCELLED','BACKGROUND_SERVICE','NATIVE_UNAVAILABLE'].includes(errorKind||'') ? 'cancelled' : ['RATE_LIMIT','PROTECTION','HTTP_401','HTTP_403'].includes(errorKind||'') ? 'blocked' : catalogAt ? 'no_frame' : 'blocked') : 'frame',
        ...(catalogAt ? { accountVerifiedAt: catalogAt, catalogVerifiedAt: catalogAt } : {}),
        ...(error ? { lastError: error, lastErrorKind: errorKind } : { firstFrameAt: observedAt, firstFrameElapsedMs: frameElapsedMs, lastError: '', lastErrorKind: '' }) };
      callbacks.current.onEvidence(evidence);
      setMessage(error || `Görüntü var · ${(frameElapsedMs / 1000).toFixed(1)} sn. Test bağlantısı kapatıldı.`);
      callbacks.current.onComplete?.(evidence);
      releaseResources();
    };
    finishRef.current = (error,expectedAttempt,errorKind) => { if(!error && (nativeMode || loading || expectedAttempt!==attempt))return;void finish(error,errorKind); };
    const nativeSample = async (source:{uri:string;headers?:Record<string,string>}) => {
      player.pause();await player.replaceAsync(null);if(!alive||done)return;
      loading=false;setMessage(`${attempt+1}/3 · arka planda gerçek ilk kare ölçülüyor…`);
      const expectedAttempt=attempt;
      pendingNative=PanelScan.probePlaybackFrame(`${owner}-${attempt}`,source.uri,source.headers||{},ctrl.signal);
      const evidence=await pendingNative;pendingNative=undefined;
      if(!alive||done||expectedAttempt!==attempt)return;
      if(evidence.frame)await finish();else if(['RATE_LIMIT','HTTP_401','HTTP_403'].includes(evidence.reason))await finish('Sunucu görüntü isteğini sınırladı/reddetti; test durduruldu. Hesap geçersiz sayılmadı.',evidence.reason);else if(['CANCELLED','NATIVE_UNAVAILABLE','PLAYER_BUSY','DECODER_SETUP'].includes(evidence.reason))await finish('Görüntü testi tamamlanamadı; hesap geçersiz sayılmadı.',evidence.reason);else await nextSample();
    };
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
        catalogAt=new Date().toISOString();
        if(nativeMode){await nativeSample(source);return;}
        await player.replaceAsync(source);
        if(!alive||done)return;loading=false;player.play();
        if(nativeMode){loading=true;await nativeSample(source);return;}
        setMessage(`${attempt+1}/3 · ilk görüntü bekleniyor…`);
        channelTimer=setTimeout(()=>void nextSample(),12000);
      } catch(e:any) { if(alive&&!done){ if(!canTryDnsAlternative(e))void finish(String(e?.message||e),e?.kind);else void nextSample(); } }
    };
    const nextSample = async () => {
      if(!alive||done)return;loading=true;clearTimeout(channelTimer);
      if(++attempt>=3){await finish('Deneme kanallarından ilk kare alınamadı; hesap geçersiz sayılmadı.');return;}
      await startSample();
    };
    const listener=player.addListener('statusChange',({status})=>{if(status==='error'&&!nativeMode&&!loading&&!done)void nextSample();});
    const appState=AppState.addEventListener('change',state=>{
      if(state!=='active' && !nativeMode && alive && !done){nativeMode=true;clearTimeout(channelTimer);
        if(!loading)void startSample();}
    });
    void (async()=>{try{
      if(visible)throw Object.assign(new Error('Önce açık oynatıcıyı kapatın.'),{kind:'PLAYER_ACTIVE'});
      releaseLease=await acquirePlaybackProbe();
      if(!alive||done){releaseLease?.();releaseLease=undefined;return;}
      if(!KizilkanNativeCore.startForegroundKeepAlive('Görüntü testi','Gerçek ilk kare doğrulanıyor…',owner,()=>finishRef.current('Android arka plan süre sınırı; görüntü sonucu belirsiz.',undefined,'BACKGROUND_SERVICE')))
        throw Object.assign(new Error('Arka plan test servisi başlatılamadı.'),{kind:'BACKGROUND_SERVICE'});
      await startSample();
    }catch(e:any){if(alive&&!done)void finish(String(e?.message||e),e?.kind);}})();
    return ()=>{alive=false;done=true;ctrl.abort();clearTimeout(timer);clearTimeout(channelTimer);clearInterval(heartbeat);listener.remove();appState.remove();stop();};
  },[]);
  useEffect(()=>{if(visible)finishRef.current('Oynatıcı açıldığı için test durduruldu.',undefined,'PLAYER_ACTIVE');},[visible]);
  return <Modal visible transparent onRequestClose={props.onClose}><View style={{flex:1,backgroundColor:'#000D',justifyContent:'center',padding:24}}><View style={{backgroundColor:'#171717',padding:16,borderRadius:12,gap:12}}>
    <Text style={{color:'white',fontWeight:'bold'}}>Görüntü test et · gerçek ilk kare</Text><Text selectable style={{color:'#ccc'}}>{props.endpoint}</Text>
    <VideoView key={channelIndex} player={player} style={{height:180}} nativeControls={false} allowsPictureInPicture={false} onFirstFrameRender={()=>finishRef.current(undefined,channelIndex)}/>
    <Text style={{color:'white'}}>{message}</Text><Button title="Kapat / iptal et" onPress={props.onClose}/>
  </View></View></Modal>;
}
