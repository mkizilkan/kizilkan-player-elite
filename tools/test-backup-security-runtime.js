#!/usr/bin/env node
/** Actual WebCrypto PIN tests by default; --native adds actual BackupCrypto.kt JVM cryptography/interoperability. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, randomBytes, pbkdf2Sync } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ts = require('./_ts');
const root = path.resolve(__dirname, '..');
function cachedJar(group, name, preferred) {
  const cache = path.join(process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle'), 'caches/modules-2/files-2.1', group, name);
  assert.ok(fs.existsSync(cache), `Cached dependency missing: ${name}; compile native project first.`);
  const versions = fs.readdirSync(cache).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (preferred && versions.includes(preferred)) versions.unshift(preferred);
  for (const version of versions) for (const hash of fs.readdirSync(path.join(cache, version))) {
    const file = path.join(cache, version, hash, `${name}-${version}.jar`);
    if (fs.existsSync(file)) return file;
  }
  throw new Error(`Cached JAR missing: ${name}`);
}
function loadTs(relative, imports) {
  const box = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, crypto: webcrypto, TextEncoder, Uint8Array,
    require: name => { assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name}`); return imports[name]; } }, { filename: relative });
  return box.exports;
}
const fixture = String.raw`package expo.modules.kizilkannativecore
import java.io.*
import java.nio.ByteBuffer
import java.util.concurrent.CancellationException
import java.util.concurrent.atomic.AtomicBoolean
import javax.crypto.AEADBadTagException

object BackupSecurityFixture {
  private const val CHUNK = 65536
  private const val HEADER = 46
  private const val RECORD = CHUNK + 16
  private const val PASSWORD = "fixture-password-şifre🔐"
  private var groups = 0
  private fun pass(name: String) { groups++; println("PASS: native backup security — " + name) }
  private fun bytes(size: Int) = ByteArray(size) { ((it * 37 + 11) and 255).toByte() }
  private fun encrypt(data: ByteArray): ByteArray = ByteArrayOutputStream().let {
    BackupCrypto.encrypt(ByteArrayInputStream(data), it, data.size.toLong(), PASSWORD); it.toByteArray()
  }
  private fun decrypt(data: ByteArray, password: String = PASSWORD): ByteArray = ByteArrayOutputStream().let {
    BackupCrypto.decrypt(ByteArrayInputStream(data), it, password); it.toByteArray()
  }
  private inline fun <reified E : Throwable> reject(name: String, action: () -> Unit) {
    var rejected = false
    try { action() } catch (error: Throwable) {
      check(error is E) { name + " raised unexpected " + error.javaClass.name }; rejected = true
    }
    check(rejected) { name + " was accepted" }
  }
  private fun mutated(data: ByteArray, at: Int): ByteArray = data.copyOf().also { it[at] = (it[at].toInt() xor 1).toByte() }
  private class CountedInput(data: ByteArray, private val cancelAt: Int = Int.MAX_VALUE, private val cancelled: AtomicBoolean = AtomicBoolean(false)) : ByteArrayInputStream(data) {
    var consumed = 0
    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
      val n = super.read(buffer, offset, minOf(length, 7919))
      if (n > 0) { consumed += n; if (consumed >= cancelAt) cancelled.set(true) }
      return n
    }
    override fun read(): Int { val n = super.read(); if (n >= 0) consumed++; return n }
  }
  private class CancelOutput(private val cancelAt: Int, private val cancelled: AtomicBoolean) : ByteArrayOutputStream() {
    override fun write(buffer: ByteArray, offset: Int, length: Int) { super.write(buffer, offset, length); if (size() >= cancelAt) cancelled.set(true) }
  }
  @JvmStatic fun main(args: Array<String>) {
    for (size in listOf(0, 1, CHUNK - 1, CHUNK, CHUNK + 1, 2 * CHUNK + 123)) {
      val original = bytes(size)
      val encrypted = encrypt(original)
      check(encrypted.size == HEADER + size + ((size + CHUNK - 1) / CHUNK + 1) * 16) { "record bound changed" }
      val output = ByteArrayOutputStream()
      BackupCrypto.decrypt(CountedInput(encrypted), output, PASSWORD)
      check(original.contentEquals(output.toByteArray())) { "roundtrip mismatch at " + size }
    }
    val original = bytes(2 * CHUNK + 123)
    val encrypted = encrypt(original)
    check(!encrypt(original).contentEquals(encrypted)) { "fresh encryption reused salt/nonce prefix" }
    pass("empty, partial-read, exact-boundary and multiple-chunk roundtrips; fresh randomness")
    reject<AEADBadTagException>("wrong password") { decrypt(encrypted, "another-password") }
    reject<AEADBadTagException>("empty payload wrong password") { decrypt(encrypt(ByteArray(0)), "another-password") }
    pass("wrong passwords rejected even for empty backups")
    reject<IllegalArgumentException>("bad magic") { decrypt(mutated(encrypted, 0)) }
    reject<IllegalArgumentException>("chunk size") { decrypt(mutated(encrypted, 6)) }
    reject<IllegalArgumentException>("KDF work") { decrypt(mutated(encrypted, 10)) }
    reject<IllegalArgumentException>("negative size") { decrypt(encrypted.copyOf().also { ByteBuffer.wrap(it, 14, 8).putLong(-1) }) }
    reject<IllegalArgumentException>("oversized size") { decrypt(encrypted.copyOf().also { ByteBuffer.wrap(it, 14, 8).putLong(Long.MAX_VALUE) }) }
    reject<AEADBadTagException>("authenticated size") { decrypt(mutated(encrypted, 21)) }
    reject<AEADBadTagException>("salt") { decrypt(mutated(encrypted, 22)) }
    reject<AEADBadTagException>("nonce prefix") { decrypt(mutated(encrypted, 38)) }
    pass("magic/format bounds and every authenticated header field reject tampering")
    reject<AEADBadTagException>("first ciphertext") { decrypt(mutated(encrypted, HEADER + 23)) }
    reject<AEADBadTagException>("first tag") { decrypt(mutated(encrypted, HEADER + CHUNK + 2)) }
    reject<AEADBadTagException>("later ciphertext") { decrypt(mutated(encrypted, HEADER + RECORD + 23)) }
    reject<AEADBadTagException>("final authentication record") { decrypt(mutated(encrypted, encrypted.lastIndex)) }
    val swapped = encrypted.copyOf()
    encrypted.copyInto(swapped, HEADER, HEADER + RECORD, HEADER + 2 * RECORD)
    encrypted.copyInto(swapped, HEADER + RECORD, HEADER, HEADER + RECORD)
    reject<AEADBadTagException>("reordered records") { decrypt(swapped) }
    val duplicated = encrypted.copyOf()
    encrypted.copyInto(duplicated, HEADER + RECORD, HEADER, HEADER + RECORD)
    reject<AEADBadTagException>("duplicated record") { decrypt(duplicated) }
    pass("ciphertext/tag corruption, record reorder/duplication and terminator tampering rejected")
    for (cut in listOf(0, 5, 20, HEADER + 3, encrypted.size - 17, encrypted.size - 16, encrypted.size - 1)) {
      reject<EOFException>("truncate " + cut) { decrypt(encrypted.copyOf(cut)) }
    }
    reject<IllegalArgumentException>("trailing data") { decrypt(encrypted + byteArrayOf(0x42)) }
    reject<EOFException>("source shorter than declared") { BackupCrypto.encrypt(ByteArrayInputStream(bytes(1)), ByteArrayOutputStream(), 2, PASSWORD) }
    reject<IllegalStateException>("source longer than declared") { BackupCrypto.encrypt(ByteArrayInputStream(bytes(2)), ByteArrayOutputStream(), 1, PASSWORD) }
    reject<IllegalArgumentException>("negative declared size") { BackupCrypto.encrypt(ByteArrayInputStream(ByteArray(0)), ByteArrayOutputStream(), -1, PASSWORD) }
    reject<IllegalArgumentException>("short password") { BackupCrypto.encrypt(ByteArrayInputStream(ByteArray(0)), ByteArrayOutputStream(), 0, "short") }
    reject<IllegalArgumentException>("long password") { BackupCrypto.decrypt(ByteArrayInputStream(encrypted), ByteArrayOutputStream(), "x".repeat(1025)) }
    pass("header/chunk/terminator truncation, trailing data and inconsistent source size rejected")
    for (decrypting in listOf(false, true)) {
      for (boundary in listOf(1, 2, 3)) {
        val input = CountedInput(if (decrypting) encrypted else original)
        val output = ByteArrayOutputStream(); var checks = 0
        val cancel = { checks++; checks >= boundary }
        reject<CancellationException>("cancel at KDF boundary " + boundary) {
          if (decrypting) BackupCrypto.decrypt(input, output, PASSWORD, cancel)
          else BackupCrypto.encrypt(input, output, original.size.toLong(), PASSWORD, cancel)
        }
        check(output.size() == 0) { "cancelled KDF published output" }
        check(input.consumed <= if (decrypting && boundary > 1) HEADER else 0) { "cancelled KDF read catalogue data" }
      }
    }
    pass("cancellation on entry and immediately before/after real PBKDF2 returns CancellationException with no output")
    for (decrypting in listOf(false, true)) {
      val cancelled = AtomicBoolean(false)
      val afterRead = if (decrypting) HEADER + RECORD else CHUNK
      val input = CountedInput(if (decrypting) encrypted else original, afterRead, cancelled)
      val output = ByteArrayOutputStream()
      reject<CancellationException>("cancel after chunk input") {
        if (decrypting) BackupCrypto.decrypt(input, output, PASSWORD, cancelled::get)
        else BackupCrypto.encrypt(input, output, original.size.toLong(), PASSWORD, cancelled::get)
      }
      check(input.consumed == afterRead && output.size() == if (decrypting) 0 else HEADER) { "cancelled input chunk was published" }
      val cancelledWrite = AtomicBoolean(false)
      val inputWrite = CountedInput(if (decrypting) encrypted else original)
      val outputWrite = CancelOutput(if (decrypting) CHUNK else HEADER + RECORD, cancelledWrite)
      reject<CancellationException>("cancel after chunk output") {
        if (decrypting) BackupCrypto.decrypt(inputWrite, outputWrite, PASSWORD, cancelledWrite::get)
        else BackupCrypto.encrypt(inputWrite, outputWrite, original.size.toLong(), PASSWORD, cancelledWrite::get)
      }
      check(inputWrite.consumed == afterRead) { "cancelled writer consumed a later record" }
      check(outputWrite.size() == if (decrypting) CHUNK else HEADER + RECORD) { "cancelled writer emitted later records" }
    }
    pass("per-chunk read/write cancellation stops before the next record")
    for (decrypting in listOf(false, true)) {
      val cancelled = AtomicBoolean(false)
      val output = object : ByteArrayOutputStream() { override fun flush() { super.flush(); cancelled.set(true) } }
      reject<CancellationException>("cancel during final flush") {
        if (decrypting) BackupCrypto.decrypt(ByteArrayInputStream(encrypted), output, PASSWORD, cancelled::get)
        else BackupCrypto.encrypt(ByteArrayInputStream(original), output, original.size.toLong(), PASSWORD, cancelled::get)
      }
    }
    pass("cancellation during final flush cannot return successful completion")
    val nativePin = BackupCrypto.hashPin("0123")
    val secondPin = BackupCrypto.hashPin("0123")
    check(nativePin.matches(Regex("kzpin:1:600000:[a-f0-9]{32}:[a-f0-9]{64}")) && nativePin != secondPin)
    check(BackupCrypto.verifyPin("0123", nativePin) && !BackupCrypto.verifyPin("0124", nativePin))
    check(BackupCrypto.verifyPin("2468", args[0])) { "native failed to verify actual WebCrypto PIN" }
    for (invalid in listOf("", "123", "12345678901", "12 4", "１２３４", "abcd")) {
      reject<IllegalArgumentException>("invalid PIN hash") { BackupCrypto.hashPin(invalid) }
      check(!BackupCrypto.verifyPin(invalid, nativePin))
    }
    val parts = nativePin.split(':')
    for (invalid in listOf("", "0123", nativePin + ":extra", nativePin.replace("kzpin", "badpin"), nativePin.replace(":1:", ":2:"),
      nativePin.replace(":600000:", ":1:"), "kzpin:1:600000:abcd:" + parts[4], "kzpin:1:600000:" + parts[3] + ":abcd",
      "kzpin:1:600000:" + "g".repeat(32) + ":" + parts[4], "kzpin:1:600000:" + parts[3] + ":" + "G".repeat(64))) {
      check(!BackupCrypto.verifyPin("0123", invalid)) { "malformed encoded PIN was accepted: " + invalid }
    }
    pass("PIN random salts, valid/wrong PIN, malformed encodings, Unicode/non-digit and length rejection; WebCrypto→native")
    println("PIN_NATIVE=" + nativePin)
    println("PASS: actual BackupCrypto.kt — " + groups + " native security groups")
  }
}
`;
async function main() {
  const protection = loadTs('frontend/src/utils/pinProtection.ts', { '@/modules/kizilkan-native-core': { KizilkanNativeCore: { available: false } } });
  const webPin = await protection.protectPin('2468');
  assert.match(webPin, /^kzpin:1:600000:[a-f0-9]{32}:[a-f0-9]{64}$/);
  assert.equal(await protection.matchesPin('2468', webPin), true);
  assert.equal(await protection.matchesPin('2469', webPin), false);
  assert.equal(await protection.protectPin(webPin), webPin, 'already protected PIN must not be rehashed');
  assert.equal(await protection.matchesPin('0000', '0000'), true, 'legacy PIN remains verifiable before migration');
  const parts = webPin.split(':');
  assert.equal(parts[4], pbkdf2Sync('2468', Buffer.from(parts[3], 'hex'), 600000, 32, 'sha256').toString('hex'), 'WebCrypto PIN hash matches independent Node PBKDF2 implementation');
  assert.notEqual(await protection.protectPin('2468'), webPin, 'same PIN gets fresh random salt');
  for (const invalid of ['', '123', '12345678901', '１２３４', '12 4']) assert.equal(await protection.matchesPin(invalid, webPin), false);
  for (const invalid of [webPin + ':extra', webPin.replace(':1:', ':2:'), webPin.replace(':600000:', ':1:'), 'kzpin:1:600000:abcd:' + parts[4]]) assert.equal(await protection.matchesPin('2468', invalid), false);
  const recovery = '0876543210';
  const pin = loadTs('frontend/src/utils/pin.ts', {
    './pinProtection': protection,
    './storage': { storage: { getItem: async () => recovery, getItemStrict: async () => recovery, setItem: async () => true } },
    './profileDataReload': { registerProfileDataDrain: () => () => {} },
    './catalogOperations': { isCatalogRestoreActive: () => false },
    'expo-crypto': { getRandomBytesAsync: async n => randomBytes(n) },
  });
  assert.equal(await pin.checkPin('2468', webPin), 'ok');
  assert.equal(await pin.checkPin(pin.MASTER_PIN, webPin), 'master');
  assert.equal(await pin.checkPin(recovery, webPin), 'recovery');
  assert.equal(await pin.checkPin('9876', webPin), 'wrong');
  assert.equal(pin.isAccepted('master'), true); assert.equal(pin.isAccepted('recovery'), true);
  const nativeSource = fs.readFileSync(path.join(root, 'frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/BackupCrypto.kt'), 'utf8');
  assert.match(nativeSource, /fun encrypt\([^\n]*shouldCancel: \(\) -> Boolean = \{ false \}/);
  assert.match(nativeSource, /fun decrypt\([^\n]*shouldCancel: \(\) -> Boolean = \{ false \}/);
  assert.ok(nativeSource.includes('throw CancellationException('));
  assert.ok(nativeSource.includes('finally { derived.fill(0) }'));
  const bridgeSource = fs.readFileSync(path.join(root, 'frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt'), 'utf8');
  const encryptStart = bridgeSource.indexOf('    AsyncFunction("encryptBackupFile")');
  const decryptStart = bridgeSource.indexOf('    AsyncFunction("decryptBackupFile")', encryptStart);
  const end = bridgeSource.indexOf('    // v18.6.0: tüketmeden', decryptStart);
  assert.ok(encryptStart >= 0 && decryptStart > encryptStart && end > decryptStart, 'actual crypto bridge extraction boundaries');
  for (const body of [bridgeSource.slice(encryptStart, decryptStart), bridgeSource.slice(decryptStart, end)]) {
    assert.match(body, /catch \(e: Throwable\) \{ target\?\.delete\(\)/, 'failed/cancelled partial output is deleted');
    assert.match(body, /finally \{ backupCryptoCancelled\.remove\(jobId,cancelled\) \}/, 'crypto job flag is released');
    assert.match(body, /BackupCrypto\.(?:encrypt|decrypt)\([^\n]+\{ cancelled\.get\(\) \}/, 'native job cancellation reaches actual crypto loop');
    assert.ok(body.includes('if(cancelled.get())throw CancellationException('), 'cancel is checked outside the crypto call');
    assert.ok(body.includes('.runOnQueue(appContext.backgroundCoroutineScope)'), 'crypto does not block Expo modules queue');
    assert.ok(!body.includes('source.delete('), 'original backup source remains preserved');
  }
  assert.ok(bridgeSource.includes('require(!target.exists())'), 'crypto cannot truncate/reuse existing source or output');
  assert.ok(bridgeSource.includes('target.path.startsWith(it.canonicalPath + File.separator)'), 'crypto output remains app-private');
  console.log('PASS: actual WebCrypto PIN — independent PBKDF2, fresh salts, malformed/invalid/wrong PIN, legacy compatibility and preserved master/recovery acceptance');
  if (!process.argv.includes('--native')) {
    console.log('PASS: native cancellation API/zeroization + private-output/error-cleanup bridge contracts; actual Kotlin encryption/interoperability runtime requires --native');
    return;
  }
  const compiler = cachedJar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20');
  const version = path.basename(compiler).match(/^kotlin-compiler-embeddable-(.+)\.jar$/)[1];
  const stdlib = cachedJar('org.jetbrains.kotlin', 'kotlin-stdlib', version);
  const annotations = cachedJar('org.jetbrains', 'annotations');
  const compilerClasspath = [compiler, stdlib, annotations,
    cachedJar('org.jetbrains.kotlin', 'kotlin-reflect', version),
    cachedJar('org.jetbrains.kotlin', 'kotlin-script-runtime', version),
    cachedJar('org.jetbrains.intellij.deps', 'trove4j'),
    cachedJar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm')].join(path.delimiter);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kizilkan-backup-security-test-'));
  let output;
  try {
    const file = path.join(temp, 'BackupSecurityFixture.kt'), classes = path.join(temp, 'classes');
    fs.writeFileSync(file, fixture, 'utf8'); fs.mkdirSync(classes);
    execFileSync('java', ['-Dfile.encoding=UTF-8', '-cp', compilerClasspath, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect', '-classpath', [stdlib, annotations].join(path.delimiter), '-d', classes,
      path.join(root, 'frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/BackupCrypto.kt'), file], { timeout: 60000, windowsHide: true, stdio: 'pipe' });
    output = execFileSync('java', ['-Dfile.encoding=UTF-8', '-cp', [classes, stdlib].join(path.delimiter), 'expo.modules.kizilkannativecore.BackupSecurityFixture', webPin], { encoding: 'utf8', timeout: 60000, windowsHide: true });
  } finally {
    const target = path.resolve(temp);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('kizilkan-backup-security-test-'));
    fs.rmSync(target, { recursive: true, force: true });
  }
  const nativePin = /^PIN_NATIVE=(.+)$/m.exec(output)?.[1].trim();
  assert.ok(nativePin, 'actual native PIN fixture result missing');
  console.log(output.split(/\r?\n/).filter(line => !line.startsWith('PIN_NATIVE=')).join('\n').trim());
  assert.equal(await protection.matchesPin('0123', nativePin), true, 'actual WebCrypto must verify native PIN');
  assert.equal(await protection.matchesPin('0124', nativePin), false);
  for (const invalid of ['', '123', '12345678901', '１２３４', '12 4']) assert.equal(await protection.matchesPin(invalid, nativePin), false);
  assert.equal(await pin.checkPin('0123', nativePin), 'ok');
  assert.equal(await pin.checkPin(pin.MASTER_PIN, nativePin), 'master');
  assert.equal(await pin.checkPin(recovery, nativePin), 'recovery');
  assert.equal(await pin.checkPin('9876', nativePin), 'wrong');
  console.log('PASS: actual WebCrypto PIN→native + native→WebCrypto, legacy migration compatibility and preserved master/recovery acceptance');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
