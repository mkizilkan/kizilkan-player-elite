import { KizilkanNativeCore } from '@/modules/kizilkan-native-core';

const ITERATIONS=600000;
export const isProtectedPin=(value:unknown):boolean=>typeof value==='string'&&value.startsWith('kzpin:');
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
async function webHash(pin:string,salt:Uint8Array):Promise<string>{
  const crypto=(globalThis as any).crypto;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},key,256)));
}
/** Android native PBKDF2; WebCrypto where available. Old unsupported platforms retain compatibility. */
export async function protectPin(pin:string):Promise<string>{
  if(!pin||isProtectedPin(pin)||!/^\d{4,10}$/.test(pin))return pin;
  if(KizilkanNativeCore.available)return KizilkanNativeCore.hashPin(pin);
  const crypto=(globalThis as any).crypto;
  if(crypto?.subtle&&crypto?.getRandomValues){const salt=crypto.getRandomValues(new Uint8Array(16));return `kzpin:1:${ITERATIONS}:${hex(salt)}:${await webHash(pin,salt)}`;}
  return pin;
}
export async function matchesPin(entered:string,actual?:string|null):Promise<boolean>{
  if(!actual)return false;
  if(!isProtectedPin(actual))return entered===actual;
  if(!/^\d{4,10}$/.test(entered))return false;
  if(KizilkanNativeCore.available)return KizilkanNativeCore.verifyProtectedPin(entered,actual);
  const parts=actual.split(':');
  if(!(globalThis as any).crypto?.subtle||parts.length!==5||parts[1]!=='1'||parts[2]!==String(ITERATIONS)||!/^[a-f0-9]{32}$/.test(parts[3])||!/^[a-f0-9]{64}$/.test(parts[4]))return false;
  const salt=Uint8Array.from(parts[3].match(/../g)!,byte=>parseInt(byte,16));
  const hash=await webHash(entered,salt);let difference=0;
  for(let i=0;i<hash.length;i++)difference|=hash.charCodeAt(i)^parts[4].charCodeAt(i);
  return difference===0;
}
