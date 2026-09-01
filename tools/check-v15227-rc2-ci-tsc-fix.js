#!/usr/bin/env node
/** v15.2.27-RC2 — CI TypeScript HARD gate recovery contract. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const workflow = read('.github/workflows/build-apk.yml');
const rc2 = read('tools/check-v15225-rc2-typescript-build.js');
const rc3 = read('tools/check-v15225-rc3-typescript-project.js');
const resolver = read('tools/_tsc.js');
const denetle = read('tools/denetle.js');
const assertions = [
  [workflow.includes('yarn install --frozen-lockfile --production=false'), 'CI devDependencies + frozen lockfile zorlamasi'],
  [workflow.includes('TypeScript CLI on-kontrolu - HARD gate'), 'CI TypeScript preflight'],
  [workflow.includes("require.resolve('typescript/bin/tsc')"), 'CI require.resolve kaniti'],
  [workflow.includes('yarn exec tsc --version'), 'CI tsc version kaniti'],
  [rc2.includes("require('./_tsc')") && rc3.includes("require('./_tsc')"), 'iki eski HARD gate ortak tasinabilir resolver kullaniyor'],
  [resolver.includes("require.resolve('typescript/bin/tsc'"), 'resolver Node module resolution kullaniyor'],
  [resolver.includes("yarn', ['bin', 'tsc']"), 'resolver yarn bin fallback kullaniyor'],
  [resolver.includes('HARD gate atlanmadı'), 'resolver fail-open yapmiyor'],
  [rc2.includes("'--project', tsconfig, '--noEmit'") && rc3.includes("'--project', tsconfig, '--noEmit'"), 'iki gate gercek project --noEmit davranisini koruyor'],
  [denetle.includes('check-v15225-rc2-typescript-build.js') && denetle.includes('check-v15225-rc3-typescript-project.js'), 'master gate iki TypeScript gateini koruyor'],
  [denetle.includes('e.stdout') && denetle.includes('e.stderr') && denetle.includes('childOut'), 'master gate CI child hata ayrintisini gizlemiyor'],
];
let failed = 0;
for (const [ok, label] of assertions) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failed++;
}
for (const file of ['tools/_tsc.js','tools/check-v15225-rc2-typescript-build.js','tools/check-v15225-rc3-typescript-project.js']) {
  const r = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding:'utf8' });
  const ok = r.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}: node --check ${file}`);
  if (!ok) { failed++; process.stderr.write(r.stderr || r.stdout || ''); }
}
if (failed) {
  console.error(`FAIL: v15.2.27-RC2 CI TSC FIX contract (${failed})`);
  process.exit(1);
}
console.log('TEMIZ — v15.2.27-RC2 CI TypeScript HARD gate fix contract');
