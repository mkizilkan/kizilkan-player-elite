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

/** The encrypted DB is canonical. A public TXT is a checked, replayable projection. */
object ScanSafetyBackup {
  private val lastWrite = mutableMapOf<String, Long>()
  @Synchronized fun flush(context: Context, journal: ScanJournalStore, runId: String, force: Boolean = true): JSONObject {
    val prefs = context.getSharedPreferences("kizilkan_scan_safety", Context.MODE_PRIVATE)
    val previous = prefs.getString("status:$runId", "{}") ?: "{}"
    if (!force && System.currentTimeMillis() - (lastWrite[runId] ?: 0L) < 3000) return JSONObject(previous)
    if (journal.resultCount(runId) == 0) return JSONObject().put("ok", true).put("count", 0)
    val stage = File(context.cacheDir, "scan-${runId.replace(Regex("[^a-zA-Z0-9_-]"), "_").take(100)}.txt.part")
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
      val existing = prefs.getString("uri:$runId", "").orEmpty()
      val name = "KIZILKAN-TARAMA-${runId.replace(Regex("[^a-zA-Z0-9_-]"), "_").take(100)}.txt"
      val relative = "Download/KIZILKAN PLAYER ELITE/Canlı Tarama Yedeği/"
      val uri = if (existing.isNotBlank()) Uri.parse(existing) else {
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
        check(prefs.edit().putString("uri:$runId", created.toString()).commit()) { "Yedek dosya kimliği kaydedilemedi" }
        created
      }
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
      val status = JSONObject().put("ok", true).put("uri", uri.toString()).put("path", relative + name).put("count", written)
      prefs.edit().putString("status:$runId", status.toString()).commit()
      return status
    } catch (e: Throwable) {
      val status = JSONObject().put("ok", false).put("error", e.message ?: "Yedek yazılamadı").put("count", journal.resultCount(runId))
      prefs.edit().putString("status:$runId", status.toString()).commit()
      return status
    } finally { stage.delete() }
  }
  fun status(context: Context, runId: String) = JSONObject(context.getSharedPreferences("kizilkan_scan_safety", Context.MODE_PRIVATE).getString("status:$runId", "{}") ?: "{}")
}
