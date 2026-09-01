# Denetleyiciler

Her paket öncesi çalıştır:

```bash
cd frontend
node ../tools/denetle.js
```

Çıktı `✅ TÜM DENETİMLER TEMİZ` değilse **paketleme.**

## Gereksinim
TypeScript parser: `/home/claude/verify/node_modules/typescript`
Yoksa: `mkdir -p ~/verify && cd ~/verify && npm i typescript`
(Yol farklıysa tools/*.js içindeki require yolunu güncelle.)

## Araçlar
| Dosya | Yakaladığı |
|---|---|
| checkdefs.js | Tanımsız hook / JSX bileşeni |
| checkcalls.js | Tanımsız fonksiyon çağrısı |
| checkctx.js | Tanımsız context value alanı |
| checkdeps.js | Bayat kapanış (stale closure) |
| checkjsx.js | Tanımsız JSX prop değişkeni |
| checktdz.js | Kullanım-önce-tanım (const hoisting) |
| checkhooksrc.js | Yanlış hook kaynağı |
| checkimports.js | Eksik nokta-import (Modal/Alert/Pressable…) |

Her biri gerçek bir çökmeden sonra yazıldı — ayrıntı: `../DEVIR-NOTU.md`
