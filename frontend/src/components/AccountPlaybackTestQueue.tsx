import React, { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { EndpointPlaybackTest } from './EndpointPlaybackTest';
import { loadTestQueue, runTestQueue } from '@/src/utils/durableTestQueue';
import { PanelScan } from '@/modules/panel-scan';
import { mergeEndpointEvidence } from '@/src/utils/playlistEndpoints';
import type { PlaylistEndpoint } from '@/src/types';

export type PlaybackTestAccount = { key: string; endpoint: string; kind: 'xtream' | 'stalker'; username?: string; password?: string; mac?: string; serial?: string; profileId?: string; archiveId?:string; priorEndpoints?:PlaylistEndpoint[] };
export async function pendingPlaybackTests(owner:string,kind:'xtream-frame'|'mac-frame'):Promise<PlaybackTestAccount[]> {
  const saved=await loadTestQueue<PlaybackTestAccount,PlaylistEndpoint>(owner,kind);
  return saved?.phase==='done'?[]:saved?.jobs.filter(job=>!Object.prototype.hasOwnProperty.call(saved.results,job.key))||[];
}
/** One renderer and one upstream at a time. Each result is encrypted before advancing. */
export function AccountPlaybackTestQueue({ accounts, owner, kind, resume=false, onEvidence, onClose }: {
  accounts: PlaybackTestAccount[]; owner:string; kind:'xtream-frame'|'mac-frame';resume?:boolean;
  onEvidence: (key: string, evidence: PlaylistEndpoint) => void; onClose: () => void;
}) {
  const [account,setAccount]=useState<PlaybackTestAccount|null>(null);
  const controller=useRef(new AbortController());
  const deliver=useRef<(value:PlaylistEndpoint)=>void>(()=>{});
  const callbacks=useRef({onEvidence,onClose});callbacks.current={onEvidence,onClose};
  useEffect(()=>{
    let alive=true;const ctrl=controller.current;
    void runTestQueue<PlaybackTestAccount,PlaylistEndpoint>({owner,kind,resume,jobs:accounts,title:'Gerçek ilk kare testi',signal:ctrl.signal,concurrency:1,timeoutMs:60000,checkpointEach:true,
      test:(job,signal)=>new Promise((resolve,reject)=>{
        const abort=()=>{if(alive)setAccount(null);reject(new Error('Görüntü testi durduruldu.'));};
        if(signal.aborted){abort();return;}
        signal.addEventListener('abort',abort,{once:true});
        deliver.current=value=>{signal.removeEventListener('abort',abort);if(alive)setAccount(null);resolve(value);};
        if(alive)setAccount(job);
      }),
      onResult:async(job,evidence)=>{
        if(evidence.playbackTestState==='cancelled')throw new Error('Görüntü testi ölçülemedi; hesap kalan işler arasında korundu.');
        if(job.archiveId && !await PanelScan.updateResultEvidence(job.archiveId,job.kind==='stalker'?{portal:job.endpoint,mac:job.mac||''}:{server:job.endpoint,username:job.username||'',password:job.password||''},
          {endpoints:mergeEndpointEvidence(job.priorEndpoints||[],evidence)}))throw new Error('Görüntü kanıtı hesap arşivine yazılamadı; test kaydı korunuyor.');
        if(alive)callbacks.current.onEvidence(job.key,evidence);
      }
    }).catch(error=>{if(alive&&!ctrl.signal.aborted)Alert.alert('Görüntü testi kesildi',String(error?.message||error));})
      .finally(()=>{if(alive)callbacks.current.onClose();});
    return()=>{alive=false;ctrl.abort();};
  },[owner,kind]);
  if(!account)return null;
  const {key,archiveId,priorEndpoints,...testProps}=account;
  return <EndpointPlaybackTest key={key} {...testProps} onEvidence={value=>deliver.current(value)} onClose={()=>{controller.current.abort();setAccount(null);}}/>;
}
