import React, { createContext, useContext, useEffect, useState, useCallback, useRef} from 'react';
import { storage } from '@/src/utils/storage';
import { Profile } from '@/src/types';
import { checkPin, isAccepted } from "@/src/utils/pin";

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
  addProfile: (name: string, color?: string, isKids?: boolean, pin?: string | null) => Promise<Profile>;
  updateProfile: (id: string, patch: Partial<Profile>) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
  switchProfile: (id: string) => Promise<void>;
  setPin: (id: string, pin: string | null) => Promise<void>;
  verifyPin: (id: string, pin: string) => boolean;
  /** Ana anahtar + kurtarma kodu destekli doğrulama (v5.5.0). */
  verifyPinAsync: (id: string, pin: string) => Promise<boolean>;
  /** Yönetici PIN doğrulaması (profil ekleme/silme için). */
  verifyAdminPin: (pin: string) => Promise<boolean>;
  /** Yönetici koruması aktif mi (yöneticinin PIN'i var mı)? */
  adminHasPin: () => boolean;
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [raw, aid] = await Promise.all([
        storage.getItem<string>(PROFILES_KEY, ''),
        storage.getItem<string>(ACTIVE_KEY, 'default'),
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
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
        } catch {}
      }
      // GERİYE DÖNÜK UYUM (v6.1.0): eski profillerde isAdmin yok. Hiç yönetici
      // yoksa ilk profili yönetici yap ki ekleme/silme koruması işlesin.
      if (list.length > 0 && !list.some(p => p.isAdmin)) {
        list = list.map((p, i) => (i === 0 ? { ...p, isAdmin: true } : p));
        storage.setItem(PROFILES_KEY, JSON.stringify(list)).catch(() => {});
      }
      profilesRef.current = list;   // ilk yüklemede de ref dolsun
      setProfiles(list);
      if (aid && list.some(p => p.id === aid)) setActiveId(aid);
      setIsLoading(false);
    })();
  }, []);

  const persist = useCallback(async (next: Profile[]) => {
    profilesRef.current = next;   // ref her zaman güncel kalsın
    setProfiles(next);
    await storage.setItem(PROFILES_KEY, JSON.stringify(next));
  }, []);

  /**
   * v5.7.0 — PIN artık BURADA, profil oluşturulurken atanıyor (atomik).
   * ESKİ HATA: addProfile'dan sonra ayrıca setPin çağrılıyordu; setPin ise
   * kendi kapanışındaki (closure) ESKİ profiles dizisini kullandığı için yeni
   * profili bulamıyor ve ESKİ listeyi geri yazıyordu -> yeni profil siliniyor,
   * ekran donuyordu. Tek işlemde yaparak bu sınıf hatayı tamamen kapatıyoruz.
   */
  const addProfile = useCallback(async (name: string, color?: string, isKids?: boolean, pin?: string | null): Promise<Profile> => {
    const base = profilesRef.current.length ? profilesRef.current : profiles;
    const idx = base.length;
    const p: Profile = {
      id: `p-${Date.now()}`,
      name: name.trim() || `Profil ${idx + 1}`,
      color: color || AVATAR_COLORS[idx % AVATAR_COLORS.length],
      hasPin: !!pin,
      pin: pin || undefined,
      isKids: !!isKids,
      // v6.1.0: İLK profil YÖNETİCİ olur. Profil ekleme/silme onun PIN'iyle.
      isAdmin: base.length === 0,
    };
    await persist([...base, p]);
    // v6.0.0: İLK profil oluşturulduğunda onu AKTİF yap. Aksi halde activeId
    // null kalıyor, activeProfile 'default'a düşüyor ve ilk kurulumda eklenen
    // liste yanlış profile (default) kaydediliyordu.
    if (base.length === 0) {
      setActiveId(p.id);
      await storage.setItem(ACTIVE_KEY, p.id);
    }
    return p;
  }, [profiles, persist]);

  const updateProfile = useCallback(async (id: string, patch: Partial<Profile>) => {
    const list = profilesRef.current.length ? profilesRef.current : profiles;
    const next = list.map(p => (p.id === id ? { ...p, ...patch } : p));
    await persist(next);
  }, [profiles, persist]);

  const removeProfile = useCallback(async (id: string) => {
    const list = profilesRef.current.length ? profilesRef.current : profiles;
    if (list.length <= 1) return;                    // En az bir profil kalmalı
    const target = list.find(p => p.id === id);
    if (target?.isAdmin) return;                     // Yönetici silinemez

    const next = list.filter(p => p.id !== id);
    await persist(next);

    /**
     * VERİ TEMİZLİĞİ (v6.3.0)
     * Profil silinince ona ait veriler diskte KALIYORDU (liste bilgileri,
     * favoriler, son izlenenler). Hem yer kaplıyor hem de aynı kimlik tekrar
     * üretilirse eski veri karışabilir. Artık temizleniyor.
     */
    try {
      await Promise.all([
        storage.removeItem(`kizilkan.playlists.meta.${id}`),
        storage.removeItem(`kizilkan.activePlaylistId.${id}`),
        storage.removeItem(`kizilkan.favorites.${id}`),
        storage.removeItem(`kizilkan.recent.${id}`),
      ]);
    } catch { /* temizlik başarısız olsa da profil silindi */ }

    if (activeId === id) {
      const newActive = next[0].id;
      setActiveId(newActive);
      await storage.setItem(ACTIVE_KEY, newActive);
    }
  }, [profiles, persist, activeId]);

  const switchProfile = useCallback(async (id: string) => {
    // REF kullanıyoruz: yeni eklenen profil de anında görünür.
    const list = profilesRef.current.length ? profilesRef.current : profiles;
    if (!list.some(p => p.id === id)) return;
    setActiveId(id);
    await storage.setItem(ACTIVE_KEY, id);
  }, [profiles]);

  const setPin = useCallback(async (id: string, pin: string | null) => {
    // GÜVENLİK: profil listede yoksa HİÇBİR ŞEY YAZMA. (Eskiden eski liste geri
    // yazılıyor ve yeni eklenen profil siliniyordu.)
    const list = profilesRef.current.length ? profilesRef.current : profiles;
    const exists = list.some(p => p.id === id);
    if (!exists) return;
    const next = list.map(p => (p.id === id ? { ...p, hasPin: !!pin, pin: pin || undefined } : p));
    await persist(next);
  }, [profiles, persist]);

  const verifyPin = useCallback((id: string, pin: string) => {
    const list = profilesRef.current.length ? profilesRef.current : profiles;
    const p = list.find(x => x.id === id);
    return !!p && !!p.hasPin && p.pin === pin;
  }, [profiles]);

  /**
   * v5.5.0: Profil PIN'i unutulursa kilitli kalmasın diye ANA ANAHTAR ve
   * KURTARMA KODU da kabul edilir.
   */
  const verifyPinAsync = useCallback(async (id: string, pin: string) => {
    const list = profilesRef.current.length ? profilesRef.current : profiles;
    const p = list.find(x => x.id === id);
    const r = await checkPin(pin, p?.pin);
    return isAccepted(r);
  }, [profiles]);

  /**
   * YÖNETİCİ DOĞRULAMASI (v6.1.0) — profil ekleme/silme için.
   * Yönetici profilin PIN'i (veya ana anahtar / kurtarma kodu) doğruysa true.
   * Yöneticinin PIN'i yoksa koruma uygulanmaz (serbest).
   */
  const verifyAdminPin = useCallback(async (pin: string) => {
    const list = profilesRef.current.length ? profilesRef.current : profiles;
    const admin = list.find(p => p.isAdmin) || list[0];
    if (!admin || !admin.hasPin) return true;
    const r = await checkPin(pin, admin.pin);
    return isAccepted(r);
  }, [profiles]);

  /** Yönetici profilin PIN'i var mı (koruma aktif mi)? */
  const adminHasPin = useCallback(() => {
    const list = profilesRef.current.length ? profilesRef.current : profiles;
    const admin = list.find(p => p.isAdmin) || list[0];
    return !!admin?.hasPin;
  }, [profiles]);

  const activeProfile = profiles.find(p => p.id === activeId) || profiles[0] || DEFAULT_PROFILE;

  return (
    <ProfileContext.Provider value={{
      profiles, activeProfile, isLoading,
      addProfile, updateProfile, removeProfile, switchProfile, setPin, verifyPin, verifyPinAsync, verifyAdminPin, adminHasPin,
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
