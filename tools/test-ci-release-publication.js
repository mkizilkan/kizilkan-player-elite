#!/usr/bin/env node
// Exercise the real Release shell step offline, including failed/missing uploads.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const yaml = require(require.resolve('js-yaml', { paths: [path.join(root, 'frontend')] }));
const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/build-apk.yml'), 'utf8'));
const steps = workflow.jobs.build.steps;
const release = steps.find(step => step.id === 'release');
const artifact = steps.find(step => step.uses === 'actions/upload-artifact@v4');
assert(release && artifact);
assert(steps.indexOf(steps.find(step => step.id === 'apkverify')) < steps.indexOf(release));
assert(steps.indexOf(steps.find(step => step.name.includes('MPV final APK'))) < steps.indexOf(release));
assert(steps.indexOf(steps.find(step => step.name === 'APK ABI ve native boyut raporu')) < steps.indexOf(release));
assert(steps.indexOf(release) < steps.indexOf(artifact));
assert(!release['continue-on-error'] && !artifact['continue-on-error']);
assert.equal(artifact.with['if-no-files-found'], 'error');
assert.equal(release['working-directory'], '.');
assert.equal(artifact.if, "${{ steps.release.outcome == 'skipped' }}");

// Verify public/private and release/artifact-only selection independently of quota.
const expression = release.if.slice(3, -2).trim();
for (const [input, ref, expected] of [
  ['true', 'refs/heads/codex/test', true],
  [undefined, 'refs/heads/main', true],
  ['false', 'refs/heads/codex/test', false],
  ['true', 'refs/heads/v17.3.0-rc1-smart-db-multisource', false],
]) {
  const condition = expression.replace('github.event.inputs.make_release', JSON.stringify(input) ?? 'undefined')
    .replace('github.ref', JSON.stringify(ref));
  assert.equal(Function(`return (${condition})`)(), expected);
}
const substitutions = {
  'github.run_number': '152',
  'steps.apk.outputs.name': 'KIZILKAN-PLAYER-ELITE-v18.7.30-build152.apk',
  'steps.apk.outputs.version': '18.7.30',
};
const script = release.run.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
  assert(Object.hasOwn(substitutions, key), `Unexpected workflow expression ${key}`);
  return substitutions[key];
});
const bash = process.platform === 'win32'
  ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe') : 'bash';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kizilkan-ci-publication-'));
try {
  // This function substitutes only the external gh service. The YAML shell body
  // itself runs unchanged; no credentials, network or actual Release is used.
  const stub = `gh() {
    if [ "$1 $2" = 'release create' ]; then
      [ "$3" = 'build-152' ] || return 91
      [ "$4" = 'artifacts/KIZILKAN-PLAYER-ELITE-v18.7.30-build152.apk' ] || return 92
      [ "$5" = 'artifacts/APK-BOYUT-RAPORU-v18.7.30.txt' ] || return 93
      [ "$6" = '--target' ] && [ "$7" = "$GITHUB_SHA" ] || return 94
      [ "$TEST_CASE" != 'create-failure' ] || return 12
    elif [ "$1 $2" = 'release view' ]; then
      [ "$TEST_CASE" != 'view-failure' ] || return 13
      [ "$TEST_CASE" = 'missing-apk' ] || printf '%s\\n' 'KIZILKAN-PLAYER-ELITE-v18.7.30-build152.apk'
      [ "$TEST_CASE" = 'missing-report' ] || printf '%s\\n' 'APK-BOYUT-RAPORU-v18.7.30.txt'
      return 0
    else
      return 95
    fi
  }
`;
  const file = path.join(temp, 'release-step.sh');
  fs.writeFileSync(file, stub + script, 'utf8');
  const syntax = spawnSync(bash, ['-n', file], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.error?.message || syntax.stderr);
  for (const testCase of ['success', 'create-failure', 'view-failure', 'missing-apk', 'missing-report']) {
    const run = spawnSync(bash, [file], {
      encoding: 'utf8', env: { ...process.env, TEST_CASE: testCase,
        GITHUB_SHA: 'fixture-exact-built-commit', NEW_ARCH: 'true', BUILD_TYPE: 'release' },
    });
    assert(!run.error, run.error?.message);
    if (testCase === 'success') assert.equal(run.status, 0, run.stderr);
    else assert.notEqual(run.status, 0, `Publication failure was swallowed: ${testCase}`);
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
console.log('PASS: CI Release publication, artifact-only routing and upload failures TEMIZ');
