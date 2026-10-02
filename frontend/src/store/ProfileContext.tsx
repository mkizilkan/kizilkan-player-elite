import React, { createContext, useContext, useEffect, useState, useCallback, useRef} from 'react';
import { storage } from '@/src/utils/storage';
import { Profile } from '@/src/types';
import { checkPin, isAccepted } from "@/src/utils/pin";
import { bigStore } from '@/src/utils/storage/bigStore';
import { recordDiagnostic } from '@/src/utils/diagnostics';
import { subscribeProfileDataReload, registerProfileDataDrain } from '@/src/utils/profileDataReload';
import { isCatalogRestoreActive } from '@/src/utils/catalogOperations';
import { protectPin, matchesPin } from '@/src/utils/pinProtection';

const PROFILES_KEY = 'kizilkan.profiles';
const ACTIVE_KEY = 'kizilkan.activeProfileId';

const DEFAULT_PROFILE: Profile = {
  id: 'default',
  name: 'Ben',
  color: '#E50914',
  hasPin: false,
};

const AVATAR_COLORS = ['#E50914', '#FF7A00', '#00C853', '#0A84FF', '#AB47BC', '#EF5350', '#26A69A', '#FFCA28'];

interface ProfileContextValue {
  profiles: Profile[];
  activeProfile: Profile;
  isLoading: boolean;
  loadError: string | null;
  retryLoad: () => void;
  addProfile: (name: string, color?: string, isKids?: boolean, pin?: string | null) => Promise<Profile>;
  updateProfile: (id: string, patch: Partial<Profile>) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
  switchProfile: (id: string) => Promise<void>;
  setPin: (id: string, pin: string | null) => Promise<void>;
  verifyPin: (id: string, pin: string) => Promise<boolean>;
  /** Ana anahtar + kurtarma kodu destekli doğrulama (v5.5.0). */
  verifyPinAsync: (id: string, pin: string) => Promise<boolean>;
  /** Yönetici PIN doğrulaması (profil ekleme/silme için). */
  verifyAdminPin: (pin: string) => Promise<boolean>;
  /** Yönetici koruması aktif mi (yöneticinin PIN'i var mı)? */
  adminHasPin: () => boolean;
  /** Process-ömürlü profil yetkisi; diske yazılmaz. PIN koruması process restart ile yeniden istenir. */
  sessionAuthorizedProfileId: string | null;
  authorizeProfileSession: (id: string) => void;
  clearProfileSession: () => void;
  isProfileSessionAuthorized: (id: string) => boolean;
  /**
   * v17.10.3 — Her başarılı profil girişinde (seçim + gerekiyorsa PIN) artan
   * sayaç. "Açılışta son kanal" yalnız bu sayaç ilerlediğinde ve yalnız
   * girilen profilin kendi ayarı/kanalıyla tetiklenir. Aynı profile ikinci kez
   * girilince (A → B → A) kimlik değişmediği için sayaç şarttır.
   */
  profileEntrySeq: number;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  /**
   * BAYAT KAPANIŞ (stale closure) KORUMASI — v5.9.0
   * addProfile'dan hemen sonra switchProfile/setPin çağrıldığında, bu
   * fonksiyonların kapanışındaki `profiles` dizisi HENÜZ YENİ PROFİLİ
   * İÇERMİYORDU. Sonuç: switchProfile sessizce geri dönüyor (profil
   * değişmiyor -> listeler karışıyor, ekran donuyor).
   * Çözüm: her zaman güncel listeyi tutan bir ref.
   */
  const profilesRef = useRef<Profile[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([DEFAULT_PROFILE]);
  const [activeId, setActiveId] = useState<string>('default');
  const activeIdRef = useRef(activeId); activeIdRef.current = activeId;
  const [isLoading, setIsLoading] = useState(true);
  const [loadError,setLoadError]=useState<string|null>(null);
  const readyRef=useRef(false);
  const credentialEpoch=useRef(0);
  const [sessionAuthorizedProfileId, setSessionAuthorizedProfileId] = useState<string | null>(null);
  const [profileEntrySeq, setProfileEntrySeq] = useState(0);
  const [reloadRevision, setReloadRevision] = useState(0);
  const operationQueue = useRef<Promise<unknown>>(Promise.resolve());
  const loadQueue=useRef<Promise<unknown>>(Promise.resolve());
  useEffect(()=>registerProfileDataDrain(()=>Promise.allSettled([operationQueue.current,loadQueue.current])),[]);
  const selectionSeq = useRef(0);
  const retryLoad=useCallback(()=>{credentialEpoch.current++;readyRef.current=false;setSessionAuthorizedProfileId(null);setReloadRevision(v=>v+1);},[]);
  useEffect(() => subscribeProfileDataReload(retryLoad), [retryLoad]);
  const serialize = useCallback(<T,>(work: () => Promise<T>, duringLoad=false): Promise<T> => {
    if(isCatalogRestoreActive())return Promise.reject(new Error('Yedek yüklenirken profil değiştirilemez.'));
    if(!duringLoad&&!readyRef.current)return Promise.reject(new Error('Profil bilgisi güvenle yüklenemedi; değişiklik yapılmadı.'));
    const task = operationQueue.current.catch(() => undefined).then(work);
    operationQueue.current = task.then(() => undefined, () => undefined);
    return task;
  }, []);

  useEffect(() => {
    let cancelled = false;
    readyRef.current=false;
    credentialEpoch.current++;
    setIsLoading(true);
    setLoadError(null);
    loadQueue.current=(async () => {
      await operationQueue.current;
      const [raw, aid] = await Promise.all([
        storage.getItemStrict<string>(PROFILES_KEY, ''),
        storage.getItemStrict<string>(ACTIVE_KEY, 'default'),
      ]);
      /**
       * v6.0.0 — İLK AÇILIŞ DÜZELTMESİ (kök sebep)
       * ESKİ: kayıt yoksa otomatik [DEFAULT_PROFILE] yükleniyordu; bu yüzden
       *       profiles.length asla 0 olmuyor, karşılama sihirbazı hiç görünmüyor
       *       ve kullanıcı doğrudan boş "liste ekle" ekranına düşüyordu.
       * YENİ: kayıt yoksa BOŞ liste. Yönlendirici bunu görüp /welcome açar.
       *       (activeProfile zaten "|| DEFAULT_PROFILE" ile korunuyor; boş liste
       *        aşağıdaki türetmede çökme yaratmaz.)
       */
      let list: Profile[] = [];
      if (raw) {
        let parsed:unknown;try {parsed=JSON.parse(raw);}catch{throw new Error('Profil kaydı bozuk; mevcut kayıt korunuyor.');}
        if(!Array.isArray(parsed)||parsed.some(p=>!p||typeof p!=='object'||Array.isArray(p)||typeof p.id!=='string'||!p.id||typeof p.name!=='string'||(p.pin!==undefined&&p.pin!==null&&typeof p.pin!=='string'))||new Set(parsed.map(p=>p.id)).size!==parsed.length)throw new Error('Profil kaydının biçimi geçersiz; mevcut kayıt korunuyor.');
        list=parsed;
      }
      // GERİYE DÖNÜK UYUM (v6.1.0): eski profillerde isAdmin yok. Hiç yönetici
      const protectedList=await Promise.all(list.map(async p=>p.pin?{...p,pin:await protectPin(p.pin)}:p));
      const pinsChanged=protectedList.some((p,i)=>p.pin!==list[i].pin);list=protectedList;
      // yoksa ilk profili yönetici yap ki ekleme/silme koruması işlesin.
      const needsAdmin=list.length>0&&!list.some(p=>p.isAdmin);
      if (needsAdmin || pinsChanged) {
        if(needsAdmin)list = list.map((p, i) => (i === 0 ? { ...p, isAdmin: true } : p));
        if (cancelled || isCatalogRestoreActive()) return;
        await serialize(async()=>{
          if(cancelled)return;
          if (!(await storage.setItem(PROFILES_KEY, JSON.stringify(list)))) throw new Error('Eski profil yönetici bilgisi kaydedilemedi.');
        },true);
      }
      if (cancelled) return;
      profilesRef.current = list;   // ilk yüklemede de ref dolsun
      readyRef.current=true;
      setProfiles(list);
      if (aid && list.some(p => p.id === aid)) setActiveId(aid);
      setIsLoading(false);
    })().catch((e:any)=>{ if(!cancelled){readyRef.current=false;setLoadError(String(e?.message||e));setSessionAuthorizedProfileId(null);setIsLoading(false);void recordDiagnostic('database','PROFILE_LOAD_FAILED',{message:String(e?.message||e)});} });
    return () => { cancelled = true; };
  }, [reloadRevision]);

  const persist = useCallback(async (next: Profile[], nextActive?: string) => {
    credentialEpoch.current++;
    next=await Promise.all(next.map(async p=>p.pin?{...p,pin:await protectPin(p.pin)}:p));
    const previousActive = nextActive ? await storage.getItemStrict<string>(ACTIVE_KEY, '') : '';
    if (nextActive && !(await storage.setItem(ACTIVE_KEY, nextActive))) throw new Error('Aktif profil kaydedilemedi.');
    if (!(await storage.setItem(PROFILES_KEY, JSON.stringify(next)))) {
      if(nextActive){const restored=previousActive?await storage.setItem(ACTIVE_KEY,previousActive):await storage.removeItem(ACTIVE_KEY);if(!restored)throw new Error('Profil bilgisi kaydedilemedi; aktif seçim de geri alınamadı.');}
      throw new Error('Profil bilgisi kaydedilemedi.');
    }
    profilesRef.current = next;   // ref her zaman güncel kalsın
    setProfiles(next);
    if(nextActive){activeIdRef.current=nextActive;setActiveId(nextActive);setSessionAuthorizedProfileId(null);}
  }, []);

  /**
   * v5.7.0 — PIN artık BURADA, profil oluşturulurken atanıyor (atomik).
   * ESKİ HATA: addProfile'dan sonra ayrıca setPin çağrılıyordu; setPin ise
   * kendi kapanışındaki (closure) ESKİ profiles dizisini kullandığı için yeni
   * profili bulamıyor ve ESKİ listeyi geri yazıyordu -> yeni profil siliniyor,
   * ekran donuyordu. Tek işlemde yaparak bu sınıf hatayı tamamen kapatıyoruz.
   */
  const addProfile = useCallback(async (name: string, color?: string, isKids?: boolean, pin?: string | null): Promise<Profile> => serialize(async () => {
    const base = profilesRef.current.length ? profilesRef.current : profiles;
    const idx = base.length;
    const p: Profile = {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || `Profil ${idx + 1}`,
      color: color || AVATAR_COLORS[idx % AVATAR_COLORS.length],
      hasPin: !!pin,
      pin: pin || undefined,
      isKids: !!isKids,
      // v6.1.0: İLK profil YÖNETİCİ olur. Profil ekleme/silme onun PIN'iyle.
      isAdmin: base.length === 0,
    };
    await persist([...base, p], base.length === 0 ? p.id : undefined);
    // v6.0.0: İLK profil oluşturulduğunda onu AKTİF yap. Aksi halde activeId
    // null kalıyor, activeProfile 'default'a düşüyor ve ilk kurulumda eklenen
    // liste yanlış profile (default) kaydediliyordu.
    return p;
  }), [profiles, persist, serialize]);

  const updateProfile = useCallback(async (id: string, patch: Partial<Profile>) => serialize(async () => {
    const list = profilesRef.current.length ? profilesRef.current : profiles;
    const next = list.map(p => (p.id === id ? { ...p, ...patch } : p));
    await persist(next);
  }), [profiles, persist, serialize]);

  const removeProfile = useCallback(async (id: string) => serialize(async () => {
    const list = profilesRef.current.length ? profilesRef.current : profiles;
    if (list.length <= 1) return;                    // En az bir profil kalmalı
    const target = list.find(p => p.id === id);
    if (target?.isAdmin) return;                     // Yönetici silinemez

    const rawMeta = await storage.getItemStrict<string>(`kizilkan.playlists.meta.${id}`, '');
    const ownIds = new Set<string>();
    try { for (const pl of JSON.parse(rawMeta || '[]')) if (pl?.id) ownIds.add(String(pl.id)); } catch { throw new Error('Profil listeleri okunamadı; güvenli silme durduruldu.'); }
    for (const other of list.filter(p => p.id !== id)) {
      const raw = await storage.getItemStrict<string>(`kizilkan.playlists.meta.${other.id}`, '');
      try { for (const pl of JSON.parse(raw || '[]')) ownIds.delete(String(pl?.id || '')); } catch { throw new Error('Diğer profil katalog sahipliği doğrulanamadı.'); }
    }
    const next = list.filter(p => p.id !== id);
    await persist(next, activeIdRef.current === id ? next[0].id : undefined);

    /**
     * VERİ TEMİZLİĞİ (v6.3.0)
     * Profil silinince ona ait veriler diskte KALIYORDU (liste bilgileri,
     * favoriler, son izlenenler). Hem yer kaplıyor hem de aynı kimlik tekrar
     * üretilirse eski veri karışabilir. Artık temizleniyor.
     */
    try {
      const prefixes = ['playlists.meta.', 'activePlaylistId.', 'favorites.', 'recent.', 'progress.', 'watchlist.', 'searchHistory.', 'hiddenItems.', 'hiddenGroups.', 'watched.', 'seriesLast.', 'libraryLegacyOwner.', 'firstListAdded.', 'player.startLast.', 'player.autoNext.'];
      const removed = await Promise.all(prefixes.map(prefix => storage.removeItem(`kizilkan.${prefix}${id}`)));
      if (removed.some(ok => !ok)) throw new Error('Bazı kişisel kayıtlar temizlenemedi.');
      for (const playlistId of ownIds) if (!(await bigStore.remove(playlistId))) throw new Error('Sahipsiz katalog temizlenemedi.');
    } catch (e: any) { void recordDiagnostic('database', 'PROFILE_CLEANUP_PARTIAL', { message: String(e?.message || e) }); }

  }), [profiles, persist, activeId, serialize]);

  const switchProfile = useCallback(async (id: string) => {
    const sequence = ++selectionSeq.current;
    return serialize(async () => {
    // REF kullanıyoruz: yeni eklenen profil de anında görünür.
    const list = profilesRef.current.length ? profilesRef.current : profiles;
    if (!list.some(p => p.id === id)) throw new Error('Profil bulunamadı.');
    if (!(await storage.setItem(ACTIVE_KEY, id))) throw new Error('Profil seçimi kaydedilemedi.');
    if (sequence !== selectionSeq.current) throw new Error('Profil seçimi daha yeni bir istekle değişti.');
    activeIdRef.current=id;
    setActiveId(id);
    setSessionAuthorizedProfileId(null);
    });
  }, [profiles, serialize]);

  const setPin = useCallback(async (id: string, pin: string | null) => serialize(async () => {
    // GÜVENLİK: profil listede yoksa HİÇBİR ŞEY YAZMA. (Eskiden eski liste geri
    // yazılıyor ve yeni eklenen profil siliniyordu.)
    const list = profilesRef.current.length ? profilesRef.current : profiles;
    const exists = list.some(p => p.id === id);
    if (!exists) return;
    const next = list.map(p => (p.id === id ? { ...p, hasPin: !!pin, pin: pin || undefined } : p));
    await persist(next);
  }), [profiles, persist, serialize]);

  const verifyPin = useCallback(async (id: string, pin: string) => {
    if(!readyRef.current)throw new Error('Profil bilgisi güvenle yüklenemedi.');
    const list = profilesRef.current.length ? profilesRef.current : profiles;
    const p = list.find(x => x.id === id);
    const epoch=credentialEpoch.current,owner=activeIdRef.current;
    const accepted=!!p&&!!p.hasPin&&await matchesPin(pin,p.pin);
    const current=profilesRef.current.find(x=>x.id===id);
    return accepted&&readyRef.current&&epoch===credentialEpoch.current&&owner===activeIdRef.current&&!isCatalogRestoreActive()&&current?.pin===p?.pin&&current?.hasPin===p?.hasPin;
  }, [profiles]);

  /**
   * v5.5.0: Profil PIN'i unutulursa kilitli kalmasın diye ANA ANAHTAR ve
   * KURTARMA KODU da kabul edilir.
   */
  const verifyPinAsync = useCallback(async (id: string, pin: string) => {
    if(!readyRef.current)throw new Error('Profil bilgisi güvenle yüklenemedi.');
    const list = profilesRef.current.length ? profilesRef.current : profiles;
    const p = list.find(x => x.id === id);
    if (!p) return false;
    const epoch=credentialEpoch.current,owner=activeIdRef.current;
    const r = await checkPin(pin, p?.pin);
    const current=profilesRef.current.find(x=>x.id===id);
    return isAccepted(r)&&readyRef.current&&epoch===credentialEpoch.current&&owner===activeIdRef.current&&!isCatalogRestoreActive()&&current?.pin===p.pin&&current?.hasPin===p.hasPin;
  }, [profiles]);

  /**
   * YÖNETİCİ DOĞRULAMASI (v6.1.0) — profil ekleme/silme için.
   * Yönetici profilin PIN'i (veya ana anahtar / kurtarma kodu) doğruysa true.
   * Yöneticinin PIN'i yoksa koruma uygulanmaz (serbest).
   */
  const verifyAdminPin = useCallback(async (pin: string) => {
    if(!readyRef.current)throw new Error('Profil bilgisi güvenle yüklenemedi.');
    const list = profilesRef.current.length ? profilesRef.current : profiles;
    const admin = list.find(p => p.isAdmin) || list[0];
    if (!admin || !admin.hasPin) return true;
    const epoch=credentialEpoch.current,owner=activeIdRef.current;
    const r = await checkPin(pin, admin.pin);
    const current=profilesRef.current.find(p=>p.isAdmin)||profilesRef.current[0];
    return isAccepted(r)&&readyRef.current&&epoch===credentialEpoch.current&&owner===activeIdRef.current&&!isCatalogRestoreActive()&&current?.id===admin.id&&current?.pin===admin.pin&&current?.hasPin===admin.hasPin;
  }, [profiles]);

  /** Yönetici profilin PIN'i var mı (koruma aktif mi)? */
  const adminHasPin = useCallback(() => {
    if(!readyRef.current)return true;
    const list = profilesRef.current.length ? profilesRef.current : profiles;
    const admin = list.find(p => p.isAdmin) || list[0];
    return !!admin?.hasPin;
  }, [profiles]);

  const authorizeProfileSession = useCallback((id: string) => {
    if(!readyRef.current||isCatalogRestoreActive())return;
    const list = profilesRef.current.length ? profilesRef.current : profiles;
    if (list.some(p => p.id === id)) {
      setSessionAuthorizedProfileId(id);
      setProfileEntrySeq(n => n + 1);
    }
  }, [profiles]);

  const clearProfileSession = useCallback(() => setSessionAuthorizedProfileId(null), []);
  const isProfileSessionAuthorized = useCallback((id: string) => readyRef.current && sessionAuthorizedProfileId === id && !isCatalogRestoreActive(), [sessionAuthorizedProfileId]);

  const activeProfile = profiles.find(p => p.id === activeId) || profiles[0] || DEFAULT_PROFILE;

  return (
    <ProfileContext.Provider value={{
      profiles, activeProfile, isLoading, loadError, retryLoad,
      addProfile, updateProfile, removeProfile, switchProfile, setPin, verifyPin, verifyPinAsync, verifyAdminPin, adminHasPin,
      sessionAuthorizedProfileId, authorizeProfileSession, clearProfileSession, isProfileSessionAuthorized, profileEntrySeq,
    }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfiles(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfiles must be used within ProfileProvider');
  return ctx;
}

export const PROFILE_AVATAR_COLORS = AVATAR_COLORS;
