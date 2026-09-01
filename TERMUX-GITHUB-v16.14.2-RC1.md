# Termux / GitHub — v16.14.2 RC1 Integrated Recovery

Telefon çalışma klasörü: `/sdcard/Download/kizilkan-player`

## 1. Mevcut klasörü güvene al ve yeni ZIP'i aç

```bash
cd /sdcard/Download
mv kizilkan-player "kizilkan-player-backup-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
mkdir -p kizilkan-player
unzip -o KIZILKAN-PLAYER-v16.14.2-RC1-INTEGRATED-RECOVERY.zip -d kizilkan-player
cd /sdcard/Download/kizilkan-player
```

## 2. Kaynak hard-gate

```bash
node tools/denetle-v16142.js
```

MPV packaging bu aşamada AAR/release output henüz yoksa BLOCKED yazabilir; kaynak suite bunu yanlış PASS saymaz.

## 3. Dependency-resolved TypeScript kontrolü

```bash
cd /sdcard/Download/kizilkan-player/frontend
yarn install --frozen-lockfile
npx tsc --noEmit
cd /sdcard/Download/kizilkan-player
```

## 4. Android prebuild/release ortamı varsa MPV paketleme doğrulaması
Generated Android proje ve Gradle release output oluşturulduktan sonra:

```bash
node tools/check-mpv-packaging-v16142.js
```

Bu gate `libmpv.so`, arm64-v8a ve `libc++_shared.so` kanıtını arar.

## 5. GitHub

```bash
cd /sdcard/Download/kizilkan-player
git init 2>/dev/null || true
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/mkizilkan/kizilkan-player-elite.git
git fetch origin
git checkout -B v16.14.2-rc1-integrated
git add -A
git status
git commit -m "KIZILKAN PLAYER v16.14.2 RC1 - integrated recovery hardening"
git push -u origin v16.14.2-rc1-integrated
```

Ana dala birleştirme, cihaz/build doğrulaması tamamlandıktan sonra yapılmalıdır.
