# KIZILKAN PLAYER ELITE v15.2.27-RC1

Bu sürüm v15.2.26-RC1 üzerine dört P0 düzeltmeyi birlikte getirir:

1. MAG/Stalker playback context: create_link sonrası gerekli MAG User-Agent / X-User-Agent / Referer ve güvenli hedeflerde Cookie/Authorization playback isteğine taşınır. 401/403/456 durumunda tek sefer fresh-session + fresh-create_link recovery uygulanır.
2. MAG VOD/Series adaptive pagination: p=0/p=1 alias davranışı algılanır, p=2 güvenli probe edilir; 0-based / 1-based ve p parametresini yok sayan portallar için duplicate governor korunur.
3. Kaydet ve Ekle UX: MAG ekleme sırasında gerçek aşama bilgisi görünür; Live kayıt tamamlandığında kullanıcıya canlı kanal sayısı ve film/dizi enrichment bilgisini veren başarı penceresi gösterilir.
4. Player emergency controls: telefon/tablet tarafında preparing/buffering/switch_engine gibi oynatılmayan fazlarda tam ekran tek-dokunuş catcher kontrolleri açar; spinner pointer-events almaz. Hata ekranındaki mevcut manuel motor seçimi korunur.

Sürüm: 15.2.27
Android versionCode: 150227

## Güvenlik
Playback credential'ları yalnız aynı host veya gerçek parent/subdomain ilişkisine sahip hedefte gönderilir. IP -> farklı IP ve ilgisiz üçüncü taraf hostlara Cookie/Authorization aktarılmaz. Telemetri değerleri değil yalnız header isimleri ve güven bayrağını kaydeder.

## Doğrulama özeti
- v15.2.27 P0 fixture: PASS
- v15.2.26 lockfile/package integrity: PASS
- tools JS syntax: PASS
- JSON parse (package.json/app.json): PASS
- Tam TypeScript --noEmit: BU ORTAMDA ÇALIŞTIRILAMADI. Sebep: çalışma konteynerinde proje node_modules yok ve registry.yarnpkg.com DNS/ağ erişimi kapalı. Bu durum PASS olarak işaretlenmemiştir.

Ayrıntı için TEST-SONUCU-v15.2.27-RC1.txt dosyasına bakın.
