/**
 * JSX PROP DEĞİŞKEN DENETLEYİCİSİ (6. araç)
 * "Property 'autoFocusOnTv' doesn't exist" sınıfını yakalar:
 * JSX niteliklerinde ({...}) kullanılan ama o kapsamda TANIMLI OLMAYAN
 * değişkenleri bulur. Önceki denetleyiciler prop DEĞERLERİNE bakmıyordu.
 */
const ts = require('./_ts');
const fs = require('fs');
const path = require('path');

const GLOBALS = new Set([
  'console','JSON','Math','Date','Promise','Array','Object','String','Number','Boolean',
  'require','process','undefined','null','true','false','NaN','Infinity','Set','Map',
  'parseInt','parseFloat','isNaN','encodeURIComponent','decodeURIComponent','Error',
  'setTimeout','clearTimeout','setInterval','clearInterval','React','global','window',
]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

let problems = 0;
for (const file of [...walk('app'), ...walk('src')]) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);

  // Her fonksiyon kapsamı için tanımlı isimleri topla
  function collectScope(node, names = new Set()) {
    // Üst kapsamdan miras alınanları da ekle
    function add(n) {
      if (!n) return;
      if (ts.isIdentifier(n)) names.add(n.text);
      else if (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) {
        n.elements.forEach(el => { if (el.name) add(el.name); });
      }
    }
    function visit(n) {
      if (ts.isVariableDeclaration(n)) add(n.name);
      if (ts.isFunctionDeclaration(n) && n.name) names.add(n.name.text);
      if (ts.isParameter(n)) add(n.name);
      if (ts.isImportClause(n)) {
        if (n.name) names.add(n.name.text);
        if (n.namedBindings) {
          if (ts.isNamespaceImport(n.namedBindings)) names.add(n.namedBindings.name.text);
          else n.namedBindings.elements.forEach(e => names.add(e.name.text));
        }
      }
      if (ts.isClassDeclaration(n) && n.name) names.add(n.name.text);
      ts.forEachChild(n, visit);
    }
    visit(node);
    return names;
  }

  const allNames = collectScope(sf);
  const reported = new Set();

  function checkJsx(node) {
    if (ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer)) {
      const expr = node.initializer.expression;
      if (expr && ts.isIdentifier(expr)) {
        const name = expr.text;
        if (!allNames.has(name) && !GLOBALS.has(name) && !reported.has(name)) {
          reported.add(name);
          const pos = sf.getLineAndCharacterOfPosition(node.getStart());
          console.log(`  TANIMSIZ PROP  ${file}:${pos.line + 1}  ->  ${node.name.getText()}={${name}}`);
          problems++;
        }
      }
    }
    ts.forEachChild(node, checkJsx);
  }
  checkJsx(sf);
}
console.log(problems === 0 ? '\nTEMIZ — tanimsiz JSX prop degiskeni yok' : `\n${problems} TANIMSIZ PROP`);
