# DÜZELTME YORUMU — v17.1.2 RC1

Bu sürüm dar kapsamlı bir build corrective'tir. v17.1.1'de eklenen native TXT/CSV streaming parser geri alınmadı ve JS `response.text()` yoluna dönülmedi.

Kök neden Kotlin standard library API sözleşmesiydi: `InputStream.bufferedReader()` buffer size parametresi kabul etmiyor. 64 KiB buffer gereksinimi `java.io.BufferedReader` constructor'ına taşındı.

Ayrıca v17.1.1 edit transaction hard-gate'i yeni patch sürümlerinde yanlış negatif üretmemesi için `17.1.1+ / versionCode >= 170101` uyumlu hale getirildi. Bu yalnız gate sürüm uyumluluğu düzeltmesidir; ürün davranışını değiştirmez.
