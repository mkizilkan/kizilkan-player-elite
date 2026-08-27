#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..');
const froot = path.join(root, 'frontend');
let bad = 0;
const pkg = JSON.parse(fs.readFileSync(path.join(froot, 'package.json'), 'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(froot, 'app.json'), 'utf8'));
const parts = String(pkg.version || '').match(/^(\d+)\.(\d+)\.(\d+)$/);
const expectedCode = parts ? Number(parts[1]) * 10000 + Number(parts[2]) * 100 + Number(parts[3]) : -1;
if (!parts || expectedCode < 150221) { console.error(`HATA — package ${pkg.version} v15.2.21 altında`); bad++; }
if (app?.expo?.version !== pkg.version || Number(app?.expo?.android?.versionCode) !== expectedCode) {
  console.error(`HATA — app/package sürüm tutarsız: ${app?.expo?.version}/${app?.expo?.android?.versionCode} package=${pkg.version}`); bad++;
}

const player = fs.readFileSync(path.join(froot, 'src/player/PlayerHost.tsx'), 'utf8');
const errorBlock = player.match(/void recordDiagnostic\("player", "MEDIA3_ERROR", \{[\s\S]*?\}, \{ sessionId: playerDiagnosticSessionRef\.current \}\);/);
if (!errorBlock) { console.error('HATA — MEDIA3_ERROR telemetry bloğu bulunamadı'); process.exit(1); }
if (/decoder:\s*v2Profile\.decoder/.test(errorBlock[0])) { console.error('HATA — EngineProfile union üzerinde decoder doğrudan okunuyor'); bad++; }
if (!/decoder:\s*v2Profile\.engine === "media3" \? undefined : v2Profile\.decoder/.test(errorBlock[0])) { console.error('HATA — decoder için media3 narrowing yok'); bad++; }
if (!/surface:\s*v2Profile\.engine === "media3" \? v2Profile\.surface : undefined/.test(errorBlock[0])) { console.error('HATA — Media3 surface telemetrisi yok'); bad++; }

// Gerçek EngineProfile union'ını minimal semantik programda derle; böylece TS2339 sınıfı tekrar kaçmasın.
const source = `
type PlaybackSurface = "surface" | "texture";
type VlcDecoder = "hw" | "sw";
type EngineProfile =
  | { engine: "media3"; surface: PlaybackSurface }
  | { engine: "vlc"; decoder: VlcDecoder }
  | { engine: "mpv"; decoder: "auto" };
declare const v2Profile: EngineProfile;
const payload = {
  engine: v2Profile.engine,
  decoder: v2Profile.engine === "media3" ? undefined : v2Profile.decoder,
  surface: v2Profile.engine === "media3" ? v2Profile.surface : undefined,
};
void payload;
`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kizilkan-ts-media3-'));
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
    console.error(`HATA TS${d.code}${pos ? ` ${pos.line + 1}:${pos.character + 1}` : ''} — ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
  }
  bad += diagnostics.length;
}

if (bad) { console.error(`\n❌ ${bad} v15.2.21 TYPESCRIPT/MEDIA3 HATASI`); process.exit(1); }
console.log('TEMIZ — v15.2.21 Media3 EngineProfile narrowing + version contract');
