/**
 * KIZILKAN PLAYER — Google Cast platform facade (TypeScript + non-Metro fallback)
 * v15.0.2 BUILD FIX
 *
 * Metro native'de cast.native.ts, web'de cast.web.ts dosyasını seçer. Bu dosya
 * `tsc --noEmit` için suffix'siz çözümleme hedefidir ve native paketi require
 * etmez; böylece web/static type-check zincirine native modül sızmaz.
 */
export const GoogleCast: any = null;
export const NativeCastButton: any = null;
