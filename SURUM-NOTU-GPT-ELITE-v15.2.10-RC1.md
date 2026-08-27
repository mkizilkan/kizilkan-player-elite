# KIZILKAN PLAYER ELITE v15.2.10-RC1

- P0 panel scan cancellation hardening: active HttpURLConnection disconnect + executor shutdownNow.
- Analiz/seçim ekranı tarama başında açılır; kullanıcı seçimi olmadan import yoktur.
- Tekli ve çoklu taramada süre/ETA, aktif panel/DNS, pause/resume/stop görünür.
- PIN korumalı profil için process-ömürlü authorization gate; session restore PIN’i atlayamaz.

## Gerçek cihaz kabul testi
1. Kodum var / Paneli biliyorum / Paneli bilmiyorum: analiz ekranı anında açılmalı.
2. Duraklat/Devam/Durdur aynı runId üzerinde gerçekten çalışmalı; Durdur sonrası BUSY kilidi kalmamalı.
3. Tarama bitene kadar import butonu etkinleşmemeli; bitince modal açık kalmalı ve seçim beklemeli.
4. Çoklu hesap analizi aynı sözleşmeyi kullanmalı; kullanıcı seçmeden import başlamamalı.
5. PIN'li tek profil: process/app yeniden açılışında profil/PIN ekranı zorunlu olmalı; playlist/settings route restore ile atlanmamalı.
