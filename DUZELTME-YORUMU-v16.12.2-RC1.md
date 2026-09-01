# KIZILKAN PLAYER v16.12.2 RC1 — DÜZELTME YORUMU

Bu sürüm 30.08.2026 cihaz tanılama kaydında v16.12.1 için kanıtlanan iki ana problemi düzeltir: eski learned `golden` profilinin `pcap320-minimal` MAG320 profilinin önüne geçmesi ve HTTP 200 + `Authorization failed.` cevabının 5 dakikalık kalıcı cooldown'a dönüşmesi.

## Düzeltmeler

- `pcap320-minimal` artık handshake profil sıralamasında koşulsuz birinci sıradadır.
- Eski learned profil silinmemiştir; PCAP profilinden sonra ikinci aday olarak korunur.
- Primer/kullanıcı portal endpoint'i learned endpoint'in önüne alınmıştır; böylece temiz ilk deneme doğru portal yolunda başlar.
- v16.12.1'in `kizilkan.mag.guard.v16121` auth-only cooldown durumu yeni sürümü kilitlemesin diye guard şeması `v16122` anahtarına taşınmıştır.
- `Authorization failed.` ile gerçek rate-limit ayrılmıştır.
- 5 dakikalık persistent cooldown yalnız gerçek `MAG_RATE_LIMIT` sınıfında (örn. HTTP 429 / açık rate-limit cevabı) yazılır.
- Auth governor aynı işlemde maksimum 4 auth reddi sınırını ve adaptif 1.25 sn pacing'i korur; ancak sonraki manuel kullanıcı denemesi 5 dakika engellenmez.
- Learned profil auth reddi alırsa failure sayacı artık gerçekten artırılır; HTTP 200 + Authorization failed önceki sürümde bu learned kaydı yeterince bayatlatmıyordu.
- Hassas MAC/token değerlerini açık kaydetmeden `STALKER_HANDSHAKE_REQUEST_FINGERPRINT` telemetrisi eklendi. Query anahtarları, JsHttpRequest/token/prehash varlığı, UA profili, cookie MAC şekli, timezone, Referer path, Accept/Accept-Encoding ve header adları kaydedilir.
- v16.12.1'deki player stale-frame, resolved URL ownership, create_link credential-boundary ve controls düzeltmeleri korunmuştur.

## Geliştirme sırasında yakalanan ek hata

Yeni hard-gate'in ilk çalıştırmasında auth-only cooldown'un hâlâ kalıcı hale geldiği görüldü. Sebep `MAG_AUTH_GOVERNOR` hata mesajında geçen `ban/rate-limit` metninin genel rate-limit regex'ine takılmasıydı. Kalıcı cooldown kararı yalnız `e.kind === "MAG_RATE_LIMIT"` olacak şekilde düzeltildi ve gate tekrar PASS verdi.
