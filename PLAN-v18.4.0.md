# PLAN — v18.4.0 (tek sürüm; ONAYLANDI ve KODLANDI — ayrıntı `AI-DEVIR-v18.4.0.md`)

Taban: `v18.3.0-rc1-scan-proxy` (b3bb771c). Dal: `v18.4.0-rc1-media-proxy-fix`.
Kullanıcı kararı (27.09.2026): tüm maddeler bu turda, sürüm bölünmeyecek. Kanıt: `kizilkan-diagnostics-2026-09-27T17-26-23-204Z.json` (v18.3.0).

## 1. KRİTİK HATA — Yerel medya MAG listesi aktifken 404 (KANITLI)
**Log:** `LOCAL_MEDIA_OPEN` → `CHANNEL_SELECTED {channelId: local-…, source: stalker}` → `create_link` (hkpremiumtv.xyz) →
`MEDIA3_ERROR 404` → VLC → mpv hepsi başarısız. `channelGroup: Yerel Müzik`, `playlistId: pl-mag-…`. Xtream aktifken sorun yok.
**Kod:** `PlayerHost.tsx` Stalker çözümüne yalnız `activePlaylist?.source === "stalker"` ile karar veriyor (satır 846–866, 1197);
öğenin yerel olup olmadığına bakmıyor. Yerel `content://` adresi `create_link`'e gidiyor.
**Düzeltme:** `effectiveSource` = yerel/dış öğe ise `"local"`, değilse listenin kaynağı. Oynatma yolundaki TÜM kararlar buna bağlanır:
Stalker anahtarı/`playUrl`/çözüm efekti/başlıklar, catch-up (1344), kaynak yenileme (1566), test düğmeleri (4788, 4924),
yedek DNS/tercihli host adayları, timeshift uygunluğu, Room kanal/komşu aramaları, EPG. Telemetri `playlistSource` → `local`.
**Kapı:** `check-v18400-local-source.js` — oynatma kararlarında korumasız `activePlaylist?.source === "stalker"` kalmamalı.

## 2. Taramaya özel proxy — geliştirme
| # | Madde |
|---|---|
| 2.1 | **Tam indirme:** 400 tavanı kalkar; indirilen listenin tamamı alınır (bellek için yüksek güvenlik tavanı + uyarı). |
| 2.2 | **Kaynak kataloğu:** her kaynak için sağlayıcı, **tür rozetleri (HTTP / SOCKS4 / SOCKS5)**, güncelleme sıklığı. Kullanıcı kaynak × tür seçer ("Tümü" kısayolu). |
| 2.3 | **Ek kaliteli kaynaklar** (aday: TheSpeedX, jetkai, roosterkid, ShiftyTR, hookzof, mmpx12, vakhov): kodlarken **canlı doğrulanır**, ölü/boş olan EKLENMEZ. |
| 2.4 | **Canlılık testi modu:** (a) Sistem (varsayılan: IP-yankı + isteğe bağlı hedef panele bağlantı), (b) **Kullanıcının sitesi** (URL; 2xx/3xx; isteğe bağlı "yanıtta şu metin geçsin"). |
| 2.5 | **Test motoru native, arka planda:** eşzamanlılık ayarı; **Duraklat / Devam / Durdur**; **"Yeter — test edilenleri kullan"** (o ana kadar çalışanlar havuz olur). |
| 2.6 | **Canlı ilerleme:** indirme (kaynak kaynak), test i/toplam, çalışan/ölü, tür bazında çalışan, hız (proxy/sn), kalan süre, en hızlı 10. |
| 2.7 | **Sonuç kalıcı:** çalışan listesi (gecikme, tür, son kontrol) saklanır; "Son test 12 dk önce · 312 çalışan"; tarama başında taze ise yeniden test edilmez. |
| 2.8 | **Taramada rotasyon düzeltmesi:** şu an proxy hatasında o deneme `null` dönüyor → hesap "bulunamadı" sayılabilir (yanlış negatif). Yeni: proxy hatası ≠ sunucu hatası; aynı deneme **sıradaki proxy ile** (en çok 3) tekrarlanır. Havuz tükenirse tarama **duraklar** + uyarı (doğrudan devam / yeni test). |

