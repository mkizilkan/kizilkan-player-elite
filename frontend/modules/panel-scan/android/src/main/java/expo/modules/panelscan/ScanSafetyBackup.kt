package expo.modules.panelscan

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/** The encrypted DB is canonical. A public TXT is a checked, replayable projection. */
object ScanSafetyBackup {
  private val lastWrite = mutableMapOf<String, Long>()
  private val writer = Executors.newSingleThreadScheduledExecutor()
  private val queueLock = Any()
  private val queued = mutableMapOf<String, ScheduledFuture<*>>()
  private val generations = mutableMapOf<String, Long>()

  /** Scan workers commit the encrypted row immediately; public file work never blocks them. */
  fun request(context: Context, journal: ScanJournalStore, runId: String): JSONObject {
    val app = context.applicationContext
    synchronized(queueLock) {
      generations[runId] = (generations[runId] ?: 0L) + 1L
      if (queued[runId]?.isDone != false) {
        val first = !status(app, runId).has("ok")
        queued[runId] = writer.schedule({
          val generation = synchronized(queueLock) { generations[runId] ?: 0L }
          flush(app, journal, runId)
          val dirty = synchronized(queueLock) { queued.remove(runId); (generations[runId] ?: 0L) != generation }
          // Results can arrive during a projection. Replay the tail even if no new scan hit arrives.
          val saved = status(app, runId)
          if (saved.optBoolean("ok") && (dirty || journal.resultCount(runId) > saved.optInt("count", 0))) request(app, journal, runId)
        }, if (first) 0L else 3000L, TimeUnit.MILLISECONDS)
      }
    }
    return status(app, runId).put("databaseCount", journal.resultCount(runId)).put("writing", true)
  }
  @Synchronized fun flush(context: Context, journal: ScanJournalStore, runId: String, force: Boolean = true): JSONObject {
    val prefs = context.getSharedPreferences("kizilkan_scan_safety", Context.MODE_PRIVATE)
    val previous = prefs.getString("status:$runId", "{}") ?: "{}"
    if (!force && System.currentTimeMillis() - (lastWrite[runId] ?: 0L) < 3000) return JSONObject(previous)
    if (journal.resultCount(runId) == 0) return JSONObject().put("state", "waiting").put("count", 0)
    val stage = File(context.cacheDir, "scan-${runId.replace(Regex("[^a-zA-Z0-9_-]"), "_").take(100)}.txt.part")
    var pendingUri: Uri? = null
    try {
      val digest = MessageDigest.getInstance("SHA-256")
      var written = 0
      stage.outputStream().buffered().use { out ->
        fun write(text: String) { val bytes = text.toByteArray(Charsets.UTF_8); out.write(bytes); digest.update(bytes) }
        write("KIZILKAN TARAMA EMNIYET YEDEGI\nRun: $runId\nHer satir kalici analiz sonucunun JSON kaydidir. Katalog sonucu yayin/ilk kare kaniti degildir.\n")
        var cursor = 0L
        do {
          val page = journal.resultsPage(runId, cursor, 100)
          val matches = page.getJSONArray("matches")
          for (i in 0 until matches.length()) { write(matches.getJSONObject(i).toString() + "\n"); written++ }
          cursor = page.getLong("nextCursor")
        } while (page.getBoolean("hasMore"))
      }
      check(written > 0) { "Kalıcı sonuçlar varken emniyet dosyası boş üretildi" }
      val name = "KIZILKAN-TARAMA-${runId.replace(Regex("[^a-zA-Z0-9_-]"), "_").take(100)}-${System.currentTimeMillis()}.txt"
      val relative = "Download/KIZILKAN PLAYER ELITE/Canlı Tarama Yedeği/"
      val uri = run {
        val created = if (Build.VERSION.SDK_INT >= 29) {
          val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name); put(MediaStore.MediaColumns.MIME_TYPE, "text/plain")
            put(MediaStore.MediaColumns.RELATIVE_PATH, relative); put(MediaStore.MediaColumns.IS_PENDING, 1)
          }
          context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: error("Yedek hedefi oluşturulamadı")
        } else {
          @Suppress("DEPRECATION") val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "KIZILKAN PLAYER ELITE/Canlı Tarama Yedeği").apply { check(mkdirs() || isDirectory) }
          Uri.fromFile(File(dir, name))
        }
        created
      }
      pendingUri = uri
      context.contentResolver.openOutputStream(uri, "wt")?.use { out -> stage.inputStream().use { it.copyTo(out, 64 * 1024) }; out.flush() } ?: error("Yedek dosyası açılamadı")
      val actual = MessageDigest.getInstance("SHA-256")
      context.contentResolver.openInputStream(uri)?.use { input ->
        val b = ByteArray(64 * 1024)
        while (true) { val n = input.read(b); if (n < 0) break; actual.update(b, 0, n) }
      } ?: error("Yedek geri okunamadı")
      check(actual.digest().contentEquals(digest.digest())) { "Emniyet yedeği yazımı doğrulanamadı" }
      if (Build.VERSION.SDK_INT >= 29 && uri.authority == MediaStore.AUTHORITY) {
        check(context.contentResolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null) == 1) { "Yedek görünür yapılamadı" }
      }
      lastWrite[runId] = System.currentTimeMillis()
      val previousUri = prefs.getString("uri:$runId", "").orEmpty()
      val retiredUri = prefs.getString("previousUri:$runId", "").orEmpty()
      val status = JSONObject().put("ok", true).put("state", "written").put("uri", uri.toString()).put("path", relative + name)
        .put("count", written).put("bytes", stage.length()).put("writtenAt", System.currentTimeMillis())
      check(prefs.edit().putString("previousUri:$runId", previousUri).putString("uri:$runId", uri.toString())
        .putString("status:$runId", status.toString()).commit()) { "Doğrulanmış yedek kimliği kaydedilemedi" }
      pendingUri = null
      // Keep the previous good generation; retire only an older URI created by this exporter.
      if (retiredUri.isNotBlank() && retiredUri != previousUri && retiredUri != uri.toString()) runCatching {
        val retired = Uri.parse(retiredUri)
        if (retired.scheme == "file") File(retired.path ?: "").delete() else context.contentResolver.delete(retired, null, null)
      }
      return status
    } catch (e: Throwable) {
      val status = JSONObject(previous).put("ok", false).put("state", "error").put("error", e.javaClass.simpleName + ": " + (e.message ?: "Yedek yazılamadı"))
        .put("databaseCount", journal.resultCount(runId))
      prefs.edit().putString("status:$runId", status.toString()).commit()
      return status
    } finally {
      pendingUri?.let { uri -> runCatching { if (uri.scheme == "file") File(uri.path ?: "").delete() else context.contentResolver.delete(uri, null, null) } }
      stage.delete()
    }
  }
  fun status(context: Context, runId: String) = JSONObject(context.getSharedPreferences("kizilkan_scan_safety", Context.MODE_PRIVATE).getString("status:$runId", "{}") ?: "{}")
}
