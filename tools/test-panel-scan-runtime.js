#!/usr/bin/env node
/** Offline production-code fixtures. Add --native to compile/run the actual Kotlin coordinator/parser. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan');
const service = fs.readFileSync(path.join(sourceRoot, 'PanelScanService.kt'), 'utf8');
const coordinator = fs.readFileSync(path.join(sourceRoot, 'ScanWorkCoordinator.kt'), 'utf8');
const moduleBox = { exports: {} };
const js = ts.transpileModule(fs.readFileSync(path.join(root, 'frontend/src/utils/bulkAccounts.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(js, { module: moduleBox, exports: moduleBox.exports }, { filename: 'bulkAccounts.js' });
const { parseBulkAccounts } = moduleBox.exports;
const plain = value => JSON.parse(JSON.stringify(value));
const fixtures = [
  { name: 'named account with empty locator', text: 'Family|fixture-user|fixture-pass|', expected: { row: 1, name: 'Family', username: 'fixture-user', password: 'fixture-pass' } },
  { name: 'unnamed account with empty locator', text: 'fixture-user|fixture-pass|', expected: { row: 1, name: '', username: 'fixture-user', password: 'fixture-pass' } },
  { name: 'colon remains in password', text: 'user:pass:with:colon', expected: { row: 1, name: '', username: 'user', password: 'pass:with:colon' } },
  { name: 'server label is not an account', text: 'server:8080', expected: null },
  { name: 'Turkish server label is not an account', text: 'Sunucu: fixture.invalid', expected: null },
  { name: 'code label is not an account', text: 'kod: 12345', expected: null },
  { name: 'panel label is not an account', text: 'panel: Fixture', expected: null },
  { name: 'server first format', text: 'http://fixture.invalid:8080|fixture-user|fixture-pass|Family', expected: { row: 1, name: 'Family', username: 'fixture-user', password: 'fixture-pass', server: 'http://fixture.invalid:8080' } },
  { name: 'quoted CSV delimiter in name/password', text: '"Family, A","fixture-user","p,a","12345"', expected: { row: 1, name: 'Family, A', username: 'fixture-user', password: 'p,a', serverCode: '12345' } },
  { name: 'Turkish header aliases', text: 'İSİM;Kullanıcı Adı;Şifre;Sunucu Kodu\nFamily;fixture-user;fixture-pass;12345', expected: { row: 2, name: 'Family', username: 'fixture-user', password: 'fixture-pass', serverCode: '12345' } },
  { name: 'account URL query decoding', text: 'Family|https://fixture.invalid/get.php?username=fixture%2Buser&password=pa%3Ass+word&type=m3u_plus', expected: { row: 1, name: 'Family', username: 'fixture+user', password: 'pa:ss word', server: 'https://fixture.invalid' } },
  { name: 'code locator', text: 'fixture-user|fixture-pass|12345', expected: { row: 1, name: '', username: 'fixture-user', password: 'fixture-pass', serverCode: '12345' } },
  { name: 'panel locator', text: 'fixture-user|fixture-pass|Fixture', expected: { row: 1, name: '', username: 'fixture-user', password: 'fixture-pass', panelName: 'Fixture' } },
  { name: 'empty password rejected', text: 'fixture-user|', expected: null },
  { name: 'named empty password rejected', text: 'Family|fixture-user||', expected: null },
];
for (const fixture of fixtures) {
  const result = plain(parseBulkAccounts(fixture.text));
  assert.deepEqual(result.accounts, fixture.expected ? [fixture.expected] : [], fixture.name);
  console.log(`PASS: JS parser — ${fixture.name}`);
}
assert.equal(plain(parseBulkAccounts('[{"username":"fixture-user","password":"fixture-pass"}]')).accounts.length, 1, 'JSON import remains supported');
assert.equal(plain(parseBulkAccounts('# comment\n\nfixture-user:fixture-pass')).accounts.length, 1, 'comment/blank lines remain supported');
// These guards connect the tested coordinator to every production worker path.
assert.equal((service.match(/checkpointTracker\.claim\(workerId, cursor, total\)/g) || []).length, 3);
assert.ok(service.includes('tracker.claimQueued(workerId, queue, nextAssigned)'));
assert.ok(!service.includes('checkpointTracker.begin('));
assert.ok(!service.includes('finally { tracker.finish(workerId) }'), 'incomplete account remains pinned');
assert.ok(!service.includes('queue.offer(poison'), 'failed producer cannot wait forever to enqueue sentinels');
assert.equal((service.match(/workerFailure\.get\(\)\?\.let \{ if \(!cancelled\.get\(\)\) throw it \}/g) || []).length, 4, 'all fixed-array modes propagate worker failure');
assert.ok(service.includes('if(outcome.cacheable&&!cancelled.get()'), 'transient probe result is not cached');
assert.ok(service.includes('if(cached!=null&&cached!="null")'), 'legacy transient-null cache retries');
assert.ok(service.includes('scanCheckpointResumePoint(') && service.includes('resumeAccount.second'), 'recovery passes only versioned, committed test count');
assert.ok(service.includes('resetCheckpointForReplay('), 'legacy replay resets stale journal checkpoint');
assert.equal((service.match(/put\("checkpointVersion", SCAN_CHECKPOINT_VERSION\)/g) || []).length, 5, 'single/bulk/unified/streaming persist checkpoint generation and legacy upgrade');
assert.ok(!service.includes('hostBackoffUntil.remove(hostKey)'), 'success never clears a concurrent rate limit');
console.log('PASS: native worker integration contracts');
if (!process.argv.includes('--native')) {
  console.log('PASS: offline JS/parser + integration contracts; Kotlin runtime requires --native');
  process.exit(0);
}

// Execute the production checkpoint SQL, including delayed/out-of-order writes.
const { DatabaseSync } = require('node:sqlite');
const journalSource = fs.readFileSync(path.join(sourceRoot, 'ScanJournalStore.kt'), 'utf8');
const singleSql = journalSource.slice(journalSource.indexOf('@Synchronized fun checkpoint(')).match(/execSQL\(\s*"([^"]+)"/)[1];
const streamingSql = journalSource.slice(journalSource.indexOf('@Synchronized fun checkpointUnified(')).match(/execSQL\(\s*"([^"]+)"/)[1];
const sqlite = new DatabaseSync(':memory:');
try {
  sqlite.exec('CREATE TABLE scan_session(run_id TEXT PRIMARY KEY,payload_enc TEXT,committed_cursor INTEGER DEFAULT 0,committed_account INTEGER DEFAULT 0,committed_tested INTEGER DEFAULT 0,state TEXT,updated_at INTEGER)');
  sqlite.prepare('INSERT INTO scan_session(run_id) VALUES (?)').run('fixture');
  const singleCheckpoint = sqlite.prepare(singleSql);
  singleCheckpoint.run(10, 10, 'RUNNING', 1, 'fixture', 10);
  singleCheckpoint.run(5, 5, 'RUNNING', 2, 'fixture', 5);
  assert.equal(sqlite.prepare('SELECT committed_cursor FROM scan_session').get().committed_cursor, 10);
  const streamingCheckpoint = sqlite.prepare(streamingSql);
  streamingCheckpoint.run(3, 12, 12, 'RUNNING', 3, 'fixture', 3, 12);
  streamingCheckpoint.run(2, 8, 8, 'RUNNING', 4, 'fixture', 2, 8);
  streamingCheckpoint.run(3, 9, 9, 'RUNNING', 5, 'fixture', 3, 9);
  const saved = sqlite.prepare('SELECT committed_account,committed_tested FROM scan_session').get();
  assert.equal(saved.committed_account, 3);
  assert.equal(saved.committed_tested, 12);
  const resetSql = journalSource.slice(journalSource.indexOf('@Synchronized fun resetCheckpointForReplay(')).match(/execSQL\(\s*"([^"]+)"/)[1];
  sqlite.exec('CREATE TABLE scan_result(run_id TEXT,payload_enc TEXT)');
  sqlite.prepare('INSERT INTO scan_result VALUES (?,?)').run('fixture', 'verified fixture payload');
  sqlite.prepare(resetSql).run('versioned encrypted fixture payload', 6, 'fixture');
  const replay = sqlite.prepare('SELECT committed_account,committed_tested,committed_cursor FROM scan_session').get();
  assert.equal(replay.committed_account, 0);
  assert.equal(replay.committed_tested, 0);
  assert.equal(replay.committed_cursor, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM scan_result').get().count, 1, 'legacy checkpoint replay retains results');
  console.log('PASS: actual SQLite checkpoint SQL prevents delayed cursor/tested regressions');
} finally { sqlite.close(); }

function cachedJar(group, name, preferredVersion) {
  const cache = path.join(process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle'), 'caches/modules-2/files-2.1', group, name);
  if (!fs.existsSync(cache)) throw new Error(`Required cached Gradle dependency missing: ${name}. Run the project Kotlin build first.`);
  const versions = fs.readdirSync(cache).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (preferredVersion && versions.includes(preferredVersion)) versions.unshift(preferredVersion);
  for (const version of versions) {
    const base = path.join(cache, version);
    for (const hash of fs.readdirSync(base)) {
      const files = fs.readdirSync(path.join(base, hash));
      const jar = files.find(file => file === `${name}-${version}.jar`);
      if (jar) return path.join(base, hash, jar);
    }
  }
  throw new Error(`No cached JAR found for ${name}`);
}
const compiler = cachedJar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20');
const compilerVersion = path.basename(compiler).match(/^kotlin-compiler-embeddable-(.+)\.jar$/)[1];
const stdlib = cachedJar('org.jetbrains.kotlin', 'kotlin-stdlib', compilerVersion);
const annotations = cachedJar('org.jetbrains', 'annotations');
const jsonJar = cachedJar('org.json', 'json');
const compilerClasspath = [compiler, stdlib, annotations,
  cachedJar('org.jetbrains.kotlin', 'kotlin-reflect', compilerVersion),
  cachedJar('org.jetbrains.kotlin', 'kotlin-script-runtime', compilerVersion),
  cachedJar('org.jetbrains.intellij.deps', 'trove4j'),
  cachedJar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm'),
].join(path.delimiter);
const parserStart = service.indexOf('  private data class StreamAccountV172(');
const parserEnd = service.indexOf('  private fun resolveCandidatesV172(', parserStart);
assert.ok(parserStart >= 0 && parserEnd > parserStart, 'actual Kotlin parser extraction boundaries');
const quoteKt = value => JSON.stringify(value).replace(/\$/g, '\\$');
const fieldList = value => value ? ['name', 'username', 'password', 'server', 'serverCode', 'panelName'].map(key => value[key] || '') : null;
const nativeCases = fixtures.map(fixture => {
  const lines = fixture.text.split('\n');
  const line = lines[lines.length - 1];
  const header = lines.length > 1 ? `parseDelimitedV172(${quoteKt(lines[0])}, delimiter)` : 'null';
  const expected = fieldList(fixture.expected);
  return `run {
    val delimiter = guessDelimiterV172(${quoteKt(lines[0])})
    val parsed = parseStreamAccountV172(${quoteKt(line)}, delimiter, ${header}, ${lines.length}, 0L)
    val actual = parsed?.let { listOf(it.name, it.username, it.password, it.server, it.serverCode, it.panelName) }
    check(actual == ${expected ? `listOf(${expected.map(quoteKt).join(', ')})` : 'null'}) { ${quoteKt(fixture.name)} + ": " + actual }
  }`;
}).join('\n');
const fixtureCode = `package expo.modules.panelscan
import java.util.concurrent.*
import java.util.concurrent.atomic.*
object PanelScanRuntimeFixture {
${service.slice(parserStart, parserEnd)}
  @JvmStatic fun main(args: Array<String>) {
    val slow = ConservativeCursorTracker(2)
    val cursor = AtomicInteger(0)
    check(slow.claim(0, cursor, 1000) == 0)
    for (i in 1 until 1000) { check(slow.claim(1, cursor, 1000) == i); slow.finish(1); check(slow.safeCursor(cursor.get().toLong()) == 0L) }
    slow.finish(0)
    check(slow.safeCursor(cursor.get().toLong()) == 1000L)
    check(slow.claim(0, cursor, 1000) == null && cursor.get() == 1000)
    println("PASS: actual Kotlin slow-worker prefix + bounded reservation")

    val longCursor = AtomicLong(Int.MAX_VALUE.toLong() + 17L)
    val longTracker = ConservativeCursorTracker(1)
    val longStart = longCursor.get()
    check(longTracker.claim(0, longCursor, longStart + 1L) == longStart)
    check(longTracker.safeCursor(longCursor.get()) == longStart)
    longTracker.finish(0)
    check(longTracker.safeCursor(longCursor.get()) == longStart + 1L)
    println("PASS: actual Kotlin 64-bit cursor")
    check(scanCheckpointResumePoint(0, 300L, 999L) == (0L to 0L))
    check(scanCheckpointResumePoint(2, 300L, 300L) == (300L to 300L))
    println("PASS: actual Kotlin legacy unsafe checkpoint replays; versioned prefix resumes")

    val queue = ArrayBlockingQueue<Long>(128)
    val queuedTracker = ConservativeCursorTracker(2)
    val next = AtomicLong(0L)
    check(queuedTracker.claimQueued(0, queue, next) { it } == null)
    for (i in 0L until 100L) queue.add(i)
    check(queuedTracker.claimQueued(0, queue, next) { it } == 0L)
    for (i in 1L until 100L) { check(queuedTracker.claimQueued(1, queue, next) { it } == i); queuedTracker.finish(1); check(queuedTracker.safeCursor(next.get()) == 0L) }
    // Cancellation/failure does not finish worker zero's partially processed account.
    check(queuedTracker.safeCursor(next.get()) == 0L)
    queuedTracker.finish(0)
    check(queuedTracker.safeCursor(next.get()) == 100L)
    println("PASS: actual Kotlin queued-account claim + interrupted account recovery")

    val prefix = ConservativeCursorTracker(2, 5L)
    val prefixQueue = ArrayBlockingQueue<Long>(2)
    val prefixNext = AtomicLong(2L)
    prefixQueue.add(2L)
    check(prefix.claimQueued(0, prefixQueue, prefixNext) { it } == 2L)
    for (ordinal in 3L until 10003L) {
      prefixQueue.add(ordinal)
      check(prefix.claimQueued(1, prefixQueue, prefixNext) { it } == ordinal)
      prefix.finishAccount(1, ordinal, 2L)
      check(prefix.streamingProgress(prefixNext.get()) == (2L to 5L))
      check(prefix.pendingAccountGroups() <= 1)
    }
    prefix.finishAccount(0, 2L, 3L)
    check(prefix.streamingProgress(prefixNext.get()) == (10003L to 20008L))
    check(prefix.streamingProgress(prefixNext.get()) == (10003L to 20008L))
    println("PASS: actual Kotlin committed probe prefix excludes in-flight account; 10000 ahead accounts use one bounded interval")

    val count = 12000
    val parallel = ConservativeCursorTracker(8)
    val parallelCursor = AtomicInteger(0)
    val completed = AtomicIntegerArray(count)
    val failure = AtomicReference<Throwable?>(null)
    val start = CountDownLatch(1)
    val pool = Executors.newFixedThreadPool(8)
    repeat(8) { id -> pool.submit {
      try {
        start.await()
        while (true) {
          val index = parallel.claim(id, parallelCursor, count) ?: break
          if (index % 7 == 0) Thread.yield()
          check(completed.compareAndSet(index, 0, 1)) { "duplicate work: " + index }
          parallel.finish(id)
        }
      } catch (error: Throwable) { failure.compareAndSet(null, error) }
    } }
    val observer = Thread {
      try {
        start.await()
        var verified = 0
        while (!pool.isTerminated) {
          val safe = parallel.safeCursor(parallelCursor.get().toLong()).toInt()
          while (verified < safe) { check(completed.get(verified) == 1) { "checkpoint skipped " + verified }; verified++ }
          Thread.yield()
        }
      } catch (error: Throwable) { failure.compareAndSet(null, error) }
    }
    observer.start(); pool.shutdown(); start.countDown()
    check(pool.awaitTermination(10, TimeUnit.SECONDS)) { "parallel fixture timed out" }
    observer.join(2000)
    check(!observer.isAlive)
    failure.get()?.let { throw it }
    check(parallelCursor.get() == count && parallel.safeCursor(parallelCursor.get().toLong()) == count.toLong())
    for (i in 0 until count) check(completed.get(i) == 1)
    println("PASS: actual Kotlin 8 workers / 12000 jobs / concurrent checkpoint observer")

    val permit = Semaphore(0, true)
    val cancelled = AtomicBoolean(false)
    val acquired = AtomicReference<Boolean?>(null)
    val waiting = Thread { acquired.set(awaitScanHostPermit(permit, cancelled)) }
    waiting.start(); Thread.sleep(250)
    check(waiting.isAlive && acquired.get() == null) { "local contention became a negative result" }
    permit.release(); waiting.join(2000)
    check(!waiting.isAlive && acquired.get() == true)
    permit.release()
    val cancelPermit = Semaphore(0, true)
    val cancelFlag = AtomicBoolean(false)
    val cancelledResult = AtomicReference<Boolean?>(null)
    val cancelWaiter = Thread { cancelledResult.set(awaitScanHostPermit(cancelPermit, cancelFlag)) }
    cancelWaiter.start(); Thread.sleep(150); cancelFlag.set(true); cancelWaiter.join(2000)
    check(!cancelWaiter.isAlive && cancelledResult.get() == false && cancelPermit.availablePermits() == 0)
    println("PASS: actual Kotlin semaphore contention + cancellation without permit leak")

    check(scanAuthStatus(1) == true && scanAuthStatus(true) == true && scanAuthStatus("TRUE") == true)
    check(scanAuthStatus(0) == false && scanAuthStatus(false) == false)
    check(scanAuthStatus(null) == null && scanAuthStatus(2) == null && scanAuthStatus("invalid") == null)
    val retryNow = 1700000000000L
    check(scanRetryAfterMillis("120", retryNow) == 120000L)
    check(scanRetryAfterMillis("-1", retryNow) == 2000L)
    val retryDate = java.text.SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz", java.util.Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("GMT") }.format(java.util.Date(retryNow + 120000L))
    check(scanRetryAfterMillis(retryDate, retryNow) == 120000L)
    for (pattern in listOf("EEEE, dd-MMM-yy HH:mm:ss zzz", "EEE MMM d HH:mm:ss yyyy")) {
      val oldDate = java.text.SimpleDateFormat(pattern, java.util.Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("GMT") }.format(java.util.Date(retryNow + 120000L))
      check(scanRetryAfterMillis(oldDate, retryNow) == 120000L)
    }
    check(scanRetryAfterMillis("invalid", retryNow) == 2000L)
    val backoffDeadline = AtomicLong(System.currentTimeMillis() + 300L)
    val backoffCancelled = AtomicBoolean(false)
    val backoffResult = AtomicReference<Boolean?>(null)
    val backoffWorker = Thread { backoffResult.set(awaitScanHostBackoff({ backoffDeadline.get() }, backoffCancelled)) }
    backoffWorker.start(); Thread.sleep(150)
    backoffDeadline.set(System.currentTimeMillis() + 500L)
    backoffWorker.join(250)
    check(backoffWorker.isAlive) { "extended backoff deadline was ignored" }
    backoffCancelled.set(true); backoffWorker.join(2000)
    check(!backoffWorker.isAlive && backoffResult.get() == false)
    println("PASS: actual Kotlin strict auth + 120-second/date Retry-After + concurrent extension/cancellation")
${nativeCases}
    println("PASS: actual Kotlin parser parity — ${fixtures.length} fixtures")
  }
}
`;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kizilkan-panel-scan-test-'));
// Windows JDK Unix-domain pipe paths must fit the OS limit; user Temp paths may be too long.
const runtimeJvmArgs = ['-Dfile.encoding=UTF-8', ...(process.platform === 'win32' ? [`-Djdk.net.unixdomain.tmpdir=${root}`] : [])];
try {
  const fixtureFile = path.join(tempRoot, 'PanelScanRuntimeFixture.kt');
  const serviceFixtureFile = path.join(tempRoot, 'PanelScanServiceRuntimeFixture.kt');
  const classes = path.join(tempRoot, 'classes');
  fs.writeFileSync(fixtureFile, fixtureCode, 'utf8');
  function extract(start, end) {
    const from = service.indexOf(start), to = service.indexOf(end, from);
    assert.ok(from >= 0 && to > from, `actual service extraction: ${start}`);
    return service.slice(from, to);
  }
  let serviceFixture = fs.readFileSync(path.join(__dirname, 'fixtures/panel-scan-native-runtime.kt'), 'utf8');
  const replacements = {
    FINALIZE: extract('  private fun finalizeSnapshot(', '  private val probeStripes='),
    RESULTS: extract('  private fun initializeResultCount(', '  private fun abortActiveNetworkWork('),
    SNAPSHOT_STORAGE: extract('  @Synchronized private fun writeSnapshot(', '  private fun finalizeSnapshot('),
    BULK: extract('  private fun runBulkScan(', '  private fun writeBulkSnapshot('),
    SNAPSHOTS: extract('  private fun writeBulkSnapshot(', '  // v17.2.0: TXT/CSV'),
    PARSER: service.slice(parserStart, parserEnd),
    CANDIDATES: extract('  private fun resolveCandidatesV172(', '  private fun runStreamingFileScanV172('),
    STREAMING: extract('  private fun runStreamingFileScanV172(', '  private fun runUnifiedScanFromStaging('),
    SINGLE: service.slice(service.indexOf('  private fun runScan('), service.lastIndexOf('\n}')),
    PROBE: extract('  private fun probe(server:', '  /** v18.5.0: proxy'),
    PHYSICAL: extract('  private fun probePhysical(', '  /** Snapshot diskte'),
    SANITIZER: extract('  private fun sanitizeLogin(', '  private fun runBulkScan('),
  };
  for (const [name, source] of Object.entries(replacements)) serviceFixture = serviceFixture.replace(`  // INSERT_${name}`, () => source);
  assert.ok(!serviceFixture.includes('// INSERT_'));
  fs.writeFileSync(serviceFixtureFile, serviceFixture, 'utf8');
  const compileOutput = execFileSync('java', ['-cp', compilerClasspath, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect', '-classpath', [stdlib, annotations, jsonJar].join(path.delimiter), '-d', classes, path.join(sourceRoot, 'ScanWorkCoordinator.kt'), fixtureFile, serviceFixtureFile], { encoding: 'utf8', timeout: 120000, windowsHide: true });
  if (compileOutput.trim()) console.log(compileOutput.trim());
  const output = execFileSync('java', [...runtimeJvmArgs, '-cp', [classes, stdlib].join(path.delimiter), 'expo.modules.panelscan.PanelScanRuntimeFixture'], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  console.log(output.trim());
  const serviceOutput = execFileSync('java', [...runtimeJvmArgs, '-cp', [classes, stdlib, jsonJar].join(path.delimiter), 'expo.modules.panelscan.PanelScanServiceRuntimeFixture'], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  console.log(serviceOutput.trim());
} finally {
  // Delete only the exact temporary directory created above, after checking its absolute parent/name.
  const target = path.resolve(tempRoot);
  assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
  assert.ok(path.basename(target).startsWith('kizilkan-panel-scan-test-'));
  fs.rmSync(target, { recursive: true, force: true });
}
console.log('PASS: panel scan offline runtime regressions');
