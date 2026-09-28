package expo.modules.kizilkannativecore

import android.content.Context
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.channels.FileChannel
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong

/**
 * KIZILKAN PLAYER v18.6.0 — Film/dizi indirme motoru (IDM tarzı parçalı indirme).
 * ===========================================================================
 *  • Tek parça veya çok parçalı (HTTP Range; parça sayısını kullanıcı belirler).
 *  • Duraklat / Devam (parça bazında kaldığı yerden — indirilen bayt korunur).
 *  • Boyut ön sorgusu (indirmeden önce) + Range desteği + hız + kalan süre.
 *  • Görünür klasöre yazar (PublicStorage: Download/KIZILKAN PLAYER ELITE/...).
 *  • Sunucu Range vermezse otomatik TEK parça. Fazla bağlantı reddedilirse (403/
 *    429/456/503) parça sayısı otomatik düşürülür ve yeniden denenir.
 *  • Media3 film/dizi "kaydet" de bu motoru kullanır (film zaten bir dosyadır).
 * Not: IPTV hesapları genelde 1–2 bağlantılıdır; JS parça sayısını hesabın sınırıyla
 * uyarır. Durum diskte kalıcıdır; uygulama yeniden başlarsa kaldığı yerden sürer.
 */
object DownloadEngine {
  private const val STATE_FILE = "downloads_v186.json"
  private const val UA = "KIZILKAN-PLAYER"

  data class Part(val index: Int, val start: Long, val end: Long, @Volatile var done: Long)

  class Job(
    val id: String, val url: String, val headers: Map<String, String>,
    val subdir: String, val fileName: String, val treeUri: String?,
    @Volatile var total: Long, @Volatile var parts: Int,
    @Volatile var uri: String?, @Volatile var path: String?,
  ) {
    @Volatile var state = "queued"     // queued|running|paused|completed|failed|cancelled
    @Volatile var error = ""
    @Volatile var acceptRanges = false
    val received = AtomicLong(0)
    @Volatile var lastTickAt = 0L
    @Volatile var lastTickBytes = 0L
    @Volatile var speed = 0L
    val partList = java.util.Collections.synchronizedList(mutableListOf<Part>())
    @Volatile var pool: java.util.concurrent.ExecutorService? = null
    val cancelFlag = java.util.concurrent.atomic.AtomicBoolean(false)
    val pauseFlag = java.util.concurrent.atomic.AtomicBoolean(false)
  }

  private val jobs = ConcurrentHashMap<String, Job>()
  @Volatile private var restored = false

