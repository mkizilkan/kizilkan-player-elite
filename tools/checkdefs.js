/**
 * Tanımsız tanımlayıcı denetleyicisi.
 * "Property 'X' doesn't exist" hatalarını DERLEME ÖNCESİ yakalar.
 * Sözdizimi denetimi bunu göremez (dilbilgisi doğru ama sembol tanımsız).
 */
const ts = require('./_ts');
const fs = require('fs');
const path = require('path');

// RN/React/JS'te hazır gelen ve import gerektirmeyen isimler
const GLOBALS = new Set([
  'React','console','JSON','Math','Date','Number','String','Boolean','Array','Object',
  'Promise','Set','Map','Error','RegExp','Buffer','setTimeout','clearTimeout',
  'setInterval','clearInterval','fetch','require','module','exports','process',
  'globalThis','undefined','null','true','false','AbortController','TextDecoder',
  'atob','btoa','URL','URLSearchParams','Infinity','NaN','parseInt','parseFloat',
  'isNaN','encodeURIComponent','decodeURIComponent','Symbol','WeakMap','Intl',
]);

function collectDefined(sf) {
  const defined = new Set();
  function visit(node) {
    // import { A, B } / import A / import * as A
    if (ts.isImportDeclaration(node) && node.importClause) {
      const c = node.importClause;
      if (c.name) defined.add(c.name.text);
      if (c.namedBindings) {
        if (ts.isNamespaceImport(c.namedBindings)) defined.add(c.namedBindings.name.text);
        else c.namedBindings.elements.forEach(e => defined.add(e.name.text));
      }
    }
    // const/let/var, function, class (her seviyede topluyoruz - kapsam gevşek ama yanlış alarm vermez)
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) defined.add(node.name.text);
    if (ts.isFunctionDeclaration(node) && node.name) defined.add(node.name.text);
    if (ts.isClassDeclaration(node) && node.name) defined.add(node.name.text);
    if (ts.isParameter(node) && ts.isIdentifier(node.name)) defined.add(node.name.text);
    // destructuring: const { a, b } = ...
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) defined.add(node.name.text);
    if (ts.isInterfaceDeclaration(node) && node.name) defined.add(node.name.text);
    if (ts.isTypeAliasDeclaration(node) && node.name) defined.add(node.name.text);
    if (ts.isEnumDeclaration(node) && node.name) defined.add(node.name.text);
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return defined;
}

function collectUsed(sf) {
  const used = new Map(); // isim -> satir
  function visit(node) {
    // Hook cagrilari: useXxx(
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const n = node.expression.text;
      if (/^use[A-Z]/.test(n) && !used.has(n)) {
        used.set(n, sf.getLineAndCharacterOfPosition(node.getStart()).line + 1);
      }
    }
    // JSX bilesenleri: <Xxx ...>
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName;
      if (ts.isIdentifier(tag) && /^[A-Z]/.test(tag.text) && !used.has(tag.text)) {
        used.set(tag.text, sf.getLineAndCharacterOfPosition(node.getStart()).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return used;
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
  const used = collectUsed(sf);
  for (const [name, line] of used) {
    if (!defined.has(name) && !GLOBALS.has(name)) {
      console.log(`  TANIMSIZ  ${file}:${line}  ->  ${name}`);
      problems++;
    }
  }
}
console.log(problems === 0 ? '\nTEMIZ — tanimsiz sembol yok' : `\n${problems} SORUN BULUNDU`);
