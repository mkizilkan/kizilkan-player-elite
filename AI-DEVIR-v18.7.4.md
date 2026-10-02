# AI devir — v18.7.4 RC1

Dal: `v18.7.4-rc1-mac-discovery`, taban: `fbbe2d7d`, tarih02.10.2026. Önceki APK18.7.3/build123.

1. Çoklu MAC artık iki aşama: MAC'siz host/API keşfi → manuel veya otomatik endpoint seçimi → yalnız seçilmiş API'de listedeki MAC doğrulaması.
2. Token/genel cihazprofili geçerli hesap sayılmaz; gerçekkimlik ve bounded katalog erişimi gerekir. Bozuk tarih bilinmiyor. MAC/endpoint sahipliği ve terminal koruma/cancel korunur.
3. onPause eski duraklatma işareti ve stalealways ayar yükleme yarışı kapanır. Aynı dış oturumda seek/fallback devamı korunur; native eski başlangıç durdurulur.
4. Proxy keşfi opt-in64KiB, hesap örneği1MiB native bytecap; eski tam katalog varsayılanları değişmez.
5. Beş sürüm alanı18.7.4/180704/RC1. Yeni bağımlılık yok. Ayrı DEV paketi ve verileri korunur.

Detaylı kanıt/plan/uygulama: [GPT-v18.7.4-MAC-PLAYER-RAPORU.md](GPT-v18.7.4-MAC-PLAYER-RAPORU.md). Opus'a aktarılacak dosya bazlı kayıt: [GPT-OPUS-GUNCELLEME-DEVRI.md](GPT-OPUS-GUNCELLEME-DEVRI.md).

Son denetim/derleme/cihaz/commit/manuel Actions sonuçları doğrulandıkça aşağıya eklenecek. İlk görüntü gecikmesinin tümü veya gerçek sağlayıcıdaki her hesabın çalıştığı henüz kanıtlanmış değildir.

## Opus devralma — 02.10.2026 (gerçek sonuçlar)

GPT'nin bıraktığı commit'siz çalışmada ilk `node tools/denetle.js` **3 kapı BAŞARISIZ** verdi (final koşu yapılmamıştı):
- `test-mag-account-validation.js`: harness `expo/fetch` transport'unu (M174-11) mock'lamıyordu → exact istek gönderilmeden düşüyordu. Harness'e `expo/fetch` mock'u (gerçek `route`, transport 'native') eklendi; assertion korundu.
- `test-mag-bulk-runtime.js`: (a) requestScope iptali `BACKGROUND_PAUSE` atıyor, test `CANCELLED` bekliyordu → **kod**: `handshakeAbortError(cred)` (requestScope varsa CANCELLED, yoksa yaşam döngüsü BACKGROUND_PAUSE); (b) aynı `expo/fetch` mock eksikti; (c) yeni sahiplik serbest değişkenleri (`profileEpoch`, `actionRunRef`, `resetProfileEpochRef`, `runRef`) test `values`'ına eklendi.
- `test-mag-action-ownership.js`: denetle.js'e kayıtlı ama **dosya hiç oluşturulmamıştı**. Gerçek mag-bulk `addValid` gövdesini çıkaran ABA testi yazıldı (sahip değilken erken çıkış + A→B→A'da eski işlemin yeni işlemi ezmemesi).

**DÜZELTME: raporun "PlaylistContext ABA (M174-13) değişti" iddiası yanlış** — `git` o dosyanın değişmediğini gösteriyor. mag-bulk işlem sahipliği (M174-12) GERÇEKTEN var ve artık test ediliyor; PlaylistContext profil-ABA parçası UYGULANMADI (ayrı ele alınacak, onaysız kodlanmaz).

Düzeltmelerden sonra: `yarn tsc --noEmit` temiz · `node tools/denetle.js` **TÜM DENETİMLER TEMİZ (exit 0)**.
DEV derleme: `assembleDebug` **BUILD SUCCESSFUL 18m28s** (PanelScan Kotlin dahil). OnePlus 7 Pro'ya `18.7.4-dev` / `180704` kuruldu, **çökmeden açıldı** (PID var, crash buffer boş, MainActivity ön planda).

Player açılış/timeshift kod incelemesi: "Her zaman" modunda ilk görüntü KASITLI olarak yerel kaydedici hazır olana kadar bekletiliyor (çift bağlantı/indirme önlemi, enginePlaybackRequest=null, PlayerHost.tsx:1194-1203); "Duraklatınca"/"Kapalı"da doğrudan upstream (gecikme yok). Duraklat/seek'in BAŞKA kanalın ilk karesine sızması (P174-01) sahiplik jetonu + arm sıfırlama ile kodda kapalı. Mod bazında sayısal ilk-kare farkı cihaz logu ile ölçülecek (telemetri hazır).

Kalan cihaz kabulü: gerçek sağlayıcıda portsuz keşif + hesap doğrulama; "Her zaman" vs "Kapalı" ilk-kare log kıyası.
