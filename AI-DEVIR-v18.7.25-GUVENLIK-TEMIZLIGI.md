# Opus devri — v18.7.25 hesap arşivi güvenlik temizliği

Tarih: 7 Ekim 2026. Kullanıcının açık talebi: herkese açık GitHub deposuna eklenmiş 579 hesaplık arşivi acilen depodan silmek.

## Kapsam

- Hedef dosya: `KIZILKAN-HESAP-ARSIVI-579-2026-10-07.txt`.
- Dosyayı ilk ve tek ekleyen commit: `b7e62889b8d5070a81d4e34d2521186eeb8d8c8e`.
- Güncel uzak referanslarda bu commit'i içerenler: `v18.7.25-rc1-contenttest-parallel-ui-macsafety` dalı ve `build-146` etiketi. Origin fetch ve contains kontrolüyle doğrulandı. Bu dal/commit için ilişkili pull request sorgusu boş döndü.
- Son commit, arşiv Git ağacından çıkarılarak yeniden oluşturuldu: `e808273e7bf5f984e15785c787c73c4068dd471b`. Dal ve build etiketi bu temiz commit'e atomik push ile taşındı. Push yalnız bu iki referansı kapsadı ve eski SHA için ayrı `force-with-lease` kontrolleri kullandı. Diğer dallar ve etiketler değiştirilmedi.
- `.gitignore` içine `KIZILKAN-HESAP-ARSIVI-*.txt` eklendi. Yerel arşiv korunuyor ancak artık Git tarafından takip edilmiyor; tekrar normal `git add` ile eklenmeyecek.
- Uygulama kaynakları, sürüm alanları ve APK değiştirilmedi. Yeni build/workflow tetiklenmedi. `build-146` APK asset'i korundu; release `target_commitish` temiz SHA'ya güncellendi.
- Temizleme sonrası GitHub eski commit SHA'sıyla dosyayı hâlâ sunduğu için kullanıcıdan ayrıca görünürlük tercihi istendi. Kullanıcı **“Geçici olarak özel yap”** yanıtıyla açık onay verdi. Depo PRIVATE yapıldı; GitHub API `isPrivate:true` ile doğrulandı.

## Doğrulama ve takip

Temizlik öncesinde .25 uygulama kaynakları için TypeScript ve bütün proje denetimleri geçti. Güvenlik değişikliğinde ek doğrulama: temiz commit ile eski commit arasında yalnız arşiv kaldırma, `.gitignore` ve bu devir belgesi farkı olması; uzak dal/etiketin temiz SHA'ya eşitliği; dosyanın bu referanslarda bulunmaması; dosya geçmişinin temiz referanslarda boş olması ve yerel arşivin ignored durumda olması.

Bu kontroller geçti. Dal ve build etiketinde contents API 404 verdi. PRIVATE değişikliğinden sonra **token/cookie/oturum kullanılmadan** üç HEAD kontrolü yapıldı: repository sayfası, eski SHA ile contents API ve eski SHA ile raw dosya bağlantısı. Üçü de **HTTP 404** döndürdü. Uzak fork sorgusu 0 döndürdü. Bu sonuç mevcut anonim erişimin kapandığını doğrular; daha önce indirilmiş kopyaları sildiği anlamına gelmez.

**Opus için önemli:** eski `b7e62889` commit'inden yeni dal açma, onu merge etme veya eski `build-146` referansını geri push etme. Bunlar temizlenen arşivi/tainted geçmişi yeniden yayınlayabilir. Yeni çalışma güncel, temiz uzak .25 dalından başlamalı. Temiz SHA için `git rev-parse origin/v18.7.25-rc1-contenttest-parallel-ui-macsafety` kullanılabilir.

Git referanslarının temizlenmesi, daha önce indirilmiş kopyaları veya GitHub'ın eski SHA/cache erişimini otomatik silmez. [GitHub'ın resmi hassas veri temizleme belgesi](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) bunun için sağlayıcı tarafında ek temizliğin gerekebileceğini açıklıyor. İfşa edilen hesap bilgileri yetki kapsamında değiştirilmelidir. GitHub Support'a başvuru gerekirse eski commit SHA'sı, etkilenen iki referans ve sıfır ilgili PR bilgisi kullanılmalı; başvuruya gerçek şifreler eklenmemeli. Bu çalışma kapsamında destek mesajı gönderilmiyor.

**Depoyu tekrar public yapmadan önce** eski SHA/blob/cache erişiminin sağlayıcı tarafında temizlendiği değerlendirilmelidir. Şu an eski obje GitHub'da yetkili erişimle hâlâ bulunabilir; PRIVATE değişikliği anonim erişimi kapatır. Yerelde `GPT-GITHUB-HASSAS-VERI-TEMIZLIGI-DESTEK-2026-10-07.md` başvuru taslağı hazırlandı.
