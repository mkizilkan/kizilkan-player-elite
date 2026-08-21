# GitHub'a Telefondan Yükleme ve APK Alma

Bu zip GitHub'a yüklenmeye HAZIR, eksiksiz projedir. emergent.sh ile ilgisi yoktur — tertemiz bir başlangıçtır.

---

## 1. GitHub hesabı ve repo (bir kez)

1. github.com → Sign up (ücretsiz)
2. Sağ üst **"+"** → **New repository**
3. İsim: `kizilkan-player`
4. **Public** seç (Actions sınırsız ücretsiz olur; Private'ta ayda 2000 dk)
5. **Create repository**

---

## 2. Dosyaları yükleme (telefondan) — 3 yol

### Yol C — Termux (EN KOLAY, önerilen)

F-Droid'den **Termux** kur (ücretsiz), sonra:

```bash
pkg update && pkg install git
cd /sdcard/Download/kizilkan-player    # zip'i açtığın klasör
git init
git add -A
git commit -m "KIZILKAN v4.3.1 FAZ A"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADIN/kizilkan-player.git
git push -u origin main
```

> Şifre sorulunca GitHub şifresi DEĞİL, **Personal Access Token** gir:
> GitHub → Settings → Developer settings → Personal access tokens →
> Tokens (classic) → Generate new token → `repo` yetkisi ver → kopyala.

### Yol A — GitHub web arayüzü

Yeni repoda **"uploading an existing file"** linkine bas. Bu zip'i telefonda
aç, klasörleri tek tek sürükle. Tarayıcıyı "masaüstü site" moduna alırsan kolaylaşır.
(Çok dosya olduğu için Termux'tan daha zahmetli.)

### Yol B — GitHub mobil uygulaması

GitHub uygulamasını kur, repoda "Add file" ile dosyaları ekle. Küçük
değişiklikler için pratik, ilk toplu yükleme için değil.

---

## 3. APK derleme (telefondan tek dokunuş)

1. Repo → **Actions** sekmesi
2. Sol menüden **"KIZILKAN APK Derle"**
3. Sağda **"Run workflow"** butonu
4. Seçenekler:
   - **Yeni Mimari**: `true` bırak (build patlarsa `false` yapıp tekrar çalıştır)
   - **Build tipi**: `release`
   - **Release oluştur**: işaretli
5. Yeşil **"Run workflow"** butonuna bas

20–40 dk sürer (sonraki build'ler 8–15 dk). İlerlemeyi Actions'tan izleyebilirsin.

---

## 4. APK'yı indirme ve kurma

Build bitince:

1. Repo → **Releases** (sağ tarafta)
2. En üstteki sürüme tıkla
3. **KIZILKAN-Player-v4.3.1-buildN.apk** linkine bas → iner
4. **ÖNEMLİ:** Kurmadan önce **eski uygulamayı kaldır** (paket adı değişti)
5. APK'yı aç → "Bilinmeyen kaynaklara izin ver" → kur

TV Box için: APK linkini `Downloader` uygulamasına yapıştır veya USB ile taşı.

---

## 5. Kurunca test et

| # | Test | Beklenen |
|---|---|---|
| 1 | `http://` bir kanal aç | **Görüntü gelmeli** (asıl düzeltme) |
| 2 | `https://` bir kanal aç | Eskisi gibi çalışmalı |
| 3 | TV Box ana ekranı | Uygulama görünmeli |
| 4 | Aç-kapa | Beyaz ekran yok |

---

## 6. Build patlarsa

Actions'ta build kırmızı olursa:

1. Önce **Yeni Mimari = false** ile tekrar dene (en olası çözüm)
2. Hâlâ patlıyorsa: build log'unun **son ekranını** al, geliştiricine gönder
3. Manifest doğrulaması build'in 8. adımında çıkar — "Summary" sayfasında
   http düzeltmesinin uygulanıp uygulanmadığını PC'siz görebilirsin
