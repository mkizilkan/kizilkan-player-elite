/**
 * FONKSİYON ÇAĞRISI DENETLEYİCİSİ (5. araç)
 * "isValidPinFormat is not defined" sınıfını yakalar: çağrılan ama ne yerel
 * tanımlı ne de import edilmiş fonksiyonları bulur.
 * Bu, hook/JSX denetleyicilerinin GÖREMEDİĞİ boşluktu.
 */
const ts = require('./_ts');
const fs = require('fs');
const path = require('path');

// JS/RN yerleşikleri ve import gerektirmeyenler
const BUILTINS = new Set([
  'require','fetch','setTimeout','clearTimeout','setInterval','clearInterval',
  'parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent',
  'encodeURI','decodeURI','String','Number','Boolean','Array','Object','JSON','Math',
  'Date','Promise','Set','Map','WeakMap','Error','RegExp','Symbol','BigInt','Proxy',
  'alert','atob','btoa','structuredClone','queueMicrotask','reportError',
  'describe','it','test','expect','beforeEach','afterEach','jest',
]);

function collectDefined(sf) {
  const defined = new Set();
  function visit(node) {
    if (ts.isImportDeclaration(node) && node.importClause) {
      const c = node.importClause;
      if (c.name) defined.add(c.name.text);
      if (c.namedBindings) {
        if (ts.isNamespaceImport(c.namedBindings)) defined.add(c.namedBindings.name.text);
        else c.namedBindings.elements.forEach(e => defined.add(e.name.text));
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) defined.add(node.name.text);
    if (ts.isFunctionDeclaration(node) && node.name) defined.add(node.name.text);
    if (ts.isClassDeclaration(node) && node.name) defined.add(node.name.text);
    if (ts.isParameter(node) && ts.isIdentifier(node.name)) defined.add(node.name.text);
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) defined.add(node.name.text);
    if (ts.isImportEqualsDeclaration(node)) defined.add(node.name.text);
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return defined;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

let problems = 0;
for (const file of [...walk('app'), ...walk('src')]) {
  const src = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ESNext, true, kind);
  const defined = collectDefined(sf);
  const reported = new Set();

  function visit(node) {
    // DÜZ fonksiyon çağrısı: foo(...)  (obj.foo() değil)
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (!defined.has(name) && !BUILTINS.has(name) && !reported.has(name)) {
        reported.add(name);
        const pos = sf.getLineAndCharacterOfPosition(node.getStart());
        console.log(`  TANIMSIZ ÇAĞRI  ${file}:${pos.line + 1}  ->  ${name}()`);
        problems++;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}
console.log(problems === 0 ? '\nTEMIZ — tanimsiz fonksiyon cagrisi yok' : `\n${problems} TANIMSIZ ÇAĞRI`);