## 3. Yerel medya → "Medya Merkezi"
| # | Madde |
|---|---|
| 3.1 | Sekmeler: **🎵 Müzik · 🎬 Video · 🖼 Fotoğraf · 📁 Klasörler** (mevcut SAF klasör gezgini korunur). |
| 3.2 | **Cihazı tara:** native `MediaStore` sorgusu (tek sorgu, sayfalı, hızlı); izin kartı (`PermissionsAndroid`, Android 13+ `READ_MEDIA_VIDEO/AUDIO/IMAGES`); `READ_MEDIA_IMAGES` eklenir. Yeni npm paketi YOK. Artımlı yenileme (değişmediyse yeniden taranmaz). |
| 3.3 | **Arama:** anlık, Türkçe duyarsız (ı/i, ş/s…); ad + sanatçı + albüm + klasör adında. |
| 3.4 | **Sıralama:** ad, eklenme/değişme tarihi, boyut, süre, tür; artan/azalan; tercih kalıcı. |
| 3.5 | **Gruplama:** Müzik → Şarkılar / Albümler / Sanatçılar / Klasörler. Video → Tümü / Klasörler (Kamera, WhatsApp, İndirilenler, Ekran kayıtları). Fotoğraf → ay başlıklı zaman çizelgesi / Albümler. |
| 3.6 | **Kartlar:** video küçük resmi + süre rozeti + HD/4K + izleme ilerleme çubuğu; müzik kapağı + sanatçı·albüm + süre; fotoğraf ızgarası (telefon 3–4, TV 5–6 sütun). Küçük resimler native, ≤256 px, önbellekli. |
| 3.7 | **Şeritler:** "Devam et" (yarım kalan videolar) + "Son açılanlar" (mevcut). |
| 3.8 | **Hızlı eylemler:** Tümünü oynat, Karıştır, klasörü kuyruk olarak oynat; uzun basış → Bilgi (boyut, çözünürlük, süre, yol), Paylaş, Kuyruğa ekle. |
| 3.9 | **Akıllı filtreler:** video "Kısa (<1 dk)", "Uzun (>20 dk)", "Ekran kayıtları"; müzik "Kısa sesleri gizle (<30 sn, WhatsApp ses kayıtları gibi)". |
| 3.10 | **Fotoğraf görüntüleyici (YENİ — şu an fotoğraf desteği yok):** tam ekran, kaydırarak geçiş, iki parmak yakınlaştırma, TV'de ◀▶, slayt gösterisi (3/5/10 sn), döndürme, bilgi, paylaş. Arka planda müzik çalarken slayt gösterisi. |
| 3.11 | TV: tüm öğeler odaklanabilir, odak geri yükleme (v18.0.0 altyapısı, kapsam `local-media`), boş/izin reddi durumları. |

## 4. Ayarlar düzeltmeleri (denetim bulguları)
| Öğe | Bulgu | Yapılacak |
|---|---|---|
| Kayıt Alma (DVR) | "YAKINDA" + yalnız bilgi penceresi; ama kod `recordings/`'e yazıyor, İndirilenler "KAYITLAR"ı listeliyor | Kayıt yolu incelenir: çalışıyorsa etiket kalkar, düğme nasıl kayıt alınacağını + kayıtları gösterir; eksikse tamamlanır |
| Ana ekran kısayolları | "Publish sonrası aktif" deniyor; kodda kısayol tanımı YOK | Android kısayolları eklenir (config plugin + derin bağlantı: Ara, Favoriler, TV Rehberi, Çoklu Ekran) |
| Bildirim paneli kontrolleri | Yalnız yerel seste var; canlı/VOD'da yok | Media3 motorunda oynat/duraklat bildirimi + "arka planda çalmaya devam et" seçeneği; pencere metni gerçeğe uydurulur (VLC/MPV'de yok olduğu açıkça yazılır) |
| "Sütunlu (DENEYSEL)" | Bilinçli deneysel | Aynen kalır |
| Genel | — | Kodlamada ayarlar ekranı satır satır taranır; başka "çalışmayan/pasif" öğe çıkarsa rapor edilir |

## 5. Doğrulama
`yarn tsc --noEmit` · `node tools/denetle.js` · yeni kapılar (yerel kaynak, proxy test motoru, medya arama normalizasyonu) ·
Kotlin `assembleDebug` (standalone DEV) · CI release · `AI-DEVIR-v18.4.0.md` + CLAUDE.md §9.

## 6. Kapsam dışı (not)
Logda 81 `ANR_WATCHDOG_STALL` var (MAG/stalker kökenli bilinen konular #4/#5); bu sürüme alınmadı, ayrı ele alınır.

## 7. Ek istek (27.09.2026)
EPG düğmesi seçili kanal kategorisinin rehberini açar (kütüphane sağ üst + TV ana ekranı Rehber düğmesi/tuşu); diğer gruplara rehberde geçilir. KODLANDI.
