import React from 'react';
import {View,Text,ActivityIndicator} from 'react-native';
import {useTheme} from '@/src/theme/ThemeContext';
import type {RefreshProgress} from '@/src/utils/refreshPlaylist';
export function CatalogProgressCards({progress,testID}:{progress:RefreshProgress|null;testID?:string}){
 const {colors}=useTheme();if(!progress)return null;
 return <View testID={testID} accessibilityLiveRegion="polite" style={{gap:8,marginVertical:10}}><Text style={{color:colors.onSurfaceSecondary}}>{progress.message}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['live','vod','series'] as const).map((kind,i)=>{
  const state=progress[kind],count=progress[`${kind}Count`],total=progress[`${kind}Total`],page=progress[`${kind}Page`];if(state==='skipped')return null;
  const status=state==='error'||progress.phase==='error'?'Hata':state==='saving'?'Kaydediliyor':progress.phase==='done'?'Tamamlandı':state==='done'?'Doğrulandı':progress.phase==='save'?'Kaydediliyor':progress.phase==='login'||progress.phase==='dns'?'Bağlanıyor':state==='waiting'?'İndiriliyor':'Bekliyor';
  return <View key={kind} style={{flexGrow:1,minWidth:95,padding:12,borderRadius:12,borderWidth:1,borderColor:state==='error'?colors.error:colors.border,backgroundColor:colors.surfaceSecondary}}><Text style={{color:colors.onSurface,fontWeight:'700'}}>{['📺 Canlı TV','🎬 Film / VOD','📚 Diziler'][i]}</Text><Text style={{color:colors.onSurfaceSecondary,marginTop:6}}>{status}</Text>{count!==undefined&&<Text style={{color:colors.brandPrimary,marginTop:6}}>{count.toLocaleString('tr-TR')}{total!==undefined?` / ${total.toLocaleString('tr-TR')}`:''} kayıt</Text>}{page!==undefined&&<Text style={{color:colors.onSurfaceSecondary,marginTop:6}}>Sayfa {page}</Text>}{(state==='waiting'||state==='saving')&&<ActivityIndicator size="small" color={colors.brandPrimary}/>}</View>;
 })}</View></View>;
}
