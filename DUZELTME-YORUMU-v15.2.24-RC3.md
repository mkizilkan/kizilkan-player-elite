# KIZILKAN PLAYER ELITE v15.2.24 RC3 — Düzeltme Yorumu

## Kök neden
Termux'ta `node tools/check-v15224-rc2-memory-native.js` doğrudan çalıştırıldığında temiz geçerken `node tools/denetle.js` içinden aynı gate `ENOENT: frontend/app/(tabs)/index.tsx` ile düşüyordu.

Kaynak incelemesi kök nedeni doğruladı:
- `denetle.js` bilinçli olarak çalışma dizinini `frontend/` yapıyor.
- RC2 gate ise `fs.readFileSync('frontend/...')` biçiminde CWD-relative yol kullanıyordu.
- Böylece master zincirde fiilen `frontend/frontend/...` aranıyordu.

## RC3 düzeltmesi
- RC2 gate'e `path` eklendi.
- `ROOT = path.resolve(__dirname, '..')` canonical repo kökü yapıldı.
- Tüm kaynak okumaları `path.join(ROOT, rel)` üzerinden gerçekleştiriliyor.
- Gate'in repo root / frontend / tools çalışma dizinlerinden aynı sonucu vermesini doğrulayan self-test eklendi.
- tools JS dosyalarının tamamı için syntax + rooted-path audit gate'i eklendi.

## JS/TS kaynak incelemesi
Gerçek RC2 paketi açılarak tools altındaki 27 mevcut JavaScript denetleyici dosyası incelendi. RC3 ile iki yeni denetleyici eklendi; tools altındaki 29 JS dosyasının tamamı ve frontend/tools genelindeki toplam 43 proje JS dosyasının tamamı `node --check` ile temiz geçti.

CWD/path denetiminde:
- RC2 memory/native gate: gerçek hata bulundu ve düzeltildi.
- `_ts.js`: CWD denemesine ek olarak `__dirname/../frontend/node_modules` fallback'i içeriyor; tek CWD'ye bağlı değil.
- `checkplayercore.js`: frontend CWD ve tools konumundan türetilen frontend root yollarını kontrollü seçiyor.
- Diğer sürüm gate'lerinin kritik kaynak okumaları repo/frontend kökünü `__dirname` üzerinden türetiyor.

## Korunan RC1/RC2 özellikleri
MAG single-flight/cache, MAG uyumluluk profilleri, Room verified activation, native paging hata durumunda full JS hydrate engeli, panel-scan Work matrisi kaldırılması, bounded scan snapshot, Media3 adaptive timeUpdate ve v15.2.23 Flight Recorder/codec/gesture/Room düzeltmeleri korunmuştur.

## RC3 Final — Claude Memory/Telemetry entegrasyonu (2026-08-27)
- Claude v16 paketindeki gerçek bellek/telemetri fikirleri kaynak diff'iyle incelendi; paket kör merge edilmedi.
- `tv-home.tsx`: Native Core varken `ensureHeavyLoaded()` kapatıldı ve bununla yetinilmeyip TV Live/VOD/Series görünümü `KizilkanNativeCore.queryItems/getCategories/getItemsByIds` ile sayfalı Room yoluna geçirildi. Böylece TV ekranı boş JS dizilerine bağımlı kalmadan ağır katalog hidratasyonunu önler.
- Sayaçlar TV ekranında `nativeSummary -> metadata -> legacy` düzenine taşındı.
- Flight Recorder: her olayda `_fg`, `_appState`, `_task`, `_taskCount`, `_taskAgeMs` bağlamı tutulur.
- Claude'un tek-string `activeTask` yaklaşımı paralel async işlerde stale restore riski taşıdığı için token/sequence tabanlı çoklu görev registry'sine yükseltildi.
- Aktif görev kapsamı refresh ile sınırlı bırakılmadı: MAG handshake/live/VOD/series, Room commit/switch verify, panel scan ve player session görevleri eklendi.
- `memorySeries`: 30 sn cadence, 240 bounded sample (~2 saat). Java used/committed/max, total/native/dalvik/other PSS, sistem kullanılabilir/toplam RAM, low-memory, fg/app-state ve aktif task kaydedilir.
- Tam istatistik/Flight Recorder temizliği `memorySeries` ve aktif task registry'sini de sıfırlar.
- Background/doze kaynaklı stall kayıtları `BACKGROUND_STALL_OR_DOZE`, foreground stall'ları `FOREGROUND_RUNTIME_STALL_OR_RESOURCE` olarak ayrılır.
- Claude paketindeki gerilemeler ALINMADI: main index Room hata -> full hydrate fallback, PanelScan `ArrayList<Work>` matrisi/tüm matches snapshot'ı, Media3 adaptif timeUpdate kaldırımı ve MAG single-flight/cache/progress gerilemeleri reddedildi.
- Yeni gate: `tools/check-v15224-rc3-claude-memory-telemetry.js`.
