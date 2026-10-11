# AI DEVİR — v18.7.21 RC1 (dal `v18.7.21-rc1-addtime-user-xtparallel-m3u`)

**Tarih:** 2026-10-06 · **Taban:** v18.7.20 · **Yazan:** Claude Opus
**Kaynak:** Kullanıcı istekleri (A/B/C/D). "Tamamını yap" + "D'yi de 18.7.21'e al".

## Yapılanlar (A+B+C+D)
| Kod | Ne | Dosya |
|---|---|---|
| **A** | **Ekleme anında kullanıcı adı/şifre** (oynatmaya gerek yok — MAG Converter yöntemi). `stalkerPrimeStreamCredentials` ilk canlı kanalın create_link'ini çözer, U4 çıkarma+kalıcılaştırma devreye girer. Tekli (`add-playlist`) + çoklu (`mag-bulk`) eklemede çağrılır (en-iyi-çaba; başarısızsa ekleme sürer). Yayın sunucusu (`server=origin`) da depolanır (C için). | `stalker.ts`, `add-playlist.tsx`, `mag-bulk.tsx` |
| **B** | **Xtream combo özel paralellik girişi** (1–250, girilen=çalışan; boş→mod). `scanConfigForSpeed` kullanıcı değerini `requestedConcurrency`'e uygular. | `add-playlist.tsx` |
| **C** | Hesap kartında **Xtream M3U (get.php) linki** üret (kullanıcı adı+şifre+yayın sunucusu), kopyala butonu, **"Görüntü testi"** (`player_api.php get_live_streams` → kanal dönerse "Görüntü var · N kanal", yoksa "Görüntü yok"). | `settings.tsx` |
| **D** | **Genel "canlı tut" ön plan servisi** (`ForegroundKeepAliveService`, native): MAG çoklu tarama/ekleme ve liste güncelleme uygulama ARKA PLANDAYKEN de sürer. `start/update/stopForegroundKeepAlive` native fonksiyonları + JS köprüsü. `dataSync` tipi (manifest + izin zaten vardı). mag-bulk (tarama+ekleme) ve `refreshPlaylistKinds` (güncelleme) iş başında start, bitince/hatada stop. İş mantığı Kotlin'e taşınmaz — servis yalnız süreci canlı tutar. | `ForegroundKeepAliveService.kt`, `KizilkanNativeCoreModule.kt`, manifest, `index.ts`, `mag-bulk.tsx`, `PlaylistContext.tsx` |

## Doğrulama (PC)
- tsc temiz · denetle TEMİZ · `check-v18721` PASS. **NATIVE DEĞİŞİKLİK VAR** → `expo prebuild` + `assembleDebug` ZORUNLU (bu devirde sonuç yazılacak).

## Cihazda test
- A: panel-a EKLE → oynatmadan kart Kullanıcı Adı dolmalı.
- B: Xtream combo → paralel sayısı gir → log `requestedConcurrency` girilen değer olmalı.
- C: kart → M3U linki görünmeli, kopyala + "Görüntü testi" → "Görüntü var · N kanal".
- D: MAG çoklu tarama/güncelleme başlat → uygulamayı ARKAYA al → bildirim görünmeli, iş sürmeli; bitince bildirim kaybolmalı.

## Bekleyen
Filmler sınıflama düzeltmesi (v18.7.20 `STALKER_VOD_PARTITION` telemetrisinden sonra); tekli MAG eklemeye keep-alive (bulk/güncelleme eklendi); release imza; katalog hız ölçümü (conc 20 sonrası); GPT G07-G10.
