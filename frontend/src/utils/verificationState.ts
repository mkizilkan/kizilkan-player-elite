import type { PlaylistEndpoint } from '@/src/types';

export type VerificationState='unknown'|'account'|'catalog'|'frame'|'no_frame'|'protected'|'cancelled'|'temporary'|'rejected'|'unsupported';
export function endpointVerificationState(e:PlaylistEndpoint):VerificationState{
  const tested=Date.parse(e.playbackTestAt||'')||0,frame=Date.parse(e.firstFrameAt||'')||0;
  const last=Date.parse(e.lastTestAt||'')||0,newestProof=Math.max(frame,Date.parse(e.accountVerifiedAt||'')||0,Date.parse(e.catalogVerifiedAt||'')||0);
  if(e.lastError&&last>=newestProof&&last>=tested){
    const kind=e.lastErrorKind||'';
    if(/CANCELLED/i.test(kind))return 'cancelled';
    if(/ACCOUNT_REJECTED|AUTH_REJECT/i.test(kind))return 'rejected';
    if(/UNSUPPORTED/i.test(kind))return 'unsupported';
    return /429|captcha|cloudflare|protection|koruma|anti.bot/i.test(kind+' '+e.lastError)?'protected':'temporary';
  }
  if(tested>=frame&&tested&&e.playbackTestState&&e.playbackTestState!=='frame'){
    if(e.playbackTestState==='cancelled')return 'cancelled';
    if(e.playbackTestState==='blocked')return 'protected';
    return e.playbackTestState==='no_frame'?'no_frame':'temporary';
  }
  if(frame)return 'frame';
  if(e.catalogVerifiedAt)return 'catalog';
  if(e.accountVerifiedAt)return 'account';
  if(e.lastError)return /429|captcha|cloudflare|protection|koruma|anti.bot/i.test(e.lastError)?'protected':'temporary';
  return 'unknown';
}
export const verificationLabel:Record<VerificationState,string>={unknown:'Henüz doğrulanmadı',account:'Hesap doğrulandı',catalog:'Katalog var · görüntü sınanmadı',frame:'Gerçek ilk kare görüldü',no_frame:'Testte ilk kare alınamadı',protected:'Koruma / engel gözlendi',cancelled:'Test iptal edildi',temporary:'Sonuç belirsiz · tekrar test edin',rejected:'Kimlik doğrulaması reddedildi',unsupported:'Bu API / katalog yöntemi desteklenmiyor'};
export function needsVerificationRetest(e:PlaylistEndpoint):boolean{return ['unknown','no_frame','protected','cancelled','temporary','unsupported'].includes(endpointVerificationState(e));}
