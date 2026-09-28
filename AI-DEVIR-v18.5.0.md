# AI DEVİR — v18.5.0 RC1

**Taban:** `v18.4.0-rc1-media-proxy-fix` (2f8fc4ec). **Dal:** `v18.5.0-rc1-proxy-speed-media`.
Kanıt: `kizilkan-diagnostics-2026-09-28T08-05-32-392Z.json` (v18.4.0, cihaz) + ekran görüntüsü (combo tarama, proxy bilgisi yok).
Onay (28.09.2026): plan A–I; anonimlik için httpbin.org kullanımı ONAYLANDI; boş havuzda tarama → "sor".

## Cihaz gözlemleri → kanıt
| Gözlem | Kanıt | Sonuç |
|---|---|---|
| Medya Merkezi sekmeleri çok yavaş (1103 video) | Log kırpıldığı için olay yok; koddan: her küçük resim tüm listeyi yeniden çiziyordu, satırlar önbelleksiz, sabit düzen yok, fotoğraf ızgarası tam boy çözüyordu | A maddesi |
| Film/dizi açılmadı | MAG 444/403, Xtream bölüm "extractor" (video yerine başka içerik), Xtream catch-up 503 (3 aday), MAG katalog boş. Aynı oturumda Xtream film açıldı (FIRST_FRAME) | Büyük ölçüde **sunucu tarafı**; kod değişikliği yapılmadı |
| Taramada proxy bilgisi yok | Kod: tüm tarama yolları (stream dahil) `probe→probePhysical` proxy'li; eksik olan GÖSTERİM | E maddesi |
| Tarama çok yavaş, 0 bulundu | 16 dk'da 444 adres, paralellik 24→1; havuzun en hızlısı 03:37'de ölü (TEST_FAILED); proxy açılırken havuz 0 | B (gerçek hata), C, G |
| Log eksik | `exportScope.returned=3473` ama dosyada 80 olay: `sanitizeValue` her diziyi 80'e kesiyordu | I maddesi |

## Yapılanlar
| # | Madde |
|---|---|
| A | **Medya Merkezi hızı:** `MediaRow`/`GridRow` React.memo + sabit kimlikli geri çağrılar; küçük resimler 250 ms'lik gruplarla; sabit satır yükseklikleri + `getItemLayout` (başlık yüksekliği ölçülür); fotoğraf ızgarası native küçük resim (≤256 px; başarısızsa tam boy); arama/sıralama anahtarları yüklemede bir kez (`withSearchKeys`); arama 150 ms gecikmeli; sekme geçişi `useTransition`; "Devam et" ilerleme kayıtlarından (tüm listeyi taramadan); telemetri `MEDIA_CENTER_TAB_SWITCH {tab, items, rows, ms}`. |
| B | **Boş havuz (gerçek hata):** v18.4.0'da proxy açık + havuz boşken her deneme istek gönderilmeden "bulunamadı" sayılıyordu. Artık: tarama başlamadan sorulur (Proxy'leri test et / Proxy'siz tara / Vazgeç); servis de boş veya tükenmiş havuzda o denemeyi DÜŞÜRMEZ, taramayı duraklatıp bekler (`pauseReason` SCAN_PROXY_EMPTY / EXHAUSTED) ve karar sonrası aynı denemeyi yeniden yapar. JS keşfi (serverCode) açık hata verir. |
| C | **İki aşamalı test:** 1) TCP bağlantı elemesi (zaman aşımı 1,5–3 sn, paralellik 2× (≤256)); 2) yalnız açık portlara doğrulama. "Yeter": 1. aşamadaysa açık portlar (doğrulanmamış), 2. aşamadaysa doğrulananlar havuz olur. |
| D | **Anonimlik:** yargıç `http://httpbin.org/get` (kullanıcı onaylı; Xtream bilgisi gitmez). Şeffaf = kendi IP'miz görünüyor; Anonim = IP gizli ama Via/X-Forwarded-For… var; Elite = iz yok. Sayılar ekranda; "Yalnız elite kullan" ve "Şeffafları ele" seçenekleri. Yargıç engellenirse IP-yankı yoluna düşer (anonimlik "bilinmiyor"). |
| E | **Tarama ekranı:** "Proxy'li / Normal tarama" anahtarı + havuz özeti + merkeze git (`ScanProxyToggleRow`); tarama sürerken canlı satır: "Proxy: N canlı · M elendi · K istek sürüyor · panel yanıtı X · Şu an: socks5://…" (`ScanProxyLiveLine`). |
| F | Proxy merkezi proxy kapalıyken de indirir/test eder; açma/kapama listeyi silmez; "Listeleri temizle" ayrı. Havuz özeti kartı. |
| G | Tarama başında havuz 15 dk'dan eskiyse hızlı TCP tazelemesi (≤15 sn; `SCAN_PROXY_REFRESH`). |
| H | Panelden yanıt getiren proxy'ler "iyi" listeye girer (kalıcı, ayrı şifreli dosya `scan_proxy_good.enc`, en çok 500); taramada 3 seçimin 2'si iyilerden; sonraki testte ilk denenir. Proxy başına en çok 4 eşzamanlı istek. |
| I | **Tanı raporu:** olay dizileri artık 80'e kesilmez; en çok 6.000 olay, her alandan en az 300; native kayıt dizileri 2.000; `exportScope.exported/exportLimit/perDomainMin`. |

Kapı: `tools/check-v18500-release.js`. Test: `test-device-media.js` 8 grup.

## Doğrulama
`yarn tsc --noEmit` temiz · `node tools/denetle.js` TÜM DENETİMLER TEMİZ · `assembleDebug`: sohbet özetinde.

## Cihaz testi
1. Medya Merkezi: 1000+ videoda sekme geçişi ve kaydırma akıcı mı; liste hemen tam doluyor mu; fotoğraf ızgarası hızlı mı.
2. Proxy merkezi (proxy KAPALIYKEN de): İndir → Testi Başlat → 1/2 TCP hızlı ilerliyor mu → 2/2'de Elite/Anonim/Şeffaf sayıları.
3. "Yalnız elite kullan" açıkken havuz yalnız elite mi.
4. Tarama ekranı: Proxy'li/Normal anahtarı; proxy açık + havuz boşken tarama başlatınca soru çıkıyor mu.
5. Proxy'li tarama sırasında canlı proxy satırı (canlı/elendi/şu an).
6. Tanı raporu: dosyada 80'den fazla olay var mı (`exportScope.exported`).

## Bilinen sınırlar
- Film/dizi hataları (444/403/503/boş katalog) sunucu kaynaklı görünüyor; aynı içeriği başka oynatıcıda denemek kesinleştirir. Açık konu #3 (Media3/MPV başlık farkı) hâlâ açık.
- httpbin.org erişilemezse anonimlik "bilinmiyor" olur (proxy yine kullanılabilir).
- Tarama sırasında ana iş parçacığı donmaları (bilinen #5, `scan:panel-stream-v172`, 36 sn'ye kadar) bu sürümde ele alınmadı.
