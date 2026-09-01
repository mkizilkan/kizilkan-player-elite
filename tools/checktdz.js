/**
 * KULLANIM-ÖNCE-TANIM DENETLEYİCİSİ (7. araç)
 * "const hoisting yok" hatasını yakalar: bir bileşen gövdesinde, henüz
 * TANIMLANMAMIŞ bir const'un hook çağrısı içinde kullanılması.
 * Bu hata SESSİZDİR (try/catch varsa çökmez, sadece çalışmaz).
 */
const ts = require('./_ts');
const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

let problems = 0;
for (const file of [...walk('app'), ...walk('src')]) {
  const src = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ESNext, true, kind);

  // Bileşen/fonksiyon gövdelerini tek tek incele
  function checkBody(body) {
    if (!body || !body.statements) return;
    // Bu gövdedeki const tanımlarının konumu
    const declPos = new Map();
    body.statements.forEach(st => {
      if (ts.isVariableStatement(st) && (st.declarationList.flags & ts.NodeFlags.Const)) {
        st.declarationList.declarations.forEach(d => {
          if (ts.isIdentifier(d.name)) declPos.set(d.name.text, d.getStart());
        });
      }
    });
    if (declPos.size === 0) return;

    // Top-level expression'larda anında okunan isimleri kontrol et.
    // v14.2'deki gerçek crash sınıfı: `isPlayingRef.current = ...` ifadesi,
    // `const isPlayingRef = useRef(...)` tanımından ÖNCE çalışıyordu. Eski araç
    // yalnız hook call'larını taradığı için bu runtime TDZ hatasını kaçırdı.
    body.statements.forEach(st => {
      if (!ts.isExpressionStatement(st)) return;
      const expr = st.expression;
      const exprPos = expr.getStart();

      const used = new Set();
      function scan(n, insideCallback) {
        if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
          ts.forEachChild(n, (c) => scan(c, true));
          return;
        }
        if (ts.isIdentifier(n) && !insideCallback) used.add(n.text);
        ts.forEachChild(n, (c) => scan(c, insideCallback));
      }
      scan(expr, false);

      const label = ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)
        ? `${expr.expression.text}()`
        : "ifade";

      for (const name of used) {
        const dp = declPos.get(name);
        if (dp !== undefined && dp > exprPos) {
          const pos = sf.getLineAndCharacterOfPosition(exprPos);
          const dpos = sf.getLineAndCharacterOfPosition(dp);
          console.log(`  KULLANIM-ÖNCE-TANIM  ${file}:${pos.line + 1}  ->  ${label} içinde '${name}' kullanılıyor ama satır ${dpos.line + 1}'de tanımlanıyor`);
          problems++;
        }
      }
    });
  }

  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.body && ts.isBlock(node.body)) {
      checkBody(node.body);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}
console.log(problems === 0 ? '\nTEMIZ — kullanim-once-tanim yok' : `\n${problems} SORUN`);
