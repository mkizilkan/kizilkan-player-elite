package expo.modules.kizilkannativecore

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.Context
import android.os.Build
import android.os.IBinder
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * v15.2.3-RC1 — Çoklu hesap ekleme için gerçek native foreground pipeline.
 *
 * Amaç:
 * - JS thread uzun Xtream katalog indirme/JSON normalize/yazma işini taşımaz.
 * - Uygulama arka plana alındığında foreground service çalışmaya devam eder.
 * - Her hesap bağımsız job'dur; tek sorunlu hesap diğerlerini bloke etmez.
 * - Başarılı hesaplar Room/SQLite canonical store'a atomik/kalıcı yazılır; eski legacy heavy kopya doğrulama sonrası temizlenir.
 * - SharedPreferences snapshot'a parola/token yazılmaz.
 */
class BulkPlaylistImportService : Service() {
  companion object {
    const val ACTION_START = "expo.modules.kizilkannativecore.BULK_IMPORT_START"
    const val ACTION_PAUSE = "expo.modules.kizilkannativecore.BULK_IMPORT_PAUSE"
    const val ACTION_RESUME = "expo.modules.kizilkannativecore.BULK_IMPORT_RESUME"
    const val ACTION_CANCEL = "expo.modules.kizilkannativecore.BULK_IMPORT_CANCEL"
    const val PREFS = "kizilkan_native_bulk_import"
    const val KEY_SNAPSHOT = "snapshot"
    const val CHANNEL_ID = "kizilkan_bulk_import"
    const val NOTIF_ID = 15022
    private const val BATCH_SIZE = 750

    fun seedStartingSnapshot(context: Context, runId: String) {
      val now = System.currentTimeMillis()
      val obj = JSONObject()
        .put("runId", runId)
        .put("state", "STARTING")
        .put("running", true)
        .put("paused", false)
        .put("cancelled", false)
        .put("completed", 0)
        .put("failed", 0)
        .put("total", 0)
        .put("jobs", JSONArray())
        .put("createdAt", now)
        .put("updatedAt", now)
      context.getSharedPreferences(PREFS, 0).edit().putString(KEY_SNAPSHOT, obj.toString()).commit()
    }
  }

