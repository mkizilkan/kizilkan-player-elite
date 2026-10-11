import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, ScrollView } from 'react-native';
import { FocusButton } from './FocusButton';
import { useTheme } from '@/src/theme/ThemeContext';
import type { DirectoryPanel } from '@/src/utils/panelDirectoryModel';

/** Credential-free HTTP reachability: never label an open port as a working subscription. */
export function PanelDnsPicker({ panel, selected, onApply, onClose }: { panel: DirectoryPanel; selected?: string[];
  onApply: (hosts: string[]) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const [selection, setSelection] = useState(() => new Set(selected ?? panel.hosts));
  const [health, setHealth] = useState<Record<string, { ms?: number; status?:number; guarded?:boolean; note: string }>>({});
  const [testing, setTesting] = useState(false);
  const controllers = useRef(new Set<AbortController>()); const alive = useRef(true);
  useEffect(() => {alive.current=true;return () => { alive.current = false; controllers.current.forEach(c => c.abort()); };}, []);
  const test = async () => {
    if (testing) return; setTesting(true); let cursor = 0, protectionSeen=false;
    await Promise.all(Array.from({ length: Math.min(3, panel.hosts.length) }, async () => {
      while (alive.current && !protectionSeen && cursor < panel.hosts.length) {
        const host = panel.hosts[cursor++], ctrl = new AbortController(); controllers.current.add(ctrl);
        const timer = setTimeout(() => ctrl.abort(), 6000), started = Date.now();
        let result: { ms?: number; status?:number; guarded?:boolean; note: string };
        try {
          const res = await fetch(host, { method: 'HEAD', signal: ctrl.signal,redirect:'manual' });
          if(res.headers.get('cf-mitigated')?.toLowerCase()==='challenge'||[401,403,429].includes(res.status))protectionSeen=true;
          result = { ms: Date.now() - started,status:res.status,guarded:res.headers.get('cf-mitigated')?.toLowerCase()==='challenge', note: res.headers.get('cf-mitigated')?.toLowerCase() === 'challenge' ? 'Doğrulama gerekiyor' : res.status === 429 ? 'İstek sınırı' : `HTTP ${res.status} · hesap sınanmadı` };
        } catch { result = { note: 'Erişim belirlenemedi · yeniden test edilebilir' }; }
        finally { clearTimeout(timer); controllers.current.delete(ctrl); }
        if (alive.current) setHealth(previous => ({ ...previous, [host]: result }));
      }
    }));
    if (alive.current) setTesting(false);
  };
  const button = (label: string, action: () => void, disabled = false) => <FocusButton disabled={disabled} onPress={action} style={{padding:12,borderWidth:1,borderColor:colors.border,borderRadius:8}}><Text style={{color:colors.onSurface}}>{label}</Text></FocusButton>;
  const rank=(host:string)=>{const status=health[host]?.status;return health[host]?.guarded?1:status===undefined?3:status>=200&&status<400?0:status>=400&&status<500?1:2;};
  const hosts = [...panel.hosts].sort((a,b) => rank(a)-rank(b)||(health[a]?.ms ?? Infinity) - (health[b]?.ms ?? Infinity));
  return <Modal visible transparent onRequestClose={onClose}><View style={{flex:1,backgroundColor:'#000C',justifyContent:'center',padding:18}}><View style={{backgroundColor:colors.surface,padding:16,borderRadius:12,gap:10,maxHeight:'85%'}}>
    <Text style={{color:colors.onSurface,fontWeight:'700'}}>{panel.panelName} · DNS seçimi</Text>
    <Text style={{color:colors.onSurfaceSecondary}}>Yanıt süresi ping/ilk görüntü süresi değildir. Hesap ve görüntü analizi yalnız seçtiğiniz adreslerde yapılır.</Text>
    {button(testing ? 'Erişim ölçülüyor…' : 'Yanıt sürelerini ölç', () => void test(), testing)}
    <View style={{flexDirection:'row',gap:8}}>{button('Hepsini seç',()=>setSelection(new Set(panel.hosts)))}{button('Seçimi kaldır',()=>setSelection(new Set()))}</View>
    <ScrollView nestedScrollEnabled>{hosts.map(host=><FocusButton key={host} onPress={()=>setSelection(old=>{const next=new Set(old);if(next.has(host))next.delete(host);else next.add(host);return next;})} style={{padding:12,borderBottomWidth:1,borderColor:colors.border}}>
      <Text style={{color:colors.onSurface}}>{selection.has(host)?'☑':'☐'} {host}</Text><Text style={{color:rank(host)===0?'#66bb6a':rank(host)===1?'#ffb74d':rank(host)===2?'#ef5350':colors.onSurfaceSecondary}}>{health[host] ? `${health[host].ms === undefined ? '' : `${health[host].ms} ms · `}${health[host].note}` : 'Henüz ölçülmedi'}</Text>
    </FocusButton>)}</ScrollView>
    {button(`${selection.size} DNS ile devam et`,()=>{onApply(hosts.filter(h=>selection.has(h)));onClose();},!selection.size)}
    {button('Kapat',onClose)}
  </View></View></Modal>;
}
