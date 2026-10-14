import { fromAccountUrl,parseBulkAccounts,type BulkAccountInput } from './bulkAccounts';
import { looksLikeKizilkanArchive,parseKizilkanAccountArchive } from './accountArchive';
import { parseMagArchive } from './magArchive';
import { accountServerIdentity,xtreamCandidateIdentity,magCandidateIdentity } from './accountIdentity';
import type { Playlist } from '@/src/types';

export type HitFileRecord={id:string;kind:'xtream'|'stalker'|'m3u_url'|'m3u_file';name:string;server:string;username?:string;password?:string;mac?:string;content?:string;sources:Array<{file:string;line:number}>;warnings:string[]};
export const HIT_IMPORT_LIMITS={files:32,fileBytes:2*1024*1024,totalBytes:8*1024*1024,records:2000};
export function hitRecordIdentity(r:HitFileRecord):string{
  if(r.kind==='xtream')return xtreamCandidateIdentity(r.server,r.username||'',r.password||'');
  if(r.kind==='stalker')return magCandidateIdentity(r.server,r.mac||'');
  return JSON.stringify([r.kind,r.kind==='m3u_file'?r.content:r.server]);
}
export function hitExistingStatus(r:HitFileRecord,playlists:Playlist[]):'new'|'existing'|'password_conflict'{
  for(const pl of playlists){
    if(r.kind==='xtream'&&pl.source==='xtream'&&accountServerIdentity(r.server)===accountServerIdentity(pl.xtreamServer||'')&&r.username===pl.xtreamUsername)
      return r.password===pl.xtreamPassword?'existing':'password_conflict';
    if(r.kind==='stalker'&&pl.source==='stalker'&&magCandidateIdentity(r.server,r.mac||'')===magCandidateIdentity(pl.stalkerPortal||'',pl.stalkerMac||''))return 'existing';
    if(r.kind==='m3u_url'&&pl.source==='m3u_url'&&r.server===pl.m3uUrl)return 'existing';
  }
  return 'new';
}
export function parseHitFile(file:string,text:string):{records:HitFileRecord[];warnings:string[]}{
  const records:HitFileRecord[]=[];const warnings:string[]=[];
  const add=(r:Omit<HitFileRecord,'id'|'sources'|'warnings'>,line=1,notes:string[]=[])=>records.push({...r,id:'',sources:[{file,line}],warnings:notes});
  const xt=(a:BulkAccountInput,line=a.row)=>add({kind:'xtream',name:a.name||file,server:a.server||'',username:a.username,password:a.password},line,a.server?[]:['DNS belirtilmemiş; içe aktarmadan önce hedef adres girin.']);
  if(/^\s*#EXTM3U/m.test(text)&&/#EXTINF:/i.test(text)){add({kind:'m3u_file',name:file,server:'',content:text});return{records,warnings};}
  if(looksLikeKizilkanArchive(text)){
    const archive=parseKizilkanAccountArchive(text);warnings.push(...archive.warnings);
    for(const a of archive.accounts){if(a.masked){warnings.push('Maskeli hesap içe aktarılamaz.');continue;}xt({...a,row:1});}
  }else if(text.includes('# KIZILKAN MAG hesap arşivi')||/^HESAP_JSON=/m.test(text)||/^\s*\{[^\n]*"mac"\s*:/m.test(text)){
    const archive=parseMagArchive(text);warnings.push(...archive.warnings);for(const r of archive.results)add({kind:'stalker',name:file,server:r.portal,mac:r.mac});
  }else{
    const lines=text.split(/\r?\n/);let block:Record<string,string>={},blockLine=1;
    const flush=()=>{let server=block.server||'';if(server&&!/^https?:\/\//i.test(server))server='http://'+server;
      if(server&&block.port){try{const u=new URL(server);if(!u.port&&!/:[0-9]+(?:\/|$)/.test(block.server))u.port=block.port;server=u.toString();}catch{}}
      if(server&&block.mac)add({kind:'stalker',name:file,server:accountServerIdentity(server),mac:block.mac.toUpperCase()},blockLine);
      else if(block.username&&block.password)xt({row:blockLine,name:file,server:server?accountServerIdentity(server):undefined,username:block.username,password:block.password});
      block={};
    };
    const labels:Record<string,string>={'sunucu':'server','server':'server','host':'server','dns':'server','portal':'server','port':'port','kullaniciadi':'username','kullanici':'username','username':'username','user':'username','sifre':'password','password':'password','pass':'password','mac':'mac'};
    let labelled=false,urls=false;
    for(let i=0;i<lines.length;i++){
      const line=lines[i];const match=line.match(/(?:https?:\/\/)[^\s<>"'|]+/i);
      if(match){const link=match[0];const account=fromAccountUrl(link,i+1);if(account){xt(account);urls=true;}
        else if(/\.(?:m3u8?)(?:[?#]|$)|\/get\.php\?/i.test(link)){add({kind:'m3u_url',name:file,server:link},i+1);urls=true;}}
      const field=line.match(/([A-Za-zÇĞİÖŞÜçğıöşü _]+)\s*(?:➤|[=:])\s*(.*?)\s*$/);
      if(!field)continue;
      const label=field[1].toLocaleLowerCase('tr').replace(/ı/g,'i').replace(/ş/g,'s').replace(/[^a-z]/g,'');const name=labels[label];
      if(!name)continue;labelled=true;
      if(name==='server'&&block.server||name==='username'&&block.username||name==='mac'&&block.mac)flush();
      if(!Object.keys(block).length)blockLine=i+1;block[name]=field[2];
    }
    flush();
    if(!labelled&&!urls||!records.length&&lines.filter(line=>line.trim()).length===1){const parsed=parseBulkAccounts(text);warnings.push(...parsed.warnings);for(const a of parsed.accounts)xt(a);}
  }
  return{records:mergeHitRecords(records).records,warnings};
}
/** Case/scheme/password matter; duplicates keep every source location. */
export function mergeHitRecords(records:HitFileRecord[]):{records:HitFileRecord[];duplicates:number}{
  const map=new Map<string,HitFileRecord>();let duplicates=0;
  for(const record of records){const identity=hitRecordIdentity(record),existing=map.get(identity);
    if(existing){existing.sources.push(...record.sources);duplicates++;}else map.set(identity,{...record,sources:[...record.sources],id:`hit-${map.size+1}`});
  }
  return{records:[...map.values()],duplicates};
}
