import * as FileSystem from 'expo-file-system/legacy';
import { KizilkanNativeCore } from '@/modules/kizilkan-native-core';

export const isEncryptedBackupName=(name?:string):boolean=>/\.kzbe$/i.test(name||'');
const temporary=(purpose:'export'|'restore',extension:string):string=>{
  if(!FileSystem.cacheDirectory)throw new Error('Geçici yedek klasörü kullanılamıyor.');
  return `${FileSystem.cacheDirectory}backup-${purpose}-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
};
const cancelled=()=>new Error('Yedek şifreleme işlemi durduruldu.');
async function cryptBackup(mode:'encrypt'|'decrypt',uri:string,password:string,signal?:AbortSignal):Promise<{uri:string;kind?:'full'|'json'}>{
  if(password.length<8)throw new Error('Yedek parolası en az 8 karakter olmalı.');
  if(signal?.aborted)throw cancelled();
  const output=temporary(mode==='encrypt'?'export':'restore',mode==='encrypt'?'kzbe':'restore');
  const jobId=`backup_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const abort=()=>{try{KizilkanNativeCore.cancelBackupCrypto(jobId);}catch{}};
  signal?.addEventListener('abort',abort,{once:true});
  let returnedUri:string|undefined;
  try{
    if(signal?.aborted)throw cancelled();
    const result=mode==='encrypt'
      ?await KizilkanNativeCore.encryptBackupFile(uri,output,password,jobId)
      :await KizilkanNativeCore.decryptBackupFile(uri,output,password,jobId);
    returnedUri=result.uri;
    if(signal?.aborted)throw cancelled();
    if(!result.ok||!result.uri)throw new Error(mode==='encrypt'?'Şifreli yedek oluşturulamadı.':'Şifreli yedek doğrulanamadı; parola veya dosya hatalı.');
    const kind='kind' in result&&(result.kind==='full'||result.kind==='json')?result.kind:undefined;
    if(mode==='decrypt'&&!kind)throw new Error('Şifreli yedek içeriği tanınmadı.');
    return {uri:result.uri,kind};
  }catch(error){
    await Promise.allSettled([removeTemporaryBackup(output),removeTemporaryBackup(returnedUri)]);
    if(signal?.aborted)throw cancelled();
    throw error;
  }finally{signal?.removeEventListener('abort',abort);}
}
export async function encryptBackupFile(uri:string,password:string,signal?:AbortSignal):Promise<string>{
  return (await cryptBackup('encrypt',uri,password,signal)).uri;
}
export async function decryptBackupFile(uri:string,password:string,signal?:AbortSignal):Promise<{uri:string;fullV3:boolean}>{
  const result=await cryptBackup('decrypt',uri,password,signal);
  return {uri:result.uri,fullV3:result.kind==='full'};
}
export async function removeTemporaryBackup(uri?:string):Promise<void>{
  if(!uri||!FileSystem.cacheDirectory)return;
  try{
    const file=new URL(decodeURIComponent(uri)),cache=new URL(decodeURIComponent(FileSystem.cacheDirectory));
    if(file.protocol!==cache.protocol||file.host!==cache.host||!file.pathname.startsWith(cache.pathname.endsWith('/')?cache.pathname:cache.pathname+'/'))return;
  }catch{return;}
  await FileSystem.deleteAsync(uri,{idempotent:true});
}
/** Only our export files are expired; shared receivers may still read a chooser URI after it resolves. */
export async function cleanupExpiredBackupExports(signal?:AbortSignal,nowMs=Date.now()):Promise<void>{
  if(!FileSystem.cacheDirectory)return;
  let names:string[];
  try{names=await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);}catch{return;}
  const owned=/^(?:backup-export-\d+-[a-z0-9]+\.kzbe|kizilkan-player-elite-export-(?:quick|personal)-\d+-[a-z0-9]+\.json|kizilkan-player-elite-full-\d{4}-\d{2}-\d{2}T[\d-]+Z\.kzb)$/i;
  for(const name of names){
    if(signal?.aborted)throw cancelled();
    if(!owned.test(name))continue;
    const uri=FileSystem.cacheDirectory+name;
    try{
      const info=await FileSystem.getInfoAsync(uri);
      if(signal?.aborted)throw cancelled();
      if(info.exists&&!info.isDirectory&&Number.isFinite(info.modificationTime)&&nowMs-Number(info.modificationTime)*1000>=24*60*60*1000)await removeTemporaryBackup(uri);
    }catch(error){if(signal?.aborted)throw error;}
  }
}
