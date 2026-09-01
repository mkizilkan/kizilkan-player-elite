# KIZILKAN PLAYER v9.4.0

## ✅ 1) ŞİFREYİ GÖSTER
Xtream listesini düzenlerken şifre yıldızlıydı; kayıtlı değeri göremiyordun.
Artık göz simgesiyle açılıp kapanıyor.

## ✅ 2) HİLAL — TÜRK BAYRAĞI BİÇİMİNDE
Eskiden Ionicons'un "moon" simgesi kullanılıyordu; o YATIK bir aydır,
bayraktaki hilale benzemiyordu.

Gerçek hilal İKİ DAİREYLE çizildi:
  1) dolu daire (marka rengi)
  2) üstüne sağa kaydırılmış, arka plan renginde ikinci daire
Aradaki hilal biçimi ortaya çıkıyor. Ağzına da yıldız yerleştirildi.

NOT: SVG paketi eklemedim — yeni native paket derleme riski demek.
Bu yüzden saf View ile çizildi, ek bağımlılık YOK.

## ⚠️ UYGULAMA SİMGESİ (app icon) HAKKINDA
Uygulama listesinde görünen simge bir PNG dosyasıdır (assets/icon.png).
Ben görsel üretemiyorum, bu yüzden onu DEĞİŞTİREMEDİM.
Yukarıdaki hilal, uygulama İÇİNDEKİ logoyu (açılış, başlıklar) etkiler.

App icon'u da değiştirmek istersen: 1024x1024 PNG hazırlayıp
frontend/assets/icon.png (ve adaptive-icon.png) üzerine yazman yeterli.

## v9.3.0'ın işleri bu pakette
Alan arası geçiş, liste yanında hesap özeti, liste kilidi (PIN),
ayar kutusunun dokununca kapanması.

## AYRI PAKET: TV DOSYALARI
KIZILKAN-TV-DOSYALARI-v9.4.0.zip — TV Box'la ilgili 13 dosya + tanı özeti.
Başka bir yapay zekâya danışmak istersen o paketi ver; içinde:
• Çözülemeyen 7 sorunun cihaz raporları
• Denenen ve YETMEYEN çözümler
• Tekrar tuzağa düşmemek için teknik notlar
