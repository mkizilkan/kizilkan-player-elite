import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,FlatList,Modal,Text,TextInput,View} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {useTheme} from '@/src/theme/ThemeContext';
import {FocusButton} from './FocusButton';
import {HIT_IMPORT_LIMITS,hitExistingStatus,mergeHitRecords,parseHitFile,type HitFileRecord} from '@/src/utils/hitFileImporter';
import type {Playlist} from '@/src/types';
import {accountServerIdentity} from '@/src/utils/accountIdentity';
import {KizilkanNativeCore} from '@/modules/kizilkan-native-core';

export function HitFileImport({ownerId,playlists,disabled,onImport}:{ownerId:string;playlists:Playlist[];disabled:boolean;onImport:(records:HitFileRecord[],signal:AbortSignal,progress:(text:string)=>void)=>Promise<void>}){
  const {colors}=useTheme();const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[rows,setRows]=useState<HitFileRecord[]>([]),[selected,setSelected]=useState<string[]>([]),[message,setMessage]=useState(''),[defaultServer,setDefaultServer]=useState('');
  const controller=useRef<AbortController|null>(null),generation=useRef(0),alive=useRef(true);
  useEffect(()=>{alive.current=true;generation.current++;setRows([]);setSelected([]);setOpen(false);return()=>{alive.current=false;generation.current++;controller.current?.abort();};},[ownerId]);
  const cancel=()=>{controller.current?.abort();setMessage('İptal istendi; yürüyen kayıt güvenli olarak durduruluyor.');};
  const pick=async()=>{
    const seq=++generation.current;setBusy(true);setMessage('Dosyalar seçiliyor…');const c=new AbortController();controller.current=c;
    const owns=()=>alive.current&&seq===generation.current&&!c.signal.aborted;
    try{
      const result=await DocumentPicker.getDocumentAsync({type:['text/*','application/json','application/octet-stream','audio/x-mpegurl'],multiple:true,copyToCacheDirectory:true});if(result.canceled||!owns())return;
      if(result.assets.length>HIT_IMPORT_LIMITS.files)throw new Error(`Bir seferde en fazla ${HIT_IMPORT_LIMITS.files} dosya seçin.`);
      const all:HitFileRecord[]=[],warnings:string[]=[];let total=0;
      for(const asset of result.assets){if(!owns())return;const info=await FileSystem.getInfoAsync(asset.uri);const bytes=asset.size||('size'in info?Number(info.size):0);total+=bytes;
        if(bytes>HIT_IMPORT_LIMITS.fileBytes||total>HIT_IMPORT_LIMITS.totalBytes)throw new Error('Önizleme sınırı: dosya başına 2 MiB, toplam 8 MiB. Büyük combo dosyasında mevcut Dosya Seç yolunu kullanın.');
        const text=await FileSystem.readAsStringAsync(asset.uri);if(text.length>HIT_IMPORT_LIMITS.fileBytes)throw new Error('Dosya önizleme sınırını aşıyor.');
        const parsed=parseHitFile(asset.name,text);all.push(...parsed.records);warnings.push(...parsed.warnings);
        if(all.length>HIT_IMPORT_LIMITS.records)throw new Error(`Önizlemede en fazla ${HIT_IMPORT_LIMITS.records} kayıt desteklenir; büyük combo için mevcut native dosya taramasını kullanın.`);
        await new Promise<void>(resolve=>setTimeout(resolve,0));
      }
      if(!owns())return;const merged=mergeHitRecords(all);setRows(merged.records);setSelected(merged.records.filter(r=>(r.server||r.kind==='m3u_file')&&hitExistingStatus(r,playlists)==='new').map(r=>r.id));setOpen(true);
      setMessage(`${merged.records.length} kayıt · ${merged.duplicates} yinelenen birleştirildi. ${warnings.length} biçim uyarısı.${warnings.length?' '+warnings.slice(0,3).join(' '):''}`);
    }catch(error:any){if(owns())setMessage(String(error?.message||error));}finally{if(alive.current&&seq===generation.current)setBusy(false);}
  };
  const start=async()=>{
    const seq=++generation.current,c=new AbortController();controller.current=c;setBusy(true);
    const keepAlive=`hit-import:${ownerId}:${seq}:${Date.now()}`;
    try{
      const chosen=rows.filter(r=>selected.includes(r.id)).map(r=>r.kind==='xtream'&&!r.server?{...r,server:accountServerIdentity(defaultServer)}:r);
      if(!chosen.length)throw new Error('İçe aktarılacak kayıt seçin.');
      if(chosen.some(r=>r.kind!=='m3u_file'&&!/^https?:\/\//i.test(r.server)))throw new Error('DNS belirtilmemiş kayıtlar için geçerli hedef adres girin.');
      KizilkanNativeCore.startForegroundKeepAlive('KIZILKAN · Dosya içe aktarma','Seçilen hesaplar yeniden doğrulanıyor…',keepAlive,()=>c.abort());
      await onImport(chosen,c.signal,text=>{if(alive.current&&seq===generation.current)setMessage(text);});
    }catch(error:any){if(alive.current&&seq===generation.current)setMessage(String(error?.message||error));}
    finally{KizilkanNativeCore.stopForegroundKeepAlive(keepAlive);if(alive.current&&seq===generation.current)setBusy(false);}
  };
  const toggle=(id:string)=>setSelected(values=>values.includes(id)?values.filter(v=>v!==id):[...values,id]);
  return <View style={{marginVertical:12}}>
    <FocusButton testID="hit-files-pick" disabled={disabled||busy} onPress={()=>void pick()} style={{padding:12,borderWidth:1,borderColor:colors.brandPrimary,borderRadius:12}}><Text style={{color:colors.brandPrimary}}>HOST / KIZILKAN / MAG / M3U dosyalarını içe aktar</Text></FocusButton>
    {!open&&message?<Text style={{color:colors.onSurfaceSecondary,marginTop:6}}>{message}</Text>:null}
    <Modal visible={open} animationType="slide" onRequestClose={()=>{if(busy)cancel();else setOpen(false);}}>
      <View style={{flex:1,padding:20,backgroundColor:colors.surface}}>
        <Text style={{color:colors.onSurface,fontWeight:'bold',fontSize:20}}>Dosya önizlemesi · {selected.length} seçili</Text>
        <Text style={{color:colors.onSurfaceSecondary,marginVertical:8}}>{message}</Text>
        <Text style={{color:colors.onSurfaceSecondary}}>Dosyadaki “hit / aktif” bilgisi kanıt değildir. Seçtikleriniz yeniden doğrulanır; mevcut hesapların katalogları korunur.</Text>
        <TextInput testID="hit-default-server" editable={!busy} value={defaultServer} onChangeText={setDefaultServer} autoCapitalize="none" autoCorrect={false} placeholder="DNS'siz combo için hedef: https://sunucu:port" placeholderTextColor={colors.onSurfaceTertiary} style={{color:colors.onSurface,borderColor:colors.border,borderWidth:1,padding:10,marginVertical:8}}/>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>
          <FocusButton disabled={busy} onPress={()=>setSelected(rows.map(r=>r.id))}><Text style={{color:colors.brandPrimary}}>Tümünü seç</Text></FocusButton>
          <FocusButton disabled={busy} onPress={()=>setSelected([])}><Text style={{color:colors.brandPrimary}}>Seçimi kaldır</Text></FocusButton>
          <FocusButton onPress={()=>busy?cancel():setOpen(false)}><Text style={{color:colors.error}}>{busy?'İptal et':'Kapat'}</Text></FocusButton>
        </View>
        <FlatList style={{flex:1,marginTop:12}} data={rows} keyExtractor={r=>r.id} initialNumToRender={12} renderItem={({item:r})=><FocusButton disabled={busy} onPress={()=>toggle(r.id)} style={{padding:12,marginBottom:8,borderWidth:1,borderColor:selected.includes(r.id)?colors.brandPrimary:colors.border,borderRadius:10}}>
          <Text style={{color:colors.onSurface}}>{selected.includes(r.id)?'☑':'☐'} {r.kind.toUpperCase()} · {r.name}</Text>
          <Text style={{color:colors.onSurfaceSecondary}}>{r.server||'DNS belirtilmemiş'}{r.username?' · '+r.username:r.mac?' · '+r.mac:''}</Text>
          <Text style={{color:colors.onSurfaceTertiary}}>{r.sources.map(s=>`${s.file}:${s.line}`).join(' · ')}</Text>
          {hitExistingStatus(r,playlists)!=='new'?<Text style={{color:colors.onSurfaceSecondary}}>{hitExistingStatus(r,playlists)==='existing'?'Zaten ekli · mevcut katalog korunacak':'Parola mevcut hesaptan farklı · eklemede açık seçim istenecek'}</Text>:null}
          {r.warnings.map((w,i)=><Text key={i} style={{color:colors.onSurfaceSecondary}}>{w}</Text>)}
        </FocusButton>}/>
        <FocusButton testID="hit-files-import" disabled={busy||!selected.length} onPress={()=>void start()} style={{padding:14,backgroundColor:colors.brandPrimary,borderRadius:12}}>{busy?<ActivityIndicator color="#fff"/>:<Text style={{color:'#fff',fontWeight:'bold'}}>Seçilenleri doğrula ve ekle ({selected.length})</Text>}</FocusButton>
      </View>
    </Modal>
  </View>;
}
