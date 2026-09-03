package expo.modules.panelscan

import android.app.*
import android.content.Intent
import android.content.Context
import android.os.Build
import android.os.IBinder
import android.os.Debug
import android.app.ActivityManager
import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ExecutorService
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicLongArray
import java.util.concurrent.atomic.AtomicReference

class PanelScanService : Service() {
  /**
   * v17.0.8: En düşük hâlâ çalışan işi izleyerek yalnız tamamlandığı kesin olan
   * contiguous prefix'i journal checkpoint olarak yazar. cursor-workerCount
   * yaklaşımı, tek bir yavaş worker geride kalırken ilerideki işleri atlayabiliyordu.
   */
  private class ConservativeCursorTracker(workerCount: Int) {
    private val inFlight = AtomicLongArray(workerCount)
    init { for (i in 0 until workerCount) inFlight.set(i, Long.MAX_VALUE) }
    fun begin(workerId: Int, index: Long) { inFlight.set(workerId, index) }
    fun finish(workerId: Int) { inFlight.set(workerId, Long.MAX_VALUE) }
    fun safeCursor(nextAssigned: Long): Long {
      var safe = nextAssigned
      for (i in 0 until inFlight.length()) safe = minOf(safe, inFlight.get(i))
      return safe.coerceAtLeast(0L)
    }
  }
  companion object {
    const val ACTION_START = "expo.modules.panelscan.START"
    const val ACTION_BULK_START = "expo.modules.panelscan.BULK_START"
    const val ACTION_UNIFIED_START = "expo.modules.panelscan.UNIFIED_START"
    const val ACTION_CANCEL = "expo.modules.panelscan.CANCEL"
    const val ACTION_PAUSE = "expo.modules.panelscan.PAUSE"
    const val ACTION_RESUME = "expo.modules.panelscan.RESUME"
    const val ACTION_RECOVER = "expo.modules.panelscan.RECOVER"
    const val PREFS = "gpt_elite_panel_scan"
    const val KEY_SNAPSHOT = "snapshot"
    const val KEY_EVENTS = "diagnostic_events"
    const val KEY_LAST_CRASH = "last_crash"
    const val CHANNEL_ID = "panel_scan"
    const val NOTIF_ID = 13001

    private val RUN_LOCK = Any()
    @Volatile private var claimedRunId: String = ""
    private val crashRecorderInstalled = AtomicBoolean(false)


    private fun sanitizedCrashMessage(value: String): String = value
      .replace(Regex("https?://[^\\s]+", RegexOption.IGNORE_CASE), "<url>")
      .replace(Regex("(?i)(username|password|token|authorization|cookie|mac)=([^&\\s]+)"), "\$1=<redacted>")
      .take(320)

    fun setProcessSummary(context: Context, raw: String) {
      if (Build.VERSION.SDK_INT < 30) return
      try {
        val bytes = raw.take(128).toByteArray(Charsets.UTF_8)
        val clipped = if (bytes.size <= 128) bytes else bytes.copyOf(128)
        (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).setProcessStateSummary(clipped)
      } catch (_: Throwable) {}
    }

    @Synchronized fun recordExternalDiagnostic(context: Context, obj: JSONObject) {
      try {
        val prefs = context.getSharedPreferences(PREFS, 0)
        val arr = try { JSONArray(prefs.getString(KEY_EVENTS, "[]") ?: "[]") } catch (_: Throwable) { JSONArray() }
        val event = JSONObject()
          .put("at", System.currentTimeMillis())
          .put("runId", obj.optString("runId", ""))
          .put("mode", obj.optString("mode", ""))
          .put("state", obj.optString("state", ""))
          .put("tested", obj.optInt("tested", 0))
          .put("total", obj.optInt("total", 0))
          .put("found", obj.optInt("found", 0))
          .put("accountIndex", obj.optInt("accountIndex", -1))
          .put("accountTotal", obj.optInt("accountTotal", 0))
          .put("payloadBytes", obj.optLong("payloadBytes", 0L))
          .put("pssKb", Debug.getPss())
          .put("error", obj.optString("error", "").take(300))
        val next = JSONArray(); next.put(event)
        for (i in 0 until minOf(arr.length(), 79)) next.put(arr.opt(i))
        prefs.edit().putString(KEY_EVENTS, next.toString()).commit()
      } catch (_: Throwable) {}
    }

    fun installCrashRecorder(context: Context) {
      if (!crashRecorderInstalled.compareAndSet(false, true)) return
      val previous = Thread.getDefaultUncaughtExceptionHandler()
      Thread.setDefaultUncaughtExceptionHandler { thread, error ->
        try {
          val stack = JSONArray()
          error.stackTrace.take(10).forEach { stack.put(it.toString().take(240)) }
          val crash = JSONObject()
            .put("at", System.currentTimeMillis())
            .put("thread", thread.name.take(120))
            .put("exception", error.javaClass.name.take(180))
            .put("message", sanitizedCrashMessage(error.message ?: ""))
            .put("stack", stack)
            .put("pssKb", Debug.getPss())
          context.getSharedPreferences(PREFS, 0).edit().putString(KEY_LAST_CRASH, crash.toString()).commit()
          recordExternalDiagnostic(context, JSONObject()
            .put("mode", "unified").put("state", "PROCESS_CRASH")
            .put("error", "${error.javaClass.simpleName}: ${sanitizedCrashMessage(error.message ?: "")}"))
          setProcessSummary(context, "scan:CRASH:${error.javaClass.simpleName}:${thread.name}")
        } catch (_: Throwable) {}
        if (previous != null) previous.uncaughtException(thread, error) else {
          android.os.Process.killProcess(android.os.Process.myPid())
          kotlin.system.exitProcess(10)
        }
      }
    }

    /**
     * v15.2.9: job sahipliği Service çalıştırılmadan ÖNCE atomik olarak alınır.
     * Böylece çalışan Service'in yeni Intent'i sessizce yutması ve JS'in sahte
     * STARTING snapshot'ında sonsuza kadar beklemesi mümkün değildir.
     */
    fun claimRun(context: Context, mode: String, runId: String): Pair<Boolean, String> = synchronized(RUN_LOCK) {
      if (claimedRunId.isNotBlank()) return@synchronized Pair(false, claimedRunId)
      claimedRunId = runId
      val now = System.currentTimeMillis()
      val obj = JSONObject()
        .put("mode", mode)
        .put("runId", runId)
        .put("state", "STARTING")
        .put("running", true)
        .put("paused", false)
        .put("cancelled", false)
        .put("tested", 0)
        .put("total", 0)
        .put("found", 0)
        .put("matches", JSONArray())
        .put("createdAt", now)
        .put("updatedAt", now)
      context.getSharedPreferences(PREFS, 0).edit().putString(KEY_SNAPSHOT, obj.toString()).commit()
      recordExternalDiagnostic(context, JSONObject().put("mode", mode).put("runId", runId).put("state", "STARTING"))
      setProcessSummary(context, "scan:STARTING:$mode")
      Pair(true, runId)
    }

    fun releaseRun(runId: String) = synchronized(RUN_LOCK) {
      if (claimedRunId == runId) claimedRunId = ""
    }

    fun activeRunId(): String = synchronized(RUN_LOCK) { claimedRunId }
  }

