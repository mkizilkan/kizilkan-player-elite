/** Eski izole fixture'lar için yeni saf MAG modüllerini gerçek kaynaklarından yükler. */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('./_ts');
const names = new Set(['magEndpointRegistry', 'magClientJsResolver', 'magDiscoveryBudget', 'magResponseFingerprint', 'catalogProgress', 'playlistEndpoints','boundedPortalSample','scanOutcome','hostRequestPolicy','panelDnsFailover','panelDirectoryModel']);
exports.load = function load(id, globals = {}) {
  const name = id.replace(/^(?:@\/src\/utils\/|\.\/)/, '');
  if (!names.has(name)) return undefined;
  const filename = path.join(__dirname, '..', 'frontend', 'src', 'utils', name + '.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = {};
  vm.runInNewContext(code, { exports: result, require: dependency => { const value = load(dependency, globals); if (!value) throw new Error('Saf MAG modülüne platform bağımlılığı eklendi: ' + dependency); return value; }, URL, URLSearchParams, AbortController,TextDecoder,TextEncoder,Uint8Array,console, setTimeout, clearTimeout, ...globals }, { filename });
  return result;
};
