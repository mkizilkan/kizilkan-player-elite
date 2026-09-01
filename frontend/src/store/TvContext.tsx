/**
 * KIZILKAN PLAYER — TV Modu Bağlamı
 * Dosya  : frontend/src/store/TvContext.tsx
 * Sürüm  : v1.0.0 (v5.2.0)
 *
 * TV modunu tüm ekranlara dağıtır. Ekranlar `useTv()` ile:
 *   - isTv           : TV düzenine geç (büyük yazı, kalın odak, overscan)
 *   - focusRing(f)   : odaklı öğe için hazır stil
 *   - overscan       : kenar boşluğu
 * bilgilerini alır.
 *
 * Mod "auto" ise cihaz otomatik algılanır; kullanıcı ayarlardan zorlayabilir
 * (bazı ucuz kutular kendini TV olarak bildirmiyor).
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef} from 'react';
import {
  resolveTvMode,
  loadTvModePref,
  saveTvMode,
  focusStyle,
  TV_OVERSCAN,
  TV_TEXT_SCALE,
  type TvMode,
} from "@/src/utils/tv";
import { useProfiles } from "@/src/store/ProfileContext";
import { storage } from "@/src/utils/storage";

/**
 * TV ANA EKRAN DÜZENİ TİPİ (v9.11.0 — KRİTİK DÜZELTME)
 * Bu tip kullanılıyordu ama HİÇBİR YERDE TANIMLI DEĞİLDİ. Ayrıca `storage`
 * bu dosyada kullanılıp import EDİLMEMİŞTİ → TvProvider çalışınca
 * "storage is not defined" hatası; TV düzeni kaydedilemiyor, uygulama
 * yeniden açılınca "columns" seçimi kaybolup "classic"e dönüyordu.
 */
export type TvLayout = "classic" | "columns";

/**
 * TV AYARLARI PROFİLE ÖZEL (v8.5.0)
 * Kullanıcının isteği: "Ahmet ile Mehmet farklı arayüz isteyebilir,
 * tema renginde olduğu gibi."
 * ESKİ VERİ KORUNUR: ortak anahtarda kayıt varsa tek seferlik devralınır.
 */
const layoutKey = (pid: string) => `kizilkan.tv.layout.${pid}`;
const previewKey = (pid: string) => `kizilkan.tv.preview.${pid}`;
const LEGACY_LAYOUT_KEY = "kizilkan.tv.layout";
const LEGACY_PREVIEW_KEY = "kizilkan.tv.preview";
/** Ortak TV ayarının hangi profile devredildiğini işaretler (bir kez). */
const TV_MIGRATED_KEY = "kizilkan.tv.migratedTo";

interface TvContextValue {
  /** TV düzeni aktif mi? */
  isTv: boolean;
  /** Kullanıcı tercihi (auto/on/off). */
  mode: TvMode;
  setMode: (m: TvMode) => Promise<void>;
  /** TV ana ekran düzeni: "classic" (mevcut) | "columns" (üç sütunlu) */
  tvLayout: TvLayout;
  setTvLayout: (l: TvLayout) => Promise<void>;
  /** Sütunlu düzende sağ panelde canlı önizleme oynatılsın mı? */
  tvPreview: boolean;
  setTvPreview: (v: boolean) => Promise<void>;
  /** Odaklı öğe için stil (TV değilse null döner). */
  focusRing: (focused: boolean, accent: string) => any;
  /** Kenar güvenli boşluk (TV'de > 0). */
  overscan: number;
  /** Yazı büyütme çarpanı (TV'de > 1). */
  textScale: number;
}

const TvContext = createContext<TvContextValue | null>(null);