  private val cancelled = AtomicBoolean(false)
  private val paused = AtomicBoolean(false)
  @Volatile private var running = false
  @Volatile private var currentRunId = ""
  @Volatile private var activeExecutor: ExecutorService? = null
  @Volatile private var lastDiagnosticState = ""
  @Volatile private var lastDiagnosticBucket = -1
  private val activeConnections = ConcurrentHashMap.newKeySet<HttpURLConnection>()

  private fun abortActiveNetworkWork() {
    try { activeExecutor?.shutdownNow() } catch (_: Throwable) {}
    val snapshot = activeConnections.toList()
    for (conn in snapshot) {
      try { conn.disconnect() } catch (_: Throwable) {}
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    installCrashRecorder(applicationContext)
    if (Build.VERSION.SDK_INT >= 26) {
      val nm = getSystemService(NotificationManager::class.java)
      nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Panel taraması", NotificationManager.IMPORTANCE_LOW))
    }
  }

  private fun notification(text: String, progress: Int, max: Int): Notification {
    val b = Notification.Builder(this, CHANNEL_ID)
      .setContentTitle("KIZILKAN PLAYER ELITE")
      .setContentText(text)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setOngoing(true)
    if (max > 0) b.setProgress(max, progress.coerceAtMost(max), false)
    return b.build()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_CANCEL -> {
        val requestedRunId = intent.getStringExtra("runId") ?: ""
        if (running && requestedRunId == currentRunId) {
          cancelled.set(true)
          paused.set(false)
          patchSnapshot { it.put("running", true).put("cancelled", true).put("paused", false).put("state", "CANCELLING") }
          abortActiveNetworkWork()
          getSystemService(NotificationManager::class.java).notify(NOTIF_ID, notification("Panel taraması durduruluyor…", 0, 0))
        }
      }
      ACTION_PAUSE -> {
        val requestedRunId = intent.getStringExtra("runId") ?: ""
        if (running && requestedRunId == currentRunId) {
          paused.set(true)
          patchSnapshot { it.put("paused", true).put("running", true).put("state", "PAUSED") }
          getSystemService(NotificationManager::class.java).notify(NOTIF_ID, notification("Panel taraması duraklatıldı", 0, 0))
        }
      }
      ACTION_RESUME -> {
        val requestedRunId = intent.getStringExtra("runId") ?: ""
        if (running && requestedRunId == currentRunId) {
          paused.set(false)
          patchSnapshot { it.put("paused", false).put("running", true).put("state", "RUNNING") }
          getSystemService(NotificationManager::class.java).notify(NOTIF_ID, notification("Panel taraması devam ediyor", 0, 0))
        }
      }
      ACTION_RECOVER -> {
        val rec = ScanJournalStore.get(applicationContext).recoverable() ?: return START_NOT_STICKY
        val requestedRunId = rec.optString("runId")
        if (requestedRunId.isBlank() || requestedRunId != activeRunId() || running) return START_NOT_STICKY
        currentRunId=requestedRunId; running=true; cancelled.set(false); paused.set(false)
        val mode=rec.optString("mode"); val payload=rec.optString("payload"); val concurrency=rec.optInt("concurrency",8); val timeoutMs=rec.optInt("timeoutMs",8000); val start=rec.optLong("cursor",0L)
        val oldResults=ScanJournalStore.get(applicationContext).results(requestedRunId, 200)
        writeSnapshot(JSONObject().put("mode",mode).put("runId",requestedRunId).put("state","RUNNING").put("running",true).put("tested",start).put("total",rec.optLong("total",0L)).put("found",oldResults.length()).put("matches",oldResults).put("recovered",true))
        startForeground(NOTIF_ID, notification("Yarım kalan tarama devam ediyor…",0,0))
        Thread { when(mode){
          "single" -> { val o=JSONObject(payload); runScan(o.optString("candidates","[]"),o.optString("username"),o.optString("password"),concurrency,timeoutMs,start.toInt()) }
          "bulk" -> { val o=JSONObject(payload); runBulkScan(o.optString("candidates","[]"),o.optString("accounts","[]"),concurrency,timeoutMs,start.toInt()) }
          "unified" -> runUnifiedScan(payload,concurrency,timeoutMs,start)
          else -> throw IllegalStateException("Bilinmeyen recovery modu: $mode")
        } }.start()
      }
      ACTION_BULK_START -> {
        val requestedRunId = intent.getStringExtra("runId") ?: ""
        if (requestedRunId.isBlank() || requestedRunId != activeRunId() || running) return START_NOT_STICKY
        currentRunId = requestedRunId
        running = true
        cancelled.set(false)
        paused.set(false)
        val candidatesJson = intent.getStringExtra("candidatesJson") ?: "[]"
        val accountsJson = intent.getStringExtra("accountsJson") ?: "[]"
        val concurrency = intent.getIntExtra("concurrency", 8).coerceIn(1,32)
        val timeoutMs = intent.getIntExtra("timeoutMs", 8000).coerceIn(2000,20000)
        val candidateCount = try { JSONArray(candidatesJson).length() } catch (_: Throwable) { 0 }
        val accountCount = try { JSONArray(accountsJson).length() } catch (_: Throwable) { 0 }
        val initialTotal = candidateCount * accountCount
        ScanJournalStore.get(applicationContext).createSession(requestedRunId, "bulk", JSONObject().put("candidates",candidatesJson).put("accounts",accountsJson).toString(), concurrency, timeoutMs, initialTotal.toLong())
        writeSnapshot(JSONObject().put("mode", "bulk").put("running", true).put("paused", false)
          .put("tested", 0).put("total", initialTotal).put("accountTested", 0).put("accountTotal", accountCount)
          .put("found", 0).put("matches", JSONArray()))
        startForeground(NOTIF_ID, notification("Çoklu hesap taraması başlıyor…", 0, initialTotal))
        Thread { runBulkScan(candidatesJson, accountsJson, concurrency, timeoutMs) }.start()
      }
      ACTION_UNIFIED_START -> {
        val requestedRunId = intent.getStringExtra("runId") ?: ""
        if (requestedRunId.isBlank() || requestedRunId != activeRunId() || running) return START_NOT_STICKY
        currentRunId = requestedRunId
        running = true
        cancelled.set(false)
        paused.set(false)
        val stagingKey = intent.getStringExtra("stagingKey") ?: requestedRunId
        val concurrency = intent.getIntExtra("concurrency", 8).coerceIn(1,32)
        val timeoutMs = intent.getIntExtra("timeoutMs", 8000).coerceIn(2000,20000)
        val initialTotal = intent.getLongExtra("initialTotal", 0L).coerceAtLeast(0L)
        val accountCount = intent.getIntExtra("accountCount", 0).coerceAtLeast(0)
        val payloadBytes = intent.getLongExtra("payloadBytes", 0L).coerceAtLeast(0L)
        writeSnapshot(JSONObject().put("mode", "unified").put("running", true).put("paused", false)
          .put("tested", 0).put("total", initialTotal).put("accountTested", 0).put("accountTotal", accountCount)
          .put("payloadBytes", payloadBytes).put("found", 0).put("matches", JSONArray()))
        recordExternalDiagnostic(applicationContext, JSONObject().put("runId", requestedRunId).put("mode", "unified")
          .put("state", "SERVICE_ENTER").put("total", initialTotal).put("accountTotal", accountCount).put("payloadBytes", payloadBytes))
        setProcessSummary(applicationContext, "scan:SERVICE_ENTER:a$accountCount:t$initialTotal:b$payloadBytes")
        startForeground(NOTIF_ID, notification("Birleşik panel taraması başlıyor…", 0, if (initialTotal > Int.MAX_VALUE) Int.MAX_VALUE else initialTotal.toInt()))
        Thread({ runUnifiedScanFromStaging(stagingKey, concurrency, timeoutMs) }, "kizilkan-panel-scan-$requestedRunId").start()
      }
      ACTION_START -> {
        val requestedRunId = intent.getStringExtra("runId") ?: ""
        if (requestedRunId.isBlank() || requestedRunId != activeRunId() || running) return START_NOT_STICKY
        currentRunId = requestedRunId
        running = true
        cancelled.set(false)
        paused.set(false)
        val candidatesJson = intent.getStringExtra("candidatesJson") ?: "[]"
        val username = intent.getStringExtra("username") ?: ""
        val password = intent.getStringExtra("password") ?: ""
        val concurrency = intent.getIntExtra("concurrency", 6).coerceIn(1,20)
        val timeoutMs = intent.getIntExtra("timeoutMs", 8000).coerceIn(2000,20000)
        val initialTotal = try { JSONArray(candidatesJson).length() } catch (_: Throwable) { 0 }
        ScanJournalStore.get(applicationContext).createSession(requestedRunId, "single", JSONObject().put("candidates",candidatesJson).put("username",username).put("password",password).toString(), concurrency, timeoutMs, initialTotal.toLong())
        writeSnapshot(JSONObject()
          .put("running", true).put("paused", false).put("tested", 0).put("total", initialTotal)
          .put("panelTested", 0).put("panelTotal", 0)
          .put("found", 0).put("matches", JSONArray()))
        startForeground(NOTIF_ID, notification("Panel taraması başlıyor…", 0, initialTotal))
        Thread { runScan(candidatesJson, username, password, concurrency, timeoutMs) }.start()
      }
    }
    return START_NOT_STICKY
  }

