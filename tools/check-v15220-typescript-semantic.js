#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..');
const playlist = fs.readFileSync(path.join(root, 'frontend/src/store/PlaylistContext.tsx'), 'utf8');
const m = playlist.match(/const persist = activeSwitchWriteQueue\.current = activeSwitchWriteQueue\.current[\s\S]*?await persist;/);
if (!m) { console.error('HATA — PlaylistContext persist bloğu bulunamadı'); process.exit(1); }
const source = `
declare const storage: { setItem(key:string, value:string): Promise<boolean> };
declare const key: string;
declare const id: string;
const activeSwitchWriteQueue: { current: Promise<void> } = { current: Promise.resolve() };
async function contract(): Promise<void> {
${m[0]}
}
`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kizilkan-ts-sem-'));
const file = path.join(dir, 'contract.ts');
fs.writeFileSync(file, source);
const program = ts.createProgram([file], {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.CommonJS,
  skipLibCheck: true,
});
const diagnostics = ts.getPreEmitDiagnostics(program).filter(d => d.file?.fileName === file);
if (diagnostics.length) {
  for (const d of diagnostics) {
    const pos = d.file && d.start != null ? d.file.getLineAndCharacterOfPosition(d.start) : null;
    console.error(`HATA TS${d.code}${pos ? ` ${pos.line+1}:${pos.character+1}` : ''} — ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
  }
  process.exit(1);
}
console.log('TEMIZ — v15.2.20 PlaylistContext Promise<void> semantik sözleşmesi');
