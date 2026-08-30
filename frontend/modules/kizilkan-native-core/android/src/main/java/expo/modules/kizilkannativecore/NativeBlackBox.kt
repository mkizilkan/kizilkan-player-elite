package expo.modules.kizilkannativecore

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.Debug
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * KIZILKAN Flight Recorder v5 — native, process-resilient diagnostics core.
 *
 * Tasarım hedefi:
 *  - Normal olaylar Room/WAL içinde append-only tutulur.
 *  - Crash/ANR gibi "ölüm anı" kayıtları Room'a güvenmeden senkron kritik journal'a yazılır.
 *  - Android 11+ processStateSummary en fazla 128 byte olacak şekilde düşük frekansta güncellenir.
 *  - Main-thread heartbeat ile gerçek sistem ANR raporunun yerine geçmeyen, fakat ANR öncesi
 *    son durum/stack/memory kanıtını saklayan watchdog bulunur.
 *  - UncaughtExceptionHandler yalnız kayıt alır; hatayı ASLA yutmaz, önceki handler'a devreder.
 */
object NativeBlackBox {
  private const val CRITICAL_FILE = "kizilkan-flight-recorder-critical-v5.jsonl"
  private const val LEGACY_CRITICAL_FILE = "kizilkan-flight-recorder-critical-v4.jsonl"
  private const val LEGACY_CRITICAL_FILE_V3 = "kizilkan-flight-recorder-critical-v3.jsonl"
  private const val PREFS = "kizilkan-flight-recorder-v4"
  private const val CLEAR_EPOCH = "clear_epoch_ms"
  private const val MAX_NORMAL_EVENTS = 100000
  private const val MAX_CRITICAL_DB_EVENTS = 10000
  private const val MAX_CRITICAL_FILE_BYTES = 32L * 1024L * 1024L
  private const val CHECKPOINT_MIN_INTERVAL_MS = 2000L
  private const val WATCHDOG_PERIOD_MS = 1000L
  private const val WATCHDOG_WARN_MS = 4000L
  private const val WATCHDOG_REPEAT_MS = 15000L

  private val initialized = AtomicBoolean(false)
  private val seq = AtomicLong(0L)
  private val lastMainAck = AtomicLong(0L)
  private val lastAnrRecord = AtomicLong(0L)
  private val lastCheckpoint = AtomicLong(0L)
  private val io = Executors.newSingleThreadExecutor { r -> Thread(r, "kizilkan-blackbox-io").apply { isDaemon = true } }
  private var watchdog: ScheduledExecutorService? = null
  private var previousHandler: Thread.UncaughtExceptionHandler? = null
  @Volatile private var appSessionId: String = ""

  fun initialize(context: Context): Map<String, Any> {
    val app = context.applicationContext
    if (initialized.compareAndSet(false, true)) {
      appSessionId = "app-${System.currentTimeMillis().toString(36)}-${UUID.randomUUID().toString().take(8)}"
      installCrashHandler(app)
      startAnrWatchdog(app)
      io.execute {
        try {
          insertEvent(
            app,
            domain = "system",
            event = "PROCESS_START",
            severity = "info",
            sessionId = appSessionId,
            runId = "",
            payloadJson = JSONObject()
              .put("pid", Process.myPid())
              .put("sdk", Build.VERSION.SDK_INT)
              .put("process", app.packageName)
              .toString(),
            critical = false,
          )
        } catch (_: Throwable) {}
      }
    }
    return health(app)
  }

  fun appendJson(context: Context, raw: String): Boolean {
    val app = context.applicationContext
    initialize(app)
    return try {
      val obj = JSONObject(raw)
      val event = obj.optString("event", "EVENT").take(96)
      val severity = obj.optString("severity", severityFor(event)).take(16)
      val critical = obj.optBoolean("critical", isCriticalEvent(event, severity))
      insertEvent(
        app,
        domain = obj.optString("domain", "system").take(32),
        event = event,
        severity = severity,
        sessionId = obj.optString("sessionId", "").take(160),
        runId = obj.optString("runId", "").take(160),
        payloadJson = obj.optJSONObject("data")?.toString() ?: "{}",
        critical = critical,
        suppliedId = obj.optString("id", ""),
        suppliedAt = obj.optLong("at", 0L),
      )
      true
    } catch (_: Throwable) {
      false
    }
  }

