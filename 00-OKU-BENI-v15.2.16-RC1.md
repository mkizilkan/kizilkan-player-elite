# KIZILKAN PLAYER ELITE v15.2.16-RC1

**Android versionCode:** 150216
**Tarih:** 2026-08-25

Bu sürüm v15.2.15-RC1 üstüne teşhis/telemetri ve MAG oturum/uyumluluk sertleştirmesi ekler.

Ana hedefler:
- KIZILKAN Tanılama Merkezi / kalıcı flight recorder.
- Player seçim → kaynak çözümleme → motor → ilk görüntü sürelerinin ölçülmesi.
- MAG kanal geçişinde gereksiz tekrar handshake/profile yerine güvenli session cache.
- 401/403/auth hatasında cache invalidation + tek fresh login retry.
- MAG get_profile varyantlarının kontrollü uyumluluk probu ve görünür aşama hataları.
- ApplicationExitInfo geçmişi + RAM + scan flight recorder korelasyonu.
- Hassas credential/token/PIN/MAC bilgisinin tanılama raporuna yazılmaması.

Bu pakette tam `npx tsc --noEmit`, Android Gradle release build ve gerçek cihaz kabul testi yapılmış sayılmaz. Gerçek build kanıtı GitHub Actions, davranış kanıtı yeni APK cihaz testidir.
