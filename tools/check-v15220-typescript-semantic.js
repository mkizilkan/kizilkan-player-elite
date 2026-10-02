#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ts = require('./_ts');
const { compileFixture, formatDiagnostic } = require('./_typescript-semantic-fixture');
const root = path.resolve(__dirname, '..');
function buildPersistFixture(playlist) {
  const m = playlist.match(/const persist = activeSwitchWriteQueue\.current = activeSwitchWriteQueue\.current[\s\S]*?await persist;/);
  if (!m) throw new Error('PlaylistContext persist bloğu veya await persist bulunamadı');
  const block = ts.createSourceFile('persist.ts', m[0], ts.ScriptTarget.ES2020, true);
  let awaitsStorage = false;
  function visit(node) {
    if (ts.isAwaitExpression(node) && ts.isCallExpression(node.expression)) {
      const callee = node.expression.expression;
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
        && callee.expression.text === 'storage' && callee.name.text === 'setItem') awaitsStorage = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(block);
  if (!awaitsStorage) throw new Error('PlaylistContext storage.setItem sonucu beklenmiyor');
  // These declarations mirror the real persist closure, including stale-owner guards.
  return `
declare const storage: { setItem(key:string, value:string): Promise<boolean> };
declare const key: string;
declare const id: string;
declare function currentPid(): string;
declare const requestedProfile: string;
declare const activeSwitchGeneration: { current: number };
declare const generation: number;
declare function isCatalogRestoreActive(): boolean;
const activeSwitchWriteQueue: { current: Promise<void> } = { current: Promise.resolve() };
async function contract(): Promise<void> {
${m[0]}
}
`;
}
function main() {
  const playlist = fs.readFileSync(path.join(root, 'frontend/src/store/PlaylistContext.tsx'), 'utf8');
  let source;
  try { source = buildPersistFixture(playlist); }
  catch (error) { console.error('HATA — ' + error.message); process.exitCode = 1; return; }
  const diagnostics = compileFixture(source);
  if (diagnostics.length) {
    for (const diagnostic of diagnostics) console.error(formatDiagnostic(diagnostic));
    process.exitCode = 1; return;
  }
  console.log('TEMIZ — v15.2.20 PlaylistContext Promise<void> semantik sözleşmesi');
}
module.exports = { buildPersistFixture };
if (require.main === module) main();
