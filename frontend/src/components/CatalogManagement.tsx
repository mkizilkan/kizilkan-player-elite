import React,{useRef,useState} from 'react';
import {View,Text,TextInput,ScrollView,Alert} from 'react-native';
import {usePlaylists} from '@/src/store/PlaylistContext';
import {useTheme} from '@/src/theme/ThemeContext';
import {KizilkanNativeCore} from '@/modules/kizilkan-native-core';
import {FocusButton} from './FocusButton';
import {CatalogProgressCards} from './CatalogProgressCards';
import type {CatalogKind,RefreshProgress} from '@/src/utils/refreshPlaylist';
type Kind=CatalogKind|'epg';
export function CatalogManagement({onFinished}:{onFinished:()=>void}){
 const {playlists,activePlaylist,loadedProfileId,cleanupPlaylistContent,refreshPlaylistKinds,updatePlaylist}=usePlaylists();const {colors}=useTheme();
 const [scope,setScope]=useState<'current'|'selected'|'all'>('current'),[selected,setSelected]=useState<string[]>([]),[kinds,setKinds]=useState<Kind[]>(['live','vod','series']);
 const [busy,setBusy]=useState(false),busyRef=useRef(false),[progress,setProgress]=useState<RefreshProgress|null>(null),[results,setResults]=useState<string[]>([]);
 const profileRef=useRef(loadedProfileId);profileRef.current=loadedProfileId;
 const button=(label:string,checked:boolean,run:()=>void)=><FocusButton key={label} disabled={busy} onPress={run} style={{padding:10,borderWidth:1,borderRadius:8,borderColor:checked?colors.brandPrimary:colors.border}}><Text style={{color:checked?colors.brandPrimary:colors.onSurface}}>{label}</Text></FocusButton>;
 const run=async(action:'cleanup'|'refresh')=>{
  if(busyRef.current)return;const targets=playlists.filter(p=>scope==='all'||(scope==='current'?p.id===activePlaylist?.id:selected.includes(p.id)));
  if(!targets.length||!kinds.length){Alert.alert('Kapsam seçin','En az bir liste ve içerik türü seçin.');return;}
  const pid=loadedProfileId,selectedKinds=[...kinds];busyRef.current=true;setBusy(true);setResults([]);
  try{
   if(action==='cleanup'){
    const previews=await KizilkanNativeCore.previewPlaylistContentCleanupBatch(targets.map(p=>p.id));
    if(previews.length!==targets.length||previews.some(p=>!p.ok||!p.preview))throw new Error('Tüm listelerin temizleme önizlemesi alınamadı.');
    const total=previews.reduce((sum,p)=>sum+selectedKinds.reduce((n,k)=>n+Number(p.preview?.[k]||0),0),0);
    const confirmed=await new Promise<boolean>(resolve=>Alert.alert('İçerikleri temizle',`${targets.length} liste · ${total.toLocaleString('tr-TR')} kayıt. Hesap, favori ve izleme kayıtları korunur. Her liste ayrı tamamlanır; hata önceki listeleri geri almaz.`,[{text:'Vazgeç',style:'cancel',onPress:()=>resolve(false)},{text:'Temizle',style:'destructive',onPress:()=>resolve(true)}],{cancelable:true,onDismiss:()=>resolve(false)}));if(!confirmed)return;
   }
   for(const [i,pl] of targets.entries()){
    if(profileRef.current!==pid)break;const prefix=`${i+1}/${targets.length} · ${pl.name}`;setProgress({phase:'content',message:prefix});
    try{if(action==='cleanup'){const count=await cleanupPlaylistContent(pl.id,selectedKinds);setResults(r=>[...r,`${pl.name}: ${count.toLocaleString('tr-TR')} kayıt temizlendi.`]);}
     else{await refreshPlaylistKinds(pl.id,selectedKinds,p=>setProgress({...p,message:`${prefix} · ${p.message}`}),()=>profileRef.current===pid);setResults(r=>[...r,`${pl.name}: güncellendi.`]);}
    }catch(e:any){setResults(r=>[...r,`${pl.name}: ${String(e?.message||e)}`]);}
   }
   setProgress({phase:'done',message:'İşlem tamamlandı; liste sonuçlarını kontrol edin.'});onFinished();
  }catch(e:any){Alert.alert('İşlem tamamlanamadı',String(e?.message||e));}finally{busyRef.current=false;setBusy(false);}
 };
 return <View style={{gap:10,marginVertical:12}}><Text style={{color:colors.onSurface,fontWeight:'700'}}>İçerik temizleme ve güncelleme</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['current','selected','all'] as const).map((s,i)=>button(['Bu liste','Liste seç','Tüm listeler'][i],scope===s,()=>setScope(s)))}</View>
 {scope==='selected'&&<ScrollView nestedScrollEnabled style={{maxHeight:220}}>{playlists.map(p=>button(`${selected.includes(p.id)?'☑':'☐'} ${p.name}`,selected.includes(p.id),()=>setSelected(s=>s.includes(p.id)?s.filter(id=>id!==p.id):[...s,p.id])))}</ScrollView>}
 <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['live','vod','series','epg'] as const).map((k,i)=>button(['Canlı TV','Film / VOD','Dizi','EPG'][i],kinds.includes(k),()=>setKinds(v=>v.includes(k)?v.filter(x=>x!==k):[...v,k])))}</View>{button('Tüm katalog + EPG',kinds.length===4,()=>setKinds(['live','vod','series','epg']))}
 <Text style={{color:colors.onSurfaceSecondary}}>Temizleme ve güncelleme ayrı işlemlerdir. Hesap bilgileri, favoriler ve izleme kayıtları korunur. Temizlik otomatik VACUUM çalıştırmaz.</Text><View style={{flexDirection:'row',gap:10}}>{button('TEMİZLE',false,()=>void run('cleanup'))}{button('GÜNCELLE',true,()=>void run('refresh'))}</View>
 {activePlaylist&&<View><Text style={{color:colors.onSurfaceSecondary}}>Bu listenin arka plan kontrol aralığı (dakika, 1–1440)</Text><TextInput key={activePlaylist.id} editable={!busy} keyboardType="number-pad" defaultValue={String(activePlaylist.freshnessMinutes||15)} onEndEditing={e=>{const n=Number(e.nativeEvent.text);if(Number.isFinite(n)&&n>=1&&n<=1440)void updatePlaylist(activePlaylist.id,{freshnessMinutes:n}).catch(()=>Alert.alert('Ayar kaydedilemedi'));}} style={{padding:10,color:colors.onSurface,borderWidth:1,borderColor:colors.border,borderRadius:8}}/></View>}
 <CatalogProgressCards progress={progress}/>{results.map((r,i)=><Text key={i} style={{color:colors.onSurfaceSecondary}}>{r}</Text>)}</View>;
}
