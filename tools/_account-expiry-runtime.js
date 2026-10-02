/** Shared real-source loader for older Stalker VM fixtures. No fake date parser. */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('./_ts');
module.exports = function loadAccountExpiry() {
  const file = path.resolve(__dirname, '../frontend/src/utils/accountExpiry.ts');
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports }, { filename: file });
  return exports;
};
