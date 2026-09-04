#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const src = read('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt');
const denetle = read('tools/denetle.js');
function ok(cond, msg) {
  if (!cond) { console.error('FAIL — ' + msg); process.exit(1); }
  console.log('✓ ' + msg);
}
function blockBetween(startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  ok(start >= 0 && end > start, `${startNeedle} bloğu bulundu`);
  return src.slice(start, end);
}
const bulk = blockBetween('private fun writeBulkSnapshot(', 'private fun writeUnifiedSnapshot(');
const unifiedStart = src.indexOf('private fun writeUnifiedSnapshot(');
const unifiedEnd = src.indexOf('private fun runUnifiedScanFromStaging(', unifiedStart);
ok(unifiedStart >= 0 && unifiedEnd > unifiedStart, 'writeUnifiedSnapshot bloğu bulundu');
const unified = src.slice(unifiedStart, unifiedEnd);
ok(!/extra\s*:\s*JSONObject/.test(bulk) && !bulk.includes('if (extra != null)') && !bulk.includes('extra.keys()') && !bulk.includes('extra.opt(key)'),
   'legacy writeBulkSnapshot tanımsız extra metadata değişkeni kullanmıyor');
ok(/extra\s*:\s*JSONObject\?\s*=\s*null/.test(unified),
   'writeUnifiedSnapshot extra metadata parametresini koruyor');
ok(unified.includes('if (extra != null)') && unified.includes('extra.keys()') && unified.includes('extra.opt(key)'),
   'unified snapshot extra metadata merge davranışı korunuyor');
ok(denetle.includes('check-v1710-panelscan-snapshot-extra-scope.js'),
   'PanelScan snapshot extra-scope gate denetle zincirine bağlı');
console.log('PASS: v17.1.0 PanelScan snapshot extra-scope Kotlin corrective contract TEMİZ');
