# KIZILKAN PLAYER — FAZ A Kurulum ve APK Derleme Kılavuzu

**Sürüm:** v4.3.1
**Tarih:** 24 Temmuz 2026
**İçerik:** 8 dosya (5 yeni, 3 güncelleme)

---

## 1. DOSYALARI YERLEŞTİRME

Zip'in içindeki `frontend/` klasörünü, projendeki `frontend/` klasörünün **üzerine** kopyala.
Klasör yapısı birebir aynı, yanlış yere düşme ihtimali yok.

| Dosya | Konum | Durum |
|---|---|---|
| `babel.config.js` | `frontend/` | YENİ |
| `eas.json` | `frontend/` | YENİ |
| `app.json` | `frontend/` | **ÜZERİNE YAZ** |
| `withCleartextTraffic.js` | `frontend/plugins/` | YENİ (klasör de yeni) |
| `withAndroidTV.js` | `frontend/plugins/` | YENİ |
| `ErrorBoundary.tsx` | `frontend/src/components/` | YENİ |
| `_layout.tsx` | `frontend/app/` | **ÜZERİNE YAZ** |
| `+not-found.tsx` | `frontend/app/` | YENİ |

Yerleştirdikten sonra `frontend/` şöyle görünmeli:

```
frontend/
├── app.json                    <- degisti
├── babel.config.js             <- YENI
├── eas.json                    <- YENI
├── eslint.config.js
├── metro.config.js
├── package.json
├── tsconfig.json
├── yarn.lock
├── .env
├── plugins/                    <- YENI KLASOR
│   ├── withAndroidTV.js
│   └── withCleartextTraffic.js
├── app/
│   ├── _layout.tsx             <- degisti
│   ├── +not-found.tsx          <- YENI
│   └── ... (diger rotalar)
└── src/
    └── components/
        ├── ErrorBoundary.tsx   <- YENI
        └── ... (diger bilesenler)
```

---

## 2. EAS BUILD İLE ÜCRETSİZ APK

### Gereksinimler
- Ücretsiz Expo hesabı: https://expo.dev/signup
- Node.js 20+ kurulu bir terminal (bilgisayar, WSL, VPS veya GitHub Codespaces)
- Ücretsiz plan: ayda 15 Android build, düşük öncelikli kuyruk

### Adımlar

```bash
# 1) EAS CLI kur
npm install -g eas-cli

# 2) Giris yap (tarayici acilir)
eas login

# 3) Proje klasorune gec
cd frontend

# 4) Bagimliliklari kur
yarn install

# 5) Projeyi EAS'e bagla (app.json'a projectId ekler)
eas init

# 6) APK'yi derle
eas build --profile tvbox --platform android
```

6. adımda sorular gelir:

| Soru | Cevap |
|---|---|
| `Generate a new Android Keystore?` | **Yes** |
| `Would you like to automatically create an EAS project?` | **Yes** |

Build 10–45 dakika sürer (ücretsiz kuyruk). Bitince terminalde ve
https://expo.dev/accounts/[kullanici-adin]/projects/frontend/builds
adresinde indirme linki çıkar.

---

## 3. APK'YI TV BOX'A KURMA

1. TV Box'ta **Ayarlar → Güvenlik → Bilinmeyen kaynaklar** açık olmalı
2. APK'yı indir:
   - TV Box tarayıcısıyla EAS linkini aç, veya
   - `Downloader` (AFTV) uygulamasıyla linki gir, veya
   - USB bellek ile taşı
3. **ÖNEMLİ:** Paket adı `com.emergent.pythonappbuilder.c9se6h` -> `com.kizilkan.player`
   olarak değişti. Bu Android için **bambaşka bir uygulama** demektir.
   Yeni APK'yı kurmadan önce **eski uygulamayı kaldır.**

---

## 4. BU BUILD'DE NE TEST EDİLECEK

| # | Test | Beklenen sonuç |
|---|---|---|
| 1 | `http://` ile başlayan bir kanal aç | **Görüntü gelmeli** (asıl düzeltme bu) |
| 2 | `https://` ile başlayan bir kanal aç | Eskisi gibi çalışmalı |
| 3 | TV Box ana ekranına bak | KIZILKAN Player **görünmeli** (leanback) |
| 4 | Uygulamayı aç-kapa | Beyaz ekran yerine düzgün açılış |

---

## 5. SORUN ÇIKARSA

### Build hatası: VLC / new architecture
`app.json` içinde `"newArchEnabled": true` -> `false` yap, tekrar dene.
`react-native-vlc-media-player@1.0.98` eski bir kütüphane, Yeni Mimari
desteği olmayabilir.

### http hâlâ çalışmıyorsa
Manifest'i kontrol et. Yerel makinede:

```bash
npx expo prebuild --clean -p android
grep -i cleartext android/app/src/main/AndroidManifest.xml
```

Çıktıda şu olmalı:
```
android:usesCleartextTraffic="true"
android:networkSecurityConfig="@xml/network_security_config"
```

Yoksa manifest çıktısını paylaş.

### Build kuyrukta çok bekliyorsa
Ücretsiz plan düşük önceliklidir. Alternatif: GitHub Actions (public repo'da
sınırsız ücretsiz) veya `eas build --local` (kotadan düşmez).

---

## 6. SIRADAKİ FAZ

**FAZ B — Backend Bağımsızlığı**
emergent.sh kredisi bittiğinde MAG/Stalker portalı, XMLTV EPG, Catch-up
listesi ve DVR özellikleri çalışmayı durduracak. Bunların hepsi cihaz
içine taşınacak, uygulama hiçbir sunucuya ihtiyaç duymayacak.
