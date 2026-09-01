# v15.2.9-RC1 Regresyon Denetimi

- [ ] `npx tsc --noEmit` geçer.
- [ ] `:panel-scan:compileReleaseKotlin` geçer.
- [ ] `:kizilkan-native-core:compileReleaseKotlin` geçer.
- [ ] Release APK derlenir ve imza doğrulanır.
- [ ] Kodum var: code -> candidate -> scan -> seçim -> import -> Room -> playlist.
- [ ] Paneli biliyorum: seçilen hosts[] doğrudan taranır; ikinci Firebase lookup yok.
- [ ] Paneli bilmiyorum: directory/cache -> tüm adaylar -> native scan.
- [ ] Devam eden scan varken yeni scan açık BUSY kararı verir; sessiz kaybolmaz.
- [ ] Pause/Resume/Cancel yalnız kendi runId'sine etki eder.
- [ ] Firebase timeout'ta UI bounded sürede hata/cache fallback davranışı gösterir.
- [ ] Background/foreground dönüşünde aktif run snapshot'ı korunur.
- [ ] Room/Cast/player önceki regresyon kapıları temiz kalır.
- [ ] Expired/disabled auth sonucu otomatik seçilmez.
- [ ] Aynı panelde iki çalışan DNS seçilse bile tek playlist oluşur; validatedHosts iki adresi de içerir.
