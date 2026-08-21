/**
 * BAYAT KAPANIŞ (stale closure) DENETLEYİCİSİ
 * useCallback/useMemo içinde kullanılan ama bağımlılık dizisinde OLMAYAN
 * dış değişkenleri bulur. "Property X doesn't exist" değil ama daha sinsi:
 * fonksiyon eski değeri görür ve yanlış yere yazar.
 */
const ts = require('./_ts');
const fs = require('fs');

// İzlenecek kritik değişkenler (yanlış değer felakete yol açanlar)
const WATCH = ['activeProfile','profiles','activeId','profileId','activePlaylist','playlists','settings','overrides','ordering','hiddenGroups','hiddenItems','favorites','watchlist','recent'];

let problems = 0;
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        (node.expression.text === 'useCallback' || node.expression.text === 'useMemo')) {
      const [fn, deps] = node.arguments;
      if (!fn || !deps || !ts.isArrayLiteralExpression(deps)) { ts.forEachChild(node, visit); return; }

      // Bağımlılıkta geçen isimler (a?.b -> a olarak da say)
      const depNames = new Set();
      deps.elements.forEach(e => {
        const t = e.getText();
        depNames.add(t);
        const root = t.split(/[?.[]/)[0];
        if (root) depNames.add(root);
      });

      // Fonksiyon gövdesinde kullanılan izlenen değişkenler
      const used = new Set();
      function scanBody(n) {
        if (ts.isIdentifier(n) && WATCH.includes(n.text)) used.add(n.text);
        ts.forEachChild(n, scanBody);
      }
      scanBody(fn);

      for (const name of used) {
        if (!depNames.has(name)) {
          const pos = sf.getLineAndCharacterOfPosition(node.getStart());
          console.log(`  BAYAT KAPANIŞ  ${file}:${pos.line + 1}  ->  '${name}' kullanılıyor ama bağımlılıkta YOK`);
          problems++;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}
console.log(problems === 0 ? 'BAYAT KAPANIŞ YOK' : `\n${problems} RİSKLİ KAPANIŞ`);
