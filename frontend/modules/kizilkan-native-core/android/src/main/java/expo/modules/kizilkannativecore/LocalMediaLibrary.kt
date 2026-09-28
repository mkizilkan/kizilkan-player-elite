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

  /**
   * v18.4.0 — Cihazdaki TÜM medya (MediaStore, tek sorgu). kind: video | audio | image.
   * Klasör seçmeye gerek kalmadan video/müzik/fotoğrafları bulur. İzin (Android 13+
   * READ_MEDIA_VIDEO/AUDIO/IMAGES) JS tarafında PermissionsAndroid ile istenir; izin
   * yoksa MediaStore boş/sınırlı döner (çökme yok). Sayfalı: offset/limit.
   * Dönen alanlar: id, uri(content://), name, size, dateAdded(sn), dateModified(sn),
   * mime, folder(bucket), duration(ms), width, height, artist, album.
   */
  /**
   * v18.6.0 — SAYFA ÖNBELLEĞİ. Cihaz kanıtı: 19.521 fotoğrafta tarama 25–77 sn sürüyordu;
   * her 2.000'lik sayfa için MediaStore sorgusu BAŞTAN çalışıyordu (10 kez). Artık tam liste
   * bir kez okunur, sayfalar bellekten verilir. MediaStore sürümü veya toplam değişirse yenilenir.
   */
  private val pageCache = java.util.concurrent.ConcurrentHashMap<String, Pair<String, List<JSONObject>>>()

  private fun storeVersion(kind: String): String = try {
    val v = if (Build.VERSION.SDK_INT >= 30) android.provider.MediaStore.getGeneration(context, android.provider.MediaStore.VOLUME_EXTERNAL).toString()
            else if (Build.VERSION.SDK_INT >= 29) android.provider.MediaStore.getVersion(context) else ""
    "$kind|$v"
  } catch (_: Throwable) { "$kind|" }

  fun queryDeviceMediaJson(kind: String, offset: Int, limit: Int): String {
    val started = SystemClock.elapsedRealtime()
    val version = storeVersion(kind)
    val cached = pageCache[kind]
    if (offset > 0 && cached != null && cached.first == version) {
      val list = cached.second
      val from = offset.coerceIn(0, list.size)
      val to = (from + limit.coerceIn(1, 5000)).coerceAtMost(list.size)
      val arr = JSONArray(); for (i in from until to) arr.put(list[i])
      return JSONObject().put("ok", true).put("kind", kind).put("total", list.size).put("offset", offset)
        .put("items", arr).put("cached", true).put("elapsedMs", SystemClock.elapsedRealtime() - started).toString()
    }
    val out = JSONArray()
    val collection: Uri = when (kind) {
      "audio" -> android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
      "image" -> android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI
      else -> android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI
    }
    val cols = mutableListOf(
      android.provider.MediaStore.MediaColumns._ID,
      android.provider.MediaStore.MediaColumns.DISPLAY_NAME,
      android.provider.MediaStore.MediaColumns.SIZE,
      android.provider.MediaStore.MediaColumns.DATE_ADDED,
      android.provider.MediaStore.MediaColumns.DATE_MODIFIED,
      android.provider.MediaStore.MediaColumns.MIME_TYPE,
    )
    if (Build.VERSION.SDK_INT >= 29) cols.add(android.provider.MediaStore.MediaColumns.BUCKET_DISPLAY_NAME)
    if (kind != "image" && Build.VERSION.SDK_INT >= 29) cols.add(android.provider.MediaStore.MediaColumns.DURATION)
    if (kind != "audio" && Build.VERSION.SDK_INT >= 29) { cols.add(android.provider.MediaStore.MediaColumns.WIDTH); cols.add(android.provider.MediaStore.MediaColumns.HEIGHT) }
    if (kind == "audio") { cols.add(android.provider.MediaStore.Audio.Media.ARTIST); cols.add(android.provider.MediaStore.Audio.Media.ALBUM) }
    val sort = "${android.provider.MediaStore.MediaColumns.DATE_ADDED} DESC"
    var total = 0
    val all = ArrayList<JSONObject>()
    try {
      context.contentResolver.query(collection, cols.toTypedArray(), null, null, sort)?.use { c ->
        total = c.count
        fun idx(name: String) = c.getColumnIndex(name)
        val iId = idx(android.provider.MediaStore.MediaColumns._ID)
        val iName = idx(android.provider.MediaStore.MediaColumns.DISPLAY_NAME)
        val iSize = idx(android.provider.MediaStore.MediaColumns.SIZE)
        val iAdded = idx(android.provider.MediaStore.MediaColumns.DATE_ADDED)
        val iMod = idx(android.provider.MediaStore.MediaColumns.DATE_MODIFIED)
        val iMime = idx(android.provider.MediaStore.MediaColumns.MIME_TYPE)
        val iBucket = if (Build.VERSION.SDK_INT >= 29) idx(android.provider.MediaStore.MediaColumns.BUCKET_DISPLAY_NAME) else -1
        val iDur = if (Build.VERSION.SDK_INT >= 29) idx(android.provider.MediaStore.MediaColumns.DURATION) else -1
        val iW = if (Build.VERSION.SDK_INT >= 29) idx(android.provider.MediaStore.MediaColumns.WIDTH) else -1
        val iH = if (Build.VERSION.SDK_INT >= 29) idx(android.provider.MediaStore.MediaColumns.HEIGHT) else -1
        val iArtist = if (kind == "audio") idx(android.provider.MediaStore.Audio.Media.ARTIST) else -1
        val iAlbum = if (kind == "audio") idx(android.provider.MediaStore.Audio.Media.ALBUM) else -1
        all.ensureCapacity(total)
        while (c.moveToNext()) {
          val id = c.getLong(iId)
          val o = JSONObject()
            .put("id", id)
            .put("uri", android.content.ContentUris.withAppendedId(collection, id).toString())
            .put("name", if (iName >= 0) c.getString(iName) ?: "" else "")
            .put("size", if (iSize >= 0) c.getLong(iSize) else 0L)
            .put("dateAdded", if (iAdded >= 0) c.getLong(iAdded) else 0L)
            .put("dateModified", if (iMod >= 0) c.getLong(iMod) else 0L)
            .put("mime", if (iMime >= 0) c.getString(iMime) ?: "" else "")
            .put("folder", if (iBucket >= 0) c.getString(iBucket) ?: "" else "")
          if (iDur >= 0) o.put("duration", c.getLong(iDur))
          if (iW >= 0) o.put("width", c.getInt(iW))
          if (iH >= 0) o.put("height", c.getInt(iH))
          if (iArtist >= 0) o.put("artist", c.getString(iArtist) ?: "")
          if (iAlbum >= 0) o.put("album", c.getString(iAlbum) ?: "")
          all.add(o)
        }
      }
      pageCache[kind] = Pair(version, all)
      val from = offset.coerceIn(0, all.size)
      val to = (from + limit.coerceIn(1, 5000)).coerceAtMost(all.size)
      for (i in from until to) out.put(all[i])
    } catch (t: Throwable) {
      return JSONObject().put("ok", false).put("error", t.message ?: "query").put("items", JSONArray()).toString()
    }
    return JSONObject().put("ok", true).put("kind", kind).put("total", total).put("offset", offset)
      .put("items", out).put("elapsedMs", SystemClock.elapsedRealtime() - started).toString()
  }

  /**
   * v18.4.0 — MediaStore küçük resmi (≤ 320 px, JPEG, önbellekli). API 29+ loadThumbnail;
   * daha eskisinde görüntüden ölçekli okuma. Dönüş: file:// yolu veya "" (yoksa).
   */
  fun thumbnailFor(uriStr: String, sizePx: Int): String {
    return try {
      val file = File(artDir, "thumb-" + sha1(uriStr + "|" + sizePx) + ".jpg")
      if (file.exists() && file.length() > 0) return Uri.fromFile(file).toString()
      val uri = Uri.parse(uriStr)
      val bmp: Bitmap? = if (Build.VERSION.SDK_INT >= 29) {
        context.contentResolver.loadThumbnail(uri, android.util.Size(sizePx, sizePx), null)
      } else null
      if (bmp != null && writeArt(bmp, file)) Uri.fromFile(file).toString() else ""
    } catch (_: Throwable) { "" }
  }
}