  private val cancelled = AtomicBoolean(false)
  private val paused = AtomicBoolean(false)
  @Volatile private var running = false
  @Volatile private var currentRunId = ""
  private val statusMap = ConcurrentHashMap<String, JSONObject>()

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT >= 26) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Playlist ekleme", NotificationManager.IMPORTANCE_LOW)
      )
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
      ACTION_PAUSE -> if (running) {
        paused.set(true)
        publishSnapshot()
        notifyNow("Playlist ekleme duraklatıldı", 0, 0)
      }
      ACTION_RESUME -> if (running) {
        paused.set(false)
        publishSnapshot()
        notifyNow("Playlist ekleme devam ediyor", 0, 0)
      }
      ACTION_CANCEL -> {
        cancelled.set(true)
        paused.set(false)
        publishSnapshot(cancelledValue = true)
      }
      ACTION_START -> if (!running) {
        currentRunId = intent.getStringExtra("runId") ?: java.util.UUID.randomUUID().toString()
        val jobsJson = intent.getStringExtra("jobsJson") ?: "[]"
        val concurrency = intent.getIntExtra("concurrency", 2).coerceIn(1, 4)
        running = true
        cancelled.set(false)
        paused.set(false)
        statusMap.clear()
        val total = try { JSONArray(jobsJson).length() } catch (_: Throwable) { 0 }
        writeSnapshot(JSONObject().put("running", true).put("paused", false).put("cancelled", false)
          .put("completed", 0).put("failed", 0).put("total", total).put("jobs", JSONArray()))
        startForeground(NOTIF_ID, notification("Playlistler ekleniyor…", 0, total))
        Thread { runJobs(jobsJson, concurrency) }.start()
      }
    }
    return START_NOT_STICKY
  }

  private fun runJobs(jobsRaw: String, concurrency: Int) {
    val completed = AtomicInteger(0)
    val failed = AtomicInteger(0)
    try {
      val jobs = JSONArray(jobsRaw)
      val total = jobs.length()
      if (total == 0) throw IllegalArgumentException("Eklenecek hesap yok")
      for (i in 0 until total) {
        val j = jobs.getJSONObject(i)
        val key = j.optString("jobKey", "job-$i")
        statusMap[key] = status(key, j.optString("displayName", "Hesap ${i + 1}"), "waiting", "Bekliyor")
      }
      publishSnapshot(completed.get(), failed.get(), total)

      val cursor = AtomicInteger(0)
      val pool = Executors.newFixedThreadPool(concurrency.coerceAtMost(total))
      repeat(concurrency.coerceAtMost(total)) {
        pool.submit {
          while (!cancelled.get()) {
            awaitIfPaused()
            if (cancelled.get()) break
            val idx = cursor.getAndIncrement()
            if (idx >= total) break
            val job = jobs.getJSONObject(idx)
            val key = job.optString("jobKey", "job-$idx")
            val name = job.optString("displayName", "Hesap ${idx + 1}")
            try {
              updateStatus(key, name, "validating", "Kimlik doğrulanıyor")
              val result = importOne(job, key, name)
              statusMap[key] = result.put("state", "completed").put("message", "Kaydedildi")
              completed.incrementAndGet()
            } catch (e: Throwable) {
              val existing = statusMap[key] ?: status(key, name, "failed", e.message ?: "Ekleme hatası")
              existing.put("state", "failed").put("message", e.message ?: "Ekleme hatası")
              statusMap[key] = existing
              failed.incrementAndGet()
            }
            val done = completed.get() + failed.get()
            publishSnapshot(completed.get(), failed.get(), total)
            notifyNow("$done/$total playlist işlendi", done, total)
          }
        }
      }
      pool.shutdown()
      while (!pool.isTerminated) Thread.sleep(120)
      publishSnapshot(completed.get(), failed.get(), total, runningValue = false, cancelledValue = cancelled.get())
    } catch (e: Throwable) {
      writeSnapshot(JSONObject().put("running", false).put("paused", false).put("error", e.message ?: "Native playlist ekleme hatası"))
    } finally {
      running = false
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
  }

  private data class EndpointResult(val name: String, val data: JSONArray, val error: String? = null)

  private fun fetchArrayDetailed(name: String, url: String, timeout: Int): EndpointResult {
    var last: Throwable? = null
    repeat(2) { attempt ->
      try {
        return EndpointResult(name, fetchArray(url, timeout), null)
      } catch (e: Throwable) {
        last = e
        if (attempt == 0) {
          awaitIfPaused()
          try { Thread.sleep(350L) } catch (_: InterruptedException) { throw e }
        }
      }
    }
    return EndpointResult(name, JSONArray(), last?.message ?: last?.javaClass?.simpleName ?: "Bilinmeyen endpoint hatası")
  }

  private fun diagnosticsJson(results: List<EndpointResult>): JSONObject {
    val out = JSONObject()
    for (r in results) {
      out.put(r.name, JSONObject()
        .put("ok", r.error == null)
        .put("count", r.data.length())
        .put("error", r.error ?: JSONObject.NULL))
    }
    return out
  }

  private fun importOne(job: JSONObject, key: String, displayName: String): JSONObject {
    val playlistId = job.getString("playlistId")
    val server = job.getString("server").trim().trimEnd('/')
    val username = job.getString("username")
    val password = job.getString("password")

    awaitIfPaused()
    val login = fetchObject(apiUrl(server, username, password, null), 30_000)
    val ui = login.optJSONObject("user_info") ?: throw IllegalStateException("Geçersiz Xtream yanıtı")
    val auth = ui.opt("auth")?.toString()
    if (auth == "0" || auth == "false") throw IllegalStateException("Kullanıcı adı veya şifre hatalı")

    updateStatus(key, displayName, "downloading", "Kataloglar paralel indiriliyor")
    val ioPool = Executors.newFixedThreadPool(6)
    try {
      val liveF = ioPool.submit<EndpointResult> { fetchArrayDetailed("live", apiUrl(server, username, password, "get_live_streams"), 120_000) }
      val liveCatsF = ioPool.submit<EndpointResult> { fetchArrayDetailed("liveCategories", apiUrl(server, username, password, "get_live_categories"), 60_000) }
      val vodF = ioPool.submit<EndpointResult> { fetchArrayDetailed("vod", apiUrl(server, username, password, "get_vod_streams"), 120_000) }
      val vodCatsF = ioPool.submit<EndpointResult> { fetchArrayDetailed("vodCategories", apiUrl(server, username, password, "get_vod_categories"), 60_000) }
      val seriesF = ioPool.submit<EndpointResult> { fetchArrayDetailed("series", apiUrl(server, username, password, "get_series"), 120_000) }
      val seriesCatsF = ioPool.submit<EndpointResult> { fetchArrayDetailed("seriesCategories", apiUrl(server, username, password, "get_series_categories"), 60_000) }

      val liveR = liveF.get(); val liveCatsR = liveCatsF.get()
      val liveRaw = liveR.data; val liveCats = categoryMap(liveCatsR.data)
      updateStatus(key, displayName, "normalizing", "Canlı ${liveRaw.length()} · Film/Dizi bekleniyor")
      awaitIfPaused()
      val vodR = vodF.get(); val vodCatsR = vodCatsF.get()
      val seriesR = seriesF.get(); val seriesCatsR = seriesCatsF.get()
      val vodRaw = vodR.data; val vodCats = categoryMap(vodCatsR.data)
      val seriesRaw = seriesR.data; val seriesCats = categoryMap(seriesCatsR.data)
      val endpointResults = listOf(liveR, liveCatsR, vodR, vodCatsR, seriesR, seriesCatsR)
      // v16.13.10: Login başarılıyken desteklenmeyen VOD/Series endpointinin 404
      // dönmesi çalışan Live kataloğunu iptal etmez. 401/403/timeout/5xx fatal kalır.
      fun isUnsupported404(r: EndpointResult): Boolean = r.error?.let { Regex("(^|\\D)404(\\D|$)").containsMatchIn(it) } == true
      if (liveR.error != null) throw IllegalStateException("Xtream canlı katalog alınamadı; mevcut veri korunuyor: ${liveR.error}")
      val contentFailures = listOf(vodR, seriesR).filter { it.error != null && !isUnsupported404(it) }
      if (contentFailures.isNotEmpty()) {
        val failures = contentFailures.joinToString("; ") { "${it.name}: ${it.error}" }
        throw IllegalStateException("Xtream katalog doğrulaması başarısız; mevcut veri korunuyor: $failures")
      }
      val diagnostics = diagnosticsJson(endpointResults)
      statusMap[key]?.put("endpointDiagnostics", diagnostics)
      publishSnapshot()

      val channels = normalizeLive(liveRaw, liveCats, server, username, password)
      val vod = normalizeVod(vodRaw, vodCats, server, username, password)
      val series = normalizeSeries(seriesRaw, seriesCats)
      if (channels.length() + vod.length() + series.length() == 0) {
        val failures = endpointResults.filter { it.error != null }.joinToString("; ") { "${it.name}: ${it.error}" }
        throw IllegalStateException(if (failures.isNotBlank()) "İçerik endpointleri başarısız: $failures" else "Hiç içerik bulunamadı")
      }

      updateStatus(key, displayName, "persisting", "Room/SQLite indeksleniyor")
      awaitIfPaused()
      persistPlaylist(playlistId, channels, vod, series)

      return status(key, displayName, "completed", "Kaydedildi")
        .put("playlistId", playlistId)
        .put("channels", channels.length())
        .put("vod", vod.length())
        .put("series", series.length())
        .put("endpointDiagnostics", diagnostics)
        .put("userInfo", sanitizeUserInfo(ui))
        .put("serverInfo", sanitizeJson(login.optJSONObject("server_info") ?: JSONObject()))
    } finally {
      ioPool.shutdownNow()
    }
  }

  private fun persistPlaylist(id: String, channels: JSONArray, vod: JSONArray, series: JSONArray) {
    // v15.2.4: Room/SQLite canonical store. Bulk import artık aynı katalogu
    // ikinci kez legacy heavy JSON dosyasına yazmaz. Backup/legacy hydrate
    // gerektiğinde Native Core Room'dan yeniden oluşturur.
    val db = KizilkanNativeDatabase.get(applicationContext)
    val started = android.os.SystemClock.elapsedRealtime()
    db.runInTransaction {
      val dao = db.mediaDao()
      dao.deletePlaylist(id)
      insertCollection(dao, id, "live", channels)
      insertCollection(dao, id, "vod", vod)
      insertCollection(dao, id, "series", series)
      db.snapshotDao().put(
        PlaylistSnapshotEntity(
          playlistId = id,
          sourceStamp = 0L,
          sourceSize = 0L,
          channelsCount = channels.length(),
          vodCount = vod.length(),
          seriesCount = series.length(),
          importedAtEpochMs = System.currentTimeMillis(),
          importMs = android.os.SystemClock.elapsedRealtime() - started,
        )
      )
    }
    // Önceki sürümden kalan duplicate heavy dosya varsa yalnız başarılı Room
    // transaction sonrasında temizle.
    val safe = id.replace(Regex("[^a-zA-Z0-9_.-]"), "_")
    val legacy = File(filesDir, "kizilkan/playlists/$safe.json")
    if (legacy.exists()) legacy.delete()
  }

  private fun insertCollection(dao: MediaItemDao, playlistId: String, kind: String, arr: JSONArray) {
    val batch = ArrayList<MediaItemEntity>(BATCH_SIZE)
    for (i in 0 until arr.length()) {
      val obj = arr.optJSONObject(i) ?: continue
      val itemId = obj.optString("id", "row-$i")
      val name = obj.optString("name", "")
      val group = obj.optString("group", "Diğer")
      val search = normalizeSearch(listOf(name, group, obj.optString("tvg_name"), obj.optString("genre"), obj.optString("cast"), obj.optString("director")).joinToString(" "))
      batch.add(MediaItemEntity("$playlistId|$kind|$itemId|$i", playlistId, kind, itemId, name, normalizeSearch(name), group, search, i, obj.toString()))
      if (batch.size >= BATCH_SIZE) { dao.insertAll(batch.toList()); batch.clear() }
    }
    if (batch.isNotEmpty()) dao.insertAll(batch)
  }

  private fun normalizeLive(raw: JSONArray, cats: Map<String, String>, server: String, user: String, pass: String): JSONArray {
    val out = JSONArray()
    for (i in 0 until raw.length()) {
      val s = raw.optJSONObject(i) ?: continue
      val sid = s.opt("stream_id")?.toString() ?: continue
      val ext = s.optString("container_extension", "ts").ifBlank { "ts" }
      out.put(JSONObject()
        .put("id", "xt-live-$sid").put("name", s.optString("name", "Kanal"))
        .put("group", cats[s.opt("category_id")?.toString()] ?: "Genel")
        .put("logo", nullable(s.optString("stream_icon"))).put("tvg_id", nullable(s.optString("epg_channel_id")))
        .put("tvg_name", s.optString("name", "Kanal")).put("epg_channel_id", nullable(s.optString("epg_channel_id")))
        .put("url", "$server/live/${enc(user)}/${enc(pass)}/$sid.$ext")
        .put("container_ext", ext).put("stream_id", sid).put("tv_archive", s.optInt("tv_archive", 0))
        .put("tv_archive_duration", s.optInt("tv_archive_duration", 0)).put("num", s.opt("num") ?: JSONObject.NULL).put("source", "xtream"))
    }
    return out
  }

  private fun normalizeVod(raw: JSONArray, cats: Map<String, String>, server: String, user: String, pass: String): JSONArray {
    val out = JSONArray()
    for (i in 0 until raw.length()) {
      val v = raw.optJSONObject(i) ?: continue
      val sid = v.opt("stream_id")?.toString() ?: continue
      val ext = v.optString("container_extension", "mp4").ifBlank { "mp4" }
      val backdrop = when (val b = v.opt("backdrop_path")) { is JSONArray -> b.optString(0, ""); else -> b?.toString() ?: "" }
      out.put(JSONObject()
        .put("id", "xt-vod-$sid").put("name", v.optString("name", "Film"))
        .put("group", cats[v.opt("category_id")?.toString()] ?: "Genel").put("poster", nullable(v.optString("stream_icon")))
        .put("year", nullableAny(v.opt("year"))).put("rating_5based", nullableAny(v.opt("rating_5based")))
        .put("youtube_trailer", nullable(v.optString("youtube_trailer"))).put("backdrop_path", nullable(backdrop))
        .put("duration", nullableAny(v.opt("duration") ?: v.opt("episode_run_time"))).put("age", nullableAny(v.opt("age")))
        .put("added", nullable(v.optString("added"))).put("release_date", nullable(v.optString("release_date").ifBlank { v.optString("releaseDate") }))
        .put("country", nullable(v.optString("country"))).put("rating", nullableAny(v.opt("rating"))).put("plot", nullable(v.optString("plot")))
        .put("cast", nullable(v.optString("cast"))).put("director", nullable(v.optString("director"))).put("genre", nullable(v.optString("genre")))
        .put("container_ext", ext).put("stream_id", sid).put("url", "$server/movie/${enc(user)}/${enc(pass)}/$sid.$ext"))
    }
    return out
  }

  private fun normalizeSeries(raw: JSONArray, cats: Map<String, String>): JSONArray {
    val out = JSONArray()
    for (i in 0 until raw.length()) {
      val s = raw.optJSONObject(i) ?: continue
      val sid = s.opt("series_id")?.toString() ?: continue
      val backdrop = when (val b = s.opt("backdrop_path")) { is JSONArray -> b.optString(0, ""); else -> b?.toString() ?: "" }
      out.put(JSONObject()
        .put("id", "xt-series-$sid").put("series_id", sid).put("name", s.optString("name", "Dizi"))
        .put("group", cats[s.opt("category_id")?.toString()] ?: "Genel").put("poster", nullable(s.optString("cover")))
        .put("plot", nullable(s.optString("plot"))).put("cast", nullable(s.optString("cast"))).put("director", nullable(s.optString("director")))
        .put("genre", nullable(s.optString("genre"))).put("release_date", nullable(s.optString("release_date").ifBlank { s.optString("releaseDate") }))
        .put("rating", nullableAny(s.opt("rating"))).put("rating_5based", nullableAny(s.opt("rating_5based")))
        .put("youtube_trailer", nullable(s.optString("youtube_trailer"))).put("backdrop_path", nullable(backdrop))
        .put("duration", nullableAny(s.opt("duration") ?: s.opt("episode_run_time"))).put("age", nullableAny(s.opt("age")))
        .put("added", nullable(s.optString("last_modified").ifBlank { s.optString("added") })).put("country", nullable(s.optString("country"))))
    }
    return out
  }

  private fun apiUrl(server: String, user: String, pass: String, action: String?): String {
    val suffix = if (action.isNullOrBlank()) "" else "&action=${enc(action)}"
    return "$server/player_api.php?username=${enc(user)}&password=${enc(pass)}$suffix"
  }

  private fun fetchObject(url: String, timeout: Int): JSONObject = JSONTokener(fetchText(url, timeout)).nextValue() as? JSONObject
    ?: throw IllegalStateException("JSON nesnesi bekleniyordu")
  private fun fetchArray(url: String, timeout: Int): JSONArray = JSONTokener(fetchText(url, timeout)).nextValue() as? JSONArray
    ?: throw IllegalStateException("JSON dizi bekleniyordu")

  private fun fetchText(url: String, timeout: Int): String {
    awaitIfPaused()
    var conn: HttpURLConnection? = null
    try {
      conn = URL(url).openConnection() as HttpURLConnection
      conn.connectTimeout = timeout
      conn.readTimeout = timeout
      conn.requestMethod = "GET"
      conn.setRequestProperty("Accept", "application/json")
      conn.setRequestProperty("User-Agent", "KIZILKAN-PLAYER-ELITE/15.2.14")
      val code = conn.responseCode
      if (code !in 200..299) throw IllegalStateException("HTTP $code")
      return conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
    } finally { conn?.disconnect() }
  }

  private fun categoryMap(arr: JSONArray): Map<String, String> {
    val out = HashMap<String, String>()
    for (i in 0 until arr.length()) {
      val c = arr.optJSONObject(i) ?: continue
      out[c.opt("category_id")?.toString() ?: continue] = c.optString("category_name", "Genel")
    }
    return out
  }

  private fun sanitizeUserInfo(src: JSONObject): JSONObject {
    val allowed = setOf("username", "status", "exp_date", "is_trial", "active_cons", "max_connections", "created_at", "allowed_output_formats", "message")
    val out = JSONObject()
    for (k in allowed) if (src.has(k)) out.put(k, src.opt(k))
    return out
  }
  private fun sanitizeJson(src: JSONObject): JSONObject {
    val deny = setOf("password", "pass", "token", "authorization", "auth_token", "access_token")
    val out = JSONObject(); val it = src.keys()
    while (it.hasNext()) { val k = it.next(); if (!deny.contains(k.lowercase(Locale.ROOT))) out.put(k, src.opt(k)) }
    return out
  }

  private fun status(key: String, name: String, state: String, message: String) = JSONObject()
    .put("jobKey", key).put("displayName", name).put("state", state).put("message", message)

  private fun updateStatus(key: String, name: String, state: String, message: String) {
    statusMap[key] = (statusMap[key] ?: status(key, name, state, message)).put("state", state).put("message", message)
    publishSnapshot()
  }

  @Synchronized private fun publishSnapshot(completed: Int? = null, failed: Int? = null, total: Int? = null, runningValue: Boolean = running && !cancelled.get(), cancelledValue: Boolean = cancelled.get()) {
    val jobs = JSONArray(); statusMap.values.sortedBy { it.optString("displayName") }.forEach { jobs.put(it) }
    val c = completed ?: statusMap.values.count { it.optString("state") == "completed" }
    val f = failed ?: statusMap.values.count { it.optString("state") == "failed" }
    val t = total ?: statusMap.size
    writeSnapshot(JSONObject().put("running", runningValue).put("paused", paused.get()).put("cancelled", cancelledValue)
      .put("completed", c).put("failed", f).put("total", t).put("jobs", jobs))
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

  private fun notifyNow(text: String, progress: Int, max: Int) {
    getSystemService(NotificationManager::class.java).notify(NOTIF_ID, notification(text, progress, max))
  }

  private fun awaitIfPaused() {
    while (paused.get() && !cancelled.get()) Thread.sleep(120)
    if (cancelled.get()) throw InterruptedException("Kullanıcı tarafından durduruldu")
  }

  private fun enc(v: String) = URLEncoder.encode(v, "UTF-8")
  private fun nullable(v: String): Any = if (v.isBlank()) JSONObject.NULL else v
  private fun nullableAny(v: Any?): Any = when (v) { null, JSONObject.NULL, "" -> JSONObject.NULL; else -> v }
  private fun normalizeSearch(v: String) = java.text.Normalizer.normalize(v, java.text.Normalizer.Form.NFD)
    .replace(Regex("\\p{Mn}+"), "").lowercase(Locale.ROOT).replace('ı', 'i').trim()
}
