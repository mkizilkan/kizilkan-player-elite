/**
 * KIZILKAN PLAYER — withLargeHeap (v17.9.9)
 * ===========================================================================
 * BU PLUGIN NE YAPIYOR?
 * ---------------------------------------------------------------------------
 * <application android:largeHeap="true"> özniteliğini yazar.
 *
 * NEDEN GEREKLİ?
 * ---------------------------------------------------------------------------
 * 23.09 cihaz kaydında büyük bir katalog (13.174 kanal + film + dizi) onarımı
 * OutOfMemoryError ile çöktü:
 *
 *   Failed to allocate a 75497480 byte allocation with 49186800 free bytes
 *   and 46MB until OOM, target footprint 402653184, growth limit 402653184
 *
 * Bu, CİHAZIN RAM'i (16 GB) ile ilgili DEĞİL. Android her uygulamaya sabit bir
 * Java heap sınırı verir; bu cihazda ~384 MB (growth limit 402653184). Katalog
 * bu sınıra dayanmışken 75 MB'lık tek blok (JSON.stringify çıktısı) istenince
 * aşılıyor. 16 GB RAM'in önemi yok — uygulama kendi heap limitinin üstüne
 * çıkamaz.
 *
 * largeHeap="true", Android'e bu uygulama için daha büyük bir heap ayırmasını
 * söyler (cihaza göre değişir, tipik olarak 512 MB veya daha fazla). Bu, kök
 * çözüm DEĞİL ama sınırı yükselterek acil rahatlama sağlar; asıl çözüm
 * payload'ın parçalı gönderilmesidir (bkz. PlaylistContext kind-başına sync).
 *
 * NOT: largeHeap her uygulama için önerilmez (Android belgeleri "gerçekten
 * gerekmedikçe kullanmayın" der), ama büyük medya katalogları işleyen bir IPTV
 * oynatıcısı bunun meşru bir kullanım durumudur — çoğu büyük IPTV uygulaması
 * (TiviMate dahil) aynısını yapar.
 */
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const withLargeHeap = (config) => {
  return withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    application.$['android:largeHeap'] = 'true';
    return cfg;
  });
};

module.exports = withLargeHeap;
