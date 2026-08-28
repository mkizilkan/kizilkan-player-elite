#!/usr/bin/env node
/** v15.2.25 RC2 + v15.2.27-RC2 FIX — GitHub ile aynı tam TypeScript semantik build kapısı. */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { resolveTsc } = require('./_tsc');
const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'frontend');
const tsconfig = path.join(frontend, 'tsconfig.json');
if (!fs.existsSync(tsconfig)) {
  console.error('HATA — frontend/tsconfig.json bulunamadı; proje TypeScript ayarları olmadan gate çalıştırılamaz.');
  process.exit(2);
}
let tsc;
try {
  tsc = resolveTsc(frontend);
} catch (error) {
  console.error(`HATA — ${error.message}`);
  process.exit(2);
}
console.log(`BILGI — TypeScript CLI: ${tsc.resolved}`);
// -p kullanımı kritiktir: tekil dosya argümanı verilirse TypeScript tsconfig.json'u
// yok sayar; JSX/Promise/ES lib hataları gerçek proje build sonucu olmaktan çıkar.
const r = spawnSync(tsc.command, [...tsc.argsPrefix, '--project', tsconfig, '--noEmit', '--pretty', 'false'], { cwd: frontend, stdio: 'inherit' });
if (r.error) { console.error('HATA — TypeScript çalıştırılamadı:', r.error.message); process.exit(2); }
if (r.status !== 0) process.exit(r.status ?? 1);
console.log('TEMIZ — v15.2.25 RC2 full TypeScript --noEmit build gate');
