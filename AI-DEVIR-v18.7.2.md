# AI DEVİR — v18.7.2 RC1 (çoklu-MAC UX + keşif düzeltmesi)

**Taban:** `v18.7.1-rc1-startup-crash` (af59385c). **Dal:** `v18.7.2-rc1-multimac-ux`.
Kanıt: `kizilkan-diagnostics-2026-09-30T19-10-16-344Z.json` (v18.7.1, 1881 olay, 59 dk) + cihaz ekran görüntüsü.
Onay (30.09): A–G hepsi bu sürümde; kısayol düzeltmesi (eski quickActions.ts) ayrı → v18.7.3.

## Kanıtlı düzeltmeler
| # | Sorun | Kök neden (kanıt) | Düzeltme |
|---|---|---|---|
| A | MAG ekranı ters/açık renk | Tema paletinde `background` anahtarı YOK (`surface` var); `mag-bulk.tsx` kökü `colors.background` (undefined) kullanıyordu. `makeStyles(c: any)` olduğu için tsc yakalamadı | Kök `colors.surface`; `makeStyles(c: ThemePalette)` (any değil) → tsc bu sınıfı yakalar |
| B | Portsuz keşif 8080'i bulamıyor / 8 dk takılıyor | Log 18:14: `DISCOVERY candidateCount:24` → 8 dk sessizlik → NONE. (1) `magExactRequest` toplu taramada reddediliyor ("has been rejected"), her deneme 20-40 sn. (2) her ölü aday 20 sn timeout; port-dış/yol-iç sıra + 12'lik güvenli bütçe 8080'e ulaşamadan bitiyor | (1) toplu tarama hostları düz fetch (`setMagBulkRouting`, native exact atlanır). (2) keşifte kısa timeout (mod: 4-8 sn), aday başına bütçe sıfırlanır, **yol-öncelikli süpürme** (/c/ → /portal.php → /stalker_portal/c/ tüm portlarda), **port listesi 54'e** ve **yol listesi 14'e** genişletildi (kullanıcı listeleri dahil). Kapalı port anında reddedilir (yavaş değil) |
| C | Bilgilendirme yok ("hiç denenmedi") | Denenen port/yol, bulunan portal ekranda yok | `onStage` → canlı satır: "Portal aranıyor · host:port/yol (i/n)", "Portal bulundu: …" |
| G | Portsuz NORMAL MAG eklemede de bulamıyor | Tekil ekleme yalnız yolları deniyordu, portu URL'de bekliyordu | Portsuz adreste `discoverMagPortal` ile port/portal bulunur; bulunan portal KALICI kaydedilir (oynatma da onu kullanır) |

## Yeni özellikler
- **D — Analiz modları + paralel sayı:** Güvenli/Dengeli/Turbo (eşzamanlılık + timeout + aday sınırı) + elle "Paralel analiz sayısı" (1–16).
- **E — Dosyadan MAC:** `.txt/.csv` seç (expo-document-picker), MAC'ler ayrıştırılıp listeye eklenir.
- **F — Bulunanı kaydet:** görünür klasöre (`İndirilenler/KIZILKAN PLAYER ELITE/MAG Hesap Arşivi/`) TXT (portal|mac|durum|bitiş) + katalog özeti JSON (canlı/VOD/dizi kategori adları). Tam katalog, hesap eklenince senkronlanır.

Dosyalar: `frontend/src/utils/magBulk.ts` (portlar/yollar/sıralama, test `tools/test-mag-bulk.js`), `magBulkScan.ts` (mod/timeout/onStage/düz fetch), `src/utils/stalker.ts` (`setMagBulkRouting`, `discoverMagPortal` timeout/onProbe, `hostnameOf` eşleşme), `app/mag-bulk.tsx` (tema/mod/paralel/dosya/kayıt/canlı satır), `app/add-playlist.tsx` (portsuz normal ekleme). Kapı: `tools/check-v18702-release.js`.

## Doğrulama
`tsc` temiz · `test-mag-bulk.js` 7 grup · `check-v18702-release.js` TEMİZ · `denetle.js` TÜM DENETİMLER TEMİZ · `assembleDebug` + **telefonda adb testi**: sohbet özetinde.

## Cihaz testi
1. Çoklu MAC: kendi MAC'inle, **portsuz** adres → keşif 8080'i bulmalı, canlı satırda port/yol akmalı.
2. Renkler: ekran koyu tema (diğer ekranlarla aynı).
3. Analiz modu + paralel sayı; dosyadan MAC; bulunanı TXT+katalog kaydet (dosya yöneticisinde gör).
4. Normal MAG ekleme portsuz adresle.

## AÇIK — v18.7.3
Kısayolların asıl sorunu (eski `quickActions.ts` her açılışta bizimkinin üstüne yazıyor). Plan: `AI-DEVIR-v18.7.1.md` "AÇIK — v18.7.2" (numara kaydı; iş v18.7.3'e taşındı).
