/**
 * KIZILKAN PLAYER — Evrensel Odaklanabilir Düğme
 * Dosya  : frontend/src/components/FocusButton.tsx
 * Sürüm  : v1.0.0 (v6.4.0)
 *
 * ===========================================================================
 * NEDEN VAR?
 * ===========================================================================
 * TV Box'ta kumandayla gezerken kullanıcının NEREDE olduğu belli olmuyordu.
 * Sebep: odak göstergesi yalnızca liste bileşenlerine (kanal satırı, afiş
 * ızgarası) eklenmişti; liste ekleme, ayarlar, arama, detay gibi EKRANLARIN
 * kendi düğmeleri kapsam dışındaydı.
 *
 * Bu bileşen TouchableOpacity ile AYNI API'ye sahiptir; tek farkı odaklanınca
 * belirgin bir çerçeve + parlama + büyüme uygulamasıdır. Böylece bir ekranı
 * TV uyumlu yapmak için sadece TouchableOpacity -> FocusButton değişimi yeter.
 *
 * Telefonda görünüm DEĞİŞMEZ (odak olayları sadece TV'de tetiklenir).
 * ===========================================================================
 */

import React from "react";
import { TouchableOpacity, type TouchableOpacityProps } from "react-native";
import { useTheme } from "@/src/theme/ThemeContext";
import { useTVFocus, focusStyle } from "@/src/hooks/useTVFocus";
import { useTvFocusMemory } from "@/src/store/TvFocusMemoryContext";

export interface FocusButtonProps extends TouchableOpacityProps {
  /** Odak çerçevesinin köşe yuvarlaklığı (öğenin kendi radius'una uysun). */
  focusRadius?: number;
  /** Bu düğme ekran açılınca otomatik odakta olsun mu? */
  autoFocus?: boolean;
  /** TV focus restore için stable identity. Verilmezse string testID kullanılır. */
  focusKey?: string;
  /** Player/modal gibi ayrı bir focus scope gerekirse. */
  focusScope?: string;
}

export const FocusButton = React.forwardRef<React.ElementRef<typeof TouchableOpacity>, FocusButtonProps>(function FocusButton({
  style,
  children,
  focusRadius = 12,
  autoFocus,
  focusKey,
  focusScope,
  focusable = true,
  hasTVPreferredFocus,
  onFocus,
  onBlur,
  ...rest
}: FocusButtonProps, ref) {
  const { colors } = useTheme();
  const { isFocused, onFocus: markFocused, onBlur: markBlurred } = useTVFocus();
  const focusMemory = useTvFocusMemory(focusScope);
  const stableFocusKey = focusKey || (typeof rest.testID === "string" ? rest.testID : undefined);
  const memoryBinding = focusMemory.bind(stableFocusKey);

  return (
    <TouchableOpacity
      ref={ref}
      {...rest}
      // v9.20.0: Caller focusable={false} diyorsa artık zorla true yapılmaz.
      focusable={focusable}
      // v9.20.0: Dışarıdan verilen native preferred-focus değerini ezme.
      // autoFocus yalnız açıkça verilmişse önceliklidir.
      hasTVPreferredFocus={autoFocus ?? hasTVPreferredFocus ?? memoryBinding.hasTVPreferredFocus}
      onFocus={(e) => { markFocused(); memoryBinding.rememberFocus(); onFocus?.(e); }}
      onBlur={(e) => { markBlurred(); onBlur?.(e); }}
      style={[style, focusStyle(colors.brandPrimary, isFocused, focusRadius)]}
    >
      {children}
    </TouchableOpacity>
  );
});

FocusButton.displayName = "FocusButton";

export default FocusButton;
