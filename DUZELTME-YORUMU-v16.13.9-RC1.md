# KIZILKAN PLAYER v16.13.9 RC1 — CI düzeltme yorumu

GitHub Actions v16.13.8 denetimi üç bağımsız uyumluluk hatası gösterdi:
1. Eski VM fixture'ları v16.13.8 ile eklenen `@/modules/kizilkan-native-core` importunu mock etmediği için MODULE_NOT_FOUND ile kırılıyordu.
2. `ReqOptions` tipine `postForm` eklenmeden alan okunmuştu; gerçek TypeScript gate TS2339 verdi.
3. v16.13.7 koruma gate'i sürümü tam `16.13.7` olarak kilitlemişti ve v16.13.8'i yanlış reddediyordu.

Düzeltmeler: altı eski fixture'a native bridge için `available:false` güvenli mock eklendi; `ReqOptions.postForm?: boolean` tanımlandı; v16.13.7 gate'i sonraki 16.13.x sürümlerini koruma denetimi olarak kabul edecek şekilde ileri uyumlu yapıldı. v16.13.8 Native MAG Exact Wire davranışı ve fallback'ler kaldırılmadı.
