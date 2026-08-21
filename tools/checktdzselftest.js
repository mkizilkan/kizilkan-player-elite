#!/usr/bin/env node
/** v15 — checktdz'nin v14.2 ref.current-before-useRef crash sinifini gerçekten yakaladigini self-test eder. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kizilkan-tdz-'));
try {
  fs.mkdirSync(path.join(tmp, 'app'));
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(path.join(tmp, 'src', 'Crash.tsx'), `function Crash(){\n  ref.current = true;\n  const ref = useRef(false);\n  return null;\n}\n`);
  const out = execFileSync(process.execPath, [path.join(__dirname, 'checktdz.js')], { cwd: tmp, encoding: 'utf8' });
  if (!/KULLANIM-ÖNCE-TANIM/.test(out) || !/1 SORUN/.test(out)) {
    console.log('SELFTEST HATA — checktdz v14.2 crash sinifini yakalayamadi');
    process.exit(1);
  }
  console.log('\nTEMIZ — TDZ denetleyici self-test basarili');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
