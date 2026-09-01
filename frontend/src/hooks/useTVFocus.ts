import { useState, useCallback } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * useTVFocus — Returns focus state + handlers for TV D-pad / keyboard navigation.
 * Used on TouchableOpacity components to show a visible focus outline on Android TV / TV Box.
 */
export function useTVFocus() {
  const [isFocused, setIsFocused] = useState(false);
  const onFocus = useCallback(() => setIsFocused(true), []);
  const onBlur = useCallback(() => setIsFocused(false), []);
  return { isFocused, onFocus, onBlur };
}

/**
 * Style helper — Applies a red neon-ish focus outline when focused.
 */
/**
 * ODAK GÖSTERGESİ — KULLANICI DENEYİMİ ODAKLI TASARIM (v7.2.0)
 * ===========================================================================
 * TASARIM HEDEFİ: Kullanıcı 2-3 metre uzaktan, GÜNDÜZ aydınlık odada veya
 * GECE karanlıkta, arka planda HANGİ renk olursa olsun odağı ANINDA görsün.
 *
 * SORUN: Tek renk çerçeve yetersiz. Kırmızı çerçeve, kırmızı/parlak bir video
 * karesinin üstünde kayboluyor; koyu çerçeve karanlık arka planda kayboluyor.
 *
 * ÇÖZÜM — ÜÇ KATMANLI GÖRÜNÜRLÜK:
 *   1) KALIN MARKA ÇERÇEVESİ  : kimlik ve yön (4-5 px)
 *   2) KOYU DIŞ GÖLGE          : açık/parlak arka planlarda çerçeveyi ayırır
 *   3) AÇIK İÇ DOLGU           : koyu arka planlarda öğeyi öne çıkarır
 *   + BELİRGİN BÜYÜME          : hareket, gözü anında çeker
 *
 * Bu kombinasyon her arka planda çalışır: parlak zeminde koyu gölge,
 * karanlık zeminde açık dolgu ve parlama devreye girer.
 * ===========================================================================
 */
export function focusStyle(color: string, isFocused: boolean, radius = 12): StyleProp<ViewStyle> {
  if (!isFocused) return null;
  return {
    borderWidth: 4,
    borderColor: color,
    borderRadius: radius,
    // Koyu arka planlarda öğeyi öne çıkaran açık dolgu
    backgroundColor: color + "33",
    // Parlak arka planlarda çerçeveyi ayıran güçlü gölge/parlama
    shadowColor: color,
    shadowOpacity: 1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 24,
    transform: [{ scale: 1.1 }],
    zIndex: 50,
  };
}

/**
 * AFİŞ/POSTER ODAĞI — film ve dizi kapakları için.
 * Afişler büyük görseller olduğu için daha güçlü büyüme kullanılır;
 * "hangi afişteyim" sorusu bir bakışta yanıtlanır.
 */
export function posterFocusStyle(color: string, isFocused: boolean, radius = 12): StyleProp<ViewStyle> {
  if (!isFocused) return null;
  return {
    borderWidth: 5,
    borderColor: color,
    borderRadius: radius,
    shadowColor: color,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
    // v9.20.0: %18 büyüme komşu kartların üstüne taşıp iki odak varmış
    // hissi veriyordu. %7 yeterince görünür, grid geometrisini bozmaz.
    transform: [{ scale: 1.07 }],
    zIndex: 35,
  };
}

/**
 * SATIR ODAĞI — kanal listesi gibi tam genişlik satırlar için.
 * Satırlar zaten geniş olduğu için büyütmek taşmaya yol açar; onun yerine
 * SOL KENARDA kalın bir marka şeridi + dolgu kullanılır (Netflix/TiviMate deseni).
 */
export function rowFocusStyle(color: string, isFocused: boolean, radius = 12): StyleProp<ViewStyle> {
  if (!isFocused) return null;
  return {
    borderWidth: 3,
    borderColor: color,
    borderLeftWidth: 10,          // güçlü sol şerit: gözün yakaladığı ilk şey
    borderRadius: radius,
    backgroundColor: color + "2E",
    shadowColor: color,
    shadowOpacity: 0.95,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
    /**
     * v7.4.0: Büyütme KALDIRILDI.
     * Satırlar tam genişlik olduğu için %3 büyüme bile listenin altındaki
     * satırın ekran dışına taşmasına sebep oluyordu ("seçili kanalın yarısı
     * görünmüyor"). Görünürlük zaten sol şerit + dolgu + parlama ile
     * sağlanıyor; büyümeye gerek yok.
     */
    zIndex: 40,
  };
}
