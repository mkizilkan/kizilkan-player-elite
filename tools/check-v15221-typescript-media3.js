#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ts = require('./_ts');
const { compileFixture, formatDiagnostic } = require('./_typescript-semantic-fixture');
const root = path.resolve(__dirname, '..');
const froot = path.join(root, 'frontend');
function buildMedia3Fixture(player, engineTypes) {
  const errorBlock = player.match(/void recordDiagnostic\("player", "MEDIA3_ERROR", \{[\s\S]*?\}, \{ sessionId: playerDiagnosticSessionRef\.current \}\);/);
  if (!errorBlock) throw new Error('MEDIA3_ERROR telemetry bloğu bulunamadı');
  const block = ts.createSourceFile('media3-error.ts', errorBlock[0], ts.ScriptTarget.ES2020, true);
  let payload;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'recordDiagnostic') {
      if (node.arguments[2] && ts.isObjectLiteralExpression(node.arguments[2])) payload = node.arguments[2];
    }
    ts.forEachChild(node, visit);
  }
  visit(block);
  const properties = ['engine', 'decoder', 'surface'].map(name => {
    const property = payload?.properties.find(node => ts.isPropertyAssignment(node)
      && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === name);
    if (!property) throw new Error(`MEDIA3_ERROR ${name} alanı bulunamadı`);
    return property.getText(block);
  });
  // Compile the production telemetry expressions against the production EngineProfile union.
  return `${engineTypes}\ndeclare const v2Profile: EngineProfile;\nconst payload = {\n${properties.join(',\n')}\n};\nvoid payload;\n`;
}
function main() {
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

  const engineTypes = fs.readFileSync(path.join(froot, 'src/player/v2/types.ts'), 'utf8');
  let source;
  try { source = buildMedia3Fixture(player, engineTypes); }
  catch (error) { console.error('HATA — ' + error.message); process.exitCode = 1; return; }
  const diagnostics = compileFixture(source);
  if (diagnostics.length) {
    for (const diagnostic of diagnostics) console.error(formatDiagnostic(diagnostic));
    bad += diagnostics.length;
  }

  if (bad) { console.error(`\n❌ ${bad} v15.2.21 TYPESCRIPT/MEDIA3 HATASI`); process.exit(1); }
  console.log('TEMIZ — v15.2.21 Media3 EngineProfile narrowing + version contract');
}
module.exports = { buildMedia3Fixture };
if (require.main === module) main();
