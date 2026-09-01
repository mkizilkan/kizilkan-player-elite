#!/usr/bin/env node
/**
 * KIZILKAN PLAYER ELITE v15.2.4 — APK footprint auditor.
 * APK'yi değiştirmez. `unzip -l` manifestinden ABI/native .so/asset toplamlarını
 * çıkarır ve tekrar üretilebilir bir metin raporu yazar.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const apk = process.argv[2];
const outArg = process.argv[3];
if (!apk || !fs.existsSync(apk)) {
  console.error(`APK bulunamadı: ${apk || '(yok)'}`);
  process.exit(2);
}

let listing;
try {
  listing = execFileSync('unzip', ['-l', apk], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  console.error('unzip -l çalıştırılamadı:', e.message);
  process.exit(3);
}

const rows = [];
for (const line of listing.split(/\r?\n/)) {
  const m = line.match(/^\s*(\d+)\s+\S+\s+\S+\s+(.+)$/);
  if (!m) continue;
  rows.push({ size: Number(m[1]), name: m[2].trim() });
}

const sum = pred => rows.reduce((n, r) => n + (pred(r) ? r.size : 0), 0);
const byAbi = new Map();
const bySo = new Map();
for (const r of rows) {
  const m = r.name.match(/^lib\/([^/]+)\/([^/]+\.so)$/);
  if (!m) continue;
  const [, abi, so] = m;
  byAbi.set(abi, (byAbi.get(abi) || 0) + r.size);
  bySo.set(so, (bySo.get(so) || 0) + r.size);
}

const fmt = n => `${(n / 1024 / 1024).toFixed(2)} MB`;
const apkBytes = fs.statSync(apk).size;
const uncompressed = rows.reduce((n, r) => n + r.size, 0);
const lines = [];
lines.push('KIZILKAN PLAYER ELITE — APK BOYUT / ABI RAPORU');
lines.push(`APK: ${path.basename(apk)}`);
lines.push(`APK disk boyutu: ${fmt(apkBytes)}`);
lines.push(`ZIP içeriği açılmış toplam: ${fmt(uncompressed)}`);
lines.push('');
lines.push('ABI başına native kütüphaneler:');
for (const [abi, size] of [...byAbi.entries()].sort((a,b)=>b[1]-a[1])) lines.push(`  ${abi}: ${fmt(size)}`);
if (!byAbi.size) lines.push('  (lib/<abi>/*.so bulunamadı)');
lines.push('');
lines.push(`Tüm native .so: ${fmt(sum(r => /^lib\/.*\.so$/.test(r.name)))}`);
lines.push(`assets/: ${fmt(sum(r => r.name.startsWith('assets/')))}`);
lines.push(`res/: ${fmt(sum(r => r.name.startsWith('res/')))}`);
lines.push(`classes*.dex: ${fmt(sum(r => /^classes\d*\.dex$/.test(r.name)))}`);
lines.push('');
lines.push('En büyük 30 native .so (ABI toplamı):');
for (const [so, size] of [...bySo.entries()].sort((a,b)=>b[1]-a[1]).slice(0,30)) lines.push(`  ${so}: ${fmt(size)}`);
lines.push('');
lines.push('Not: Bu rapor universal APK içeriğini ölçer. Play Store AAB/split teslim boyutu cihaz ABI’sine göre daha düşük olabilir.');

const report = lines.join('\n') + '\n';
const out = outArg || path.join(path.dirname(apk), 'APK-BOYUT-RAPORU.txt');
fs.writeFileSync(out, report);
process.stdout.write(report);
console.log(`Rapor: ${out}`);
