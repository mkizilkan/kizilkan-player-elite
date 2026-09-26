package expo.modules.kizilkannativecore

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.DocumentsContract
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.Locale

/**
 * v18.1.0 — YEREL MEDYA KÜTÜPHANESİ (Android SAF / USB / SD).
 *
 * 1) listChildrenJson: Bir klasörün TÜM çocuklarını TEK bir DocumentsContract
 *    sorgusuyla (ad, MIME, boyut, tarih, klasör mü) döndürür. Eski yol her alt
 *    öğe için ayrı readDirectoryAsync çağrısı yapıyordu (N IPC → büyük USB
 *    klasöründe saniyeler). Yalnız klasörler ve ses/video dosyaları döner.
 * 2) mediaInfo: MediaMetadataRetriever ile süre, başlık/sanatçı/albüm, çözünürlük
 *    ve kapak (ses: gömülü kapak, video: bir kare). Kapak ≤ 360 px JPEG olarak
 *    uygulama önbelleğine yazılır; aynı dosya için tekrar çıkarılmaz.
 *
 * Yeni paket yok; yalnız Android framework API'leri.
 */
internal class LocalMediaLibrary(private val context: Context) {
  companion object {
    private val VIDEO_EXT = setOf("mp4", "mkv", "avi", "mov", "m4v", "webm", "ts", "m2ts", "mts", "mpg", "mpeg", "3gp", "flv", "wmv", "vob")
    private val AUDIO_EXT = setOf("mp3", "flac", "aac", "m4a", "ogg", "oga", "opus", "wav", "wma", "amr", "mka", "alac", "aiff", "aif")
    // v18.2.0: videonun yanındaki dış altyazı dosyaları (liste ekranında gösterilmez, videoya bağlanır).
    private val SUBTITLE_EXT = setOf("srt", "vtt")
    private const val ART_MAX_PX = 360
  }

  private val artDir: File by lazy { File(context.cacheDir, "kizilkan-local-art").apply { mkdirs() } }

  private fun extOf(name: String): String {
    val dot = name.lastIndexOf('.')
    return if (dot >= 0 && dot < name.length - 1) name.substring(dot + 1).lowercase(Locale.ROOT) else ""
  }

  private fun mediaKind(name: String, mime: String): String? {
    val ext = extOf(name)
    if (ext in VIDEO_EXT || mime.startsWith("video/")) return "video"
    if (ext in AUDIO_EXT || mime.startsWith("audio/")) return "audio"
    if (ext in SUBTITLE_EXT) return "subtitle"
    return null
  }

