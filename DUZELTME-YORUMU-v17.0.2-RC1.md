# DÜZELTME YORUMU — v17.0.2 RC1

## P0 kök neden
v17 numeric-zap native bridge'i `KEYCODE_0..9` ve `KEYCODE_NUMPAD_0..9` olaylarını `KizilkanRemoteKey` olarak yayınladıktan sonra `return true` ile global olarak tüketiyordu. Android/IME'nin KeyEvent ürettiği sayısal girişlerde bu, PIN TextInput'ın rakamı alamamasına yol açabilecek doğrudan tüketim noktasıydı.

## Düzeltme
Digit olayları JS'e gönderilmeye devam eder (numeric zap korunur) fakat digit için native event tüketilmez; normal Android input zinciri `super.dispatchKeyEvent(event)` ile devam eder. Medya/CH tuşlarının mevcut tüketim davranışı korunur.

## Ek geliştirmeler
Playlist/account seviyesinde User-Agent/Referer/Origin varsayımları ve açık öncelik zinciri eklendi. MAG/Stalker için auto/portal/device/manual timezone politikası, doğrulanmış portal timezone keşfi ve edit ekranı eklendi.

## Regresyon koruması
v17.0.2 hard-gate; PIN input, numeric zap, header inheritance, timezone ve v17.0.0/v17.0.1 preservation gate'lerini birlikte doğrular.
