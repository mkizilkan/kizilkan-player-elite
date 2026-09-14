/** v17.3.0: directory identity, provenance and validated panel base addresses. */
export type DirectorySource = 'splayer' | 'masteriptv';
export type DirectoryScope = 'all' | DirectorySource;
export type PanelOrigin = { source:DirectorySource; baseUrl:string; panelName:string; realCode:string|null; hosts:string[]; rawHosts?:string[] };
export type DirectoryPanel = { code:string; panelName:string; hosts:string[]; realCode?:string|null; codes?:string[]; directoryKey?:string; sources?:PanelOrigin[]; invalidHosts?:Array<{raw:string;reason:string}> };
export type PanelTarget = { codes?:string[]; names?:string[]; keys?:string[] };
export const panelNameKey=(v:string)=>v.trim().normalize('NFC').toLocaleLowerCase('tr');
export function canonicalPanelHost(raw:unknown):string|null {
  if(typeof raw!=='string')return null;
  let value=raw.trim();
  if(!value||/\s|[\\<>"']/.test(value)||/removed|deleted|sentinel|undefined|null/i.test(value))return null;
  if(/^https?\/\//i.test(value))value=value.replace(/^(https?)\/\//i,'$1://');
  if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(value))value=`http://${value}`;
  try {
    const u=new URL(value),host=u.hostname;
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)return null;
    if(!host||!(host.includes('.')||/^\[[0-9a-f:]+\]$/i.test(host)))return null;
    if(!host.startsWith('[')&&host.split('.').some(label=>!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)))return null;
    return `${u.origin}${u.pathname.replace(/\/+$/,'')}`;
  }catch{return null;}
}
export function validPanelHosts(values:unknown[]):string[]{return Array.from(new Set(values.map(canonicalPanelHost).filter((v):v is string=>v!==null)));}
export function mergeDirectory(items:DirectoryPanel[]):DirectoryPanel[]{
  const panels=new Map<string,DirectoryPanel>();
  for(const item of items){
    const key=panelNameKey(item.panelName),prev=panels.get(key);
    const codes=Array.from(new Set([...(prev?.codes||[]),...(item.codes||(item.code?[item.code]:[]))]));
    panels.set(key,{...item,directoryKey:key,code:codes[0]||'',realCode:codes[0]||null,codes,sources:[...(prev?.sources||[]),...(item.sources||[])],hosts:validPanelHosts([...(prev?.hosts||[]),...item.hosts]),invalidHosts:[...(prev?.invalidHosts||[]),...(item.invalidHosts||[])]});
  }
  return [...panels.values()].filter(p=>p.hosts.length).sort((a,b)=>a.panelName.localeCompare(b.panelName,'tr'));
}
export function filterDirectory(items:DirectoryPanel[],scope:DirectoryScope='all',target:PanelTarget={}):DirectoryPanel[]{
  const codes=(target.codes||[]).map(panelNameKey),names=(target.names||[]).map(panelNameKey),keys=target.keys||[];
  const hasTarget=codes.length+names.length+keys.length>0;
  return items.map(item=>{
    if(!item.sources?.length||scope==='all')return item;
    const sources=item.sources.filter(s=>s.source===scope),realCodes=Array.from(new Set(sources.map(s=>s.realCode).filter((c):c is string=>!!c)));
    return {...item,sources,codes:realCodes,code:realCodes[0]||'',realCode:realCodes[0]||null,hosts:validPanelHosts(sources.flatMap(s=>s.hosts))};
  }).filter(item=>item.hosts.length>0&&(!hasTarget||keys.includes(item.directoryKey||panelNameKey(item.panelName))||names.includes(panelNameKey(item.panelName))||(item.codes||[item.code]).some(c=>!!c&&codes.includes(panelNameKey(c)))));
}
