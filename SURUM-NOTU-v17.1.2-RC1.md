# KIZILKAN PLAYER ELITE v17.1.2 RC1

## Amaç
v17.1.1 RC1 GitHub Actions Android release derlemesinde `:panel-scan:compileReleaseKotlin` aşamasını durduran gerçek Kotlin API uyumsuzluğunu gidermek.

## Kanıtlanmış kök neden
CI derleyici mesajı:

`PanelScanModule.kt:332:43 Too many arguments for 'fun InputStream.bufferedReader(charset: Charset = ...): BufferedReader'`

v17.1.1 native büyük dosya akış okuyucusunda `stream.bufferedReader(Charsets.UTF_8, 64 * 1024)` kullanılmıştı. Bu extension yalnız charset parametresi kabul ediyor.

## Düzeltme
Akış mimarisi ve 64 KiB buffer korunarak çağrı şu yapıya çevrildi:

`BufferedReader(InputStreamReader(stream, Charsets.UTF_8), 64 * 1024)`

Bu değişiklik ham TXT/CSV dosyasını JS tarafında tek büyük String'e dönüştürmeden satır-satır native okuma hedefini korur.

## Sürüm
- App: 17.1.2
- Android versionCode: 170102
- iOS buildNumber: 17.1.2
- Etiket: GPT ELITE v17.1.2 RC1
