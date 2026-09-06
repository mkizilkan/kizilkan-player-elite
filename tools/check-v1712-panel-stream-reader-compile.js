const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const file = path.join(ROOT, 'frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanModule.kt');
const src = fs.readFileSync(file, 'utf8');

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

if (/\.bufferedReader\s*\(\s*Charsets\.UTF_8\s*,/.test(src)) {
  fail('InputStream.bufferedReader(Charsets.UTF_8, size) geçersiz iki argümanlı çağrı hâlâ mevcut');
}
if (!src.includes('import java.io.BufferedReader')) {
  fail('java.io.BufferedReader importu yok');
}
if (!src.includes('import java.io.InputStreamReader')) {
  fail('java.io.InputStreamReader importu yok');
}
if (!/BufferedReader\s*\(\s*InputStreamReader\s*\(\s*stream\s*,\s*Charsets\.UTF_8\s*\)\s*,\s*64\s*\*\s*1024\s*\)\.use\s*\{\s*reader\s*->/.test(src)) {
  fail('64 KiB native streaming reader düzeltmesi bulunamadı');
}
if (!src.includes('context.contentResolver.openInputStream(uri)')) {
  fail('ContentResolver InputStream tabanlı native streaming yol korunmamış');
}
if (!src.includes('reader.readLine()')) {
  fail('satır-satır okuma davranışı korunmamış');
}

console.log('PASS: v17.1.2 PanelScan streaming reader compile corrective');
