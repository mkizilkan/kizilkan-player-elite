#!/usr/bin/env node
/** v15.2.25 RC3 — GitHub ile aynı tam TypeScript semantik build kapısı. */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'frontend');
const tsconfig = path.join(frontend, 'tsconfig.json');
const localTsc = path.join(frontend, 'node_modules', 'typescript', 'bin', 'tsc');
if (!fs.existsSync(tsconfig)) {
  console.error('HATA — frontend/tsconfig.json bulunamadı; proje TypeScript ayarları olmadan gate çalıştırılamaz.');
  process.exit(2);
}
if (!fs.existsSync(localTsc)) {
  console.error('HATA — frontend/node_modules/typescript/bin/tsc bulunamadı; tam TypeScript gate atlanamaz. Önce `yarn install --frozen-lockfile` çalıştırın.');
  process.exit(2);
}
// -p kullanımı kritiktir: tekil dosya argümanı verilirse TypeScript tsconfig.json'u
// yok sayar; JSX/Promise/ES lib hataları gerçek proje build sonucu olmaktan çıkar.
const r = spawnSync(process.execPath, [localTsc, '--project', tsconfig, '--noEmit', '--pretty', 'false'], { cwd: frontend, stdio: 'inherit' });
if (r.error) { console.error('HATA — TypeScript çalıştırılamadı:', r.error.message); process.exit(2); }
if (r.status !== 0) process.exit(r.status ?? 1);
console.log('TEMIZ — v15.2.25 RC3 full TypeScript --noEmit build gate');
