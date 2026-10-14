import React from 'react';
import { Text,View } from 'react-native';
import type { Playlist,PlaylistEndpoint } from '@/src/types';
import { endpointVerificationState,needsVerificationRetest,verificationLabel } from '@/src/utils/verificationState';
import { useTheme } from '@/src/theme/ThemeContext';

/** Evidence comes from actual account/catalog/Media3 tests; transport 200 is not a frame. */
export function PortalHealthCard({endpoints,capabilities}:{endpoints:PlaylistEndpoint[];capabilities?:Playlist['catalogCapabilities']}){
  const {colors}=useTheme();const uncertain=endpoints.filter(needsVerificationRetest).length;
  return <View style={{padding:12,borderWidth:1,borderColor:colors.border,borderRadius:12,marginVertical:8}}>
    <Text style={{color:colors.onSurface,fontWeight:'bold'}}>Portal sağlığı · {endpoints.length} adres</Text>
    {endpoints.map(e=><Text key={e.kind+e.url} style={{color:colors.onSurfaceSecondary,marginTop:6}}>{e.primary?'● ':''}{e.url}{'\n'}{verificationLabel[endpointVerificationState(e)]}</Text>)}
    {capabilities?<Text style={{color:colors.onSurfaceSecondary,marginTop:8}}>{(['live','vod','series'] as const).map((kind,i)=>['Canlı','Film','Dizi'][i]+': '+(capabilities[kind]==='empty'?'boş':capabilities[kind]==='unsupported_404'?'desteklenmiyor':capabilities[kind]==='error'?'alınamadı':capabilities[kind]==='supported'?'katalog var':'yedek yöntem')).join(' · ')}</Text>:null}
    {uncertain>0?<Text style={{color:colors.onSurfaceSecondary,marginTop:8}}>{uncertain} adres için sonuç belirsiz. Aşağıdaki hesap / görüntü testleriyle yeniden kontrol edebilirsiniz. Boş veya desteklenmeyen katalog hesabı geçersiz yapmaz.</Text>:null}
  </View>;
}
