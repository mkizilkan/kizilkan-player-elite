#!/usr/bin/env node
// Exercise the real Release shell step offline, including failed/missing uploads.
// v18.7.33: depo public oldugu icin artifact kotasi yok. Sozlesme degisti —
// APK hem Release'e hem Actions artifact deposuna gider ve calisma ozetinde
// dogrudan indirme baglantisi yayinlanir. Node 20 calisma zamani yasak.
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
const artifact = steps.find(step => typeof step.uses === 'string' && step.uses.startsWith('actions/upload-artifact@'));
const summary = steps.find(step => typeof step.name === 'string' && step.name.includes('Calisma ozeti'));
assert(release && artifact && summary, 'release, artifact ve ozet adimlari bulunmali');
assert(steps.indexOf(steps.find(step => step.id === 'apkverify')) < steps.indexOf(release));
assert(steps.indexOf(steps.find(step => step.name.includes('MPV final APK'))) < steps.indexOf(release));
assert(steps.indexOf(steps.find(step => step.name === 'APK ABI ve native boyut raporu')) < steps.indexOf(release));
assert(steps.indexOf(release) < steps.indexOf(artifact));
assert(!release['continue-on-error'] && !artifact['continue-on-error']);
assert.equal(artifact.with['if-no-files-found'], 'error');
assert.equal(release['working-directory'], '.');
// Artifact yuklemesi KOSULSUZ: "Eserler: -" gorunup APK uretilmedi sanilmasin.
assert.equal(artifact.if, undefined, 'artifact yuklemesi kosulsuz olmali (Release + Eserler birlikte)');
// Ozet adimi release ile artifact arasinda ve her zaman calisir.
assert(steps.indexOf(release) < steps.indexOf(summary), 'ozet release sonrasi olmali');
assert(steps.indexOf(summary) < steps.indexOf(artifact), 'ozet artifact oncesi olmali');
assert(/always\(\)/.test(summary.if), 'ozet adimi always() ile kosullanmali');
assert.equal(summary['working-directory'], '.');
assert(summary.run.includes('GITHUB_STEP_SUMMARY'), 'ozet GITHUB_STEP_SUMMARY yazmali');
assert(summary.run.includes('releases/download/'), 'ozet dogrudan indirme baglantisi yazmali');
assert(summary.run.includes('releases/latest'), 'ozet telefon icin latest baglantisi yazmali');
assert(summary.run.includes('sha256sum'), 'ozet SHA-256 yayinlamali');

// Node 20 calisma zamani kullanan action surumleri yasak (GitHub runner'lari zorla
// node24'e dusuruyor; ileride tamamen kalkacak). Esikler: checkout>=5, cache>=5,
// upload-artifact>=6.
const nodeFloor = { 'actions/checkout': 5, 'actions/cache': 5, 'actions/upload-artifact': 6 };
for (const step of steps) {
  if (typeof step.uses !== 'string') continue;
  const [name, ref] = step.uses.split('@');
  if (!Object.hasOwn(nodeFloor, name)) continue;
  const major = Number(/^v(\d+)/.exec(ref || '')?.[1]);
  assert(Number.isInteger(major), `${step.uses}: surum okunamadi`);
  assert(major >= nodeFloor[name], `${step.uses} node20 calistirir; en az v${nodeFloor[name]} olmali`);
}

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
// Ozet adiminin kabuk govdesi de gercekten calistirilir (bash -n + iki senaryo).
const summarySubs = {
  'github.run_number': '152',
  'github.server_url': 'https://github.com',
  'github.repository': 'mkizilkan/kizilkan-player-elite',
  'steps.apk.outputs.name': 'KIZILKAN-PLAYER-ELITE-v18.7.30-build152.apk',
  'steps.apk.outputs.version': '18.7.30',
  'steps.release.outcome': '__OUTCOME__',
};
const summaryScript = summary.run.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
  assert(Object.hasOwn(summarySubs, key), `Unexpected summary expression ${key}`);
  return summarySubs[key];
});
const temp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'kizilkan-ci-summary-'));
try {
  fs.mkdirSync(path.join(temp2, 'artifacts'));
  fs.writeFileSync(path.join(temp2, 'artifacts', summarySubs['steps.apk.outputs.name']), Buffer.alloc(3 * 1048576, 7));
  for (const [outcome, mustHave] of [['success', 'releases/download/build-152/'], ['skipped', 'Eserler']]) {
    const file2 = path.join(temp2, `summary-${outcome}.sh`);
    fs.writeFileSync(file2, summaryScript.split('__OUTCOME__').join(outcome), 'utf8');
    const syn = spawnSync(bash, ['-n', file2], { encoding: 'utf8' });
    assert.equal(syn.status, 0, syn.error?.message || syn.stderr);
    const out = path.join(temp2, `summary-${outcome}.md`);
    const run2 = spawnSync(bash, [file2], {
      cwd: temp2, encoding: 'utf8',
      env: { ...process.env, GITHUB_STEP_SUMMARY: out, NEW_ARCH: 'true', BUILD_TYPE: 'release' },
    });
    assert(!run2.error, run2.error?.message);
    assert.equal(run2.status, 0, run2.stderr);
    const text = fs.readFileSync(out, 'utf8');
    assert(text.includes(mustHave), `ozet (${outcome}) beklenen metni yazmadi: ${mustHave}`);
    assert(text.includes('3 MB'), 'ozet gercek dosya boyutunu yazmali');
    assert(/[0-9a-f]{64}/.test(text), 'ozet gercek SHA-256 yazmali');
  }
} finally {
  fs.rmSync(temp2, { recursive: true, force: true });
}
console.log('PASS: CI Release yayinlama + kosulsuz artifact + calisma ozeti + node24 esigi TEMIZ');
