# Yerel, Metro olmadan açılabilen DEV APK. Normal uygulamanın verilerine dokunmaz.
[CmdletBinding()]
param([switch]$Install,[string]$DeviceSerial,[switch]$SkipChecks)
$ErrorActionPreference='Stop'
$taskRoot=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$frontendRoot=Join-Path $taskRoot 'frontend'
$previousLocation=Get-Location
$previousJava=$env:JAVA_HOME
$previousJavaOptions=$env:JAVA_TOOL_OPTIONS
try {
  if (!$env:JAVA_HOME) {
    $jdkCandidate='C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
    if (Test-Path -LiteralPath (Join-Path $jdkCandidate 'bin\java.exe')) {$env:JAVA_HOME=$jdkCandidate}
  }
  if (!$env:JAVA_HOME -or !(Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {throw 'JDK 17 JAVA_HOME tanımlayın.'}
  if (!$env:ANDROID_HOME) {$env:ANDROID_HOME='C:\Android\Sdk'}
  if (!(Test-Path -LiteralPath $env:ANDROID_HOME)) {throw 'ANDROID_HOME Android SDK klasörünü göstermeli.'}
  $env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
  # JDK Windows Unix-domain pipe: uzun/kullanıcı adı içeren temp yolu bağlantıyı bozabilir.
  $socketRoot=Join-Path $taskRoot '.jdk-sockets'
  New-Item -ItemType Directory -Path $socketRoot -Force | Out-Null
  $socketJavaPath=$socketRoot.Replace('\','/')
  $env:JAVA_TOOL_OPTIONS="$previousJavaOptions -Djdk.net.unixdomain.tmpdir=$socketJavaPath".Trim()
  Set-Location -LiteralPath $frontendRoot
  if (!$SkipChecks) {
    & yarn.cmd tsc --noEmit
    if ($LASTEXITCODE -ne 0) {throw 'TypeScript denetimi başarısız.'}
    & node (Join-Path $taskRoot 'tools\denetle.js')
    if ($LASTEXITCODE -ne 0) {throw 'Regresyon denetimi başarısız.'}
  }
  & npx.cmd expo prebuild --platform android --no-install
  if ($LASTEXITCODE -ne 0) {throw 'Android prebuild başarısız.'}
  Set-Location -LiteralPath (Join-Path $frontendRoot 'android')
  & .\gradlew.bat :app:assembleDebug --no-daemon --console=plain
  if ($LASTEXITCODE -ne 0) {throw 'DEV APK derlemesi başarısız.'}
  $version=(Get-Content -LiteralPath (Join-Path $frontendRoot 'app.json') -Raw | ConvertFrom-Json).expo.version
  $apkRoot=Join-Path $taskRoot 'artifacts'
  New-Item -ItemType Directory -Path $apkRoot -Force | Out-Null
  $apkPath=Join-Path $apkRoot "KIZILKAN-$version-RC1-DEV.apk"
  Copy-Item -LiteralPath '.\app\build\outputs\apk\debug\app-debug.apk' -Destination $apkPath -Force
  Write-Host "DEV APK: $apkPath"
  if ($Install) {
    $adb=Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
    $devices=@(& $adb devices | Select-String '^\S+\s+device$' | ForEach-Object {($_.Line -split '\s+')[0]})
    if ($DeviceSerial) {if ($DeviceSerial -notin $devices) {throw 'Seçilen telefon bağlı/yetkili değil.'}}
    elseif ($devices.Count -eq 1) {$DeviceSerial=$devices[0]}
    elseif ($devices.Count -gt 1) {throw 'Birden çok cihaz var; -DeviceSerial belirtin.'}
    else {Write-Host 'Yetkili telefon bağlı değil. APK PC üzerinde hazır.';return}
    & $adb -s $DeviceSerial install -r -g $apkPath
    if ($LASTEXITCODE -ne 0) {throw 'DEV kurulamadı. Uygulama/verileri otomatik kaldırılmadı.'}
  }
} finally {
  $env:JAVA_HOME=$previousJava
  $env:JAVA_TOOL_OPTIONS=$previousJavaOptions
  Set-Location -LiteralPath $previousLocation.Path
}