  @Synchronized private fun appendDiagnosticEvent(obj: JSONObject) {
    val prefs = getSharedPreferences(PREFS, 0)
    val arr = try { JSONArray(prefs.getString(KEY_EVENTS, "[]") ?: "[]") } catch (_: Throwable) { JSONArray() }
    val event = JSONObject()
      .put("at", System.currentTimeMillis())
      .put("runId", obj.optString("runId", currentRunId))
      .put("mode", obj.optString("mode", ""))
      .put("state", obj.optString("state", ""))
      .put("tested", obj.optInt("tested", 0))
      .put("total", obj.optInt("total", 0))
      .put("found", obj.optInt("found", 0))
      .put("accountIndex", obj.optInt("accountIndex", -1))
      .put("pssKb", Debug.getPss())
      .put("error", obj.optString("error", "").take(300))
    val next = JSONArray(); next.put(event)
    for (i in 0 until minOf(arr.length(), 79)) next.put(arr.opt(i))
    prefs.edit().putString(KEY_EVENTS, next.toString()).commit()
  }

  @Synchronized private fun writeSnapshot(obj: JSONObject) {
    if (currentRunId.isNotBlank() && !obj.has("runId")) obj.put("runId", currentRunId)
    if (!obj.has("createdAt")) {
      val previousRaw = getSharedPreferences(PREFS, 0).getString(KEY_SNAPSHOT, "{}") ?: "{}"
      val previousCreatedAt = try { JSONObject(previousRaw).optLong("createdAt", 0L) } catch (_: Throwable) { 0L }
      obj.put("createdAt", if (previousCreatedAt > 0L) previousCreatedAt else System.currentTimeMillis())
    }
    if (!obj.has("state")) {
      val state = when {
        obj.optBoolean("cancelled", false) -> "CANCELLED"
        obj.optBoolean("running", false) && obj.optBoolean("paused", false) -> "PAUSED"
        obj.optBoolean("running", false) -> "RUNNING"
        obj.has("error") -> "FAILED"
        else -> "COMPLETED"
      }
      obj.put("state", state)
    }
    obj.put("updatedAt", System.currentTimeMillis())
    getSharedPreferences(PREFS, 0).edit().putString(KEY_SNAPSHOT, obj.toString()).apply()
    val stateNow = obj.optString("state", "")
    val bucket = obj.optInt("tested", 0) / 100
    if (stateNow != lastDiagnosticState || bucket != lastDiagnosticBucket || obj.has("error")) {
      appendDiagnosticEvent(obj)
      lastDiagnosticState = stateNow
      lastDiagnosticBucket = bucket
    }
  }

