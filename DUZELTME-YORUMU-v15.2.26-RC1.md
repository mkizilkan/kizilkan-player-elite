# DÜZELTME YORUMU — v15.2.26 RC1

Kök neden: v15.2.25 RC3 paketinde `frontend/package.json` içinde bulunan `@react-native-tvos/config-tv@^0.1.6`, paketlenmiş `frontend/yarn.lock` içinde kilitli değildi. Bu nedenle `yarn install --frozen-lockfile` doğrudan başarısız oluyordu.

Düzeltme:
- Bağımlılık kaldırılmadı; TV desteği korunmuştur.
- Lockfile gerçek Yarn çözümlemesiyle yeniden oluşturulmuş ve pakete entegre edilmiştir.
- Aynı regresyonun tekrar etmemesi için özel lockfile/package hard-gate eklenmiştir.
- Sürüm v15.2.26 RC1 / versionCode 150226 olarak yükseltilmiştir.

Not: Çalıştırılmayan hiçbir test PASS olarak raporlanmaz.
