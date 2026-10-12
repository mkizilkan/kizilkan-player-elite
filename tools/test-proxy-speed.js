#!/usr/bin/env node
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..');
const exportsFor = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'frontend/src/utils/scanProxySpeed.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsFor });
const S = exportsFor, plain = v => JSON.parse(JSON.stringify(v));
assert.deepEqual(plain(S.PROXY_VERIFY_SPEEDS.map(s => [s.id, s.parallel])), [['slow',16],['safe',32],['fast',64],['ultra',128],['manual',null]]);
for (const preset of S.PROXY_VERIFY_SPEEDS.slice(0,4)) {
  assert.equal(S.proxyVerificationSettings({verificationSpeed:preset.id,verifyConcurrency:999}).verifyConcurrency,preset.parallel);
}
assert.deepEqual(plain(S.proxyVerificationSettings({})), {verificationSpeed:'slow',manualVerifyConcurrency:16,verifyConcurrency:16});
assert.equal(S.proxyVerificationSettings({verificationSpeed:'manual',manualVerifyConcurrency:73}).verifyConcurrency,73);
assert.equal(S.proxyVerificationSettings({verificationSpeed:'ultra',manualVerifyConcurrency:73}).manualVerifyConcurrency,73);
assert.equal(S.proxyVerificationSettings({verificationSpeed:'invalid',manualVerifyConcurrency:NaN}).verifyConcurrency,16);
assert.equal(S.proxyVerificationSettings({verificationSpeed:'manual',manualVerifyConcurrency:900}).verifyConcurrency,128);
assert.equal(S.proxyVerificationSettings({verificationSpeed:'manual',manualVerifyConcurrency:-9}).verifyConcurrency,1);
for (const value of ['', '0', '129', '3000', '-1', '1.5', '5e1', 'abc', 'Infinity']) assert.equal(S.parseManualProxyParallel(value),null,value);
for (const n of [1,7,16,32,64,73,128]) assert.equal(S.parseManualProxyParallel(' '+n+' '),n);
assert.equal(S.proxyTcpParallel(32,true),64); assert.equal(S.proxyTcpParallel(64,true),128);
assert.equal(S.proxyTcpParallel(128,true),128); assert.equal(S.proxyTcpParallel(32),32);
const screen=fs.readFileSync(path.join(root,'frontend/app/scan-proxy.tsx'),'utf8');
assert.ok(screen.includes('PROXY_VERIFY_SPEEDS.map') && screen.includes('{parallel} paralel'));
assert.ok(screen.includes('scan-proxy-manual-parallel') && screen.includes('parseManualProxyParallel(manualParallel)'));
assert.ok(screen.includes('updateLivenessParallel(prog.runId, test.verifyConcurrency)'));
assert.ok(!screen.includes('Doğrulama en çok 16 paralel'));
const engine=fs.readFileSync(path.join(root,'frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ProxyTestEngine.kt'),'utf8');
assert.ok(engine.includes('{state.verifyConcurrency}') && engine.includes('state.id==runId'));
assert.ok(engine.includes('verifyDone') && engine.includes('saveTestJournal(context,"input"'));
console.log('PASS: five speed presets, strict manual input, independent TCP migration, manual preference preservation and UI/native wiring');