  @Synchronized private fun patchSnapshot(mutator: (JSONObject) -> Unit) {
    val raw = getSharedPreferences(PREFS, 0).getString(KEY_SNAPSHOT, "{}") ?: "{}"
    val obj = try { JSONObject(raw) } catch (_: Throwable) { JSONObject() }
    mutator(obj)
    writeSnapshot(obj)
  }

  /**
   * v15.2.11: job hangi yoldan çıkarsa çıksın SharedPreferences'ta terminal
   * snapshot bırak. Böylece UI CANCELLING/STARTING durumunda sonsuza kadar kalmaz.
   */
  private fun finalizeSnapshot(mode: String) {
    patchSnapshot { obj ->
      obj.put("mode", mode)
        .put("running", false)
        .put("paused", false)
      if (cancelled.get()) {
        obj.put("cancelled", true).put("state", "CANCELLED")
        obj.remove("error")
      } else if (obj.has("error")) {
        obj.put("state", "FAILED")
      } else {
        val state = obj.optString("state", "")
        if (state !in setOf("COMPLETED", "FAILED", "CANCELLED")) obj.put("state", "COMPLETED")
      }
    }
  }

  private fun probe(server: String, username: String, password: String, timeoutMs: Int): JSONObject? {
    val base = server.trim().trimEnd('/')
    val u = java.net.URLEncoder.encode(username, "UTF-8")
    val p = java.net.URLEncoder.encode(password, "UTF-8")
    var conn: HttpURLConnection? = null
    return try {
      if (cancelled.get() || Thread.currentThread().isInterrupted) return null
      val opened = URL("$base/player_api.php?username=$u&password=$p").openConnection() as HttpURLConnection
      conn = opened
      activeConnections.add(opened)
      if (cancelled.get() || Thread.currentThread().isInterrupted) return null
      opened.connectTimeout = timeoutMs
      opened.readTimeout = timeoutMs
      opened.requestMethod = "GET"
      opened.setRequestProperty("Accept", "application/json")
      if (opened.responseCode !in 200..299) return null
      val text = opened.inputStream.bufferedReader().use { it.readText() }
      val data = JSONObject(text)
      val ui = data.optJSONObject("user_info") ?: return null
      val auth = ui.opt("auth")?.toString()
      if (auth == "0" || auth == "false") return null
      data
    } catch (_: Throwable) { null } finally { conn?.let { activeConnections.remove(it) }; conn?.disconnect() }
  }

  /** Snapshot diskte kalıcıdır; parola/token gibi hassas alanları yazma. */
  private fun sanitizeLogin(input: JSONObject): JSONObject {
    val deny = setOf("password", "pass", "token", "authorization", "auth_token", "access_token")
    fun clean(src: JSONObject): JSONObject {
      val out = JSONObject(); val keys = src.keys()
      while (keys.hasNext()) {
        val key = keys.next(); if (deny.contains(key.lowercase())) continue
        val value = src.opt(key)
        when (value) {
          is JSONObject -> out.put(key, clean(value))
          is JSONArray -> {
            val arr = JSONArray(); for (i in 0 until value.length()) {
              val v = value.opt(i); arr.put(if (v is JSONObject) clean(v) else v)
            }; out.put(key, arr)
          }
          else -> out.put(key, value)
        }
      }
      return out
    }
    return clean(input)
  }

