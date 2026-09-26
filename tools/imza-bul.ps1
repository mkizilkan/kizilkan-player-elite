<#
  KIZILKAN PLAYER — Hangi anahtar (keystore) güncel? (v18.2.0)

  NE YAPAR?
    Telefondaki uygulamanın (veya GitHub'daki son release APK'nın) imza
    parmak izini okur, verdiğiniz her .jks/.keystore dosyasının parmak iziyle
    karşılaştırır ve EŞLEŞENİ söyler. Eşleşen anahtar, telefona GÜNCELLEME
    olarak kurulabilen APK'yı imzalayan anahtardır.

  GÜVENLİK
    Şifreler yalnız BU pencerede, gizli girişle sorulur; hiçbir yere yazılmaz,
    kaydedilmez, ekrana basılmaz.

  KULLANIM (PowerShell)
    cd C:\Projeler\kizilkan-player-elite
    .\tools\imza-bul.ps1 -Keystores "D:\yol\anahtar1.jks","D:\yol\anahtar2.jks"

    Referans otomatik seçilir:
      1) USB/ağ ile bağlı telefon/TV box varsa (adb) → kurulu uygulamanın APK'sı
      2) yoksa → GitHub'daki son release APK (gh ile indirilir)
    Elle vermek için: -ReferenceApk "C:\...\app-release.apk"
#>
param(
  [Parameter(Mandatory = $true)][string[]]$Keystores,
  [string]$ReferenceApk = "",
  [string]$Package = "com.gpt.kizilkan.player"
)

$ErrorActionPreference = "Stop"
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "C:\Android\Sdk" }
$apksigner = Get-ChildItem -Path "$sdk\build-tools" -Recurse -Filter apksigner.bat -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
$adb = Join-Path $sdk "platform-tools\adb.exe"
$tmp = Join-Path $env:TEMP "kizilkan-imza"
New-Item -ItemType Directory -Force $tmp | Out-Null

function Norm([string]$fp) { return ($fp -replace '[^0-9A-Fa-f]', '').ToUpper() }

# ── 1) Referans APK ─────────────────────────────────────────────────────────
if (-not $ReferenceApk) {
  if (Test-Path $adb) {
    $devices = & $adb devices | Select-String "`tdevice$"
    if ($devices) {
      $path = (& $adb shell pm path $Package 2>$null | Select-String "base.apk" | Select-Object -First 1)
      if ($path) {
        $remote = ($path.ToString() -replace '^package:', '').Trim()
        $ReferenceApk = Join-Path $tmp "cihazdaki.apk"
        & $adb pull $remote $ReferenceApk | Out-Null
        Write-Host "Referans: cihazdaki kurulu uygulama ($Package)" -ForegroundColor Cyan
      }
    }
  }
}
if (-not $ReferenceApk) {
  if (Get-Command gh -ErrorAction SilentlyContinue) {
    Write-Host "Cihaz bulunamadı; GitHub'daki son release APK indiriliyor..." -ForegroundColor Cyan
    Remove-Item "$tmp\*.apk" -Force -ErrorAction SilentlyContinue
    gh release download --repo mkizilkan/kizilkan-player-elite --pattern "*.apk" --dir $tmp --clobber | Out-Null
    $ReferenceApk = (Get-ChildItem "$tmp\*.apk" | Select-Object -First 1).FullName
  }
}
if (-not $ReferenceApk -or -not (Test-Path $ReferenceApk)) { throw "Referans APK bulunamadı. -ReferenceApk ile verin." }
if (-not $apksigner) { throw "apksigner bulunamadı (Android SDK build-tools)." }

$certOut = & $apksigner.FullName verify --print-certs $ReferenceApk 2>&1 | Out-String
$refLine = ($certOut -split "`n" | Where-Object { $_ -match "certificate SHA-256 digest" } | Select-Object -First 1)
if (-not $refLine) { throw "APK imzası okunamadı:`n$certOut" }
$ref = Norm (($refLine -split ":", 2)[1])
Write-Host "Referans SHA-256: $ref`n"

# ── 2) Anahtarlar ────────────────────────────────────────────────────────────
$found = $false
foreach ($ks in $Keystores) {
  if (-not (Test-Path $ks)) { Write-Host "YOK: $ks" -ForegroundColor Yellow; continue }
  $sec = Read-Host -AsSecureString "Şifre ($([IO.Path]::GetFileName($ks)))"
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  try {
    $list = & keytool -list -v -keystore $ks -storepass $plain 2>&1 | Out-String
  } finally { $plain = $null }
  if ($list -match "password was incorrect|Keystore was tampered") { Write-Host "  Şifre yanlış: $ks`n" -ForegroundColor Red; continue }
  $alias = ""
  foreach ($line in ($list -split "`n")) {
    if ($line -match "^Alias name:\s*(.+)$") { $alias = $Matches[1].Trim() }
    if ($line -match "SHA256:\s*(.+)$") {
      $fp = Norm $Matches[1]
      $ok = $fp -eq $ref
      $color = if ($ok) { "Green" } else { "Gray" }
      Write-Host ("  {0}  alias={1}  {2}" -f ([IO.Path]::GetFileName($ks)), $alias, $(if ($ok) { "✔ EŞLEŞİYOR — GÜNCEL ANAHTAR BU" } else { "eşleşmiyor" })) -ForegroundColor $color
      if ($ok) { $found = $true }
    }
  }
  Write-Host ""
}
if (-not $found) { Write-Host "Hiçbir anahtar eşleşmedi. Başka bir yedek dosyanız olabilir." -ForegroundColor Yellow }
