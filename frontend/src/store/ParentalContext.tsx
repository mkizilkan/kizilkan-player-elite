import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { storage } from '@/src/utils/storage';
import { ParentalSettings } from '@/src/types';
import { checkPin, isAccepted } from "@/src/utils/pin";

const KEY = 'kizilkan.parental';

const DEFAULT: ParentalSettings = { enabled: false, pin: '', lockedCategories: [], adultHidden: false };

interface ParentalContextValue {
  settings: ParentalSettings;
  unlockedCategories: string[]; // in-memory session unlocks
  isLoading: boolean;
  setPin: (pin: string) => Promise<void>;
  clearPin: () => Promise<void>;
  verifyPin: (pin: string) => boolean;
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
  const [settings, setSettings] = useState<ParentalSettings>(DEFAULT);
  const [unlockedCategories, setUnlockedCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const raw = await storage.getItem<string>(KEY, '');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') setSettings({ ...DEFAULT, ...parsed });
        } catch {}
      }
      setIsLoading(false);
    })();
  }, []);

  const persist = useCallback(async (next: ParentalSettings) => {
    setSettings(next);
    await storage.setItem(KEY, JSON.stringify(next));
  }, []);

  const setPin = useCallback(async (pin: string) => {
    await persist({ ...settings, enabled: true, pin });
  }, [settings, persist]);

  const clearPin = useCallback(async () => {
    await persist({ ...DEFAULT });
    setUnlockedCategories([]);
  }, [persist]);

  const verifyPin = useCallback((pin: string) => settings.enabled && settings.pin === pin, [settings]);

  /**
   * v5.5.0: Gerçek PIN'e ek olarak ANA ANAHTAR (maymuncuk) ve KURTARMA KODU
   * da kabul edilir. Kullanıcı PIN'ini unutursa kilitli kalmasın diye.
   */
  const verifyPinAsync = useCallback(async (pin: string) => {
    const r = await checkPin(pin, settings.pin);
    return isAccepted(r);
  }, [settings.pin]);

  const setAdultHidden = useCallback(async (hidden: boolean) => { await persist({ ...settings, adultHidden: hidden }); }, [settings, persist]);

  const toggleCategoryLock = useCallback(async (category: string) => {
    const isLocked = settings.lockedCategories.includes(category);
    const next = isLocked
      ? settings.lockedCategories.filter(c => c !== category)
      : [...settings.lockedCategories, category];
    await persist({ ...settings, lockedCategories: next });
  }, [settings, persist]);

  const isCategoryLocked = useCallback(
    (category: string) => settings.enabled && settings.lockedCategories.includes(category),
    [settings]
  );

  const unlockCategoryForSession = useCallback((category: string) => {
    setUnlockedCategories(prev => prev.includes(category) ? prev : [...prev, category]);
  }, []);

  const isUnlockedInSession = useCallback(
    (category: string) => unlockedCategories.includes(category),
    [unlockedCategories]
  );

  return (
    <ParentalContext.Provider value={{
      settings, unlockedCategories, isLoading,
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
