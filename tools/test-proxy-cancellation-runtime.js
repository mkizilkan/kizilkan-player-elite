#!/usr/bin/env node
/** Offline JVM fixture: actual proxy request/cancel bodies and actual Expo queue registrations. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const base = path.join(root, 'frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan');
const moduleSource = fs.readFileSync(path.join(base, 'PanelScanModule.kt'), 'utf8');
const poolSource = fs.readFileSync(path.join(base, 'ScanProxyPool.kt'), 'utf8');
function between(source, first, last) {
  const start = source.indexOf(first), end = source.indexOf(last, start);
  assert.ok(start >= 0 && end > start, `Missing production extraction boundary: ${first}`);
  return source.slice(start, end);
}
const poolBodies = between(poolSource, '  private class RequestControl {', '  // Authenticator');
const moduleQueues = between(moduleSource, '  // Cancellation must remain', '  override fun definition()');
const registrations = between(moduleSource, '    AsyncFunction("proxiedProbe")', '    // v17.1.1:');
const destroy = between(moduleSource, '    OnDestroy {', '    // ── v18.4.0:');
function cachedJar(group, name, preferred) {
  const cache = path.join(process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle'), 'caches/modules-2/files-2.1', group, name);
  assert.ok(fs.existsSync(cache), `Cached dependency missing: ${name}; compile native project first.`);
  const versions = fs.readdirSync(cache).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (preferred && versions.includes(preferred)) versions.unshift(preferred);
  for (const version of versions) for (const hash of fs.readdirSync(path.join(cache, version))) {
    const candidate = path.join(cache, version, hash, `${name}-${version}.jar`);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Cached JAR missing: ${name}`);
}
const compiler = cachedJar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20');
const version = path.basename(compiler).match(/^kotlin-compiler-embeddable-(.+)\.jar$/)[1];
const stdlib = cachedJar('org.jetbrains.kotlin', 'kotlin-stdlib', version);
const annotations = cachedJar('org.jetbrains', 'annotations');
const json = cachedJar('org.json', 'json');
const coroutines = cachedJar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm');
const compilerClasspath = [compiler, stdlib, annotations, coroutines,
  cachedJar('org.jetbrains.kotlin', 'kotlin-reflect', version),
  cachedJar('org.jetbrains.kotlin', 'kotlin-script-runtime', version),
  cachedJar('org.jetbrains.intellij.deps', 'trove4j')].join(path.delimiter);
const code = `package expo.modules.panelscan
import java.net.*
import java.util.concurrent.*
import java.util.concurrent.atomic.*
import org.json.JSONObject
import kotlinx.coroutines.*

class Context
object ScanProxyPool {
  enum class Fault { TARGET, PROXY, UNKNOWN }
  data class Entry(val key: String = "fixture", val host: String = "localhost", val port: Int = 1)
  data class Selection(val proxy: Proxy = Proxy.NO_PROXY, val basicHeader: String? = null, val entry: Entry = Entry())
  val selected = AtomicInteger(0); val released = AtomicInteger(0); val faults = CopyOnWriteArrayList<Fault>()
  fun select(): Selection { selected.incrementAndGet(); return Selection() }
  fun release(selection: Selection) { released.incrementAndGet() }
  fun reportResult(context: Context, key: String, fault: Fault) { faults.add(fault) }
  fun classify(error: Throwable) = Fault.UNKNOWN
  fun proxiedGet(context: Context, url: String, timeoutMs: Int) = proxiedRequest(context, url, "GET", null, null, timeoutMs)
${poolBodies}
}
class FixtureAppContext(val backgroundCoroutineScope: CoroutineScope) { val reactContext: Context? = Context() }
class Registration(private var scope: CoroutineScope, private val body: (Array<out Any>) -> Any) {
  fun runOnQueue(next: CoroutineScope) = apply { scope = next }
  fun call(vararg args: Any): CompletableFuture<Any> {
    val result = CompletableFuture<Any>()
    scope.launch { try { result.complete(body(args)) } catch (error: Throwable) { result.completeExceptionally(error) } }
    return result
  }
}
class ModuleHarness(private val modulesQueue: CoroutineScope, val appContext: FixtureAppContext) {
  val calls = mutableMapOf<String, Registration>()
  private var cleanup: () -> Unit = {}
${moduleQueues}
  private fun register(name: String, body: (Array<out Any>) -> Any) = Registration(modulesQueue, body).also { calls[name] = it }
  private fun AsyncFunction(name: String, body: (String, Int) -> String) = register(name) { body(it[0] as String, it[1] as Int) }
  private fun AsyncFunction(name: String, body: (String, String, String, String, Int) -> String) = register(name) { body(it[0] as String, it[1] as String, it[2] as String, it[3] as String, it[4] as Int) }
  private fun AsyncFunction(name: String, body: (String, String, String, String, String, Int) -> String) = register(name) { body(it[0] as String, it[1] as String, it[2] as String, it[3] as String, it[4] as String, it[5] as Int) }
  private fun AsyncFunction(name: String, body: (String) -> Boolean) = register(name) { body(it[0] as String) }
  private fun OnDestroy(body: () -> Unit) { cleanup = body }
  fun destroy() = cleanup()
  init {
${destroy}
${registrations}
  }
}
object ProxyCancellationFixture {
  @JvmStatic fun main(args: Array<String>) {
    val moduleDispatcher = Executors.newSingleThreadExecutor().asCoroutineDispatcher()
    val modules = CoroutineScope(SupervisorJob() + moduleDispatcher)
    val io = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val module = ModuleHarness(modules, FixtureAppContext(io))
    val server = ServerSocket(0, 8, InetAddress.getLoopbackAddress())
    val entered = CountDownLatch(1)
    val serverWorker = Executors.newSingleThreadExecutor()
    val serverJob = serverWorker.submit {
      server.accept().use { client ->
        val reader = client.getInputStream().bufferedReader()
        while (true) { val line = reader.readLine() ?: break; if (line.isEmpty()) break }
        val output = client.getOutputStream()
        output.write("HTTP/1.1 200 OK\\r\\nTransfer-Encoding: chunked\\r\\nConnection: close\\r\\n\\r\\n".toByteArray()); output.flush()
        entered.countDown()
        try { repeat(40) { output.write("1\\r\\nx\\r\\n".toByteArray()); output.flush(); Thread.sleep(100) }; output.write("0\\r\\n\\r\\n".toByteArray()); output.flush() } catch (_: Throwable) {}
      }
    }
    try {
      val request = module.calls.getValue("proxiedRequestCancelable").call("slow_fixture", "http://127.0.0.1:" + server.localPort + "/slow", "GET", "{}", "", 5000)
      check(entered.await(2, TimeUnit.SECONDS)) { "actual HTTP request did not start" }
      // A short native operation must stay schedulable while the response body is unfinished.
      val heartbeat = CompletableFuture<Boolean>(); modules.launch { heartbeat.complete(true) }
      check(heartbeat.get(500, TimeUnit.MILLISECONDS)) { "provider IO blocked Expo modules queue" }
      val started = System.nanoTime()
      check(module.calls.getValue("cancelProxiedRequest").call("slow_fixture").get(1500, TimeUnit.MILLISECONDS) == true)
      val result = JSONObject(request.get(1500, TimeUnit.MILLISECONDS) as String)
      check(result.optString("error") == "CANCELLED" && !result.optBoolean("ok")) { "late/incorrect cancellation result: $result" }
      check(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 1500) { "cancel waited for provider timeout" }
      check(ScanProxyPool.released.get() == 1 && ScanProxyPool.faults.isEmpty()) { "cancel leaked proxy lease or reported false proxy failure" }
      println("PASS: actual Kotlin slow localhost HTTP cancellation + modules queue remains responsive")
      check(module.calls.getValue("cancelProxiedRequest").call("pre_fixture").get(500, TimeUnit.MILLISECONDS) == true)
      val before = ScanProxyPool.selected.get()
      val pre = JSONObject(module.calls.getValue("proxiedRequestCancelable").call("pre_fixture", "http://127.0.0.1:" + server.localPort + "/never", "GET", "{}", "", 5000).get(500, TimeUnit.MILLISECONDS) as String)
      check(pre.optString("error") == "CANCELLED" && ScanProxyPool.selected.get() == before) { "cancel-before-start opened a provider connection" }
      println("PASS: actual Kotlin cancel-before-start opens no provider connection")
    } finally {
      module.destroy(); io.cancel(); modules.cancel(); moduleDispatcher.close(); server.close(); serverWorker.shutdownNow(); runCatching { serverJob.get(2, TimeUnit.SECONDS) }
    }
  }
}
`;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kizilkan-proxy-cancel-test-'));
try {
  const file = path.join(temp, 'ProxyCancellationFixture.kt'), classes = path.join(temp, 'classes');
  fs.writeFileSync(file, code, 'utf8');
  fs.mkdirSync(classes);
  const classpath = [stdlib, annotations, json, coroutines].join(path.delimiter);
  execFileSync('java', ['-cp', compilerClasspath, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect', '-classpath', classpath, '-d', classes, file], { timeout: 60000, windowsHide: true, stdio: 'pipe' });
  const output = execFileSync('java', ['-cp', [classes, classpath].join(path.delimiter), 'expo.modules.panelscan.ProxyCancellationFixture'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  console.log(output.trim());
} finally {
  const target = path.resolve(temp);
  assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
  assert.ok(path.basename(target).startsWith('kizilkan-proxy-cancel-test-'));
  fs.rmSync(target, { recursive: true, force: true });
}
