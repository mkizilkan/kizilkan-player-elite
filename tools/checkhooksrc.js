/**
 * HOOK KAYNAK DENETLEYİCİSİ (8. araç)
 * "Cannot read property X of undefined" sınıfını yakalar:
 * bir hook'tan (useXxx) YOK OLAN bir alan destructure edilmesi.
 * Örn: const { favorites } = useLibrary()  ama favorites PlaylistContext'te.
 */
const ts = require('./_ts');
const fs = require('fs');
const path = require('path');

// Hook -> sağladığı alanlar (provider value'sundan otomatik çıkarılır)
const PROVIDERS = {
  usePlaylists: 'src/store/PlaylistContext.tsx',
  useLibrary: 'src/store/LibraryContext.tsx',
  useProfiles: 'src/store/ProfileContext.tsx',
  useParental: 'src/store/ParentalContext.tsx',
  useTv: 'src/store/TvContext.tsx',
  useTheme: 'src/theme/ThemeContext.tsx',
};

/** Provider'ın value nesnesindeki alan adlarını topla. */
function providedKeys(file) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  const keys = new Set();
  function visit(n) {
    // const value = useMemo(() => ({ ... })) — dolayli value
    if (ts.isVariableDeclaration(n) && n.name.getText() === 'value' && n.initializer) {
      const collect = (node) => {
        if (ts.isObjectLiteralExpression(node)) {
          node.properties.forEach(p => {
            if (ts.isShorthandPropertyAssignment(p)) keys.add(p.name.text);
            else if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) keys.add(p.name.text);
            else if (ts.isSpreadAssignment(p)) keys.add('__spread__');
          });
        }
        ts.forEachChild(node, collect);
      };
      collect(n.initializer);
    }
    // <X.Provider value={{ ... }}>
    if (ts.isJsxAttribute(n) && n.name.getText() === 'value' &&
        n.initializer && ts.isJsxExpression(n.initializer)) {
      const e = n.initializer.expression;
      if (e && ts.isObjectLiteralExpression(e)) {
        e.properties.forEach(p => {
          if (ts.isShorthandPropertyAssignment(p)) keys.add(p.name.text);
          else if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) keys.add(p.name.text);
          else if (ts.isSpreadAssignment(p)) keys.add('__spread__');
        });
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
  return keys;
}

const provided = {};
for (const [hook, file] of Object.entries(PROVIDERS)) {
  try { provided[hook] = providedKeys(file); } catch { provided[hook] = null; }
}

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

  function visit(node) {
    // const { a, b } = useXxx()
    if (ts.isVariableDeclaration(node) && node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.name && ts.isObjectBindingPattern(node.name)) {
      const hook = node.initializer.expression.text;
      const keys = provided[hook];
      if (keys && !keys.has('__spread__')) {
        node.name.elements.forEach(el => {
          // { favorites } veya { setPin: setProfPin }
          const orig = el.propertyName ? el.propertyName.getText() : el.name.getText();
          if (!keys.has(orig)) {
            const pos = sf.getLineAndCharacterOfPosition(el.getStart());
            console.log(`  YANLIŞ KAYNAK  ${file}:${pos.line + 1}  ->  ${hook}() '${orig}' sağlamıyor`);
            problems++;
          }
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}
console.log(problems === 0 ? '\nTEMIZ — hook kaynaklari dogru' : `\n${problems} YANLIŞ KAYNAK`);