export function TvProvider({ children }: { children: React.ReactNode }) {
  const { activeProfile } = useProfiles();
  // Yazma işlemleri her zaman GÜNCEL profili kullansın (bayat kapanış koruması)
  const profileIdRef = useRef<string>("default");
  profileIdRef.current = activeProfile?.id || "default";

  const [isTv, setIsTv] = useState(false);
  const [mode, setModeState] = useState<TvMode>("auto");
  /**
   * TV ARAYÜZ SEÇİMİ (v8.0.0)
   * "classic"  : mevcut tek sütunlu düzen (varsayılan — hiçbir şey değişmez)
   * "columns"  : kategoriler | kanallar | önizleme+bilgi (TiviMate tarzı)
   * Kullanıcı Ayarlar'dan seçer; telefon bu ayardan ETKİLENMEZ.
   */
  const [tvLayout, setTvLayoutState] = useState<TvLayout>("classic");
  const [tvPreview, setTvPreviewState] = useState(true);   // varsayılan AÇIK

  useEffect(() => {
    let alive = true;
    (async () => {
      const [resolved, pref] = await Promise.all([resolveTvMode(), loadTvModePref()]);
      if (!alive) return;
      setIsTv(resolved);
      setModeState(pref);
      const pid = activeProfile?.id || "default";

      let lay = await storage.getItem<string>(layoutKey(pid), "");
      if (!lay) {
        /**
         * DEVRALMA HATASI DÜZELTMESİ (v8.6.0)
         * ESKİ HATA: Ortak (LEGACY) anahtar SİLİNMİYORDU. Bu yüzden HER PROFİL
         * aynı eski değeri devralıyor ve profiller birbirini etkiliyormuş gibi
         * görünüyordu ("Ahmet'te sütunlu seçince Mehmet'te de sütunlu").
         * YENİ: Devralma YALNIZCA BİR KEZ; devralan profil işaretleniyor ve
         * ortak anahtar temizleniyor. Sonraki profiller VARSAYILAN başlar.
         */
        const migratedTo = await storage.getItem<string>(TV_MIGRATED_KEY, "");
        if (!migratedTo) {
          const legacy = await storage.getItem<string>(LEGACY_LAYOUT_KEY, "");
          if (legacy === "columns" || legacy === "classic") {
            lay = legacy;
            await storage.setItem(layoutKey(pid), legacy);
            await storage.setItem(TV_MIGRATED_KEY, pid);
            await storage.removeItem(LEGACY_LAYOUT_KEY);
          }
        }
      }
      setTvLayoutState(lay === "columns" ? "columns" : "classic");

      let prev = await storage.getItem<string>(previewKey(pid), "");
      if (!prev) {
        // Aynı tek-seferlik kural önizleme ayarı için de geçerli.
        const migratedTo = await storage.getItem<string>(TV_MIGRATED_KEY, "");
        if (!migratedTo || migratedTo === pid) {
          const legacyP = await storage.getItem<string>(LEGACY_PREVIEW_KEY, "");
          if (legacyP) {
            prev = legacyP;
            await storage.setItem(previewKey(pid), legacyP);
            await storage.removeItem(LEGACY_PREVIEW_KEY);
          }
        }
      }
      setTvPreviewState(prev !== "0");
    })();
    return () => { alive = false; };
    // PROFİL DEĞİŞİNCE o profilin TV ayarlarını yükle (v8.5.0)
  }, [activeProfile?.id]);

  const setMode = useCallback(async (m: TvMode) => {
    await saveTvMode(m);
    setModeState(m);
    setIsTv(await resolveTvMode());
  }, []);

  const setTvLayout = useCallback(async (l: TvLayout) => {
    setTvLayoutState(l);
    await storage.setItem(layoutKey(profileIdRef.current), l);
  }, []);

  const setTvPreview = useCallback(async (v: boolean) => {
    setTvPreviewState(v);
    await storage.setItem(previewKey(profileIdRef.current), v ? "1" : "0");
  }, []);

  const focusRing = useCallback(
    (focused: boolean, accent: string) => (isTv ? focusStyle(focused, accent) : null),
    [isTv]
  );

  const value = useMemo<TvContextValue>(
    () => ({
      isTv,
      mode,
      setMode,
      focusRing,
      overscan: isTv ? TV_OVERSCAN : 0,
      tvLayout, setTvLayout, tvPreview, setTvPreview,
      textScale: isTv ? TV_TEXT_SCALE : 1,
    }),
    /**
     * BAĞIMLILIK DÜZELTMESİ (v8.4.0) — KRİTİK
     * tvLayout ve tvPreview bu listede YOKTU. Bu yüzden kullanıcı Ayarlar'dan
     * "Sütunlu" seçtiğinde value nesnesi YENİLENMİYOR, tüm ekranlar ESKİ
     * değeri (classic) görmeye devam ediyordu.
     * Sütunlu arayüzün görünmemesinin İKİNCİ sebebi buydu.
     */
    [isTv, mode, setMode, focusRing, tvLayout, setTvLayout, tvPreview, setTvPreview]
  );

  return <TvContext.Provider value={value}>{children}</TvContext.Provider>;
}

export function useTv(): TvContextValue {
  const ctx = useContext(TvContext);
  // Sağlayıcı yoksa güvenli varsayılan (telefon davranışı).
  if (!ctx) {
    return {
      isTv: false,
      mode: "auto",
      setMode: async () => {},
      focusRing: () => null,
      overscan: 0,
      textScale: 1,
      // v8.4.0: yeni alanlar yedekte de bulunmalı; yoksa sağlayıcı
      // olmayan bir bağlamda tvLayout undefined olup çökmeye yol açar.
      tvLayout: "classic",
      setTvLayout: async () => {},
      tvPreview: true,
      setTvPreview: async () => {},
    };
  }
  return ctx;
}
