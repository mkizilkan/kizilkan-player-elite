import React from 'react';
import {View,Text,ActivityIndicator} from 'react-native';
import {useTheme} from '@/src/theme/ThemeContext';
import type {RefreshProgress} from '@/src/utils/refreshPlaylist';
export function CatalogProgressCards({progress}:{progress:RefreshProgress|null}){
 const {colors}=useTheme();if(!progress)return null;
 return <View accessibilityLiveRegion="polite" style={{gap:8,marginVertical:10}}><Text style={{color:colors.onSurfaceSecondary}}>{progress.message}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['live','vod','series'] as const).map((kind,i)=>{
  const state=progress[kind],count=progress[`${kind}Count`];if(state==='skipped')return null;
  const status=state==='error'||progress.phase==='error'?'Hata':progress.phase==='done'?'Tamamlandı':state==='done'?'Doğrulandı':progress.phase==='save'?'Kaydediliyor':progress.phase==='login'||progress.phase==='dns'?'Bağlanıyor':state==='waiting'?'İndiriliyor':'Bekliyor';
  return <View key={kind} style={{flexGrow:1,minWidth:95,padding:12,borderRadius:12,borderWidth:1,borderColor:state==='error'?'#E53935':colors.border,backgroundColor:colors.surfaceSecondary}}><Text style={{color:colors.onSurface,fontWeight:'700'}}>{['📺 Canlı TV','🎬 Film / VOD','📚 Diziler'][i]}</Text><Text style={{color:colors.onSurfaceSecondary,marginTop:6}}>{status}</Text>{count!==undefined&&<Text style={{color:colors.brandPrimary,marginTop:6}}>{count.toLocaleString('tr-TR')} kayıt</Text>}{state==='waiting'&&<ActivityIndicator size="small" color={colors.brandPrimary}/>}</View>;
 })}</View></View>;
}
