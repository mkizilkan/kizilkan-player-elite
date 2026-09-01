# DÜZELTME YORUMU — v15.2.16-RC1

v15.2.15 cihaz bulgularında MAG playlist yüklemenin görünür hata vermeden geri dönmesi, MAG kanal zap süresinin yüksek olması ve çoklu taramada aralıklı process reset gözlendi.

v15.2.16 bunları kör fallback/timeout artışıyla gizlemez. MAG oturumunu cache'leyip yalnız auth reddinde yeniler, get_profile aşamasını varyant bazında ölçer, katalog hatasını kullanıcıya taşır; Player/Scan/Process telemetry için kalıcı ve credential-redacted bir flight recorder kurar.

Restore önizleme/admin-normal kullanıcı yetki modeli ve playlist sıralama UX'i bu paket içinde tamamlanmış sayılmaz; ayrı onaylı geliştirme fazında ele alınacaktır.
