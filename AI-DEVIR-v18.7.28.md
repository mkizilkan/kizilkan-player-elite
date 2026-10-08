# AI devir — KIZILKAN PLAYER ELITE v18.7.28 RC1

Tarih: 08.10.2026. Dal: `codex/v18.7.28-rc1-proxy-sources`.
Taban: v18.7.27 / `43cc02c6c38b3e3e3b151eddc73994e4ef3e1cef`.

Kullanıcının açık isteğiyle ALPHA TEAM BATTALION ve ALPHA WOLFS kaynaklarındaki erişilebilir eksik proxy listeleri eklendi. İnceleme MD'sindeki diğer mimari öneriler kodlanmadı.

| Dosya | Değişiklik / neden |
|---|---|
| `frontend/src/utils/scanProxy.ts` | Katalog 11→19 kaynak, 30→47 URL. ALIILAPRO/OpenProxyList/Sunny9577/Jetkai/Clarketm/ShiftyTR/Opsxcq/Proxy4parsing yeni; TheSpeedX HTTP yeniden doğrulanıp mevcut sağlayıcıya eklendi. Eski 11 kaynağın bütün URL'leri korunuyor. Beş eski liste `fresh:false`. |
| `frontend/app/scan-proxy.tsx` | Eski kaynak için açık uyarı satırı. Mevcut indirme → ayrıştırma → ayrı native canlılık testi akışı kullanılıyor. |
| `frontend/app.json` + `frontend/package.json` | Beş sürüm alanı 18.7.28/180728/RC1; bağımlılık eklenmedi. |
| `GPT-PYTHON-KAYNAKLARI-EKLENEBILECEKLER-2026-10-08.md` | PY10/K14 düzeltildi: UI tekrar ayıklaması zaten mevcut, credential anahtarının küçük harfe çevrilmesi hatalı. |
| `GPT-ALPHA-TEAM-WOLFS-EK-INCELEME-2026-10-08.md` | Kaynak MD doğrulaması, 12 ek bulgu, feed güncellik/erişim kararları ve testler. |
| `CLAUDE.md` + `GPT-OPUS-GUNCELLEME-DEVRI.md` | Güncel kapsam, dosya değişiklikleri, kanıtlar ve kalan cihaz işleri. |

Doğrulama:

- 39 feed URL'i HTTPS/biçim kontrolü.
- 17 yeni URL gerçek uygulama parser'ıyla başarılı; HTTP/SOCKS türleri doğru.
- Mevcut URL'ler değişmemiş; katalogda URL tekrarı yok; yeni kaynaklar otomatik seçilmiyor.
- Gerçek `downloadProxySources` ile dört kaynağı birleştirme başarılı, 4.240 aday.
- `yarn tsc --noEmit`: PASS (37,50 sn).
- `node tools/denetle.js`: tüm kapılar PASS, exit 0.
- `git diff --check`: PASS.

Kotlin değişmedi, native derleme yapılmadı. Commit/push/manuel Actions/APK/kurulum henüz yapılmadı. Bu kontroller canlı proxy veya cihaz kabul testi yerine geçmez.

Yeni APK'da denenmesi gerekenler: kaynak ekranında 19 sağlayıcı/tür seçenekleri, beş eski kaynak etiketi, seçili kaynakları indir/test, uygulama yeniden açıldığında kullanıcı tercihlerinin korunması.

Kapsam dışında açık kalanlar: Önceki cihaz servis/kurtarma/ekrandan çıkış sorunları; MAG normal katalog yenileme hızı; katalog testi hata sebepleri ve gerçek ilk kare; `add-playlist.tsx:452` kullanıcı adı/şifreyi küçük harfe çeviren tekrar anahtarı. Bu güncelleme bunları çözmüş sayılmamalı.