  fun appendCriticalJson(context: Context, raw: String): Boolean {
    val app = context.applicationContext
    initialize(app)
    return try {
      val incoming = JSONObject(raw)
      val payload = JSONObject()
        .put("at", incoming.optLong("at", System.currentTimeMillis()))
        .put("elapsedRealtimeMs", SystemClock.elapsedRealtime())
        .put("kind", "JS_CRITICAL_EVENT")
        .put("event", incoming.optString("event", "CRITICAL").take(96))
        .put("domain", incoming.optString("domain", "system").take(32))
        .put("sessionId", incoming.optString("sessionId", "").take(160))
        .put("runId", incoming.optString("runId", "").take(160))
        .put("data", incoming.optJSONObject("data") ?: JSONObject())
        .put("memory", JSONObject(runtimeMemory(app)))
        .put("appSessionId", appSessionId)
      writeCriticalSync(app, payload)
      setCheckpoint(app, "critical:${incoming.optString("event", "EVENT").take(80)}")
      true
    } catch (_: Throwable) { false }
  }

  fun setCheckpoint(context: Context, summary: String): Boolean {
    val app = context.applicationContext
    initialize(app)
    val now = SystemClock.elapsedRealtime()
    val prev = lastCheckpoint.get()
    if (now - prev < CHECKPOINT_MIN_INTERVAL_MS || !lastCheckpoint.compareAndSet(prev, now)) return false
    if (Build.VERSION.SDK_INT < 30) return false
    return try {
      val am = app.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val safe = summary.replace(Regex("[\\r\\n\\t]+"), " ").take(120)
      val bytes = safe.toByteArray(Charsets.UTF_8).let { if (it.size <= 128) it else it.copyOf(128) }
      am.setProcessStateSummary(bytes)
      true
    } catch (_: Throwable) {
      false
    }
  }

  fun snapshot(context: Context, limit: Int): Map<String, Any> {
    val app = context.applicationContext
    initialize(app)
    val dao = KizilkanNativeDatabase.get(app).diagnosticDao()
    val take = limit.coerceIn(1, 50000)
    val clearEpoch = clearEpoch(app)
    val events = try { dao.latest(take).filter { it.atEpochMs >= clearEpoch }.map(::entityToMap) } catch (_: Throwable) { emptyList() }
    val critical = try { dao.latestCritical(1000).filter { it.atEpochMs >= clearEpoch }.map(::entityToMap) } catch (_: Throwable) { emptyList() }
    return mapOf(
      "schemaVersion" to 5,
      "appSessionId" to appSessionId,
      "health" to health(app),
      "events" to events,
      "critical" to critical,
      "criticalJournal" to readCriticalFile(app, 500).filter { (it["at"] as? Number)?.toLong()?.let { at -> at >= clearEpoch } ?: true },
    )
  }

  fun health(context: Context): Map<String, Any> {
    val app = context.applicationContext
    val db = KizilkanNativeDatabase.get(app)
    val dao = db.diagnosticDao()
    val critical = criticalFile(app)
    return mapOf(
      "initialized" to initialized.get(),
      "schemaVersion" to 5,
      "appSessionId" to appSessionId,
      "dbEvents" to try { dao.count() } catch (_: Throwable) { 0 },
      "dbCriticalEvents" to try { dao.criticalCount() } catch (_: Throwable) { 0 },
      "criticalJournalBytes" to if (critical.exists()) critical.length() else 0L,
      "clearEpochMs" to clearEpoch(app),
      "normalCapacity" to MAX_NORMAL_EVENTS,
      "criticalCapacity" to MAX_CRITICAL_DB_EVENTS,
      "watchdogActive" to (watchdog?.isShutdown == false),
      "checkpointApi" to (Build.VERSION.SDK_INT >= 30),
      "pid" to Process.myPid(),
    )
  }

  fun clear(context: Context): Boolean {
    val app = context.applicationContext
    return try {
      KizilkanNativeDatabase.get(app).diagnosticDao().clear()
      app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong(CLEAR_EPOCH, System.currentTimeMillis()).commit()
      val file = criticalFile(app)
      if (file.exists()) file.delete()
      val old = File(app.filesDir, "$CRITICAL_FILE.old")
      if (old.exists()) old.delete()
      val legacy = File(app.filesDir, LEGACY_CRITICAL_FILE)
      if (legacy.exists()) legacy.delete()
      val legacyOld = File(app.filesDir, "$LEGACY_CRITICAL_FILE.old")
      if (legacyOld.exists()) legacyOld.delete()
      val legacyV3 = File(app.filesDir, LEGACY_CRITICAL_FILE_V3)
      if (legacyV3.exists()) legacyV3.delete()
      val legacyV3Old = File(app.filesDir, "$LEGACY_CRITICAL_FILE_V3.old")
      if (legacyV3Old.exists()) legacyV3Old.delete()
      true
    } catch (_: Throwable) { false }
  }

