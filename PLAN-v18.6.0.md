# PLAN — v18.6.0 (ONAYLANDI ve KODLANDI — ayrıntı `AI-DEVIR-v18.6.0.md`)

Taban: `v18.5.0-rc1-proxy-speed-media` (042b0662). Önerilen dal: `v18.6.0-rc1-record-download-cast`.
Kanıt: `kizilkan-diagnostics-2026-09-28T16-34-56-522Z.json` (v18.5.0, 4.069 olay — rapor artık tam) + ekran görüntüleri.

## 1. Kanıtlı hatalar
| # | Sorun | Kanıt | Düzeltme |
|---|---|---|---|
| 1.1 | Combo taramada paralellik "etkin 1" | Log: etkin 18→12→6→1, 833 hesap ~15 dk; bellek ~600 MB (baskı yok). Kod: `runUnifiedScanV171` işçi sayısını o anki 15 hesaplık partinin iş miktarıyla sınırlıyor (`coerceAtMost(batchWork)`); parti bitmeden sonraki başlamıyor | Partiler iş miktarına göre doldurulur (en az istenen×4 deneme) ve bir parti bitmeden sonrakine geçilir (boru hattı); parti başına iş sayısı + sınırlama sebebi telemetriye. Değerin tam 1'e düşme anı bu telemetriyle kesinleştirilecek |
| 1.2 | Proxy'li/Normal anahtarı çoklu hesap ekranında yok | Ekran görüntüsü; kod: anahtar yalnız "Kodum var/Paneli biliyorum" hız bölümünde | Çoklu hesap (combo) tarama ayarlarına da eklenir |
| 1.3 | TXT'ye kaydet hata | Ekran: Android "İndirilenler" SAF sağlayıcısı yazmaya izin vermiyor | Varsayılan: `Download/KIZILKAN PLAYER ELITE/` (MediaStore, Android 10+ izin gerekmez; dosya yöneticisinde görünür). "Başka klasör seç" ve "Paylaş" kalır |
| 1.4 | Medya Merkezi yavaş | Log: video sekmesi 1.103 öğede 1,86–1,96 sn; **19.521 fotoğraf** taraması 25 sn, bir kez 77 sn | Sayfalı yükleme: MediaStore'dan ekrana gelen sayfa (ör. 300) okunur, kaydırdıkça devamı; sayılar ayrı hızlı sorguyla; arama/sıralama native sorguda (tüm listeyi JS'e taşımadan); sekme verisi korunur |
| 1.5 | Kısayol simgeleri boş kutu | Kod: Android sistem simgeleri (`android.R.drawable`) kullanılıyor; birçok başlatıcı bunları çizmiyor | Uygulamaya kendi simgeleri eklenir (arama, favori, rehber, çoklu ekran; tema kırmızısı) |
| 1.6 | Kısayol uygulamayı açıyor ama ekrana götürmüyor | Log: `APP_SHORTCUT_OPEN` **0 kez**. Kod: kısayol, uygulamanın normal açılış isteğiyle AYNI (yalnız ek veri farklı); Android bu durumda açık uygulamayı öne getirip isteği uygulamaya İLETMİYOR (ek veri karşılaştırmaya girmez) | Kısayola ayrı bir istek kimliği (kendi action + `kizilkan-gpt://shortcut/<ad>` adresi); profil/PIN kapısı korunur; her adım telemetriye (native alındı / JS okudu / yönlendi) |

## 2. İstekler
| # | İstek | Plan |
|---|---|---|
| 2.1 | Kayıt yalnız VLC'de — diğer oynatıcılarda da | **MPV:** MPV'nin kendi `stream-record` özelliği (ek bağlantı YOK). **Media3 canlı:** kayıt başlayınca yayın, zaman kaydırmadaki gibi uygulamanın yerel kaydedicisinden oynatılır; tek bağlantı kuralı korunur, akış dosyaya da yazılır. **Media3 film/dizi:** aynı dosya indirme yöneticisiyle indirilir (1 bağlantılı hesaplarda izlerken indirmenin ikinci bağlantı açacağı uyarılır). Kayıt klasörleri VLC ile aynı; kayıtlar İndirilenler → KAYITLAR'da |
| 2.2 | Film/dizi indirme: tek parça / çok parçalı (IDM gibi) | Native indirme motoru: HTTP Range ile 1–16 parça (kullanıcı seçer), duraklat/devam (parça bazında kaldığı yerden), hız ve kalan süre. Sunucu Range desteklemiyorsa otomatik tek parça. Sunucu fazla bağlantıyı reddederse (403/456/429) parça sayısı otomatik düşürülür |
| 2.3 | İndirmeden önce boyut | İndir penceresinde boyut (sunucudan ön sorgu), Range desteği, önerilen parça sayısı ve hesabın bağlantı sınırı (Xtream `max_connections`, varsa) |
| 2.4 | Kayıt yeri seçimi + görünür varsayılan klasör | Varsayılan `Download/KIZILKAN PLAYER ELITE/Filmler` ve `/Diziler/<dizi adı>` (dosya yöneticisinde görünür). "Başka klasör seç" (SAF) — seçim hatırlanır. Mevcut uygulama içi indirmeler korunur |
| 2.5 | Medya Merkezi sürekli çal / sürekli oynat | Müzik ve video: Tekrar Kapalı / Tümünü Tekrarla / Tek Tekrarla + Karıştır (oynatıcıda düğme, tercih kalıcı). Slayt: "Sürekli" (başa dön) / "Sonda dur" |
| 2.6 | Chromecast: müzik, fotoğraf, slayt | Yayın köprüsü (v18.2.0) üzerinden: müzik (sıradakiyle kuyruk), tek fotoğraf, slayt gösterisi (fotoğraflar sırayla alıcıya gönderilir, telefondan ileri/geri/duraklat). Fotoğraf görüntüleyiciye ve Medya Merkezi'ne yayın düğmesi |
| 2.7 | Uygulama ve kısayol simgesinde ay-yıldız Türk Bayrağı'ndaki gibi | Mevcut simgede yıldız dik duruyor (bayrakta bir ucu hilale bakar), küçük ve uzak; hilal ince. Türk Bayrağı Kanunu'ndaki oranlar (hilal dış/iç çember çapları ve merkez uzaklığı, yıldız çember çapı ve hilale uzaklığı) **resmî metinden doğrulanarak** yeniden çizilir; uygulama simgesi + uyarlanabilir simge + açılış ekranı. Önizleme onayına sunulur |

## 3. Açık notlar
- Film/dizi oynatma hataları (403/401/456/444/503, video yerine hata sayfası) sunucu kaynaklı; logda uygulamaya ait oynatma hatası yok (12 açılış, 0 "başarısız").
- Logdaki 47 donmanın hepsi uygulama arka plandayken; ön planda donma yok.

## 4. Doğrulama
`yarn tsc --noEmit` · `node tools/denetle.js` · yeni kapılar (kısayol isteği, kayıt motorları, parçalı indirme ayrıştırıcı birim testi) ·
`assembleDebug` (PC'siz DEV) · push · CI · `AI-DEVIR-v18.6.0.md` + CLAUDE.md §9.

## 5. Ek istek (29.09.2026)
Film/dizide izlendi işaretleri (bölüm ✓, sezon sayacı, afişte ✓/yarım çubuğu/S·B). KODLANDI.
