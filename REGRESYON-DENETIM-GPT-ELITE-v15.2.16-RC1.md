# REGRESYON DENETİMİ — KIZILKAN PLAYER ELITE v15.2.16-RC1

## Korunan davranışlar
- v15.2.11+ scan runId / pause / resume / cancel / terminal state sözleşmesi.
- Selection-before-import ve round-robin çoklu hesap akışı.
- DNS alias grouping / validatedHosts.
- ProfileSessionGate ve process-session PIN güvenliği.
- v15.2.14 MAG Live/VOD/Series ve atomic backup restore sertleştirmesi.
- v15.2.15 Stalker Series `Record<string,string>[]` TypeScript contract düzeltmesi.
- Room canonical store, native paging/search ve chunked import.

## v15.2.16 yeni korumalar
1. Tanılama ring-buffer 400 olay ile bounded tutulur.
2. Tanılama raporunda password/token/cookie/authorization/secret/PIN/MAC/username/device ID/serial redaksiyonu vardır.
3. Player `CHANNEL_SELECTED`, `PLAYER_SESSION_START`, `FIRST_FRAME`, engine failure ve buffering olaylarını kaydeder.
4. MAG resolve süresi ölçülür; session cache vardır; auth reddinde forceFresh retry yapılır.
5. MAG get_profile hataları sessiz `catch(() => null)` ile yutulmaz; varyant diagnostics üretilir.
6. ApplicationExitInfo son 5 kaydı ve PSS/RSS/timestamp/description gösterilebilir.
7. Native scan flight recorder credential saklamadan runId/state/tested/total/found/accountIndex/PSS/error tutar.
8. `tools/check-v15216-diagnostics.js` yukarıdaki sözleşmeleri ve iki ardışık MAG resolve'da handshake=1/profile=1/create_link=2 davranışını fixture ile doğrular.

## Cihazda zorunlu kabul testleri
- MAG Kaydet ve Yükle: gerçek portal; hata varsa aşama mesajı görünür olmalı, sessiz geri dönüş olmamalı.
- MAG aynı kanal/ardışık kanal zap: ilk ve ikinci açılışın Player Tanılama süreleri karşılaştırılmalı.
- 401/403/token expiry senaryosu: bir kez fresh login ile toparlanmalı.
- Player Media3/VLC/MPV: first-frame, rebuffer ve engine error telemetry oluşmalı.
- Çoklu hesap scan reset tekrar ederse Process Exit + Scan Tanılama zaman korelasyonu incelenmeli.
- Tanılama raporu export edilip credential/token/MAC sızıntısı olmadığı kontrol edilmeli.