  private fun insertEvent(
    context: Context,
    domain: String,
    event: String,
    severity: String,
    sessionId: String,
    runId: String,
    payloadJson: String,
    critical: Boolean,
    suppliedId: String = "",
    suppliedAt: Long = 0L,
  ) {
    val now = if (suppliedAt > 0L) suppliedAt else System.currentTimeMillis()
    val id = suppliedId.ifBlank { "n-${now.toString(36)}-${seq.incrementAndGet().toString(36)}" }
    val entity = DiagnosticEventEntity(
      id = id,
      atEpochMs = now,
      elapsedRealtimeMs = SystemClock.elapsedRealtime(),
      appSessionId = appSessionId,
      domain = domain,
      event = event,
      severity = severity,
      sessionId = sessionId,
      runId = runId,
      threadName = Thread.currentThread().name.take(120),
      processId = Process.myPid(),
      critical = critical,
      payloadJson = payloadJson.take(16_384),
    )
    val dao = KizilkanNativeDatabase.get(context).diagnosticDao()
    dao.insert(entity)
    val count = dao.count()
    if (count > MAX_NORMAL_EVENTS + MAX_CRITICAL_DB_EVENTS) {
      dao.deleteOldestNormal((count - MAX_NORMAL_EVENTS).coerceAtLeast(200))
      val criticalCount = dao.criticalCount()
      if (criticalCount > MAX_CRITICAL_DB_EVENTS) dao.deleteOldestCritical(criticalCount - MAX_CRITICAL_DB_EVENTS)
    }
  }

