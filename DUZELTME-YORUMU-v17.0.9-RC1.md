# DÜZELTME YORUMU — v17.0.9 RC1

GitHub Actions v17.0.8 RC1 build logu `:panel-scan:compileReleaseKotlin` taskında beş kaynak hata gösterdi: bulk worker sayısında Int/Long `minOf`, unified Long karşılaştırmalarında Int literal, kaldırılmış `offsets` referansı ve Long modulo karşılaştırması. v17.0.9 bunları doğrudan kök nedenden düzeltir.

En kritik değişiklik `offsets` yerine round-robin resume reconstruction'dır. Unified taramanın layer sırası korunur; `safeStart` önce tamamen tamamlanan layer sayısına, ardından mevcut layer içindeki account-order prefixine ayrılır. Böylece heterojen candidate sayılarında `completedByAccount` gerçek contiguous checkpoint prefixiyle uyumludur.
