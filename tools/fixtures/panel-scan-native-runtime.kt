package expo.modules.panelscan

import java.io.BufferedReader
import java.io.ByteArrayInputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.Proxy
import java.util.concurrent.*
import java.util.concurrent.atomic.*
import org.json.JSONArray
import org.json.JSONObject

// Only Android/storage/UI boundaries are substituted. The production scan/probe
// functions below are inserted verbatim by test-panel-scan-runtime.js.
class NotificationManager { fun notify(id: Int, notification: Any) {} }
object Uri { fun parse(text: String) = text }
class FixturePreferences(private val snapshot: () -> JSONObject, private val save: (String) -> Unit) {
  fun getString(key: String, fallback: String) = snapshot().toString()
  fun edit() = Editor()
  inner class Editor {
    private var value = "{}"
    fun putString(key: String, text: String): Editor { value = text; return this }
    fun apply() { save(value) }
  }
}
class ScanJournalStore {
  companion object {
    private val instance = ScanJournalStore()
    fun get(context: Any) = instance
  }
  private val probes = ConcurrentHashMap<String, String>()
  private val resultPayloads = ConcurrentHashMap<String, String>()
  val checkpoints = ConcurrentHashMap<String, Long>()
  val committedTests = ConcurrentHashMap<String, Long>()
  val states = ConcurrentHashMap<String, String>()
  fun readProbe(run: String, key: String) = probes["$run|$key"]
  fun writeProbe(run: String, key: String, payload: String) { probes["$run|$key"] = payload }
  fun addResult(run: String, key: String, payload: String) = resultPayloads.putIfAbsent("$run|$key", payload) == null
  fun resultCount(run: String) = resultPayloads.keys.count { it.startsWith("$run|") }
  fun pruneUnverifiedResults(run: String): Int {
    var removed = 0
    for ((key, value) in resultPayloads.entries) {
      if (!key.startsWith("$run|")) continue
      val decoded = runCatching { JSONObject(value) }.getOrNull() ?: continue
      if (scanAuthStatus(decoded.optJSONObject("login")?.optJSONObject("user_info")?.opt("auth")) != true && resultPayloads.remove(key, value)) removed++
    }
    return removed
  }
  fun results(run: String, limit: Int = 1000000): JSONArray {
    val results = JSONArray()
    resultPayloads.entries.filter { it.key.startsWith("$run|") }.take(limit).forEach { results.put(JSONObject(it.value)) }
    return results
  }
  fun checkpoint(run: String, cursor: Long) { checkpoints[run] = cursor }
  @Synchronized fun checkpointUnified(run: String, cursor: Int, tested: Long) {
    if ((checkpoints[run] ?: 0L) <= cursor.toLong()) { checkpoints[run] = cursor.toLong(); committedTests[run] = tested }
  }
  fun finish(run: String, state: String) { states[run] = state }
}
object ScanProxyPool {
  var enabled = false
  enum class Fault { TARGET, PROXY }
  data class Entry(val key: String = "fixture")
  data class Selection(val proxy: Proxy = Proxy.NO_PROXY, val basicHeader: String? = null, val entry: Entry = Entry())
  fun select(): Selection? = null
  fun isEmptyPool() = true
  fun release(selection: Selection?) {}
  fun reportResult(context: Any, key: String, fault: Fault) {}
  fun classify(error: Throwable) = Fault.TARGET
}

