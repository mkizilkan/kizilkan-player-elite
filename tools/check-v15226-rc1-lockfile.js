#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'frontend', 'package.json');
const lockPath = path.join(root, 'frontend', 'yarn.lock');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const lock = fs.readFileSync(lockPath, 'utf8');
const dep = '@react-native-tvos/config-tv';
const spec = pkg.dependencies && pkg.dependencies[dep];
if (spec !== '^0.1.6') {
  console.error(`FAIL: ${dep} beklenen ^0.1.6, bulunan ${spec}`);
  process.exit(1);
}
if (!lock.includes('"@react-native-tvos/config-tv@^0.1.6":')) {
  console.error('FAIL: yarn.lock içinde @react-native-tvos/config-tv@^0.1.6 kaydı yok');
  process.exit(1);
}
if (!lock.includes('config-tv-0.1.6.tgz')) {
  console.error('FAIL: yarn.lock config-tv 0.1.6 tarball kaydı yok');
  process.exit(1);
}
console.log('PASS: v15.2.26 RC1 lockfile/package uyumu');
