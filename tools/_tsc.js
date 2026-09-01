/**
 * KIZILKAN PLAYER — taşınabilir TypeScript CLI çözücü
 * v15.2.27-RC2 CI TSC FIX
 *
 * HARD gate'i gevşetmez. Yalnızca TypeScript CLI'nin farklı npm/yarn
 * node_modules yerleşimlerinde güvenilir şekilde bulunmasını sağlar.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function resolveTsc(frontend) {
  const attempted = [];

  const direct = path.join(frontend, 'node_modules', 'typescript', 'bin', 'tsc');
  attempted.push(direct);
  if (fs.existsSync(direct)) return { command: process.execPath, argsPrefix: [direct], resolved: direct };

  try {
    const resolved = require.resolve('typescript/bin/tsc', { paths: [frontend] });
    attempted.push(resolved);
    if (fs.existsSync(resolved)) return { command: process.execPath, argsPrefix: [resolved], resolved };
  } catch (error) {
    attempted.push(`require.resolve: ${error && error.code ? error.code : 'bulunamadı'}`);
  }

  const yarnBin = spawnSync('yarn', ['bin', 'tsc'], {
    cwd: frontend,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (!yarnBin.error && yarnBin.status === 0) {
    const candidate = String(yarnBin.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop();
    if (candidate) {
      attempted.push(candidate);
      if (fs.existsSync(candidate)) return { command: process.execPath, argsPrefix: [candidate], resolved: candidate };
    }
  } else {
    attempted.push(`yarn bin tsc: ${yarnBin.error ? yarnBin.error.message : `exit ${yarnBin.status}`}`);
  }

  const error = new Error(
    "TypeScript CLI bulunamadı. HARD gate atlanmadı. " +
    "CI/yerel ortamda devDependencies dahil bağımlılıkları kurun: " +
    "`yarn install --frozen-lockfile --production=false`.\n" +
    `Denenen yollar: ${attempted.join(' | ')}`
  );
  error.code = 'KIZILKAN_TSC_NOT_FOUND';
  throw error;
}

module.exports = { resolveTsc };
