package expo.modules.panelscan

import android.app.*
import android.content.Intent
import android.content.Context
import android.os.Build
import android.os.IBinder
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

class PanelScanService : Service() {
  companion object {
    const val ACTION_START = "expo.modules.panelscan.START"
    const val ACTION_BULK_START = "expo.modules.panelscan.BULK_START"
    const val ACTION_UNIFIED_START = "expo.modules.panelscan.UNIFIED_START"
    const val ACTION_CANCEL = "expo.modules.panelscan.CANCEL"
    const val ACTION_PAUSE = "expo.modules.panelscan.PAUSE"
    const val ACTION_RESUME = "expo.modules.panelscan.RESUME"
    const val PREFS = "gpt_elite_panel_scan"
    const val KEY_SNAPSHOT = "snapshot"
    const val CHANNEL_ID = "panel_scan"
    const val NOTIF_ID = 13001

    private val RUN_LOCK = Any()
    @Volatile private var claimedRunId: String = ""

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

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
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
          patchSnapshot { it.put("running", true).put("cancelled", true).put("paused", false).put("state", "CANCELLED") }
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
        val jobsJson = intent.getStringExtra("jobsJson") ?: "[]"
        val concurrency = intent.getIntExtra("concurrency", 8).coerceIn(1,32)
        val timeoutMs = intent.getIntExtra("timeoutMs", 8000).coerceIn(2000,20000)
        val jobs = try { JSONArray(jobsJson) } catch (_: Throwable) { JSONArray() }
        var initialTotal = 0
        for (i in 0 until jobs.length()) initialTotal += jobs.optJSONObject(i)?.optJSONArray("candidates")?.length() ?: 0
        writeSnapshot(JSONObject().put("mode", "unified").put("running", true).put("paused", false)
          .put("tested", 0).put("total", initialTotal).put("accountTested", 0).put("accountTotal", jobs.length())
          .put("found", 0).put("matches", JSONArray()))
        startForeground(NOTIF_ID, notification("Birleşik panel taraması başlıyor…", 0, initialTotal))
        Thread { runUnifiedScan(jobsJson, concurrency, timeoutMs) }.start()
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

  @Synchronized private fun writeSnapshot(obj: JSONObject) {
    if (currentRunId.isNotBlank() && !obj.has("runId")) obj.put("runId", currentRunId)
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
  }

  @Synchronized private fun patchSnapshot(mutator: (JSONObject) -> Unit) {
    val raw = getSharedPreferences(PREFS, 0).getString(KEY_SNAPSHOT, "{}") ?: "{}"
    val obj = try { JSONObject(raw) } catch (_: Throwable) { JSONObject() }
    mutator(obj)
    writeSnapshot(obj)
  }

  private fun probe(server: String, username: String, password: String, timeoutMs: Int): JSONObject? {
    val base = server.trim().trimEnd('/')
    val u = java.net.URLEncoder.encode(username, "UTF-8")
    val p = java.net.URLEncoder.encode(password, "UTF-8")
    var conn: HttpURLConnection? = null
    return try {
      conn = URL("$base/player_api.php?username=$u&password=$p").openConnection() as HttpURLConnection
      conn.connectTimeout = timeoutMs
      conn.readTimeout = timeoutMs
      conn.requestMethod = "GET"
      conn.setRequestProperty("Accept", "application/json")
      if (conn.responseCode !in 200..299) return null
      val text = conn.inputStream.bufferedReader().use { it.readText() }
      val data = JSONObject(text)
      val ui = data.optJSONObject("user_info") ?: return null
      val auth = ui.opt("auth")?.toString()
      if (auth == "0" || auth == "false") return null
      data
    } catch (_: Throwable) { null } finally { conn?.disconnect() }
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

  private fun runBulkScan(candidatesRaw: String, accountsRaw: String, concurrency: Int, timeoutMs: Int) {
    try {
      val candidates = JSONArray(candidatesRaw); val accounts = JSONArray(accountsRaw)
      val candidateCount = candidates.length(); val accountCount = accounts.length(); val total = candidateCount * accountCount
      if (candidateCount == 0 || accountCount == 0) throw IllegalArgumentException("Tarama için hesap veya aday sunucu yok")
      val cursor = AtomicInteger(0); val tested = AtomicInteger(0)
      val matches = java.util.Collections.synchronizedList(mutableListOf<JSONObject>())
      val completedByAccount = Array(accountCount) { AtomicInteger(0) }; val accountDone = AtomicInteger(0)
      val panelSet = linkedSetOf<String>()
      for (i in 0 until candidateCount) { val c = candidates.getJSONObject(i); panelSet.add("${c.optString("code")}\u0000${c.optString("panelName")}") }
      val workerCount = concurrency.coerceIn(1, minOf(32, total)); val pool = Executors.newFixedThreadPool(workerCount)
      repeat(workerCount) {
        pool.submit {
          while (!cancelled.get()) {
            while (paused.get() && !cancelled.get()) Thread.sleep(100)
            if (cancelled.get()) break
            val flat = cursor.getAndIncrement(); if (flat >= total) break
            val ai = flat / candidateCount; val ci = flat % candidateCount
            val account = accounts.getJSONObject(ai); val candidate = candidates.getJSONObject(ci)
            val login = probe(candidate.optString("server"), account.optString("username"), account.optString("password"), timeoutMs)
            if (login != null) matches.add(JSONObject()
              .put("accountIndex", ai).put("sourceRow", account.optInt("row", ai + 1)).put("username", account.optString("username"))
              .put("name", account.optString("name")).put("panelName", candidate.optString("panelName")).put("code", candidate.optString("code"))
              .put("server", candidate.optString("server")).put("login", sanitizeLogin(login)))
            if (completedByAccount[ai].incrementAndGet() == candidateCount) accountDone.incrementAndGet()
            val done = tested.incrementAndGet()
            if (done == total || done % 16 == 0 || login != null) writeBulkSnapshot(done,total,accountDone.get(),accountCount,panelSet.size,matches,candidate.optString("panelName"),ai)
            if (done % 16 == 0 || login != null) getSystemService(NotificationManager::class.java).notify(NOTIF_ID, notification("$done/$total · ${matches.size} hesap bulundu", done, total))
          }
        }
      }
      pool.shutdown(); while (!pool.isTerminated) Thread.sleep(100)
      writeBulkSnapshot(tested.get(),total,accountDone.get(),accountCount,panelSet.size,matches,"",-1,false)
    } catch (e: Throwable) {
      writeSnapshot(JSONObject().put("mode","bulk").put("running",false).put("error",e.message ?: "Native çoklu hesap tarama hatası"))
    } finally {
      val finishedRunId = currentRunId
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
    val resultArray=JSONArray(); synchronized(matches){ matches.forEach{ resultArray.put(it) } }
    val snap = JSONObject().put("mode",mode).put("running",runningValue).put("paused",paused.get()).put("cancelled",cancelled.get())
      .put("tested",tested).put("total",total).put("accountTested",accountTested).put("accountTotal",accountTotal).put("panelTotal",panelTotal)
      .put("found",matches.size).put("panelName",panelName).put("currentServer",currentServer).put("accountIndex",accountIndex).put("matches",resultArray)
    if (accountStatuses != null) snap.put("accountStatuses", accountStatuses)
    writeSnapshot(snap)
  }

  private fun runUnifiedScan(jobsRaw: String, concurrency: Int, timeoutMs: Int) {
    try {
      val jobs = JSONArray(jobsRaw)
      val accountCount = jobs.length()
      if (accountCount == 0) throw IllegalArgumentException("Tarama için hesap yok")

      data class Work(val accountIndex: Int, val candidateIndex: Int)
      val work = ArrayList<Work>()
      val completedByAccount = Array(accountCount) { AtomicInteger(0) }
      val expectedByAccount = IntArray(accountCount)
      val panelSet = linkedSetOf<String>()
      for (ai in 0 until accountCount) {
        val job = jobs.getJSONObject(ai)
        val candidates = job.optJSONArray("candidates") ?: JSONArray()
        expectedByAccount[ai] = candidates.length()
        for (ci in 0 until candidates.length()) {
          work.add(Work(ai, ci))
          val c = candidates.optJSONObject(ci) ?: continue
          panelSet.add("${c.optString("code")}\u0000${c.optString("panelName")}")
        }
      }
      if (work.isEmpty()) throw IllegalArgumentException("Tarama için aday sunucu yok")

      val total = work.size
      val cursor = AtomicInteger(0)
      val tested = AtomicInteger(0)
      val accountDone = AtomicInteger(expectedByAccount.count { it == 0 })
      val matches = java.util.Collections.synchronizedList(mutableListOf<JSONObject>())
      fun accountStatuses(currentIndex: Int): JSONArray {
        val foundCounts = IntArray(accountCount)
        synchronized(matches) {
          for (m in matches) {
            val idx = m.optInt("accountIndex", -1)
            if (idx in 0 until accountCount) foundCounts[idx]++
          }
        }
        val arr = JSONArray()
        for (ai in 0 until accountCount) {
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
      val pool = Executors.newFixedThreadPool(concurrency.coerceIn(1, minOf(32, total)))
      repeat(concurrency.coerceIn(1, minOf(32, total))) {
        pool.submit {
          while (!cancelled.get()) {
            while (paused.get() && !cancelled.get()) Thread.sleep(100)
            if (cancelled.get()) break
            val wi = cursor.getAndIncrement()
            if (wi >= total) break
            val unit = work[wi]
            val account = jobs.getJSONObject(unit.accountIndex)
            val candidates = account.optJSONArray("candidates") ?: JSONArray()
            val candidate = candidates.getJSONObject(unit.candidateIndex)
            val login = probe(candidate.optString("server"), account.optString("username"), account.optString("password"), timeoutMs)
            if (login != null) matches.add(JSONObject()
              .put("accountIndex", unit.accountIndex)
              .put("sourceRow", account.optInt("row", unit.accountIndex + 1))
              .put("username", account.optString("username"))
              .put("name", account.optString("name"))
              .put("panelName", candidate.optString("panelName"))
              .put("code", candidate.optString("code"))
              .put("server", candidate.optString("server"))
              .put("login", sanitizeLogin(login)))
            if (completedByAccount[unit.accountIndex].incrementAndGet() == expectedByAccount[unit.accountIndex]) accountDone.incrementAndGet()
            val done = tested.incrementAndGet()
            if (done == total || done % 12 == 0 || login != null) {
              writeBulkSnapshot(
                done, total, accountDone.get(), accountCount, panelSet.size, matches,
                candidate.optString("panelName"), unit.accountIndex,
                currentServer = candidate.optString("server"),
                accountStatuses = accountStatuses(unit.accountIndex),
                mode = "unified",
              )
            }
            if (done % 12 == 0 || login != null) getSystemService(NotificationManager::class.java)
              .notify(NOTIF_ID, notification("$done/$total · ${matches.size} hesap bulundu", done, total))
          }
        }
      }
      pool.shutdown()
      while (!pool.isTerminated) Thread.sleep(100)
      writeBulkSnapshot(
        tested.get(), total, accountDone.get(), accountCount, panelSet.size, matches, "", -1, false,
        currentServer = "", accountStatuses = accountStatuses(-1), mode = "unified"
      )
    } catch (e: Throwable) {
      writeSnapshot(JSONObject().put("mode","unified").put("running",false).put("error",e.message ?: "Birleşik native panel tarama hatası"))
    } finally {
      val finishedRunId = currentRunId
      running = false
      releaseRun(finishedRunId)
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
  }

  private fun runScan(raw: String, user: String, pass: String, concurrency: Int, timeoutMs: Int) {
    try {
      val arr = JSONArray(raw)
      val total = arr.length()
      val cursor = AtomicInteger(0)
      val tested = AtomicInteger(0)
      val matches = java.util.Collections.synchronizedList(mutableListOf<JSONObject>())
      val panelRemaining = mutableMapOf<String, AtomicInteger>()
      val panelDone = AtomicInteger(0)
      for (i in 0 until total) {
        val c = arr.getJSONObject(i)
        val key = "${c.optString("code")}\u0000${c.optString("panelName")}"
        panelRemaining.getOrPut(key) { AtomicInteger(0) }.incrementAndGet()
      }
      val panelTotal = panelRemaining.size
      val pool = Executors.newFixedThreadPool(concurrency)
      repeat(concurrency) {
        pool.submit {
          while (!cancelled.get()) {
            while (paused.get() && !cancelled.get()) Thread.sleep(120)
            if (cancelled.get()) break
            val i = cursor.getAndIncrement()
            if (i >= total) break
            val c = arr.getJSONObject(i)
            val panelName = c.optString("panelName")
            val server = c.optString("server")
            val data = probe(server, user, pass, timeoutMs)
            if (data != null) {
              matches.add(JSONObject()
                .put("panelName", panelName)
                .put("code", c.optString("code"))
                .put("server", server)
                .put("login", sanitizeLogin(data)))
            }
            val done = tested.incrementAndGet()
            val pk = "${c.optString("code")}\u0000$panelName"
            if (panelRemaining[pk]?.decrementAndGet() == 0) panelDone.incrementAndGet()
            val resultArray = JSONArray()
            synchronized(matches) { matches.forEach { resultArray.put(it) } }
            val snap = JSONObject()
              .put("running", done < total && !cancelled.get()).put("paused", paused.get())
              .put("tested", done).put("total", total)
              .put("panelTested", panelDone.get()).put("panelTotal", panelTotal)
              .put("found", matches.size).put("panelName", panelName)
              .put("matches", resultArray)
            writeSnapshot(snap)
            val nm = getSystemService(NotificationManager::class.java)
            nm.notify(NOTIF_ID, notification("$done/$total · ${matches.size} hesap bulundu", done, total))
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
      running = false
      releaseRun(finishedRunId)
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
  }
}
