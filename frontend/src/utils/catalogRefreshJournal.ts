import { storage } from '@/src/utils/storage';
import type { Playlist } from '@/src/types';
import type { CatalogKind } from './refreshPlaylist';

type CompletedKind={count:number;fingerprint?:string};
export type CatalogRefreshJournal={schema:1;owner:string;playlistId:string;generation:string;binding:string;expected:CatalogKind[];completed:Partial<Record<CatalogKind,CompletedKind>>;state:'running'|'interrupted'|'completed';at:number};
const key=(owner:string,id:string)=>`kizilkan.catalogRefresh.v1.${encodeURIComponent(owner)}.${encodeURIComponent(id)}`;
export async function openCatalogRefreshJournal(owner:string,pl:Playlist,kinds:CatalogKind[],force:boolean):Promise<CatalogRefreshJournal>{
  const Crypto=await import('expo-crypto');
  const binding=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,JSON.stringify([pl.source,pl.xtreamServer,pl.xtreamUsername,pl.xtreamPassword,pl.stalkerPortal,pl.stalkerMac,pl.contentSelection,pl.backupHosts,pl.stalkerBackupPortals,force,[...kinds].sort()]));
  const raw=await storage.getItemStrict(key(owner,pl.id),'');
  if(raw){const saved=JSON.parse(raw);if(saved.schema===1&&saved.owner===owner&&saved.playlistId===pl.id&&saved.binding===binding&&saved.state!=='completed'&&Date.now()-saved.at<86400000){
    saved.state='running';saved.at=Date.now();await saveCatalogRefreshJournal(saved);return saved;
  }}
  const journal:CatalogRefreshJournal={schema:1,owner,playlistId:pl.id,generation:`refresh-${Date.now()}-${Math.random().toString(36).slice(2)}`,binding,expected:[...kinds],completed:{},state:'running',at:Date.now()};
  await saveCatalogRefreshJournal(journal);return journal;
}
export async function saveCatalogRefreshJournal(journal:CatalogRefreshJournal):Promise<void>{
  journal.at=Date.now();if(!await storage.setItem(key(journal.owner,journal.playlistId),JSON.stringify(journal)))throw new Error('Katalog devam kaydı yazılamadı; mevcut kayıt korunuyor.');
}
export function verifiedRefreshKinds(journal:CatalogRefreshJournal,summary:{roomIndexed?:boolean;channels?:number;vod?:number;series?:number}|null,pl:Playlist):CatalogKind[]{
  if(!summary?.roomIndexed)return [];
  return journal.expected.filter(kind=>{const saved=journal.completed[kind];if(!saved)return false;
    const count=kind==='live'?summary.channels:summary[kind];
    const fingerprint=pl.catalogSync?.[kind==='live'?'liveFingerprint':kind==='vod'?'vodFingerprint':'seriesFingerprint'];
    return count===saved.count&&(!saved.fingerprint||saved.fingerprint===fingerprint)&&!pl.cleanedKinds?.includes(kind);
  });
}
