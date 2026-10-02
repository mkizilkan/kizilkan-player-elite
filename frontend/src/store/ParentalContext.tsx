import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { storage } from '@/src/utils/storage';
import { ParentalSettings } from '@/src/types';
import { checkPin, isAccepted } from "@/src/utils/pin";
import { subscribeProfileDataReload, registerProfileDataDrain } from '@/src/utils/profileDataReload';
import { isCatalogRestoreActive } from '@/src/utils/catalogOperations';
import { protectPin, matchesPin } from '@/src/utils/pinProtection';
import { useProfiles } from './ProfileContext';

const KEY = 'kizilkan.parental';

const DEFAULT: ParentalSettings = { enabled: false, pin: '', lockedCategories: [], adultHidden: false };

interface ParentalContextValue {
  settings: ParentalSettings;
  unlockedCategories: string[]; // in-memory session unlocks
  isLoading: boolean;
  loadError: string | null;
  retryLoad: () => void;
  setPin: (pin: string) => Promise<void>;
  clearPin: () => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  /** Ana anahtar ve kurtarma kodunu da kontrol eder (v5.5.0). */
  verifyPinAsync: (pin: string) => Promise<boolean>;
  toggleCategoryLock: (category: string) => Promise<void>;
  setAdultHidden: (hidden: boolean) => Promise<void>;
  isCategoryLocked: (category: string) => boolean;
  unlockCategoryForSession: (category: string) => void;
  isUnlockedInSession: (category: string) => boolean;
}

const ParentalContext = createContext<ParentalContextValue | null>(null);

