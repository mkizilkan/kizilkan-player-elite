/**
 * CONTEXT VALUE DENETLEYİCİSİ
 * "Property 'X' doesn't exist" hatasını yakalar: provider value nesnesine
 * konan ama fonksiyon/değişken olarak TANIMLANMAMIŞ isimleri bulur.
 */
const ts = require('./_ts');
const fs = require('fs');

const files = process.argv.slice(2);
let problems = 0;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);

  // Tanımlı isimler (const/function/let)
  const defined = new Set();
  function collectDefs(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) defined.add(node.name.text);
    if (ts.isFunctionDeclaration(node) && node.name) defined.add(node.name.text);
    if (ts.isParameter(node) && ts.isIdentifier(node.name)) defined.add(node.name.text);
    // const [a, b] = useState() / const { x } = useFoo()
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) defined.add(node.name.text);
    if (ts.isArrayBindingPattern(node) || ts.isObjectBindingPattern(node)) {
      node.elements.forEach(el => { if (el.name && ts.isIdentifier(el.name)) defined.add(el.name.text); });
    }
    ts.forEachChild(node, collectDefs);
  }
  collectDefs(sf);

  // "value = { ... }" veya "<X.Provider value={{ ... }}>" içindeki shorthand'ler
  function checkValueObj(node) {
    if (ts.isObjectLiteralExpression(node)) {
      for (const prop of node.properties) {
        // shorthand: { foo }  -> foo tanımlı olmalı
        if (ts.isShorthandPropertyAssignment(prop)) {
          const name = prop.name.text;
          if (!defined.has(name) && !['children'].includes(name)) {
            const pos = sf.getLineAndCharacterOfPosition(prop.getStart());
            console.log(`  TANIMSIZ VALUE  ${file}:${pos.line + 1}  ->  ${name}`);
            problems++;
          }
        }
      }
    }
    ts.forEachChild(node, checkValueObj);
  }
  checkValueObj(sf);
}
console.log(problems === 0 ? 'CONTEXT VALUE TEMIZ' : `\n${problems} TANIMSIZ VALUE ALANI`);
