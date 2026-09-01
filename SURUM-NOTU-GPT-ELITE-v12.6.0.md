# GPT KIZILKAN PLAYER ELITE v12.6.0

## Düzeltmeler
- v12.5.0 açılış/playlist ekleme sırasında senkron çalışan +18 taraması kritik yoldan kaldırıldı.
- +18 cache'i 300 öğelik batch'ler halinde event-loop'a yield ederek arka planda hazırlanır; playlist açılışı/kaydı bunu beklemez.
- DNS/normal Xtream eklemede Canlı/Film/Dizi aşamaları ayrı ilerleme verir; kaydetme ve arka plan +18 hazırlığı ayrıca gösterilir.
- Tümünü Güncelle iki kontrollü worker ile çalışır; tek yavaş panel tüm 9 playlist kuyruğunu seri olarak bloke etmez.
- Tümünü Güncelle canlı/film/dizi ve kaydetme aşamalarını listeler bazında gösterir.
- v12.5.0 tüm-DNS, gesture izolasyonu, auto-continue, ELITE package/storage ve diğer geliştirmeler korunur.

## Sürüm
- version: 12.6.0
- buildNumber: 12.6.0
- versionCode: 120600
- package: com.gpt.kizilkan.player
