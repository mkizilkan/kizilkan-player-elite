import React,{useState} from 'react';
import {View,Text,TextInput,ScrollView} from 'react-native';
import {FocusButton} from './FocusButton';
import {useTheme} from '@/src/theme/ThemeContext';
import type {DirectoryPanel,DirectoryScope,PanelTarget} from '@/src/utils/panelDirectoryModel';
export function PanelScopePicker({scope,target,directory,onScope,onTarget,onLoad,busy}:{scope:DirectoryScope;target:PanelTarget;directory:DirectoryPanel[];onScope:(s:DirectoryScope)=>void;onTarget:(t:PanelTarget)=>void;onLoad:()=>void;busy:boolean}){
 const {colors}=useTheme();const [expanded,setExpanded]=useState(false),[search,setSearch]=useState(''),[text,setText]=useState(''),[mode,setMode]=useState<'codes'|'names'>('codes');
 const button=(label:string,selected:boolean,run:()=>void)=><FocusButton key={label} disabled={busy} onPress={run} style={{padding:10,borderWidth:1,borderRadius:8,borderColor:selected?colors.brandPrimary:colors.border}}><Text style={{color:selected?colors.brandPrimary:colors.onSurface}}>{label}</Text></FocusButton>;
 const parse=(v:string)=>v.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);
 return <View style={{gap:8,marginVertical:12}}><Text style={{color:colors.onSurface,fontWeight:'700'}}>Panel kaynakları</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['all','splayer','masteriptv'] as const).map((s,i)=>button(['Tüm kaynaklar','Splayer','MasterIPTV'][i],scope===s,()=>onScope(s)))}</View>
 <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{button('Tüm paneller',!target.codes?.length&&!target.names?.length&&!target.keys?.length,()=>{onTarget({});setText('');})}{button(`Panel seç (${target.keys?.length||0})`,expanded,()=>{setExpanded(!expanded);if(!directory.length)onLoad();})}</View>
 <View style={{flexDirection:'row',gap:8}}>{button('Gerçek kodlar',mode==='codes',()=>{setMode('codes');onTarget({...target,names:[],codes:parse(text)});})}{button('Panel adları',mode==='names',()=>{setMode('names');onTarget({...target,codes:[],names:parse(text)});})}</View>
 <TextInput editable={!busy} value={text} onChangeText={t=>{setText(t);onTarget({...target,codes:[],names:[],[mode]:parse(t)});}} placeholder={mode==='codes'?'Kodları virgülle ayırın':'Panel adlarını virgülle ayırın'} placeholderTextColor={colors.onSurfaceTertiary} style={{color:colors.onSurface,padding:10,borderWidth:1,borderColor:colors.border,borderRadius:8}}/>
 <Text style={{color:colors.onSurfaceSecondary,fontSize:12}}>Kaynak ve hedef seçimleri birlikte uygulanır. MasterIPTV için panel adı veya panel seçimini kullanın.</Text>
 {expanded&&<><TextInput value={search} onChangeText={setSearch} placeholder="Panel ara" placeholderTextColor={colors.onSurfaceTertiary} style={{color:colors.onSurface,padding:10}}/><ScrollView nestedScrollEnabled style={{maxHeight:230}}>{directory.filter(p=>p.panelName.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'))).slice(0,100).map(p=>{const key=p.directoryKey||p.panelName,checked=target.keys?.includes(key)||false;return button(`${checked?'☑':'☐'} ${p.panelName} · ${p.hosts.length} DNS`,checked,()=>onTarget({...target,keys:checked?target.keys?.filter(k=>k!==key):[...(target.keys||[]),key]}));})}</ScrollView><Text style={{color:colors.onSurfaceSecondary,fontSize:12}}>İlk 100 sonuç gösterilir; diğer paneller için arayın.</Text></>}
 </View>;
}