class NativeWorkerHarness(val currentRunId: String, private val behavior: String) {
  private val applicationContext = Any()
  private val cancelled = AtomicBoolean(false)
  private val paused = AtomicBoolean(false)
  private var running = true
  private var activeExecutor: ExecutorService? = null
  private var activeFileStream: java.io.InputStream? = null
  private val activeConnections = ConcurrentHashMap.newKeySet<HttpURLConnection>()
  private val persistentFound = AtomicInteger(0)
  private var resultCountRunId = ""
  private var lastDiagnosticState = ""
  private var lastDiagnosticBucket = -1
  private var lastDiagnosticAccountBucket = -1
  private var inputText = ""
  private val contentResolver = object {
    fun openInputStream(uri: String) = ByteArrayInputStream(inputText.toByteArray(Charsets.UTF_8))
  }
  @Volatile var snapshot = JSONObject()
  private val PREFS = "fixture"
  private val KEY_SNAPSHOT = "snapshot"
  private val NOTIF_ID = 1
  private val STOP_FOREGROUND_REMOVE = 1
  private fun notification(text: String, progress: Int, max: Int) = Any()
  private fun <T> getSystemService(type: Class<T>): T = type.getDeclaredConstructor().newInstance()
  private fun getSharedPreferences(name: String, mode: Int) = FixturePreferences({ snapshot }, { value -> snapshot = JSONObject(value) })
  private fun appendDiagnosticEvent(value: JSONObject) {}
  private fun releaseRun(run: String) {}
  private fun stopForeground(mode: Int) {}
  private fun stopSelf() {}
  private fun recordExternalDiagnostic(context: Any, event: JSONObject) {}
  private fun computeEffectiveConcurrency(context: Any, requested: Int, batch: Int) = requested.coerceIn(1, 32)
  private fun canonicalPanelHost(value: String): String? = value.takeIf { it.startsWith("http://") }
  private fun sanitizeLogin(value: JSONObject) = value
  private fun abortActiveNetworkWork() {
    activeExecutor?.shutdownNow()
    activeFileStream?.close()
    activeConnections.forEach { it.disconnect() }
  }
  private fun probe(server: String, username: String, password: String, timeout: Int): JSONObject? {
    when (behavior) {
      "failure" -> throw IllegalStateException("injected worker failure")
      "cancel" -> { cancelled.set(true); return null }
    }
    return JSONObject().put("user_info", JSONObject().put("auth", 1))
  }
  // INSERT_RESULTS
  // INSERT_SNAPSHOT_STORAGE
  // INSERT_FINALIZE
  // INSERT_BULK
  // INSERT_SNAPSHOTS
  // INSERT_PARSER
  // INSERT_CANDIDATES
  // INSERT_STREAMING
  // INSERT_SINGLE

  fun single() {
    val candidates = JSONArray().put(JSONObject().put("server", "http://fixture.invalid").put("panelName", "fixture").put("code", "12345"))
    runScan(candidates.toString(), "fixture-user", "fixture-pass", 2, 1000)
  }
  fun bulk() {
    val candidates = JSONArray().put(JSONObject().put("server", "http://fixture.invalid").put("panelName", "fixture"))
    val accounts = JSONArray().put(JSONObject().put("username", "fixture-user").put("password", "fixture-pass"))
    runBulkScan(candidates.toString(), accounts.toString(), 2, 1000)
  }
  fun streaming(rows: Int, start: Long = 0L, committedTested: Long = 0L) {
    inputText = "name|username|password|server\n" + (0 until rows).joinToString("\n") { "Family$it|fixture-user|fixture-pass|http://fixture.invalid" }
    runStreamingFileScanV172("fixture", "[]", 4, 4, 1000, 5, "fixture-source", start, committedTested)
  }
}

object NativeProbeHarness {
  private val applicationContext = Any()
  private val currentRunId = "probe-fixture"
  private val cancelled = AtomicBoolean(false)
  private val paused = AtomicBoolean(false)
  private val probeStripes = Array(128) { Any() }
  private val hostPermits = ConcurrentHashMap<String, Semaphore>()
  private val hostBackoffUntil = ConcurrentHashMap<String, Long>()
  private val activeConnections = ConcurrentHashMap.newKeySet<HttpURLConnection>()
  private fun ensureScanProxyReady() {}
  private fun canonicalPanelHost(server: String) = server
  private fun recordExternalDiagnostic(context: Any, event: JSONObject) {}
  private fun pauseForProxy(reason: String, host: String) {}
  // INSERT_PROBE
  // INSERT_PHYSICAL
  // INSERT_SANITIZER

  fun cacheKey(base: String, username: String): String {
    val raw = JSONArray().put(base).put(username).put("fixture-pass").toString()
    return java.security.MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
  }
  fun query(base: String, username: String) = probe(base, username, "fixture-pass", 1000)
  fun seedLegacyNull(base: String, username: String) {
    ScanJournalStore.get(applicationContext).writeProbe(currentRunId, cacheKey(base, username), "null")
  }
  fun seedLegacyUnverified(base: String, username: String) {
    ScanJournalStore.get(applicationContext).writeProbe(currentRunId, cacheKey(base, username), JSONObject().put("user_info", JSONObject().put("auth", 2)).toString())
  }
  fun cached(base: String, username: String) = ScanJournalStore.get(applicationContext).readProbe(currentRunId, cacheKey(base, username))
  fun deadline(base: String) = hostBackoffUntil[URL(base).host.lowercase()] ?: 0L
  fun setDeadline(base: String, deadline: Long) { hostBackoffUntil[URL(base).host.lowercase()] = deadline }
}

