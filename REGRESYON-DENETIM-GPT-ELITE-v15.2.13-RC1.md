# KIZILKAN PLAYER ELITE v15.2.13-RC1 — REGRESYON DENETİMİ

## Korunması zorunlu v15.2.11/v15.2.12 sözleşmeleri
- runId-scoped scan lifecycle ve BUSY/terminal state
- hazırlık AbortController cancellation
- native disconnect + executor shutdownNow cancellation
- terminal COMPLETED / FAILED / CANCELLED snapshot
- `user:pass` / `user:password` quick parser
- round-robin unified multi-account scan
- tarama bitmeden import yok; kullanıcı seçimi zorunlu
- yalnız seçilen aboneliklerin import edilmesi
- DNS alias grouping / `validatedHosts`
- process/session profil PIN gate
- v15.2.12 `resolveOneBulkAccount(..., control: ScanExecutionControl)` zorunlu control contract

## v15.2.13 HARD kontrolleri
1. Scan Durdur/Duraklat kontrolleri generic `loading` state'ine tekrar bağlanmamalı.
2. MAG AccountInfo `status` değeri string varsayımıyla doğrudan `.toLowerCase()` çağırmamalı; normalize boundary korunmalı.
3. Stalker katalog yolu Live + VOD + Series'i ve create_link media-type çözümünü korumalı.
4. Xtream add/refresh/native bulk import içerik endpoint hatasında kısmi snapshot commit etmemeli.
5. M3U JS + Android native parser Live/VOD/Series sınıflandırma parity'sini korumalı.
6. Tam backup tek dev playlist-heavy JSON üretmemeli; Room paging + chunked restore sözleşmesi korunmalı.
7. Eski JSON backup restore desteği kaldırılmamalı.
8. Keystore/signing materyali pakete veya Git'e girmemeli.

## Gerçek cihaz acceptance
- Çoklu scan: hazırlıkta Durdur, native scan'de Durdur, Duraklat/Devam, round-robin.
- Quick parser 4/4: `1234567:1234567`, `user:pass`, `user:password`, `stream:stream`.
- Tarama sonu modal açık kalmalı, otomatik playlist eklenmemeli, yalnız seçim sonrası import.
- MAG aktifken Ayarlar/AccountInfoCard tekrar tekrar açılmalı; runtime crash olmamalı.
- Aynı test hesabında mümkünse başka güvenilir istemci sayılarıyla Live/VOD/Series karşılaştırılmalı: MAG, Xtream, M3U.
- Xtream ilk ekleme + restart + refresh sonrasında üç medya tipi birbirine karışmamalı.
- Büyük veride Hızlı/Kişisel/Tam backup; Tam backup progress, Durdur, restore ve eski JSON restore testleri.
- Profil PIN process kill/restart ve route restore bypass testi.

**Not:** Statik denetim geçmesi cihaz acceptance başarısı değildir.
