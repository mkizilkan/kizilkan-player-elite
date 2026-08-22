package expo.modules.panelscan

import android.app.*
import android.content.Intent
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
    const val ACTION_CANCEL = "expo.modules.panelscan.CANCEL"
    const val ACTION_PAUSE = "expo.modules.panelscan.PAUSE"
    const val ACTION_RESUME = "expo.modules.panelscan.RESUME"
    const val PREFS = "gpt_elite_panel_scan"
    const val KEY_SNAPSHOT = "snapshot"
    const val CHANNEL_ID = "panel_scan"
    const val NOTIF_ID = 13001
  }

  private val cancelled = AtomicBoolean(false)
  private val paused = AtomicBoolean(false)
  @Volatile private var running = false

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
        cancelled.set(true)
        paused.set(false)
        patchSnapshot { it.put("running", false).put("cancelled", true).put("paused", false) }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
      }
      ACTION_PAUSE -> if (running) {
        paused.set(true)
        patchSnapshot { it.put("paused", true).put("running", true) }
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID, notification("Panel taraması duraklatıldı", 0, 0))
      }
      ACTION_RESUME -> if (running) {
        paused.set(false)
        patchSnapshot { it.put("paused", false).put("running", true) }
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID, notification("Panel taraması devam ediyor", 0, 0))
      }
      ACTION_START -> if (!running) {
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
                .put("login", data))
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
        .put("running", false).put("paused", false).put("tested", tested.get()).put("total", total)
        .put("panelTested", panelDone.get()).put("panelTotal", panelTotal)
        .put("found", matches.size).put("matches", resultArray))
    } catch (e: Throwable) {
      writeSnapshot(JSONObject().put("running", false).put("error", e.message ?: "Native panel tarama hatası"))
    } finally {
      running = false
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
  }
}