  private fun installCrashHandler(context: Context) {
    previousHandler = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      try {
        val payload = JSONObject()
          .put("at", System.currentTimeMillis())
          .put("elapsedRealtimeMs", SystemClock.elapsedRealtime())
          .put("kind", "UNCAUGHT_EXCEPTION")
          .put("thread", thread.name)
          .put("exception", throwable.javaClass.name)
          .put("message", (throwable.message ?: "").take(1000))
          .put("stack", JSONArray(throwable.stackTrace.take(80).map { it.toString() }))
          .put("memory", JSONObject(runtimeMemory(context)))
          .put("appSessionId", appSessionId)
        writeCriticalSync(context, payload)
        setCheckpoint(context, "crash:${throwable.javaClass.simpleName};thread:${thread.name}")
      } catch (_: Throwable) {}
      val previous = previousHandler
      if (previous != null) previous.uncaughtException(thread, throwable)
      else {
        Process.killProcess(Process.myPid())
        kotlin.system.exitProcess(10)
      }
    }
  }

  private fun startAnrWatchdog(context: Context) {
    val main = Handler(Looper.getMainLooper())
    lastMainAck.set(SystemClock.elapsedRealtime())
    val beat = object : Runnable {
      override fun run() {
        lastMainAck.set(SystemClock.elapsedRealtime())
        main.postDelayed(this, WATCHDOG_PERIOD_MS)
      }
    }
    main.post(beat)
    watchdog = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "kizilkan-anr-watchdog").apply { isDaemon = true } }
    watchdog?.scheduleAtFixedRate({
      try {
        val now = SystemClock.elapsedRealtime()
        val lag = now - lastMainAck.get()
        val previous = lastAnrRecord.get()
        if (lag >= WATCHDOG_WARN_MS && now - previous >= WATCHDOG_REPEAT_MS && lastAnrRecord.compareAndSet(previous, now)) {
          val mainThread = Looper.getMainLooper().thread
          val stack = mainThread.stackTrace.take(80).map { it.toString() }
          val payload = JSONObject()
            .put("at", System.currentTimeMillis())
            .put("elapsedRealtimeMs", now)
            .put("kind", "MAIN_THREAD_STALL")
            .put("lagMs", lag)
            .put("thread", mainThread.name)
            .put("stack", JSONArray(stack))
            .put("memory", JSONObject(runtimeMemory(context)))
            .put("appSessionId", appSessionId)
          writeCriticalSync(context, payload)
          try {
            insertEvent(context, "system", "ANR_WATCHDOG_STALL", "critical", appSessionId, "", payload.toString(), true)
          } catch (_: Throwable) {}
          setCheckpoint(context, "anr-watchdog;lag:${lag}ms")
        }
      } catch (_: Throwable) {}
    }, WATCHDOG_PERIOD_MS, WATCHDOG_PERIOD_MS, TimeUnit.MILLISECONDS)
  }

  private fun writeCriticalSync(context: Context, payload: JSONObject) {
    val file = criticalFile(context)
    if (file.exists() && file.length() >= MAX_CRITICAL_FILE_BYTES) {
      val old = File(context.filesDir, "$CRITICAL_FILE.old")
      if (old.exists()) old.delete()
      file.renameTo(old)
    }
    FileOutputStream(file, true).use { out ->
      out.write((payload.toString() + "\n").toByteArray(Charsets.UTF_8))
      out.fd.sync()
    }
  }

  private fun readCriticalFile(context: Context, limit: Int): List<Map<String, Any>> {
    val out = ArrayList<Map<String, Any>>()
    for (file in listOf(criticalFile(context), File(context.filesDir, "$CRITICAL_FILE.old"), File(context.filesDir, LEGACY_CRITICAL_FILE), File(context.filesDir, "$LEGACY_CRITICAL_FILE.old"), File(context.filesDir, LEGACY_CRITICAL_FILE_V3), File(context.filesDir, "$LEGACY_CRITICAL_FILE_V3.old"))) {
      if (!file.exists()) continue
      try {
        val lines = file.readLines(Charsets.UTF_8)
        for (i in lines.indices.reversed()) {
          if (out.size >= limit) break
          val line = lines[i].trim()
          if (line.isEmpty()) continue
          try {
            val o = JSONObject(line)
            out.add(jsonObjectToMap(o))
          } catch (_: Throwable) {}
        }
      } catch (_: Throwable) {}
      if (out.size >= limit) break
    }
    return out
  }

  private fun clearEpoch(context: Context): Long = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(CLEAR_EPOCH, 0L)

  private fun criticalFile(context: Context) = File(context.filesDir, CRITICAL_FILE)

  private fun severityFor(event: String): String = when {
    Regex("CRASH|ANR|FATAL|BLACK_SCREEN|ROLLBACK_FAILED", RegexOption.IGNORE_CASE).containsMatchIn(event) -> "critical"
    Regex("ERROR|FAILED|TIMEOUT|STALL|OOM|LOW_MEMORY", RegexOption.IGNORE_CASE).containsMatchIn(event) -> "error"
    Regex("WARN|STALE|RECOVERY|REBUFFER", RegexOption.IGNORE_CASE).containsMatchIn(event) -> "warn"
    else -> "info"
  }

  private fun isCriticalEvent(event: String, severity: String): Boolean =
    severity == "critical" || severity == "error" || Regex("CRASH|ANR|FATAL|BLACK_SCREEN|TIMEOUT|STALL|ROLLBACK", RegexOption.IGNORE_CASE).containsMatchIn(event)

  private fun runtimeMemory(context: Context): Map<String, Any> {
    val info = Debug.MemoryInfo()
    Debug.getMemoryInfo(info)
    val runtime = Runtime.getRuntime()
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    val sys = ActivityManager.MemoryInfo()
    am?.getMemoryInfo(sys)
    val fdCount = try { File("/proc/self/fd").list()?.size ?: -1 } catch (_: Throwable) { -1 }
    return mapOf(
      "pssKb" to info.totalPss,
      "nativePssKb" to info.nativePss,
      "dalvikPssKb" to info.dalvikPss,
      "otherPssKb" to info.otherPss,
      "javaHeapUsedBytes" to (runtime.totalMemory() - runtime.freeMemory()),
      "javaHeapMaxBytes" to runtime.maxMemory(),
      "systemAvailMemBytes" to sys.availMem,
      "systemLowMemory" to sys.lowMemory,
      "threadCount" to Thread.getAllStackTraces().size,
      "fdCount" to fdCount,
    )
  }

  private fun entityToMap(e: DiagnosticEventEntity): Map<String, Any> = mapOf(
    "id" to e.id,
    "at" to e.atEpochMs,
    "elapsedRealtimeMs" to e.elapsedRealtimeMs,
    "appSessionId" to e.appSessionId,
    "domain" to e.domain,
    "event" to e.event,
    "severity" to e.severity,
    "sessionId" to e.sessionId,
    "runId" to e.runId,
    "thread" to e.threadName,
    "pid" to e.processId,
    "critical" to e.critical,
    "data" to try { jsonObjectToMap(JSONObject(e.payloadJson)) } catch (_: Throwable) { emptyMap<String, Any>() },
  )

  private fun jsonObjectToMap(obj: JSONObject): Map<String, Any> {
    val out = LinkedHashMap<String, Any>()
    val keys = obj.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      val value = obj.opt(key)
      out[key] = when (value) {
        is JSONObject -> jsonObjectToMap(value)
        is JSONArray -> (0 until value.length()).map { idx ->
          when (val v = value.opt(idx)) {
            is JSONObject -> jsonObjectToMap(v)
            JSONObject.NULL, null -> ""
            else -> v
          }
        }
        JSONObject.NULL, null -> ""
        else -> value
      }
    }
    return out
  }
}