  private fun runBulkScan(candidatesRaw: String, accountsRaw: String, concurrency: Int, timeoutMs: Int, startCursor: Int = 0) {
    try {
      val candidates = JSONArray(candidatesRaw); val accounts = JSONArray(accountsRaw)
      val candidateCount = candidates.length(); val accountCount = accounts.length(); val total = candidateCount * accountCount
      if (candidateCount == 0 || accountCount == 0) throw IllegalArgumentException("Tarama için hesap veya aday sunucu yok")
      val safeStart = startCursor.coerceIn(0, total)
      val cursor = AtomicInteger(safeStart); val tested = AtomicInteger(safeStart)
      val matches = java.util.Collections.synchronizedList(mutableListOf<JSONObject>())
      if (safeStart > 0) { val saved=ScanJournalStore.get(applicationContext).results(currentRunId); for(i in 0 until saved.length()) saved.optJSONObject(i)?.let { matches.add(it) } }
      val completedByAccount = Array(accountCount) { AtomicInteger(0) }; val accountDone = AtomicInteger(0)
      for (ai in 0 until accountCount) {
        val before = (safeStart - ai * candidateCount).coerceIn(0, candidateCount)
        completedByAccount[ai].set(before)
        if (before == candidateCount) accountDone.incrementAndGet()
      }
      val panelSet = linkedSetOf<String>()
      for (i in 0 until candidateCount) { val c = candidates.getJSONObject(i); panelSet.add("${c.optString("code")}\u0000${c.optString("panelName")}") }
      val workerCount = concurrency.coerceIn(1, minOf(32, total)); val pool = Executors.newFixedThreadPool(workerCount)
      val checkpointTracker = ConservativeCursorTracker(workerCount)
      activeExecutor = pool
      repeat(workerCount) { workerId ->
        pool.submit {
          while (!cancelled.get()) {
            while (paused.get() && !cancelled.get()) Thread.sleep(100)
            if (cancelled.get()) break
            val flat = cursor.getAndIncrement(); if (flat >= total) break
            checkpointTracker.begin(workerId, flat.toLong())
            val ai = flat / candidateCount; val ci = flat % candidateCount
            val account = accounts.getJSONObject(ai); val candidate = candidates.getJSONObject(ci)
            val login = probe(candidate.optString("server"), account.optString("username"), account.optString("password"), timeoutMs)
            if (login != null) { val hit=JSONObject()
              .put("accountIndex", ai).put("sourceRow", account.optInt("row", ai + 1)).put("username", account.optString("username"))
              .put("name", account.optString("name")).put("panelName", candidate.optString("panelName")).put("code", candidate.optString("code"))
              .put("server", candidate.optString("server")).put("login", sanitizeLogin(login)); if (ScanJournalStore.get(applicationContext).addResult(currentRunId, "$ai|${candidate.optString("server")}", hit.toString())) matches.add(hit) }
            if (completedByAccount[ai].incrementAndGet() == candidateCount) accountDone.incrementAndGet()
            val done = tested.incrementAndGet()
            checkpointTracker.finish(workerId)
            if (done % 16 == 0 || login != null) ScanJournalStore.get(applicationContext).checkpoint(currentRunId, checkpointTracker.safeCursor(cursor.get().toLong()))
            if (done == total || done % 16 == 0 || login != null) writeBulkSnapshot(done,total,accountDone.get(),accountCount,panelSet.size,matches,candidate.optString("panelName"),ai)
            if (done % 16 == 0 || login != null) getSystemService(NotificationManager::class.java).notify(NOTIF_ID, notification("$done/$total · ${matches.size} hesap bulundu", if (total > Int.MAX_VALUE) ((done * Int.MAX_VALUE) / total).toInt() else done.toInt(), if (total > Int.MAX_VALUE) Int.MAX_VALUE else total.toInt()))
          }
        }
      }
      pool.shutdown(); while (!pool.isTerminated) Thread.sleep(100)
      writeBulkSnapshot(tested.get(),total,accountDone.get(),accountCount,panelSet.size,matches,"",-1,false)
    } catch (e: Throwable) {
      writeSnapshot(JSONObject().put("mode","bulk").put("running",false).put("error",e.message ?: "Native çoklu hesap tarama hatası"))
    } finally {
      val finishedRunId = currentRunId
      finalizeSnapshot("bulk")
      ScanJournalStore.get(applicationContext).finish(finishedRunId, try { JSONObject(getSharedPreferences(PREFS,0).getString(KEY_SNAPSHOT,"{}") ?: "{}").optString("state","FAILED") } catch (_:Throwable) { "FAILED" })
      activeExecutor = null
      activeConnections.clear()
      running = false
      releaseRun(finishedRunId)
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
  }

  private fun writeBulkSnapshot(
    tested:Int,total:Int,accountTested:Int,accountTotal:Int,panelTotal:Int,matches:MutableList<JSONObject>,
    panelName:String,accountIndex:Int,runningValue:Boolean = tested < total && !cancelled.get(),
    currentServer:String = "", accountStatuses:JSONArray? = null, mode:String = "bulk"
  ) {
    val resultArray = JSONArray()
    // v15.2.24-RC2: periyodik snapshot bütün geçmişi tekrar serialize etmez.
    // Son 200 sonuç UI/resume için yeterlidir; toplam found ayrı sayaçta korunur.
    synchronized(matches) {
      val start = (matches.size - 200).coerceAtLeast(0)
      for (i in start until matches.size) resultArray.put(matches[i])
    }
    val snap = JSONObject().put("mode",mode).put("running",runningValue).put("paused",paused.get()).put("cancelled",cancelled.get())
      .put("tested",tested).put("total",total).put("accountTested",accountTested).put("accountTotal",accountTotal).put("panelTotal",panelTotal)
      .put("found",matches.size).put("panelName",panelName).put("currentServer",currentServer).put("accountIndex",accountIndex).put("matches",resultArray)
    if (accountStatuses != null) snap.put("accountStatuses", accountStatuses)
    writeSnapshot(snap)
  }

  private fun writeUnifiedSnapshot(
    tested:Long,total:Long,accountTested:Int,accountTotal:Int,panelTotal:Int,matches:MutableList<JSONObject>,
    panelName:String,accountIndex:Int,runningValue:Boolean = tested < total && !cancelled.get(),
    currentServer:String = "", accountStatuses:JSONArray? = null
  ) {
    val resultArray = JSONArray()
    synchronized(matches) {
      val start = (matches.size - 200).coerceAtLeast(0)
      for (i in start until matches.size) resultArray.put(matches[i])
    }
    val snap = JSONObject().put("mode","unified").put("running",runningValue).put("paused",paused.get()).put("cancelled",cancelled.get())
      .put("tested",tested).put("total",total).put("accountTested",accountTested).put("accountTotal",accountTotal).put("panelTotal",panelTotal)
      .put("found",matches.size).put("panelName",panelName).put("currentServer",currentServer).put("accountIndex",accountIndex).put("matches",resultArray)
    if (accountStatuses != null) snap.put("accountStatuses", accountStatuses)
    writeSnapshot(snap)
  }

  private fun runUnifiedScanFromStaging(stagingKey: String, concurrency: Int, timeoutMs: Int, startCursor: Long = 0L) {
    val safeKey = stagingKey.replace(Regex("[^a-zA-Z0-9_.-]"), "_")
    val file = File(filesDir, "kizilkan/panel-scan-staging/$safeKey.json")
    try {
      if (!file.exists()) throw IllegalStateException("Birleşik tarama staging dosyası bulunamadı")
      recordExternalDiagnostic(applicationContext, JSONObject().put("runId", currentRunId).put("mode", "unified")
        .put("state", "STAGING_READ").put("payloadBytes", file.length()))
      setProcessSummary(applicationContext, "scan:STAGING_READ:b${file.length()}")
      val raw = file.bufferedReader(Charsets.UTF_8).use { it.readText() }
      val estimatedTotal = try {
        val root = JSONObject(raw); val jobs = root.optJSONArray("jobs") ?: JSONArray(); var n=0L
        val sets=root.optJSONArray("candidateSets"); for(i in 0 until jobs.length()){ val j=jobs.optJSONObject(i); val a=j?.optJSONArray("candidates") ?: sets?.optJSONArray(j?.optInt("candidateSet",-1) ?: -1); n += (a?.length() ?: 0) } ; n
      } catch (_:Throwable){0L}
      ScanJournalStore.get(applicationContext).createSession(currentRunId, "unified", raw, concurrency, timeoutMs, estimatedTotal)
      // Credential içeren staging payload'ı RAM'e alındıktan hemen sonra diskten kaldır.
      runCatching { file.delete() }
      runUnifiedScan(raw, concurrency, timeoutMs, startCursor)
    } catch (e: Throwable) {
      writeSnapshot(JSONObject().put("mode","unified").put("running",false)
        .put("error", "${e.javaClass.simpleName}: ${e.message ?: "Birleşik tarama staging hatası"}"))
      recordExternalDiagnostic(applicationContext, JSONObject().put("runId", currentRunId).put("mode", "unified")
        .put("state", "STAGING_FAILED").put("error", "${e.javaClass.simpleName}: ${e.message ?: ""}"))
      val finishedRunId = currentRunId
      finalizeSnapshot("unified")
      activeExecutor = null
      activeConnections.clear()
      running = false
      releaseRun(finishedRunId)
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    } finally {
      runCatching { file.delete() }
    }
  }

  private fun runUnifiedScan(jobsRaw: String, concurrency: Int, timeoutMs: Int, startCursor: Long = 0L) {
    try {
      val root = try { JSONObject(jobsRaw) } catch (_: Throwable) { null }
      val jobs = root?.optJSONArray("jobs") ?: JSONArray(jobsRaw)
      val candidateSets = root?.optJSONArray("candidateSets")
      val accountCount = jobs.length()
      if (accountCount == 0) throw IllegalArgumentException("Tarama için hesap yok")

      fun candidatesFor(accountIndex: Int): JSONArray {
        val job = jobs.optJSONObject(accountIndex) ?: return JSONArray()
        job.optJSONArray("candidates")?.let { return it }
        val setIndex = job.optInt("candidateSet", -1)
        return if (candidateSets != null && setIndex in 0 until candidateSets.length()) candidateSets.optJSONArray(setIndex) ?: JSONArray() else JSONArray()
      }

      // v15.2.24-RC2: candidate×account kadar Work nesnesi üretme. Büyük taramalarda
      // bu matris gereksiz heap baskısı oluşturuyordu. Yalnız candidate katmanlarının
      // kümülatif iş sayısını tutup global cursor -> (account,candidate) eşlemesini
      // ihtiyaç anında hesaplıyoruz. Bellek O(toplam iş) yerine O(maxCandidate+account).
      val completedByAccount = Array(accountCount) { AtomicInteger(0) }
      val expectedByAccount = IntArray(accountCount)
      val candidateArrays = Array(accountCount) { candidatesFor(it) }
      val panelSet = linkedSetOf<String>()
      var maxCandidates = 0
      for (ai in 0 until accountCount) {
        val candidates = candidateArrays[ai]
        expectedByAccount[ai] = candidates.length()
        maxCandidates = maxOf(maxCandidates, candidates.length())
        for (ci in 0 until candidates.length()) {
          val c = candidates.optJSONObject(ci) ?: continue
          panelSet.add("${c.optString("code")}\u0000${c.optString("panelName")}")
        }
      }
      // v15.2.11 round-robin sırası korunur; fakat Work listesi materialize edilmez.
      val layerEnds = LongArray(maxCandidates)
      var total = 0L
      for (ci in 0 until maxCandidates) {
        for (ai in 0 until accountCount) if (ci < expectedByAccount[ai]) total++
        layerEnds[ci] = total
      }
      if (total == 0L) throw IllegalArgumentException("Tarama için aday sunucu yok")

      fun resolveWork(index: Long): Pair<Int, Int> {
        var lo = 0; var hi = layerEnds.lastIndex
        while (lo < hi) {
          val mid = (lo + hi) ushr 1
          if (index < layerEnds[mid]) hi = mid else lo = mid + 1
        }
        val ci = lo
        val before = if (ci == 0) 0L else layerEnds[ci - 1]
        var ordinal = index - before
        for (ai in 0 until accountCount) {
          if (ci < expectedByAccount[ai]) {
            if (ordinal == 0L) return ai to ci
            ordinal--
          }
        }
        throw IndexOutOfBoundsException("scan work index=$index")
      }
      val safeStart = startCursor.coerceIn(0L, total)
      val cursor = AtomicLong(safeStart)
      val tested = AtomicLong(safeStart)
      val lastUiSnapshotAt = AtomicLong(0L)
      // v17.0.9: Resume ilerlemesini round-robin/layer sırasının gerçek prefixinden yeniden kur.
      // `safeStart` [0, safeStart) aralığındaki tamamlandığı kesin iş sayısıdır.
      // Önce tamamen bitmiş candidate katmanlarını, sonra varsa kısmi katmandaki
      // account-order prefixini dağıtırız. Böylece artık var olmayan lineer `offsets`
      // varsayımına dönmeden O(accountCount + log(maxCandidates)) bellek/zamanla doğru
      // account progress elde edilir.
      if (safeStart > 0L) {
        val fullLayers: Int
        var partialInLayer = 0L
        if (safeStart >= total) {
          fullLayers = maxCandidates
        } else {
          var lo = 0
          var hi = layerEnds.lastIndex
          while (lo < hi) {
            val mid = (lo + hi) ushr 1
            if (safeStart < layerEnds[mid]) hi = mid else lo = mid + 1
          }
          fullLayers = lo
          val layerStart = if (fullLayers == 0) 0L else layerEnds[fullLayers - 1]
          partialInLayer = safeStart - layerStart
        }
        for (ai in 0 until accountCount) {
          var before = minOf(fullLayers, expectedByAccount[ai])
          if (partialInLayer > 0L && fullLayers < expectedByAccount[ai]) {
            before++
            partialInLayer--
          }
          completedByAccount[ai].set(before)
        }
      }
      val accountDone = AtomicInteger(expectedByAccount.indices.count { expectedByAccount[it] == 0 || completedByAccount[it].get() >= expectedByAccount[it] })
      val matches = java.util.Collections.synchronizedList(mutableListOf<JSONObject>())
      if (safeStart > 0L) { val saved=ScanJournalStore.get(applicationContext).results(currentRunId); for(i in 0 until saved.length()) saved.optJSONObject(i)?.let { matches.add(it) } }
      val workerFailure = AtomicReference<Throwable?>(null)
      fun accountStatuses(currentIndex: Int): JSONArray {
        val foundCounts = IntArray(accountCount)
        synchronized(matches) {
          for (m in matches) {
            val idx = m.optInt("accountIndex", -1)
            if (idx in 0 until accountCount) foundCounts[idx]++
          }
        }
        val arr = JSONArray()
        // v17.0.4: 100K+ hesapta her progress tick'inde dev JSON üretme.
        // Küçük/normal taramada geriye dönük tam görünüm; ultra taramada aktif pencere.
        val startIndex = if (accountCount <= 2000) 0 else (currentIndex - 100).coerceAtLeast(0)
        val endIndex = if (accountCount <= 2000) accountCount else (startIndex + 250).coerceAtMost(accountCount)
        for (ai in startIndex until endIndex) {
          val job = jobs.optJSONObject(ai) ?: JSONObject()
          val done = completedByAccount[ai].get()
          val expected = expectedByAccount[ai]
          val state = when {
            done >= expected && expected > 0 -> "completed"
            done > 0 || ai == currentIndex -> "running"
            else -> "queued"
          }
          arr.put(JSONObject()
            .put("accountIndex", ai)
            .put("sourceRow", job.optInt("row", ai + 1))
            .put("name", job.optString("name"))
            .put("state", state)
            .put("tested", done)
            .put("total", expected)
            .put("remaining", (expected - done).coerceAtLeast(0))
            .put("found", foundCounts[ai]))
        }
        return arr
      }
      val workerCount = concurrency.coerceIn(1, minOf(32L, total).toInt())
      val pool = Executors.newFixedThreadPool(workerCount)
      val checkpointTracker = ConservativeCursorTracker(workerCount)
      activeExecutor = pool
      recordExternalDiagnostic(applicationContext, JSONObject().put("runId", currentRunId).put("mode", "unified")
        .put("state", "WORKERS_STARTED").put("total", total).put("accountTotal", accountCount))
      setProcessSummary(applicationContext, "scan:WORKERS:a$accountCount:t$total:w$workerCount")
      repeat(workerCount) { workerId ->
        pool.submit {
          try {
            while (!cancelled.get() && workerFailure.get() == null) {
              while (paused.get() && !cancelled.get()) Thread.sleep(100)
              if (cancelled.get() || workerFailure.get() != null) break
              val wi = cursor.getAndIncrement()
              if (wi >= total) break
              checkpointTracker.begin(workerId, wi)
              val (accountIndex, candidateIndex) = resolveWork(wi)
              val account = jobs.getJSONObject(accountIndex)
              val candidates = candidateArrays[accountIndex]
              val candidate = candidates.getJSONObject(candidateIndex)
              val login = probe(candidate.optString("server"), account.optString("username"), account.optString("password"), timeoutMs)
              if (login != null) { val hit=JSONObject()
                .put("accountIndex", accountIndex)
                .put("sourceRow", account.optInt("row", accountIndex + 1))
                .put("username", account.optString("username"))
                .put("name", account.optString("name"))
                .put("panelName", candidate.optString("panelName"))
                .put("code", candidate.optString("code"))
                .put("server", candidate.optString("server"))
                .put("login", sanitizeLogin(login)); if (ScanJournalStore.get(applicationContext).addResult(currentRunId, "$accountIndex|${candidate.optString("server")}", hit.toString())) matches.add(hit) }
              if (completedByAccount[accountIndex].incrementAndGet() == expectedByAccount[accountIndex]) accountDone.incrementAndGet()
              val done = tested.incrementAndGet()
              checkpointTracker.finish(workerId)
              if (done % 64L == 0L || login != null) ScanJournalStore.get(applicationContext).checkpoint(currentRunId, checkpointTracker.safeCursor(cursor.get()))
              val now = System.currentTimeMillis()
              val previousSnapshotAt = lastUiSnapshotAt.get()
              val snapshotDue = done == total || login != null || (now - previousSnapshotAt >= 250L && lastUiSnapshotAt.compareAndSet(previousSnapshotAt, now))
              if (snapshotDue) {
                writeUnifiedSnapshot(
                  done, total, accountDone.get(), accountCount, panelSet.size, matches,
                  candidate.optString("panelName"), accountIndex,
                  currentServer = candidate.optString("server"),
                  accountStatuses = accountStatuses(accountIndex),
                )
              }
              if (done % 500L == 0L) setProcessSummary(applicationContext, "scan:RUNNING:a$accountCount:d$done:t$total")
              if (snapshotDue) getSystemService(NotificationManager::class.java)
                .notify(NOTIF_ID, notification("$done/$total · ${matches.size} hesap bulundu", if (total > Int.MAX_VALUE) ((done * Int.MAX_VALUE) / total).toInt() else done.toInt(), if (total > Int.MAX_VALUE) Int.MAX_VALUE else total.toInt()))
            }
          } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            if (!cancelled.get()) workerFailure.compareAndSet(null, e)
          } catch (e: Throwable) {
            workerFailure.compareAndSet(null, e)
            recordExternalDiagnostic(applicationContext, JSONObject().put("runId", currentRunId).put("mode", "unified")
              .put("state", "WORKER_FAILED").put("tested", tested.get()).put("total", total)
              .put("error", "${e.javaClass.simpleName}: ${e.message ?: ""}"))
          }
        }
      }
      pool.shutdown()
      while (!pool.isTerminated) Thread.sleep(100)
      workerFailure.get()?.let { if (!cancelled.get()) throw it }
      writeUnifiedSnapshot(
        tested.get(), total, accountDone.get(), accountCount, panelSet.size, matches, "", -1, false,
        currentServer = "", accountStatuses = accountStatuses(-1)
      )
    } catch (e: Throwable) {
      writeSnapshot(JSONObject().put("mode","unified").put("running",false)
        .put("error", "${e.javaClass.simpleName}: ${e.message ?: "Birleşik native panel tarama hatası"}"))
    } finally {
      val finishedRunId = currentRunId
      finalizeSnapshot("unified")
      ScanJournalStore.get(applicationContext).finish(finishedRunId, try { JSONObject(getSharedPreferences(PREFS,0).getString(KEY_SNAPSHOT,"{}") ?: "{}").optString("state","FAILED") } catch (_:Throwable) { "FAILED" })
      setProcessSummary(applicationContext, if (cancelled.get()) "scan:CANCELLED" else "scan:TERMINAL")
      activeExecutor = null
      activeConnections.clear()
      running = false
      releaseRun(finishedRunId)
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
  }

  private fun runScan(raw: String, user: String, pass: String, concurrency: Int, timeoutMs: Int, startCursor: Int = 0) {
    try {
      val arr = JSONArray(raw)
      val total = arr.length()
      val safeStart = startCursor.coerceIn(0, total)
      val cursor = AtomicInteger(safeStart)
      val tested = AtomicInteger(safeStart)
      val matches = java.util.Collections.synchronizedList(mutableListOf<JSONObject>())
      if (safeStart > 0) { val saved=ScanJournalStore.get(applicationContext).results(currentRunId); for(i in 0 until saved.length()) saved.optJSONObject(i)?.let { matches.add(it) } }
      val panelRemaining = mutableMapOf<String, AtomicInteger>()
      for (i in 0 until total) {
        val c = arr.getJSONObject(i)
        val key = "${c.optString("code")}\u0000${c.optString("panelName")}"
        panelRemaining.getOrPut(key) { AtomicInteger(0) }.incrementAndGet()
      }
      for (i in 0 until safeStart) {
        val c = arr.getJSONObject(i)
        val key = "${c.optString("code")}\u0000${c.optString("panelName")}"
        panelRemaining[key]?.decrementAndGet()
      }
      val panelTotal = panelRemaining.size
      val panelDone = AtomicInteger(panelRemaining.values.count { it.get() == 0 })
      val pool = Executors.newFixedThreadPool(concurrency)
      val checkpointTracker = ConservativeCursorTracker(concurrency)
      activeExecutor = pool
      repeat(concurrency) { workerId ->
        pool.submit {
          while (!cancelled.get()) {
            while (paused.get() && !cancelled.get()) Thread.sleep(120)
            if (cancelled.get()) break
            val i = cursor.getAndIncrement()
            if (i >= total) break
            checkpointTracker.begin(workerId, i.toLong())
            val c = arr.getJSONObject(i)
            val panelName = c.optString("panelName")
            val server = c.optString("server")
            val data = probe(server, user, pass, timeoutMs)
            if (data != null) {
              val hit=JSONObject().put("panelName", panelName).put("code", c.optString("code")).put("server", server).put("login", sanitizeLogin(data)); if (ScanJournalStore.get(applicationContext).addResult(currentRunId, server, hit.toString())) matches.add(hit)
            }
            val done = tested.incrementAndGet()
            checkpointTracker.finish(workerId)
            if (done % 8 == 0 || data != null) ScanJournalStore.get(applicationContext).checkpoint(currentRunId, checkpointTracker.safeCursor(cursor.get().toLong()))
            val pk = "${c.optString("code")}\u0000$panelName"
            if (panelRemaining[pk]?.decrementAndGet() == 0) panelDone.incrementAndGet()
            val resultArray = JSONArray()
            synchronized(matches) { matches.forEach { resultArray.put(it) } }
            val snap = JSONObject()
              .put("running", done < total && !cancelled.get()).put("paused", paused.get())
              .put("tested", done).put("total", total)
              .put("panelTested", panelDone.get()).put("panelTotal", panelTotal)
              .put("found", matches.size).put("panelName", panelName).put("currentServer", server)
              .put("matches", resultArray)
            writeSnapshot(snap)
            val nm = getSystemService(NotificationManager::class.java)
            nm.notify(NOTIF_ID, notification("$done/$total · ${matches.size} hesap bulundu", if (total > Int.MAX_VALUE) ((done * Int.MAX_VALUE) / total).toInt() else done.toInt(), if (total > Int.MAX_VALUE) Int.MAX_VALUE else total.toInt()))
          }
        }
      }
      pool.shutdown()
      while (!pool.isTerminated) Thread.sleep(100)
      val resultArray = JSONArray()
      synchronized(matches) { matches.forEach { resultArray.put(it) } }
      writeSnapshot(JSONObject()
        .put("running", false).put("paused", false).put("cancelled", cancelled.get()).put("tested", tested.get()).put("total", total)
        .put("panelTested", panelDone.get()).put("panelTotal", panelTotal)
        .put("found", matches.size).put("matches", resultArray))
    } catch (e: Throwable) {
      writeSnapshot(JSONObject().put("running", false).put("error", e.message ?: "Native panel tarama hatası"))
    } finally {
      val finishedRunId = currentRunId
      finalizeSnapshot("single")
      ScanJournalStore.get(applicationContext).finish(finishedRunId, try { JSONObject(getSharedPreferences(PREFS,0).getString(KEY_SNAPSHOT,"{}") ?: "{}").optString("state","FAILED") } catch (_:Throwable) { "FAILED" })
      activeExecutor = null
      activeConnections.clear()
      running = false
      releaseRun(finishedRunId)
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
  }
}
