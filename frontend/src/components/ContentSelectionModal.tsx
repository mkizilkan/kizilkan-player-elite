import React, { useMemo, useState } from 'react';
import { Modal, View, Text, ScrollView, TextInput, StyleSheet } from 'react-native';
import { FocusButton } from '@/src/components/FocusButton';
import { useTheme } from '@/src/theme/ThemeContext';
import { SPACING, RADIUS, FONT } from '@/src/theme/themes';
import type { PlaylistContentSelection } from '@/src/types';
import { allContentSelection } from '@/src/utils/contentSelection';

type Categories = { live:string[]; vod:string[]; series:string[] };
export function ContentSelectionModal({visible,categories,initial,onCancel,onApply}:{visible:boolean;categories:Categories;initial?:PlaylistContentSelection|null;onCancel:()=>void;onApply:(s:PlaylistContentSelection)=>void}){
  const {colors}=useTheme();
  const [selection,setSelection]=useState<PlaylistContentSelection>(initial ? {...initial} : allContentSelection());
  const [search,setSearch]=useState('');
  React.useEffect(()=>{ if(visible) { setSelection(initial ? {...initial} : allContentSelection()); setSearch(''); } },[visible,initial]);
  const q=search.trim().toLocaleLowerCase('tr');
  const filtered=useMemo(()=>({
    live:categories.live.filter(x=>!q||x.toLocaleLowerCase('tr').includes(q)),
    vod:categories.vod.filter(x=>!q||x.toLocaleLowerCase('tr').includes(q)),
    series:categories.series.filter(x=>!q||x.toLocaleLowerCase('tr').includes(q)),
  }),[categories,q]);
  const toggleCat=(kind:'live'|'vod'|'series',cat:string)=>{
    const key=`${kind}Categories` as 'liveCategories'|'vodCategories'|'seriesCategories';
    setSelection(prev=>{
      const all=categories[kind];
      const cur=prev[key]===null?[...all]:[...(prev[key]||[])];
      const next=cur.includes(cat)?cur.filter(x=>x!==cat):[...cur,cat];
      return {...prev,[key]:next,updatedAt:new Date().toISOString()};
    });
  };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.overlay}><View style={[styles.modal,{backgroundColor:colors.surface,borderColor:colors.border}]}> 
      <Text style={[styles.title,{color:colors.onSurface}]}>İçerik / Kategori Seçimi</Text>
      <Text style={{color:colors.onSurfaceSecondary,fontSize:FONT.size.sm}}>Seçim kalıcıdır. Sonraki normal yenilemeler yalnız bu kapsamı kullanır.</Text>
      <TextInput value={search} onChangeText={setSearch} placeholder="Kategori ara…" placeholderTextColor={colors.onSurfaceTertiary} style={[styles.search,{color:colors.onSurface,borderColor:colors.border,backgroundColor:colors.surfaceSecondary}]}/>
      <ScrollView style={{maxHeight:480}}>
        {([['live','Canlı TV'],['vod','Film'],['series','Dizi']] as const).map(([kind,label])=>{
          const enabled=selection[kind]; const key=`${kind}Categories` as 'liveCategories'|'vodCategories'|'seriesCategories'; const chosen=selection[key];
          return <View key={kind} style={styles.section}>
            <FocusButton onPress={()=>setSelection(p=>({...p,[kind]:!p[kind],updatedAt:new Date().toISOString()}))} style={styles.header}>
              <Text style={{color:enabled?colors.brandPrimary:colors.onSurfaceSecondary,fontWeight:'800'}}>{enabled?'☑':'☐'} {label} ({categories[kind].length})</Text>
            </FocusButton>
            {enabled && filtered[kind].map(cat=>{ const on=chosen===null||chosen.includes(cat); return <FocusButton key={`${kind}:${cat}`} onPress={()=>toggleCat(kind,cat)} style={styles.row}><Text style={{color:on?colors.onSurface:colors.onSurfaceSecondary}}>{on?'☑':'☐'} {cat}</Text></FocusButton>; })}
          </View>;
        })}
      </ScrollView>
      <View style={styles.actions}>
        <FocusButton onPress={onCancel} style={[styles.action,{borderColor:colors.border}]}><Text style={{color:colors.onSurface}}>İptal</Text></FocusButton>
        <FocusButton onPress={()=>onApply({...selection,updatedAt:new Date().toISOString()})} style={[styles.action,{backgroundColor:colors.brandPrimary}]}><Text style={{color:colors.onBrandPrimary,fontWeight:'800'}}>Seçimi Uygula</Text></FocusButton>
      </View>
    </View></View>
  </Modal>;
}
const styles=StyleSheet.create({overlay:{flex:1,backgroundColor:'rgba(0,0,0,.82)',alignItems:'center',justifyContent:'center',padding:SPACING.lg},modal:{width:'100%',maxWidth:640,borderWidth:1,borderRadius:RADIUS.lg,padding:SPACING.lg},title:{fontSize:FONT.size.lg,fontWeight:'900',marginBottom:6},search:{height:46,borderWidth:1,borderRadius:RADIUS.md,paddingHorizontal:12,marginVertical:SPACING.md},section:{marginBottom:10},header:{paddingVertical:10},row:{paddingVertical:7,paddingHorizontal:8},actions:{flexDirection:'row',gap:SPACING.sm,marginTop:SPACING.md},action:{flex:1,minHeight:48,borderWidth:1,borderRadius:RADIUS.pill,alignItems:'center',justifyContent:'center'}});
