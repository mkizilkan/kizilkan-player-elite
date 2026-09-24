import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Text, View} from 'react-native';
import {usePlaylists} from '@/src/store/PlaylistContext';
import {useTheme} from '@/src/theme/ThemeContext';
import {FONT, RADIUS, SPACING} from '@/src/theme/themes';
import {formatRefreshProgress} from '@/src/utils/refreshPlaylist';

const formatElapsed=(ms:number)=>{
  const total=Math.max(0,Math.floor(ms/1000));
  const min=Math.floor(total/60);
  const sec=total%60;
  return `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
};

/**
 * v17.9.10 — GLOBAL BOŞ-KABUK ONARIM GÖSTERGESİ
 * Playlist seçimi profil girişinden, Playlist Yönetimi'nden veya Ayarlar'daki
 * SEÇ düğmesinden başlatılsa da AYNI gerçek recovery state'i gösterilir.
 */
export function PlaylistRepairOverlay(){
  const {heavyLoading,repairProgress}=usePlaylists();
  const {colors}=useTheme();
  const [now,setNow]=useState(Date.now());

  useEffect(()=>{
    if(!heavyLoading||!repairProgress)return;
    setNow(Date.now());
    const timer=setInterval(()=>setNow(Date.now()),1000);
    return()=>clearInterval(timer);
  },[heavyLoading,repairProgress?.playlistId,repairProgress?.startedAt]);

  const statusLine=useMemo(()=>{
    const p=repairProgress?.progress;
    if(!p||!(p.live||p.vod||p.series))return '';
    return formatRefreshProgress(p);
  },[repairProgress?.progress]);
  if(!heavyLoading||!repairProgress)return null;

  const currentPaused=repairProgress.pausedAt?Math.max(0,now-repairProgress.pausedAt):0;
  const elapsed=Math.max(0,now-repairProgress.startedAt-(repairProgress.pausedTotalMs||0)-currentPaused);
  const silentFor=now-repairProgress.lastProgressAt;
  const isPaused=repairProgress.phase==='paused'||!!repairProgress.pausedAt;
  const waitMessage=isPaused
    ? 'Uygulama arka planda. Ağ isteği güvenle durduruldu; geri dönünce yarım kalan aşamadan devam edilecek.'
    : silentFor>=30000
      ? 'Yanıt normalden uzun sürüyor; işlem devam ediyor.'
      : silentFor>=15000
        ? 'Sunucudan yanıt bekleniyor…'
        : '';

  return <View
    testID="playlist-repair-overlay"
    style={{
      position:'absolute',top:0,left:0,right:0,bottom:0,zIndex:10000,
      backgroundColor:'rgba(0,0,0,0.92)',alignItems:'center',justifyContent:'center',
      paddingHorizontal:SPACING.xl,
    }}
  >
    <View style={{
      width:'100%',maxWidth:640,borderWidth:1,borderColor:colors.brandPrimary,
      backgroundColor:colors.surface,borderRadius:RADIUS.lg,padding:SPACING.xl,
      alignItems:'center',
    }}>
      <ActivityIndicator size="large" color={colors.brandPrimary}/>
      <Text style={{color:colors.onSurface,fontSize:FONT.size.xl,fontWeight:'900',textAlign:'center',marginTop:SPACING.lg}}>
        {repairProgress.playlistName} hazırlanıyor
      </Text>
      <Text style={{color:colors.onSurfaceSecondary,fontSize:FONT.size.base,textAlign:'center',marginTop:SPACING.sm,lineHeight:22}}>
        {repairProgress.message}
      </Text>
      {!!statusLine&&<Text
        testID="playlist-repair-catalog-progress"
        style={{color:colors.onSurface,fontSize:FONT.size.lg,fontWeight:'900',textAlign:'center',marginTop:SPACING.lg,lineHeight:30}}
      >
        {statusLine}
      </Text>}
      <Text style={{color:colors.onSurfaceTertiary,fontSize:FONT.size.sm,textAlign:'center',marginTop:SPACING.md}}>
        Geçen süre: {formatElapsed(elapsed)} · Aktif işlem
        {(repairProgress.pausedTotalMs||currentPaused)>0 ? ` · Arka plan: ${formatElapsed((repairProgress.pausedTotalMs||0)+currentPaused)}` : ''}
      </Text>
      {!!waitMessage&&<Text style={{color:colors.brandPrimary,fontSize:FONT.size.sm,fontWeight:'800',textAlign:'center',marginTop:SPACING.sm}}>
        {waitMessage}
      </Text>}
      <Text style={{color:colors.onSurfaceSecondary,fontSize:FONT.size.sm,textAlign:'center',marginTop:SPACING.lg,lineHeight:20}}>
        {isPaused ? 'Uygulamaya döndüğünüzde tamamlanan kataloglar korunur ve yalnız yarım kalan aşama yeniden başlatılır.' : 'İşlem devam ederken bu ekran kapanmaz. Her aşama tamamlandıkça Canlı, Film ve Dizi durumu burada güncellenir.'}
      </Text>
    </View>
  </View>;
}

export default PlaylistRepairOverlay;
