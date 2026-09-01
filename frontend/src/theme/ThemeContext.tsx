import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { storage } from '@/src/utils/storage';
import { THEMES, ThemeName, ThemePalette } from './themes';
import { useProfiles } from '@/src/store/ProfileContext';

interface ThemeContextValue {
  themeName: ThemeName;
  colors: ThemePalette;
  setTheme: (name: ThemeName) => Promise<void>;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * TEMA ARTIK PROFİLE ÖZEL (v7.1.0)
 * ---------------------------------------------------------------------------
 * ESKİ DAVRANIŞ: Tema tek bir ortak anahtarda ('kizilkan.theme') saklanıyordu.
 * Bir profil temayı değiştirince TÜM profillerin teması değişiyordu.
 *
 * YENİ: Anahtar profil kimliğini içerir -> her profilin kendi teması olur.
 * Profil değişince o profilin teması otomatik yüklenir.
 *
 * ESKİ VERİ KORUNUR: Ortak anahtarda kayıtlı tema varsa ve profilin kendi
 * kaydı yoksa ondan devralınır — kullanıcı mevcut tercihini kaybetmez.
 */
const themeKey = (profileId: string) => `kizilkan.theme.${profileId}`;
const LEGACY_THEME_KEY = 'kizilkan.theme';
const DEFAULT_THEME: ThemeName = 'netflix';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { activeProfile } = useProfiles();
  const [themeName, setThemeName] = useState<ThemeName>(DEFAULT_THEME);
  const [isLoading, setIsLoading] = useState(true);

  // Yazma işlemleri HER ZAMAN güncel profili kullansın (bayat kapanış koruması).
  const profileIdRef = useRef<string>('default');
  profileIdRef.current = activeProfile?.id || 'default';

  // Profil değişince o profilin temasını yükle.
  useEffect(() => {
    let alive = true;
    (async () => {
      const pid = activeProfile?.id || 'default';
      let saved = await storage.getItem<string>(themeKey(pid), '');

      // Profilin kendi kaydı yoksa eski ortak tercihi devral (tek seferlik).
      if (!saved) {
        const legacy = await storage.getItem<string>(LEGACY_THEME_KEY, '');
        if (legacy && legacy in THEMES) {
          saved = legacy;
          await storage.setItem(themeKey(pid), legacy);
        }
      }

      if (!alive) return;
      setThemeName(saved && saved in THEMES ? (saved as ThemeName) : DEFAULT_THEME);
      setIsLoading(false);
    })();
    return () => { alive = false; };
  }, [activeProfile?.id]);

  const setTheme = useCallback(async (name: ThemeName) => {
    setThemeName(name);
    await storage.setItem(themeKey(profileIdRef.current), name);
  }, []);

  return (
    <ThemeContext.Provider value={{ themeName, colors: THEMES[themeName], setTheme, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
