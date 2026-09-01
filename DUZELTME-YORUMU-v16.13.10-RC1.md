# KIZILKAN PLAYER v16.13.10 RC1 — Düzeltme Yorumu

Cihaz Flight Recorder kanıtına göre playlist seçimi, Xtream katalog commit politikası, MAG runtime varsayılanı ve playlist yönetim görünürlüğü birlikte düzeltildi.

- Playlist switch: aynı hedefe peş peşe dokunmak artık çalışan switch/self-repair generation'ını sürekli iptal etmiyor; aynı hedefteki ikinci çağrı coalesce edilir. Eski aktif playlist, yeni Room snapshot doğrulanmadan değiştirilmez.
- Xtream: Live başarılı olduğu halde VOD/Series endpointleri HTTP 404 döndüren panellerde artık çalışan Live kataloğu çöpe atılmaz. 404 `unsupported` kabul edilir; auth/timeout/5xx gibi hatalar hâlâ güvenli commit bariyeridir.
- Native Xtream importer aynı capability-aware 404 politikasına taşındı.
- Playlist yönetimi: uygulama içindeki değiştirme düğmesi doğrudan yönetim modunu açar. Sıralama seçenekleri, maksimum kullanıcı sırası, sabitlenenlerin üstte tutulması, sürükle-bırak özel sıra ve SEÇ/AKTİF butonu bu ekranda görünür ve kalıcıdır.
- MAG: MAG320 PCAP/Loader Exact varsayılanı runtime/profile helper katmanında da esas alındı; MAG254/MAG250 uyumluluk fallbackleri korunur.
- Player: 404 araştırması için güvenli Xtream provenance telemetry korunur. MPV native ABI/libc++ problemi bu pakette kanıtlanmadan “çözüldü” denmemiştir.
