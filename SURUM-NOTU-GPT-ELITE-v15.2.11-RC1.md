# KIZILKAN PLAYER ELITE v15.2.11-RC1

## Amaç
v15.2.10 gerçek cihaz testinde kalan Sunucu Kodu / Çoklu Hesap analiz lifecycle hatalarını kökten kapatmak. Bu sürüm yeni bir tarama özelliği eklemek yerine mevcut analiz motorunun hazırlık, duraklatma, durdurma, terminal snapshot ve kullanıcı seçimi sözleşmesini sertleştirir.

## P0 düzeltmeler
- Panel rehberi/DNS adayları hazırlanırken `Durdur` artık yalnız UI mesajı üretmez; aynı AbortController katalog REST isteklerini de keser.
- Native taramada açık `HttpURLConnection` kayıtları `disconnect()` ve executor `shutdownNow()` ile kesilir; job hangi çıkış yoluna girerse girsin terminal `COMPLETED / FAILED / CANCELLED` snapshot bırakılır.
- Durdur butonu ilk basıştan sonra `Durduruluyor…` durumuna kilitlenir; tekrar tekrar cancel intent/message üretmez.
- Hazırlık aşamasında Duraklat butonu yanlış çalışıyormuş gibi davranmaz; native runId oluşunca gerçek Pause/Resume etkinleşir.
- Birleşik çoklu tarama işleri hesap bazında bloklu değil round-robin planlanır; Hesap 1 bitene kadar diğer hesaplar 0% beklemez.
- Tarama bitince sonuç ekranı açık kalır. Hiçbir discovery yolu kullanıcı seçiminden önce playlist importuna geçmez.
- Aynı hesap+panelde çalışan birden fazla DNS, importta tek abonelik/playlist olarak gruplanır ve tüm DNS'ler `validatedHosts` yedeğinde korunur.
- Hızlı yapıştırmada `user:pass` ve `user:password` artık gerçek kullanıcı/şifre çifti olarak kabul edilir.

## Korunanlar
Room canonical storage, Cast, MPV/VLC/Media3, profil PIN session gate, server-code cache, runId ownership, endpoint diagnostics ve önceki sürümlerin diğer işlevleri korunmuştur.
