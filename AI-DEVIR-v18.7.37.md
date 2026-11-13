# KIZILKAN PLAYER ELITE v18.7.37 RC1 — Hesap ekleme UX + hız paketi (7 madde)

Tarih: 13 Kasım 2026. Dal: `v18.7.37-rc1-add-account-ux-speed`.
Taban: `25405c6a` (v18.7.36). Kaynak: **13.11.2026 canlı cihaz oturumu** (Poco X3, DEV 18.7.36).
Kullanıcı combo çoklu-hesap taramasında "Liste ekleniyor"da takıldı; adb teşhisiyle kök nedenler
koddan kanıtlandı (donma değil — JS saturasyonu + Binder taşması + kilitli ekleme butonu). Kullanıcı
7 maddenin tamamını, commit/push/CI tetikleme ve PC DEV derleme yetkisini verdi; telefonu çıkardı.

## 1. Neden bu iş — cihaz kanıtı

| Kanıt (adb) | Teşhis |
|---|---|
| `mqt_v_js` %103, native tarama thread %0 | "İkinci tur" native; JS saturasyonu = katalog commit + poll re-render (donma değil) |
| `TransactionTooLargeException: data parcel 1.29 MB` · `startStreamingFileScanV172 rejected` | Combo-dosya tarama Binder ~1 MB sınırını aşıp 0 buluyordu (#6) |
| Ekranda "0/1 liste tamamlandı" ama DB'de 9/13 | İlerleme yanıltıcı; kullanıcı "takıldı" sanıp çıkaracaktı (#7) |
| "Doğrula ve Ekle" = "Taramanın Bitmesini Bekleyin" | Bulunan 13 hesap, 56 dk'lık ikinci tur bitene kadar eklenemiyordu (#4) |
| Her "Liste Ekle" girişinde ikinci tur diriliyor | forceExit defer+pause ediyor; re-entry auto-recovery resurrect ediyor (#5) |
| Alt buton gezinme çubuğu altında | HitFileImport modalında safe-area yok (#1) |
| MAG MAC/seri no klavye altında | 12 TextInput'ta onFocus kaydırması yok (#2) |

## 2. Yapılan 7 düzeltme (hepsi kanıta dayalı, kör düzeltme yok)

| # | Düzeltme | Dosya |
|---|---|---|
| **#1** | HitFileImport modalına `useSafeAreaInsets` ile alt/üst inset → "Seçilenleri doğrula ve ekle" butonu çubuk üstüne | `src/components/HitFileImport.tsx` |
| **#2** | 12 TextInput'a `onFocus={revealCredentialFields}` (MAG portal/MAC/seri, Xtream sunucu, kod, kod-kaynağı, liste adı, M3U URL, arama, combo paralellik/parti) | `app/add-playlist.tsx` |
| **#3** | Native scan retry fazında poll aralığı 350→900 ms (dev progress string + re-render JS yükü düşer; işlev aynı) | `app/add-playlist.tsx` (2 poll döngüsü) |
| **#4** | "Doğrula ve Ekle" butonlarının `!bulkScanFinished`/`nativeScanRunning` kilidi kaldırıldı → bulunan (zaten doğrulanmış) hesaplar tarama sürerken eklenebilir; etikete "· tarama sürüyor" | `app/add-playlist.tsx` (bulk + keşif) |
| **#5** | Deferred (ekrandan çıkınca ertelenen) tarama artık PROCESS_RESTARTED auto-recovery'den MUAF (`scanDeferredByUser` gate) → yarım tarama her girişte diriltilmiyor | `app/add-playlist.tsx` |
| **#6** | `startStreamingFileScanV172`'ye giden dizin `sources` çıkarılarak sıkıştırılır (`compactDirectory`) → Binder ~1 MB taşması biter, combo-dosya taraması çalışır (§5) | `app/add-playlist.tsx` |
| **#7** | Dosyadan toplu içe aktarımda GENEL ilerleme ("Hesap X/N işleniyor · N eklendi" + çubuk); overlay hit-import boyunca görünür; yanıltıcı tek-liste "0/1" gizlenir | `app/add-playlist.tsx` |

**Native (Kotlin) değişiklik YOK** — tümü TS/TSX. `assembleDebug` sözleşme gereği zorunlu değil;
kullanıcı isteğiyle PC DEV derlemesi yine yapıldı (§5 altına kaydedilecek).

## 3. Mimari uyum / regresyon koruması

- #4: `addSelectedBulkCandidates` yalnız `bulkCandidates` (bulunan sonuçlar) üzerinde çalışır,
  taramanın bitmesine bağlı değil → tarama sürerken çağrılması güvenli (dedup mevcut playlist'e karşı).
- #6: Native tarayıcı yalnız panelName/code/hosts probe eder; `sources` tarama sonrası JS'te
  `directoryRef`'ten çözülür (`add-playlist.tsx:~723` fallback) → işlev korunur, yalnız Binder yükü düşer.
  §5 "sources köprüden geçmez" kuralına UYUMLU (startUnifiedScanV171 zaten compactPayload kullanıyordu).
- #3: Yalnız poll ARALIĞI değişti; tarama mantığı, journal cursor'u (artımlı) ve sonuç birleştirme aynı.
- #5: Deferred değilse davranış birebir eskisi gibi. "Find more" özelliği kaldırılmadı (§2.4).
- Hiçbir özellik çıkarılmadı/azaltılmadı; `package.json`'a paket EKLENMEDİ.

## 4. Doğrulama (PC)
- `yarn tsc --noEmit`: **PASS** (22.8 sn).
- `node tools/check-v18737-release.js`: **PASS** (7 madde + 5 sürüm alanı).
- `node tools/denetle.js`: <doldurulacak>.
- PC DEV `assembleDebug`: <doldurulacak>.
- Satır-sonu: `git diff --check` temiz; diff 4 dosya / ~91 ekleme (CRLF şişmesi yok).

## 5. Cihaz kabul senaryoları (YAPILMADI — telefon çıkarıldı)
1. **#6:** Combo "Çoklu Hesap → dosya seç" → artık `TransactionTooLargeException` YOK, hesaplar bulunur.
2. **#4:** Tarama sürerken "Doğrula ve Ekle" basılabilmeli; bulunanlar hemen eklenmeli.
3. **#5:** "Liste Ekle"den çıkıp tekrar girince yarım tarama KENDİLİĞİNDEN ikinci turu başlatmamalı.
4. **#7:** Dosyadan içe aktarırken "Hesap X/N işleniyor" görünmeli (tek-liste "0/1" değil).
5. **#1:** HitFileImport önizleme ekranında alt buton çubuk altında kalmamalı.
6. **#2:** MAG MAC/seri no alanına dokununca alan klavye üstüne kaymalı.
7. **#3:** Uzun ikinci turda JS thread (ekran akıcılığı) rahatlamalı.

**Abartma yok:** #3 retry'ın NATIVE hızını değiştirmez (yalnız JS poll yükünü azaltır); #5 derin
resume mantığının tek güvenli gate'ini ekler, tam davranışı cihazda doğrulanmalı. Keşif taramasının
kendisi (9314 adres) doğası gereği yavaş kalır — asıl hızlı yol dosyadan içe aktarmadır (#6/#7).

## 6. Gerçek teslim kaydı — Opus, 13.11.2026
<commit/push/run/APK bilgileri doldurulacak>
