import type { Channel, VodItem, SeriesItem, PlaylistContentSelection } from '@/src/types';

type Catalog = { channels: Channel[]; vod: VodItem[]; series: SeriesItem[] };
const norm=(v:any)=>String(v||'Genel').trim()||'Genel';
export function catalogCategories(c:Catalog){
  const uniq=(rows:any[])=>Array.from(new Set(rows.map(x=>norm(x.group)))).sort((a,b)=>a.localeCompare(b,'tr'));
  return {live:uniq(c.channels),vod:uniq(c.vod),series:uniq(c.series)};
}
export function applyContentSelection(c:Catalog,s?:PlaylistContentSelection|null):Catalog{
  if(!s) return c;
  const keep=(rows:any[], enabled:boolean, selected:string[]|null)=>{
    if(!enabled) return [];
    if(selected===null) return rows;
    const set=new Set(selected.map(norm));
    return rows.filter(x=>set.has(norm(x.group)));
  };
  return {channels:keep(c.channels,s.live,s.liveCategories),vod:keep(c.vod,s.vod,s.vodCategories),series:keep(c.series,s.series,s.seriesCategories)};
}
export function allContentSelection():PlaylistContentSelection{return {live:true,vod:true,series:true,liveCategories:null,vodCategories:null,seriesCategories:null,updatedAt:new Date().toISOString()};}
