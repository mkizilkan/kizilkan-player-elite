#!/usr/bin/env node
// Real compiler regression tests: platform path spelling cannot suppress semantic failures.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { compileFixture, formatDiagnostic } = require('./_typescript-semantic-fixture');
const { buildPersistFixture } = require('./check-v15220-typescript-semantic');
const { buildMedia3Fixture } = require('./check-v15221-typescript-media3');
const root = path.resolve(__dirname, '..');
const playlist = fs.readFileSync(path.join(root, 'frontend/src/store/PlaylistContext.tsx'), 'utf8');
const player = fs.readFileSync(path.join(root, 'frontend/src/player/PlayerHost.tsx'), 'utf8');
const engineTypes = fs.readFileSync(path.join(root, 'frontend/src/player/v2/types.ts'), 'utf8');
const persist = buildPersistFixture(playlist), media3 = buildMedia3Fixture(player, engineTypes);
for (const file of ['C:\\kizilkan-semantic-fixture\\contract.ts', '/kizilkan-semantic-fixture/contract.ts']) {
  assert.deepEqual(compileFixture(persist, file), [], `production persist closure compiles at ${file}`);
  const missing = compileFixture(persist + '\nmissingFixtureClosure();', file);
  assert.ok(missing.some(diagnostic => diagnostic.code === 2304), 'undeclared closures must produce TS2304');
  assert.ok(missing.some(diagnostic => /1:\d+|\d+:\d+/.test(formatDiagnostic(diagnostic))), 'diagnostics retain their source position');
  const wrongReturn = persist.replace('if (!(await storage.setItem(key, id)))', 'return await storage.setItem(key, id);\nif (!(await storage.setItem(key, id)))');
  assert.notEqual(wrongReturn, persist);
  assert.ok(compileFixture(wrongReturn, file).some(diagnostic => diagnostic.code === 2322), 'Promise<boolean> must not satisfy the Promise<void> queue');
  assert.deepEqual(compileFixture(media3, file), [], 'production narrowed telemetry compiles');
  const wrongDecoder = media3.replace('v2Profile.engine === "media3" ? undefined : v2Profile.decoder', 'v2Profile.decoder');
  assert.notEqual(wrongDecoder, media3);
  assert.ok(compileFixture(wrongDecoder, file).some(diagnostic => diagnostic.code === 2339), 'unnarrowed Media3 union field must produce TS2339');
}
assert.throws(() => buildPersistFixture(playlist.replace('await persist;', 'void persist;')), /await persist/);
assert.throws(() => buildPersistFixture(playlist.replace('if (!(await storage.setItem(key, id)))', 'if (!(storage.setItem(key, id)))')), /sonucu beklenmiyor/);
console.log('PASS: semantic fixtures — Windows/POSIX paths, real closure/types, unknown names, Promise<void>, Media3 narrowing and awaited persistence');