  // ── Boyut ön sorgusu ────────────────────────────────────────────────────────
  fun probe(url: String, headersJson: String, timeoutMs: Int): JSONObject {
    val out = JSONObject()
    var conn: HttpURLConnection? = null
    return try {
      conn = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = timeoutMs; readTimeout = timeoutMs
        setRequestProperty("User-Agent", UA)
        setRequestProperty("Range", "bytes=0-0")
        applyHeaders(this, headersJson)
      }
      val code = conn.responseCode
      val ranges = code == 206 || conn.getHeaderField("Accept-Ranges")?.contains("bytes", true) == true
      var total = -1L
      val cr = conn.getHeaderField("Content-Range")
      if (cr != null && cr.contains("/")) total = cr.substringAfterLast("/").trim().toLongOrNull() ?: -1L
      if (total <= 0) total = conn.getHeaderField("Content-Length")?.toLongOrNull()?.let { if (code == 206) -1L else it } ?: -1L
      out.put("ok", code in 200..299).put("size", total).put("acceptRanges", ranges)
        .put("mime", conn.contentType ?: "").put("httpCode", code)
    } catch (t: Throwable) {
      out.put("ok", false).put("size", -1L).put("acceptRanges", false).put("error", t.message ?: "")
    } finally { runCatching { conn?.disconnect() } }
  }

  private fun applyHeaders(conn: HttpURLConnection, headersJson: String) {
    runCatching {
      val h = JSONObject(headersJson)
      val keys = h.keys()
      while (keys.hasNext()) { val k = keys.next(); conn.setRequestProperty(k, h.optString(k)) }
    }
  }

  // ── Başlat ──────────────────────────────────────────────────────────────────
  fun start(context: Context, cfgJson: String): JSONObject {
    restoreIfNeeded(context)
    val c = JSONObject(cfgJson)
    val id = c.optString("id").ifBlank { "dl-" + System.currentTimeMillis() }
    if (jobs[id]?.state == "running") return status(context)
    val headers = HashMap<String, String>()
    c.optJSONObject("headers")?.let { val ks = it.keys(); while (ks.hasNext()) { val k = ks.next(); headers[k] = it.optString(k) } }
    val job = Job(
      id, c.getString("url"), headers,
      c.optString("subdir", "Filmler"), c.optString("fileName", "video.mp4"),
      c.optString("treeUri", "").ifBlank { null },
      c.optLong("size", -1L), c.optInt("parts", 1).coerceIn(1, 16),
      null, null,
    )
    jobs[id] = job
    launch(context, job)
    persist(context)
    return status(context)
  }

  private fun launch(context: Context, job: Job) {
    job.state = "running"; job.error = ""; job.cancelFlag.set(false); job.pauseFlag.set(false)
    Thread {
      try {
        // Boyut/Range bilinmiyorsa öğren.
        val pr = probe(job.url, JSONObject(job.headers as Map<*, *>).toString(), 15000)
        if (job.total <= 0) job.total = pr.optLong("size", -1L)
        job.acceptRanges = pr.optBoolean("acceptRanges", false)
        var parts = if (job.acceptRanges && job.total > 0) job.parts.coerceIn(1, 16) else 1
        // Hedef dosya (görünür klasör). Yeniden başlatmada mevcut uri korunur.
        if (job.uri == null) {
          val ext = job.fileName.substringAfterLast('.', "").lowercase()
          val mime = when (ext) { "mkv" -> "video/x-matroska"; "ts" -> "video/mp2t"; "avi" -> "video/x-msvideo"; "webm" -> "video/webm"; "mp3" -> "audio/mpeg"; else -> "video/mp4" }
          val t = PublicStorage.create(context, job.subdir, job.fileName, mime, job.treeUri)
          job.uri = t.uri.toString(); job.path = t.displayPath
        }
        val pfd = PublicStorage.openRw(context, Uri.parse(job.uri))
        // Konumlu yazma (paralel parçalar aynı dosyanın farklı yerlerine): FileChannel.write(buf, pos).
        FileOutputStream(pfd.fileDescriptor).channel.use { raf ->
          if (job.total > 0 && raf.size() != job.total) runCatching { android.system.Os.ftruncate(pfd.fileDescriptor, job.total) }
          // Devam: mevcut parçalar (indirilen bayt) korunur. Range yoksa kaldığı yerden
          // devam edilemez → tek parça baştan.
          if (job.partList.isEmpty() || job.partList.size != parts && job.received.get() == 0L) buildParts(job, parts)
          if (!job.acceptRanges) { for (pt in job.partList) pt.done = 0; job.received.set(0) }
          else job.received.set(job.partList.sumOf { it.done })
          val n = job.partList.size
          job.parts = n
          val pool = Executors.newFixedThreadPool(n); job.pool = pool
          val failures = java.util.Collections.synchronizedList(mutableListOf<Int>())
          val futures = job.partList.map { part ->
            pool.submit { if (!downloadPart(job, part, raf)) failures.add(part.index) }
          }
          for (f in futures) runCatching { f.get() }
          pool.shutdownNow()
          when {
            job.cancelFlag.get() -> { job.state = "cancelled"; PublicStorage.delete(context, Uri.parse(job.uri)); job.uri = null }
            job.pauseFlag.get() -> job.state = "paused"
            failures.isNotEmpty() && parts > 1 -> {
              // Çok parçalı başarısız → tek parçaya düş ve baştan dene (sunucu bağlantı sınırı).
              job.received.set(0); job.partList.clear(); job.parts = 1
              runCatching { pfd.close() }
              relaunchSingle(context, job); return@Thread
            }
            failures.isNotEmpty() -> { job.state = "failed"; job.error = "İndirme tamamlanamadı (parça ${failures.first()})" }
            else -> { job.state = "completed"; PublicStorage.finish(context, Uri.parse(job.uri)) }
          }
        }
        runCatching { pfd.close() }
      } catch (t: Throwable) {
        job.state = "failed"; job.error = t.message ?: "indirme hatası"
      } finally { persist(context) }
    }.apply { isDaemon = true }.start()
  }

  private fun relaunchSingle(context: Context, job: Job) {
    // uri'yi sıfırla ki dosya baştan yazılsın.
    job.uri?.let { PublicStorage.delete(context, Uri.parse(it)) }
    job.uri = null; job.acceptRanges = false
    launch(context, job)
  }

  private fun buildParts(job: Job, parts: Int) {
    job.partList.clear()
    if (job.total <= 0 || parts <= 1 || !job.acceptRanges) {
      job.partList.add(Part(0, 0, -1, 0)); return
    }
    val chunk = job.total / parts
    for (i in 0 until parts) {
      val start = i * chunk
      val end = if (i == parts - 1) job.total - 1 else start + chunk - 1
      job.partList.add(Part(i, start, end, 0))
    }
    job.received.set(0)
  }

  private fun downloadPart(job: Job, part: Part, raf: FileChannel): Boolean {
    var conn: HttpURLConnection? = null
    return try {
      if (job.cancelFlag.get() || job.pauseFlag.get()) return false
      if (part.end >= 0 && part.start + part.done > part.end) return true   // parça zaten bitmiş
      conn = (URL(job.url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 20000; readTimeout = 30000
        setRequestProperty("User-Agent", UA)
        applyHeaders(this, JSONObject(job.headers as Map<*, *>).toString())
        if (part.end >= 0 || part.start > 0) setRequestProperty("Range", "bytes=${part.start + part.done}-" + (if (part.end >= 0) part.end.toString() else ""))
      }
      val code = conn.responseCode
      if (code == 403 || code == 429 || code == 456 || code == 503) return false
      if (code !in 200..299) return false
      val buf = ByteArray(64 * 1024)
      conn.inputStream.use { input ->
        var pos = part.start + part.done
        while (true) {
          if (job.cancelFlag.get() || job.pauseFlag.get()) return false
          val r = input.read(buf); if (r < 0) break
          val bb = ByteBuffer.wrap(buf, 0, r)
          var wpos = pos
          while (bb.hasRemaining()) wpos += raf.write(bb, wpos)
          pos += r; part.done += r; job.received.addAndGet(r.toLong()); tickSpeed(job)
        }
      }
      true
    } catch (_: Throwable) { false } finally { runCatching { conn?.disconnect() } }
  }

  private fun tickSpeed(job: Job) {
    val now = System.currentTimeMillis()
    if (now - job.lastTickAt < 1000) return
    synchronized(job) {
      if (now - job.lastTickAt < 1000) return
      val bytes = job.received.get()
      if (job.lastTickAt > 0) job.speed = ((bytes - job.lastTickBytes) * 1000L / (now - job.lastTickAt)).coerceAtLeast(0)
      job.lastTickAt = now; job.lastTickBytes = bytes
    }
  }

  fun pause(context: Context, id: String): JSONObject { jobs[id]?.let { it.pauseFlag.set(true); it.state = "paused"; it.pool?.shutdownNow() }; persist(context); return status(context) }
  fun resume(context: Context, id: String): JSONObject { jobs[id]?.let { if (it.state == "paused" || it.state == "failed") launch(context, it) }; return status(context) }
  fun cancel(context: Context, id: String): JSONObject {
    jobs[id]?.let { it.cancelFlag.set(true); it.pool?.shutdownNow(); it.uri?.let { u -> PublicStorage.delete(context, Uri.parse(u)) }; jobs.remove(id) }
    persist(context); return status(context)
  }

  fun status(context: Context): JSONObject {
    restoreIfNeeded(context)
    val arr = JSONArray()
    for (j in jobs.values) {
      val received = if (j.state == "completed") j.total.coerceAtLeast(0) else j.received.get()
      val eta = if (j.speed > 0 && j.total > 0) (j.total - received) / j.speed else 0L
      arr.put(JSONObject()
        .put("id", j.id).put("fileName", j.fileName).put("state", j.state).put("error", j.error)
        .put("total", j.total).put("received", received).put("parts", j.parts).put("acceptRanges", j.acceptRanges)
        .put("speed", j.speed).put("etaSec", eta).put("path", j.path ?: "").put("uri", j.uri ?: "")
        .put("subdir", j.subdir))
    }
    return JSONObject().put("downloads", arr)
  }

  // ── Kalıcılık ─────────────────────────────────────────────────────────────
  private fun persist(context: Context) {
    runCatching {
      val arr = JSONArray()
      for (j in jobs.values) {
        if (j.state == "cancelled") continue
        arr.put(JSONObject().put("id", j.id).put("url", j.url).put("headers", JSONObject(j.headers as Map<*, *>))
          .put("subdir", j.subdir).put("fileName", j.fileName).put("treeUri", j.treeUri ?: "")
          .put("total", j.total).put("parts", j.parts).put("uri", j.uri ?: "").put("path", j.path ?: "")
          .put("state", if (j.state == "running") "paused" else j.state).put("received", j.received.get())
          .put("acceptRanges", j.acceptRanges)
          .put("partList", JSONArray(synchronized(j.partList) { j.partList.map { JSONArray().put(it.index).put(it.start).put(it.end).put(it.done) } })))
      }
      File(context.filesDir, STATE_FILE).writeText(arr.toString())
    }
  }
  private fun restoreIfNeeded(context: Context) {
    if (restored) return; restored = true
    runCatching {
      val f = File(context.filesDir, STATE_FILE); if (!f.exists()) return
      val arr = JSONArray(f.readText())
      for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        val headers = HashMap<String, String>()
        o.optJSONObject("headers")?.let { val ks = it.keys(); while (ks.hasNext()) { val k = ks.next(); headers[k] = it.optString(k) } }
        val job = Job(o.getString("id"), o.optString("url"), headers, o.optString("subdir", "Filmler"),
          o.optString("fileName"), o.optString("treeUri", "").ifBlank { null },
          o.optLong("total", -1L), o.optInt("parts", 1), o.optString("uri", "").ifBlank { null }, o.optString("path", "").ifBlank { null })
        job.state = o.optString("state", "paused"); job.received.set(o.optLong("received", 0L))
        job.acceptRanges = o.optBoolean("acceptRanges", false)
        o.optJSONArray("partList")?.let { pl -> for (k in 0 until pl.length()) { val a = pl.optJSONArray(k) ?: continue
          job.partList.add(Part(a.optInt(0), a.optLong(1), a.optLong(2), a.optLong(3))) } }
        jobs[job.id] = job
      }
    }
  }
}