  fun listChildrenJson(uriStr: String): String {
    val started = SystemClock.elapsedRealtime()
    val out = JSONObject()
    try {
      val uri = Uri.parse(uriStr)
      val parentDocId = if (DocumentsContract.isDocumentUri(context, uri)) DocumentsContract.getDocumentId(uri)
        else DocumentsContract.getTreeDocumentId(uri)
      val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(uri, parentDocId)
      val projection = arrayOf(
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        DocumentsContract.Document.COLUMN_MIME_TYPE,
        DocumentsContract.Document.COLUMN_SIZE,
        DocumentsContract.Document.COLUMN_LAST_MODIFIED,
      )
      val entries = JSONArray()
      var skipped = 0
      var total = 0
      context.contentResolver.query(childrenUri, projection, null, null, null)?.use { c ->
        val iId = c.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
        val iName = c.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
        val iMime = c.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
        val iSize = c.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE)
        val iMod = c.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
        while (c.moveToNext()) {
          total += 1
          val docId = if (iId >= 0) c.getString(iId) else null
          if (docId.isNullOrBlank()) { skipped += 1; continue }
          val name = (if (iName >= 0) c.getString(iName) else null) ?: docId.substringAfterLast('/')
          val mime = (if (iMime >= 0) c.getString(iMime) else null) ?: ""
          val isDir = mime == DocumentsContract.Document.MIME_TYPE_DIR
          val kind = if (isDir) "dir" else mediaKind(name, mime)
          if (kind == null || name.startsWith(".")) { skipped += 1; continue }
          val childUri = DocumentsContract.buildDocumentUriUsingTree(uri, docId)
          entries.put(JSONObject().apply {
            put("uri", childUri.toString())
            put("name", name)
            put("kind", kind)
            put("mime", mime)
            put("ext", if (isDir) "" else extOf(name))
            put("size", if (iSize >= 0 && !c.isNull(iSize)) c.getLong(iSize) else -1L)
            put("modified", if (iMod >= 0 && !c.isNull(iMod)) c.getLong(iMod) else 0L)
          })
        }
      } ?: throw IllegalStateException("QUERY_NULL")
      out.put("ok", true)
      out.put("entries", entries)
      out.put("total", total)
      out.put("skipped", skipped)
    } catch (t: Throwable) {
      out.put("ok", false)
      out.put("error", (t.message ?: t.javaClass.simpleName).take(200))
      out.put("entries", JSONArray())
    }
    out.put("elapsedMs", SystemClock.elapsedRealtime() - started)
    return out.toString()
  }

  private fun sha1(value: String): String =
    MessageDigest.getInstance("SHA-1").digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

  private fun scaleDown(src: Bitmap): Bitmap {
    val w = src.width
    val h = src.height
    val longest = maxOf(w, h)
    if (longest <= ART_MAX_PX) return src
    val ratio = ART_MAX_PX.toFloat() / longest
    return Bitmap.createScaledBitmap(src, (w * ratio).toInt().coerceAtLeast(1), (h * ratio).toInt().coerceAtLeast(1), true)
  }

  private fun writeArt(bitmap: Bitmap, file: File): Boolean = try {
    FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 82, it) }
    true
  } catch (_: Throwable) {
    try { file.delete() } catch (_: Throwable) {}
    false
  }

  fun mediaInfo(uriStr: String): Map<String, Any> {
    val started = SystemClock.elapsedRealtime()
    val result = LinkedHashMap<String, Any>()
    val artFile = File(artDir, sha1(uriStr) + ".jpg")
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(context, Uri.parse(uriStr))
      fun meta(key: Int): String = try { retriever.extractMetadata(key) ?: "" } catch (_: Throwable) { "" }
      val durationMs = meta(MediaMetadataRetriever.METADATA_KEY_DURATION).toLongOrNull() ?: 0L
      val hasVideo = meta(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO) == "yes"
      val hasAudio = meta(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO) == "yes"
      result["ok"] = true
      result["durationMs"] = durationMs
      result["hasVideo"] = hasVideo
      result["hasAudio"] = hasAudio
      result["title"] = meta(MediaMetadataRetriever.METADATA_KEY_TITLE)
      result["artist"] = meta(MediaMetadataRetriever.METADATA_KEY_ARTIST).ifBlank { meta(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST) }
      result["album"] = meta(MediaMetadataRetriever.METADATA_KEY_ALBUM)
      result["width"] = meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH).toIntOrNull() ?: 0
      result["height"] = meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT).toIntOrNull() ?: 0
      result["bitrate"] = meta(MediaMetadataRetriever.METADATA_KEY_BITRATE).toLongOrNull() ?: 0L

      var artPath = ""
      if (artFile.exists() && artFile.length() > 0L) {
        artPath = artFile.absolutePath
      } else {
        val embedded = try { retriever.embeddedPicture } catch (_: Throwable) { null }
        var bitmap: Bitmap? = null
        if (embedded != null && embedded.isNotEmpty()) {
          val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
          BitmapFactory.decodeByteArray(embedded, 0, embedded.size, bounds)
          var sample = 1
          while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= ART_MAX_PX) sample *= 2
          bitmap = BitmapFactory.decodeByteArray(embedded, 0, embedded.size, BitmapFactory.Options().apply { inSampleSize = sample })
        } else if (hasVideo) {
          // Siyah açılış karesinden kaçın: sürenin %10'u, en fazla 15 sn.
          val atUs = (if (durationMs > 0) minOf(durationMs / 10, 15_000L) else 1_000L) * 1000L
          bitmap = try {
            if (Build.VERSION.SDK_INT >= 27) retriever.getScaledFrameAtTime(atUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, ART_MAX_PX, ART_MAX_PX)
            else retriever.getFrameAtTime(atUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
          } catch (_: Throwable) { null }
        }
        if (bitmap != null) {
          val scaled = scaleDown(bitmap)
          if (writeArt(scaled, artFile)) artPath = artFile.absolutePath
          if (scaled !== bitmap) scaled.recycle()
          bitmap.recycle()
        }
      }
      result["artPath"] = artPath
    } catch (t: Throwable) {
      result["ok"] = false
      result["error"] = (t.message ?: t.javaClass.simpleName).take(200)
    } finally {
      try { retriever.release() } catch (_: Throwable) {}
    }
    result["elapsedMs"] = SystemClock.elapsedRealtime() - started
    return result
  }

  /** Önbellekteki kapak dosyalarını temizler (Ayarlar/yerel medya "önbelleği temizle"). */
  fun clearArtCache(): Int {
    var n = 0
    try { artDir.listFiles()?.forEach { if (it.delete()) n += 1 } } catch (_: Throwable) {}
    return n
  }
}