object PanelScanServiceRuntimeFixture {
  @JvmStatic fun main(args: Array<String>) {
    for (mode in listOf("single", "bulk", "streaming")) {
      val run = "failure-$mode"
      val harness = NativeWorkerHarness(run, "failure")
      when (mode) { "single" -> harness.single(); "bulk" -> harness.bulk(); else -> harness.streaming(20000) }
      check(harness.snapshot.optString("state") == "FAILED") { "$mode hid worker failure: ${harness.snapshot}" }
      check(harness.snapshot.optString("error").contains("injected worker failure"))
      check(ScanJournalStore.get(Unit).states[run] == "FAILED")
      check(ScanJournalStore.get(Unit).checkpoints[run] == null) { "$mode committed failed work" }
    }
    check(Thread.getAllStackTraces().keys.none { it.isAlive && it.name == "kizilkan-v172-producer" }) { "producer thread leaked" }
    println("PASS: actual Kotlin single/bulk/streaming worker exception -> FAILED; no checkpoint/producer leak")

    for (mode in listOf("single", "bulk", "streaming")) {
      val run = "cancel-$mode"
      val harness = NativeWorkerHarness(run, "cancel")
      when (mode) { "single" -> harness.single(); "bulk" -> harness.bulk(); else -> harness.streaming(1000) }
      check(harness.snapshot.optString("state") == "CANCELLED")
      check(harness.snapshot.optLong("tested") == 0L) { "$mode counted cancelled probe" }
      check(harness.snapshot.optInt("accountTested") == 0)
      check(ScanJournalStore.get(Unit).checkpoints[run] == null) { "$mode committed partial account" }
    }
    println("PASS: actual Kotlin single/bulk/streaming cancellation during probe preserves recovery cursor")

    val successful = NativeWorkerHarness("success-streaming", "valid")
    successful.streaming(500)
    check(successful.snapshot.optString("state") == "COMPLETED")
    check(successful.snapshot.optInt("tested") == 500 && successful.snapshot.optInt("accountTested") == 500)
    check(successful.snapshot.optInt("found") == 500 && successful.snapshot.getJSONArray("matches").length() == 200)
    check(ScanJournalStore.get(Unit).checkpoints["success-streaming"] == 500L)
    println("PASS: actual Kotlin bounded streaming success drains queue and commits 500 accounts")

    val journal = ScanJournalStore.get(Unit)
    for (i in 0 until 300) journal.addResult("recovery-streaming", "$i|||http://fixture.invalid", JSONObject().put("accountIndex", i).put("login", JSONObject().put("user_info", JSONObject().put("auth", 1))).toString())
    journal.addResult("recovery-streaming", "bad-legacy", JSONObject().put("login", JSONObject().put("user_info", JSONObject().put("auth", 2))).toString())
    journal.addResult("recovery-streaming", "missing-legacy", JSONObject().put("login", JSONObject().put("user_info", JSONObject())).toString())
    val recovered = NativeWorkerHarness("recovery-streaming", "valid")
    recovered.streaming(500, 300L, 300L)
    check(recovered.snapshot.optInt("tested") == 500 && recovered.snapshot.optInt("found") == 500)
    check(recovered.snapshot.getJSONArray("matches").length() == 200)
    check(journal.committedTests["recovery-streaming"] == 500L)
    println("PASS: actual Kotlin streaming recovery restores tested and full found count beyond 200-row UI tail")

    val requests = ConcurrentHashMap<String, AtomicInteger>()
    val slowResponseStarted = CountDownLatch(1)
    val releaseSlowSuccess = CountDownLatch(1)
    val server = com.sun.net.httpserver.HttpServer.create(java.net.InetSocketAddress("127.0.0.1", 0), 0)
    val serverPool = Executors.newFixedThreadPool(2)
    server.executor = serverPool
    server.createContext("/player_api.php") { exchange ->
      val query = exchange.requestURI.rawQuery.split('&').associate { val pair = it.split('=', limit = 2); pair[0] to java.net.URLDecoder.decode(pair.getOrElse(1) { "" }, "UTF-8") }
      val username = query["username"] ?: ""
      val count = requests.computeIfAbsent(username) { AtomicInteger(0) }.incrementAndGet()
      if (username == "slow-success") { slowResponseStarted.countDown(); check(releaseSlowSuccess.await(5, TimeUnit.SECONDS)) }
      val status = if (username in listOf("retry429", "retry503", "concurrent-limit") && count == 1) if (username == "retry503") 503 else 429 else 200
      val userInfo = JSONObject().put("password", "fixture-secret")
      if (username != "missing") userInfo.put("auth", when (username) { "rejected" -> 0; "unknown2" -> 2; "nonsense" -> "nonsense"; else -> 1 })
      val body = if (username == "malformed") "not-json" else JSONObject().put("user_info", userInfo).toString()
      val bytes = body.toByteArray(Charsets.UTF_8)
      exchange.responseHeaders.add("Retry-After", "1")
      exchange.sendResponseHeaders(status, bytes.size.toLong())
      exchange.responseBody.use { it.write(bytes) }
    }
    server.start()
    try {
      val base = "http://127.0.0.1:${server.address.port}"
      check(NativeProbeHarness.query(base, "accepted") != null)
      check(NativeProbeHarness.query(base, "accepted") != null)
      check(requests["accepted"]?.get() == 1)
      check(NativeProbeHarness.cached(base, "accepted")?.contains("fixture-secret") == false)
      check(NativeProbeHarness.query(base, "rejected") == null)
      check(NativeProbeHarness.query(base, "rejected") == null)
      check(requests["rejected"]?.get() == 1)
      check(NativeProbeHarness.cached(base, "rejected") == SCAN_AUTH_REJECTED_CACHE)
      for (username in listOf("retry429", "retry503")) {
        check(NativeProbeHarness.query(base, username) == null)
        check(NativeProbeHarness.cached(base, username) == null)
        check(NativeProbeHarness.query(base, username) != null)
        check(requests[username]?.get() == 2)
      }
      check(NativeProbeHarness.query(base, "malformed") == null)
      check(NativeProbeHarness.query(base, "malformed") == null)
      check(requests["malformed"]?.get() == 2 && NativeProbeHarness.cached(base, "malformed") == null)
      for (username in listOf("missing", "unknown2", "nonsense")) {
        check(NativeProbeHarness.query(base, username) == null)
        check(NativeProbeHarness.query(base, username) == null)
        check(requests[username]?.get() == 2 && NativeProbeHarness.cached(base, username) == null)
      }
      NativeProbeHarness.seedLegacyNull(base, "legacy")
      check(NativeProbeHarness.query(base, "legacy") != null && requests["legacy"]?.get() == 1)
      NativeProbeHarness.seedLegacyUnverified(base, "legacy-unverified")
      check(NativeProbeHarness.query(base, "legacy-unverified") != null && requests["legacy-unverified"]?.get() == 1)
      val slowFailure = AtomicReference<Throwable?>(null)
      val slowSuccess = Thread {
        try { check(NativeProbeHarness.query(base, "slow-success") != null) } catch (error: Throwable) { slowFailure.set(error) }
      }
      slowSuccess.start()
      check(slowResponseStarted.await(2, TimeUnit.SECONDS))
      check(NativeProbeHarness.query(base, "concurrent-limit") == null)
      val protectedDeadline = NativeProbeHarness.deadline(base)
      releaseSlowSuccess.countDown(); slowSuccess.join(2000)
      check(!slowSuccess.isAlive)
      slowFailure.get()?.let { throw it }
      check(NativeProbeHarness.deadline(base) == protectedDeadline) { "successful response erased concurrent 429" }
      NativeProbeHarness.setDeadline(base, System.currentTimeMillis() + 5000L)
      val interrupted = AtomicBoolean(false)
      val interruptedProbe = Thread {
        try { NativeProbeHarness.query(base, "interrupted") }
        catch (_: InterruptedException) { interrupted.set(Thread.currentThread().isInterrupted) }
      }
      interruptedProbe.start(); Thread.sleep(150); interruptedProbe.interrupt(); interruptedProbe.join(2000)
      check(!interruptedProbe.isAlive && interrupted.get()) { "physical probe swallowed InterruptedException" }
      check(requests["interrupted"] == null)
      println("PASS: actual Kotlin HTTP probe cache: positive/auth rejection cached; unknown auth rejected; 429/503/malformed/legacy-null retry; secrets sanitized")
      println("PASS: actual Kotlin concurrent HTTP 429 survives successful response; backoff interruption propagates")
    } finally { releaseSlowSuccess.countDown(); server.stop(0); serverPool.shutdownNow() }
  }
}
