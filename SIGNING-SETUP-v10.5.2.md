# GPT KIZILKAN Player — Kalıcı Android İmza Kurulumu (v10.5.2)

## Neden gerekli?
Android bir APK'yi mevcut uygulamanın üzerine güncelleme olarak yalnızca şu üç şartla kurar:
1. package ID aynı: `com.kizilkan.player`
2. yeni `versionCode` daha büyük
3. APK aynı özel anahtarla imzalanmış

GitHub Actions runner'ındaki geçici/debug imza build'ler arasında değişebildiği için v10.5.2'den itibaren release build kalıcı keystore Secrets olmadan bilinçli olarak durur.

## GitHub'a eklenecek Repository Secrets
Repository → **Settings → Secrets and variables → Actions → New repository secret**

Aşağıdaki dört secret gerekli:
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Özel keystore ve değerler, proje ZIP'inin DIŞINDA verilen `GPT-KIZILKAN-v10.5.2-SIGNING-PRIVATE.zip` paketindedir.

> **ÖNEMLİ:** `.jks`, parola dosyası veya base64 keystore metnini GitHub reposuna commit ETMEYİN. Bunlar özel imza anahtarıdır. Kaybolursa mevcut kullanıcılara aynı package ID ile güncelleme veremezsiniz.

## İlk geçiş notu
v10.5.1 ve daha eski APK'lar farklı/geçici imzayla kurulmuş olabilir. Bu nedenle v10.5.2 ilk kalıcı-imza sürümü olarak eski kurulumun üzerine kurulmayabilir. Gerekirse eski uygulamayı bir kez kaldırıp v10.5.2'yi kurun. **v10.5.2'den sonraki build'lerde aynı dört GitHub Secret korunursa normal güncelleme zinciri devam eder.**

## CI doğrulaması
Workflow artık APK üretildikten sonra:
- package ID
- versionCode
- `apksigner verify`
- sertifika SHA-256

kontrollerini yapar ve sonucu Actions özetine yazar. Doğrulama başarısızsa Release oluşturulmaz.
