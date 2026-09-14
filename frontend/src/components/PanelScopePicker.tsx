import React,{useState} from 'react';
import {View,Text,TextInput,ScrollView} from 'react-native';
import {FocusButton} from './FocusButton';
import {useTheme} from '@/src/theme/ThemeContext';
import {canonicalPanelHost,type DirectoryPanel,type DirectoryScope,type PanelTarget} from '@/src/utils/panelDirectoryModel';

const split=(value:string)=>value.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);
export function PanelScopePicker({scope,target,directory,onScope,onTarget,onLoad,busy}:{scope:DirectoryScope;target:PanelTarget;directory:DirectoryPanel[];onScope:(s:DirectoryScope)=>void;onTarget:(t:PanelTarget)=>void;onLoad:()=>void;busy:boolean}){
 const {colors}=useTheme();const [expanded,setExpanded]=useState(true),[search,setSearch]=useState('');
 const [codesText,setCodesText]=useState((target.codes||[]).join(', ')),[namesText,setNamesText]=useState((target.names||[]).join(', ')),[hostsText,setHostsText]=useState((target.hosts||[]).join(', '));
 const button=(label:string,selected:boolean,run:()=>void)=><FocusButton key={label} disabled={busy} onPress={run} style={{padding:10,borderWidth:1,borderRadius:8,borderColor:selected?colors.brandPrimary:colors.border}}><Text style={{color:selected?colors.brandPrimary:colors.onSurface}}>{label}</Text></FocusButton>;
 const inputStyle={color:colors.onSurface,padding:10,borderWidth:1 as const,borderColor:colors.border,borderRadius:8};
 const matches=directory.filter(p=>{const q=search.trim().toLocaleLowerCase('tr');return !q||[p.panelName,...(p.codes||[]),...(p.sources||[]).map(s=>s.source)].some(v=>v.toLocaleLowerCase('tr').includes(q));});
 const invalidHosts=split(hostsText).filter(h=>!canonicalPanelHost(h));
 return <View style={{gap:8,marginVertical:12}}><Text style={{color:colors.onSurface,fontWeight:'700'}}>Panel kaynakları ve hedefler</Text>
 <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['all','splayer','masteriptv'] as const).map((s,i)=>button(['Tüm kaynaklar','Splayer','MasterIPTV'][i],scope===s,()=>onScope(s)))}</View>
 <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{button('Tüm paneller',!target.codes?.length&&!target.names?.length&&!target.keys?.length&&!target.hosts?.length,()=>{onTarget({});setCodesText('');setNamesText('');setHostsText('');})}{button(`Panel listesi · ${target.keys?.length||0} seçili`,expanded,()=>{setExpanded(!expanded);if(!directory.length)onLoad();})}</View>
 <Text style={{color:colors.onSurfaceSecondary}}>Listeden panel adı, gerçek kodu ve kaynaklarını görerek istediğiniz kadar panel seçin. Liste yüklenmezse “Rehberi yükle”ye dokunun.</Text>
 {expanded&&<><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{button(directory.length?`Rehberi yenile (${directory.length})`:'Rehberi yükle',false,onLoad)}</View><TextInput value={search} onChangeText={setSearch} placeholder="Panel adı, kod veya kaynak ara" placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle}/><ScrollView nestedScrollEnabled style={{maxHeight:270}} keyboardShouldPersistTaps="always">{matches.slice(0,100).map(p=>{const key=p.directoryKey||p.panelName,checked=target.keys?.includes(key)||false;const codes=(p.codes||[]).filter(Boolean);const sources=Array.from(new Set((p.sources||[]).map(s=>s.source)));return button(`${checked?'☑':'☐'} ${p.panelName}${codes.length?` · Kod: ${codes.join(', ')}`:' · Kod yok'} · ${sources.join(' + ')||'Kaynak bilinmiyor'} · ${p.hosts.length} DNS`,checked,()=>onTarget({...target,keys:checked?target.keys?.filter(k=>k!==key):[...(target.keys||[]),key]}));})}</ScrollView><Text style={{color:colors.onSurfaceSecondary,fontSize:12}}>{matches.length} eşleşme · ilk 100 gösterilir; daha fazlası için arayın.</Text></>}
 <Text style={{color:colors.onSurface,fontWeight:'700'}}>İsteğe bağlı elle hedef ekle</Text>
 <TextInput editable={!busy} value={codesText} onChangeText={v=>{setCodesText(v);onTarget({...target,codes:split(v)});}} placeholder="Gerçek kodlar: ör. 12345, 67890" placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle}/>
 <TextInput editable={!busy} value={namesText} onChangeText={v=>{setNamesText(v);onTarget({...target,names:split(v)});}} placeholder="Panel adları: ör. Benim Panelim" placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle}/>
 <TextInput editable={!busy} value={hostsText} onChangeText={v=>{setHostsText(v);onTarget({...target,hosts:split(v).filter(h=>!!canonicalPanelHost(h))});}} placeholder="Doğrudan DNS: ör. https://panel.example.com" placeholderTextColor={colors.onSurfaceTertiary} style={inputStyle}/>
 {!!invalidHosts.length&&<Text style={{color:colors.error}}>Geçersiz DNS atlandı: {invalidHosts.length}</Text>}
 <Text style={{color:colors.onSurfaceSecondary,fontSize:12}}>Seçimler birlikte uygulanır. Kodu olmayan MasterIPTV panellerini adından veya listeden seçin. Yalnız kendi aboneliğinizin adreslerini kullanın.</Text></View>;
}