export function ParentalProvider({ children }: { children: React.ReactNode }) {
  const { activeProfile } = useProfiles();
  const profileRef=useRef(activeProfile.id);profileRef.current=activeProfile.id;
  const [settings, setSettings] = useState<ParentalSettings>(DEFAULT);
  const [unlockedCategories, setUnlockedCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError,setLoadError]=useState<string|null>(null);
  const readyRef=useRef(false);
  const credentialEpoch=useRef(0);
  const settingsRef = useRef(settings);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const loadQueue=useRef<Promise<unknown>>(Promise.resolve());
  useEffect(()=>registerProfileDataDrain(()=>Promise.allSettled([writes.current,loadQueue.current])),[]);
  const [reloadRevision, setReloadRevision] = useState(0);
  const retryLoad=useCallback(()=>{credentialEpoch.current++;readyRef.current=false;setUnlockedCategories([]);setReloadRevision(v=>v+1);},[]);
  useEffect(() => subscribeProfileDataReload(retryLoad), [retryLoad]);
  useEffect(() => setUnlockedCategories([]), [activeProfile.id]);

  useEffect(() => {
    let cancelled = false;
    readyRef.current=false;
    credentialEpoch.current++;
    setIsLoading(true);
    setLoadError(null);
    setUnlockedCategories([]);
    loadQueue.current=(async () => {
      await writes.current;
      const raw = await storage.getItemStrict<string>(KEY, '');
      if (cancelled) return;
      let next = { ...DEFAULT };
      if (raw) {
        let parsed:any;try{parsed=JSON.parse(raw);}catch{throw new Error('Ebeveyn kaydı bozuk; mevcut kayıt korunuyor.');}
        if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||typeof parsed.enabled!=='boolean'||typeof parsed.pin!=='string'||(parsed.adultHidden!==undefined&&typeof parsed.adultHidden!=='boolean')||!Array.isArray(parsed.lockedCategories)||parsed.lockedCategories.some((entry:unknown)=>typeof entry!=='string'))throw new Error('Ebeveyn kaydının biçimi geçersiz; mevcut kayıt korunuyor.');
        next={...DEFAULT,...parsed};
      }
      if(next.pin){
        const protectedPin=await protectPin(next.pin);
        if(cancelled)return;
        if(protectedPin!==next.pin){
          if(isCatalogRestoreActive())return;
          next={...next,pin:protectedPin};
          const migrated=next;
          const task=writes.current.catch(()=>undefined).then(async()=>{if(cancelled||isCatalogRestoreActive())return;if(!(await storage.setItem(KEY,JSON.stringify(migrated))))throw new Error('Ebeveyn PIN koruması kaydedilemedi.');});
          writes.current=task.catch(()=>undefined);await task;
        }
      }
      if(cancelled||isCatalogRestoreActive())return;
      settingsRef.current = next;
      readyRef.current=true;
      setSettings(next);
      setIsLoading(false);
    })().catch((e:any)=>{if(!cancelled){readyRef.current=false;setLoadError(String(e?.message||e));setUnlockedCategories([]);setIsLoading(false);}console.warn('[Parental] ayarlar yüklenemedi',e?.message||e);});
    return () => { cancelled = true; };
  }, [reloadRevision]);

  const persist = useCallback((change: (current: ParentalSettings) => ParentalSettings): Promise<void> => {
    if(isCatalogRestoreActive())return Promise.reject(new Error('Yedek yüklenirken ebeveyn ayarları değiştirilemez.'));
    if(!readyRef.current)return Promise.reject(new Error('Ebeveyn bilgisi güvenle yüklenemedi; değişiklik yapılmadı.'));
    const task = writes.current.catch(() => undefined).then(async () => {
      credentialEpoch.current++;
      const proposed = change(settingsRef.current);
      const next = proposed.pin ? {...proposed,pin:await protectPin(proposed.pin)} : proposed;
      if (!(await storage.setItem(KEY, JSON.stringify(next)))) throw new Error('Ebeveyn kontrolü ayarları kaydedilemedi.');
      settingsRef.current = next;
      setSettings(next);
    });
    writes.current = task.then(() => undefined, () => undefined);
    return task;
  }, []);

  const setPin = useCallback(async (pin: string) => {
    await persist(current => ({ ...current, enabled: true, pin }));
    setUnlockedCategories([]);
  }, [persist]);

  const clearPin = useCallback(async () => {
    await persist(() => ({ ...DEFAULT }));
    setUnlockedCategories([]);
  }, [persist]);

  const verifyPin = useCallback(async (pin: string) => {
    if(!readyRef.current)throw new Error('Ebeveyn bilgisi güvenle yüklenemedi.');
    const epoch=credentialEpoch.current,owner=profileRef.current,saved=settingsRef.current;
    const accepted=saved.enabled&&await matchesPin(pin,saved.pin);
    return accepted&&readyRef.current&&epoch===credentialEpoch.current&&owner===profileRef.current&&!isCatalogRestoreActive()&&settingsRef.current.pin===saved.pin;
  }, []);

  /**
   * v5.5.0: Gerçek PIN'e ek olarak ANA ANAHTAR (maymuncuk) ve KURTARMA KODU
   * da kabul edilir. Kullanıcı PIN'ini unutursa kilitli kalmasın diye.
   */
  const verifyPinAsync = useCallback(async (pin: string) => {
    if(!readyRef.current)throw new Error('Ebeveyn bilgisi güvenle yüklenemedi.');
    const epoch=credentialEpoch.current,owner=profileRef.current,saved=settingsRef.current;
    const r = await checkPin(pin, saved.pin);
    return isAccepted(r)&&readyRef.current&&epoch===credentialEpoch.current&&owner===profileRef.current&&!isCatalogRestoreActive()&&settingsRef.current.pin===saved.pin;
  }, []);

  const setAdultHidden = useCallback(async (hidden: boolean) => { await persist(current => ({ ...current, adultHidden: hidden })); }, [persist]);

  const toggleCategoryLock = useCallback(async (category: string) => {
    await persist(current => ({ ...current, lockedCategories: current.lockedCategories.includes(category)
      ? current.lockedCategories.filter(c => c !== category) : [...current.lockedCategories, category] }));
    setUnlockedCategories(prev => prev.filter(c => c !== category));
  }, [persist]);

  const isCategoryLocked = useCallback(
    (category: string) => !readyRef.current || (settings.enabled && settings.lockedCategories.includes(category)),
    [settings]
  );

  const unlockCategoryForSession = useCallback((category: string) => {
    if(!readyRef.current||profileRef.current!==activeProfile.id || isCatalogRestoreActive())return;
    setUnlockedCategories(prev => prev.includes(category) ? prev : [...prev, category]);
  }, [activeProfile.id]);

  const isUnlockedInSession = useCallback(
    (category: string) => readyRef.current && unlockedCategories.includes(category),
    [unlockedCategories]
  );

  return (
    <ParentalContext.Provider value={{
      settings, unlockedCategories, isLoading, loadError, retryLoad,
      setPin, clearPin, verifyPin, verifyPinAsync, toggleCategoryLock, setAdultHidden, isCategoryLocked,
      unlockCategoryForSession, isUnlockedInSession,
    }}>
      {children}
    </ParentalContext.Provider>
  );
}

export function useParental(): ParentalContextValue {
  const ctx = useContext(ParentalContext);
  if (!ctx) throw new Error('useParental must be used within ParentalProvider');
  return ctx;
}
