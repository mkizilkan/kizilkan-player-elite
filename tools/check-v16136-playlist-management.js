#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const need=(s,x,m)=>{if(!s.includes(x))throw new Error(m||`missing ${x}`)};
const pkg=JSON.parse(read('frontend/package.json')), app=JSON.parse(read('frontend/app.json'));
if(pkg.version!=='16.13.6'||app.expo.version!=='16.13.6'||app.expo.android.versionCode!==161306)throw new Error('version mismatch');
const pm=read('frontend/src/utils/playlistManagement.ts'), ps=read('frontend/app/playlist-select.tsx'), ap=read('frontend/app/add-playlist.tsx'), ty=read('frontend/src/types/index.ts');
for(const x of ['manual','name_asc','name_desc','created_desc','created_asc','last_used_desc','last_refresh_desc','total_desc','live_desc','vod_desc','series_desc','expiry_asc','expiry_desc']) need(pm,`'${x}'`,`sort mode ${x}`);
for(const x of ['pinned?: boolean','manualOrder?: number','lastUsedAt?: string','lastRefreshedAt?: string','lastRefreshOk?: boolean']) need(ty,x);
for(const x of ['Playlist ara…','Özel sıra','playlist-pin-','Kategori seçimlerini değiştir','ContentSelectionModal','saveManualOrder','bulkSelected','bulkRefresh','bulkDelete','lastRefreshOk']) need(ps,x);
for(const x of ['playlistIdentityCanonical','Playlist zaten mevcut','Mevcut olanı aç','Ayrı ekle','Mevcudu güncelle','resolveDuplicateTarget']) need(ap,x);
need(pm,'exp_date'); need(pm,'tariff_expired_date');
console.log('PASS: v16.13.6 playlist management/category reselect/duplicate/expiry contract');
