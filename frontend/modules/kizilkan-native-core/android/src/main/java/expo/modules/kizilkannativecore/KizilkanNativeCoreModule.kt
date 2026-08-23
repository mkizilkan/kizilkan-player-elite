package expo.modules.kizilkannativecore

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Debug
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream
import java.time.Instant
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.text.Normalizer
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * KIZILKAN Native Data Core — Room/SQLite Phase 1
 *
 * Kural: dev playlist koleksiyonlari JS/Hermes belleğine yalnız legacy ekran
 * gerçekten isterse taşınır. Normal kategori/search/page sorguları Room/SQLite
 * üzerinde indeksli çalışır ve React'e yalnız görünen sayfa döner.
 */
class KizilkanNativeCoreModule : Module() {
  data class IndexResult(val snapshot: PlaylistSnapshotEntity, val cacheHit: Boolean)

  companion object {
    private val telemetry = ConcurrentHashMap<String, Map<String, Any>>()
    private val invalidated = ConcurrentHashMap.newKeySet<String>()
    private val indexLocks = ConcurrentHashMap<String, Any>()
    private const val BATCH_SIZE = 750
    private val playerSessionSeq = AtomicLong(0L)
    @Volatile private var activePlayerSession = 0L
  }

  override fun definition() = ModuleDefinition {
    Name("KizilkanNativeCore")

    AsyncFunction("warmPlaylist") { id: String ->
      val result = ensureIndexed(id)
      summary(result.snapshot, cacheHit = result.cacheHit)
    }

    // v15.2.4: Android tarafında Room artık canonical playlist deposudur.
    // JS tarafı yeni/yenilenmiş katalogu bir kez native core'a aktarır; native
    // core transaction içinde indeksler. Legacy .json yalnız eski sürüm migration
    // kaynağı olarak kalır ve başarılı import sonrası temizlenebilir.
    AsyncFunction("importPlaylistHeavyJson") { id: String, json: String ->
      val started = SystemClock.elapsedRealtime()
      val root = JSONTokener(json).nextValue() as? JSONObject
        ?: throw IllegalStateException("Playlist JSON nesne değil: $id")
      val snapshot = indexRoot(id, root, sourceStamp = 0L, sourceSize = json.toByteArray(Charsets.UTF_8).size.toLong(), started = started)
      invalidated.remove(id)
      updateTelemetry(id, mapOf(
        "canonicalStore" to "Room/SQLite",
        "legacyFileRequired" to false,
        "importMs" to snapshot.importMs,
        "bytes" to snapshot.sourceSize,
        "channels" to snapshot.channelsCount,
        "vod" to snapshot.vodCount,
        "series" to snapshot.seriesCount,
      ))
      summary(snapshot, cacheHit = false)
    }

    // v15.2.5: Legacy/MAG/compatibility yollarında 50-100 bin kaydı tek bir
    // JSON.stringify ile JS thread'de kilitlememek için chunked staging import.
    // Staging dosyası GEÇİCİDİR; canonical veri yalnız finalize transaction
    // başarıyla bittiğinde Room'a geçer. Yarım import mevcut Room snapshot'ını bozmaz.
    AsyncFunction("beginChunkedPlaylistImport") { id: String ->
      val file = chunkImportFile(id)
      file.parentFile?.mkdirs()
      if (file.exists()) file.delete()
      file.createNewFile()
      true
    }

    AsyncFunction("appendPlaylistChunk") { id: String, kind: String, jsonArray: String ->
      val file = chunkImportFile(id)
      if (!file.exists()) throw IllegalStateException("Chunk import başlatılmadı: $id")
      val k = normalizeKind(kind)
      val arr = JSONTokener(jsonArray).nextValue() as? JSONArray
        ?: throw IllegalStateException("Chunk JSON array değil")
      FileOutputStream(file, true).bufferedWriter(Charsets.UTF_8, 64 * 1024).use { out ->
        for (i in 0 until arr.length()) {
          val obj = arr.optJSONObject(i) ?: continue
          out.append(k).append('\t').append(obj.toString()).append('\n')
        }
      }
      arr.length()
    }

    AsyncFunction("finishChunkedPlaylistImport") { id: String ->
      finishChunkedImport(id)
    }

    AsyncFunction("cancelChunkedPlaylistImport") { id: String ->
      val file = chunkImportFile(id)
      !file.exists() || file.delete()
    }

    // v15.2.4: M3U URL/Dosya yolu da ağır JS parse + dev array üretmez.
    // Metin native worker'da parse edilir ve doğrudan Room canonical store'a girer.
    AsyncFunction("importM3uText") { id: String, text: String ->
      val started = SystemClock.elapsedRealtime()
      val root = parseM3uToRoot(text)
      val snapshot = indexRoot(id, root, 0L, text.toByteArray(Charsets.UTF_8).size.toLong(), started)
      invalidated.remove(id)
      summary(snapshot, cacheHit = false)
    }

    AsyncFunction("fetchAndImportM3u") { id: String, url: String, userAgent: String ->
      val started = SystemClock.elapsedRealtime()
      val text = downloadText(url, userAgent)
      if (text.length < 8) throw IllegalStateException("M3U yanıtı boş")
      val root = parseM3uToRoot(text)
      val snapshot = indexRoot(id, root, 0L, text.toByteArray(Charsets.UTF_8).size.toLong(), started)
      invalidated.remove(id)
      summary(snapshot, cacheHit = false)
    }

    AsyncFunction("hasPlaylistIndex") { id: String ->
      database().snapshotDao().get(id) != null
    }

    AsyncFunction("deleteLegacyPlaylistFile") { id: String ->
      val file = playlistFile(id)
      !file.exists() || file.delete()
    }

    AsyncFunction("getStorageFootprint") {
      storageFootprint()
    }

    // v15.2.4: cihaz üstünde gerçek RAM görünürlüğü. Bu telemetri tahmin değil,
    // Android Debug.MemoryInfo + Runtime/ActivityManager değerlerinden gelir.
    Function("getRuntimeMemory") {
      runtimeMemory()
    }

    // v15.2.4 Native Player Session Arbiter Phase 1: player motorlarını henüz
    // Kotlin'e taşımadan generation authority native tarafta tutulur. Böylece
    // React yeniden render/activity restore olsa bile eski callback yeni session'a
    // aitmiş gibi kabul edilemez.
    Function("beginPlayerSession") {
      val id = playerSessionSeq.incrementAndGet()
      activePlayerSession = id
      id
    }

    Function("getPlayerSession") { activePlayerSession }

    Function("isPlayerSessionActive") { id: Long ->
      id != 0L && id == activePlayerSession
    }

    Function("invalidatePlayerSession") { id: Long ->
      if (id == 0L || id == activePlayerSession) {
        val next = playerSessionSeq.incrementAndGet()
        activePlayerSession = next
        next
      } else activePlayerSession
    }

    AsyncFunction("readPlaylistHeavy") { id: String ->
      val started = SystemClock.elapsedRealtime()
      val snapshot = ensureIndexed(id).snapshot
      val db = database()
      // Legacy ekran sözleşmesi: tüm koleksiyon istenirse bile JSON.parse JS'de
      // yapılmaz. Room'dan yeniden kurulur. Yeni ekranlar queryItems kullanmalı.
      val result = mapOf<String, Any>(
        "channels" to db.mediaDao().allRaw(id, "live").map(::rawToMap),
        "vod" to db.mediaDao().allRaw(id, "vod").map(::rawToMap),
        "series" to db.mediaDao().allRaw(id, "series").map(::rawToMap),
      )
      updateTelemetry(id, mapOf(
        "legacyHydrateMs" to (SystemClock.elapsedRealtime() - started),
        "legacyHydrate" to true,
        "channels" to snapshot.channelsCount,
        "vod" to snapshot.vodCount,
        "series" to snapshot.seriesCount,
      ))
      result
    }

    AsyncFunction("getPlaylistSummary") { id: String ->
      val result = ensureIndexed(id)
      summary(result.snapshot, cacheHit = result.cacheHit)
    }

    AsyncFunction("getCategories") { id: String, kind: String ->
      ensureIndexed(id)
      database().mediaDao().categories(id, normalizeKind(kind)).map {
        mapOf<String, Any>("name" to it.name, "count" to it.count)
      }
    }

    AsyncFunction("queryItems") { id: String, kind: String, group: String, search: String, offset: Int, limit: Int ->
      ensureIndexed(id)
      val dao = database().mediaDao()
      val k = normalizeKind(kind)
      val wantedGroup = group.trim().ifEmpty { "__all__" }
      val q = normalizeSearch(search)
      val start = offset.coerceAtLeast(0)
      val take = limit.coerceIn(1, 250)
      val total = dao.queryCount(id, k, wantedGroup, q)
      val raw = dao.queryRaw(id, k, wantedGroup, q, start, take)
      val items = raw.map(::rawToMap)
      mapOf<String, Any>(
        "items" to items,
        "offset" to start,
        "returned" to items.size,
        "total" to total,
        "hasMore" to (start + items.size < total),
      )
    }

    AsyncFunction("getItem") { id: String, kind: String, itemId: String ->
      ensureIndexed(id)
      database().mediaDao().getItemRaw(id, normalizeKind(kind), itemId)?.let(::rawToMap)
    }

    AsyncFunction("getItemsByIds") { id: String, kind: String, itemIds: List<String> ->
      ensureIndexed(id)
      if (itemIds.isEmpty()) emptyList<Map<String, Any?>>()
      else database().mediaDao().getItemsRaw(id, normalizeKind(kind), itemIds.distinct().take(500)).map(::rawToMap)
    }

    AsyncFunction("fetchAndCacheEpg") { url: String, playlistId: String, userAgent: String ->
      val started = SystemClock.elapsedRealtime()
      val xml = downloadText(url, userAgent)
      val count = indexEpgXml(playlistId, xml)
      updateTelemetry(playlistId, mapOf(
        "epgPrograms" to count,
        "epgImportMs" to (SystemClock.elapsedRealtime() - started),
        "epgNative" to true,
      ))
      mapOf<String, Any>("count" to count, "native" to true)
    }

    AsyncFunction("getEpgNowNext") { playlistId: String, channelIds: List<String>, nowSec: Long ->
      if (channelIds.isEmpty()) emptyMap<String, Any>() else {
        val rows = database().epgDao().window(playlistId, channelIds.distinct().take(100), nowSec, nowSec + 12L * 3600L)
        val grouped = rows.groupBy { it.channelId }
        val out = LinkedHashMap<String, Any>()
        for (channelId in channelIds) {
          val list = grouped[channelId] ?: continue
          val now = list.firstOrNull { it.startTimestamp <= nowSec && it.stopTimestamp > nowSec }
          val next = if (now != null) list.firstOrNull { it.startTimestamp >= now.stopTimestamp } else list.firstOrNull { it.startTimestamp > nowSec }
          if (now != null || next != null) out[channelId] = mapOf<String, Any?>(
            "now" to now?.let(::epgToMap),
            "next" to next?.let(::epgToMap),
          )
        }
        out
      }
    }

    AsyncFunction("getEpgChannelPrograms") { playlistId: String, channelId: String ->
      database().epgDao().channelPrograms(playlistId, channelId).map(::epgToMap)
    }

    AsyncFunction("removeEpg") { playlistId: String ->
      database().epgDao().deletePlaylist(playlistId)
      true
    }

    AsyncFunction("reindexPlaylist") { id: String ->
      invalidated.add(id)
      val result = ensureIndexed(id)
      summary(result.snapshot, cacheHit = false)
    }

    Function("invalidatePlaylist") { id: String ->
      // DB'yi main thread'de silmeyiz. Sonraki AsyncFunction stamp/size kontrolü
      // yapıp atomik transaction ile yeniden indeksler.
      invalidated.add(id)
      true
    }

    AsyncFunction("removePlaylistIndex") { id: String ->
      val db = database()
      db.runInTransaction {
        db.mediaDao().deletePlaylist(id)
        db.snapshotDao().delete(id)
        db.epgDao().deletePlaylist(id)
      }
      invalidated.remove(id)
      telemetry.remove(id)
      indexLocks.remove(id)
      true
    }

    AsyncFunction("clearCache") {
      val db = database()
      db.runInTransaction {
        db.mediaDao().clear()
        db.snapshotDao().clear()
        db.epgDao().clear()
      }
      invalidated.clear()
      telemetry.clear()
      indexLocks.clear()
      true
    }

    AsyncFunction("startBulkImport") { jobsJson: String, concurrency: Int ->
      val ctx = context()
      val intent = Intent(ctx, BulkPlaylistImportService::class.java).apply {
        action = BulkPlaylistImportService.ACTION_START
        putExtra("jobsJson", jobsJson)
        putExtra("concurrency", concurrency.coerceIn(1, 4))
      }
      if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(intent) else ctx.startService(intent)
      true
    }

    AsyncFunction("pauseBulkImport") {
      context().startService(Intent(context(), BulkPlaylistImportService::class.java).apply { action = BulkPlaylistImportService.ACTION_PAUSE })
      true
    }

    AsyncFunction("resumeBulkImport") {
      context().startService(Intent(context(), BulkPlaylistImportService::class.java).apply { action = BulkPlaylistImportService.ACTION_RESUME })
      true
    }

    AsyncFunction("cancelBulkImport") {
      context().startService(Intent(context(), BulkPlaylistImportService::class.java).apply { action = BulkPlaylistImportService.ACTION_CANCEL })
      true
    }

    Function("getBulkImportSnapshot") {
      context().getSharedPreferences(BulkPlaylistImportService.PREFS, 0)
        .getString(BulkPlaylistImportService.KEY_SNAPSHOT, "{}") ?: "{}"
    }

    Function("getTelemetry") { id: String -> telemetry[id] ?: emptyMap<String, Any>() }
  }

  private fun context() = appContext.reactContext ?: throw IllegalStateException("Android context yok")
  private fun database() = KizilkanNativeDatabase.get(context())

  private fun safeId(id: String) = id.replace(Regex("[^a-zA-Z0-9_.-]"), "_")
  private fun playlistFile(id: String): File = File(context().filesDir, "kizilkan/playlists/${safeId(id)}.json")
  private fun chunkImportFile(id: String): File = File(context().filesDir, "kizilkan/import-staging/${safeId(id)}.ndjson")

  private fun snapshotMatchesFile(id: String, snapshot: PlaylistSnapshotEntity): Boolean {
    val file = playlistFile(id)
    return file.exists() && snapshot.sourceStamp == file.lastModified() && snapshot.sourceSize == file.length() && !invalidated.contains(id)
  }

  private fun ensureIndexed(id: String): IndexResult {
    // warmPlaylist/queryItems/getCategories aynı anda tetiklenebilir. Aynı
    // playlist için çift parse + iki DELETE/INSERT transaction koşmasın.
    val lock = indexLocks.getOrPut(id) { Any() }
    synchronized(lock) {
      return ensureIndexedLocked(id)
    }
  }

  private fun ensureIndexedLocked(id: String): IndexResult {
    val file = playlistFile(id)
    val db = database()
    val existing = db.snapshotDao().get(id)

    // v15.2.4 canonical rule: Room snapshot varsa ve invalidation yoksa dosya
    // bulunması zorunlu değildir. sourceStamp=0 doğrudan Room importunu temsil eder.
    if (existing != null && !invalidated.contains(id)) {
      if (existing.sourceStamp == 0L || !file.exists() || snapshotMatchesFile(id, existing)) {
        updateTelemetry(id, mapOf(
          "roomCacheHit" to true,
          "canonicalStore" to "Room/SQLite",
          "legacyFilePresent" to file.exists(),
          "bytes" to existing.sourceSize,
          "importMs" to existing.importMs,
          "channels" to existing.channelsCount,
          "vod" to existing.vodCount,
          "series" to existing.seriesCount,
        ))
        return IndexResult(existing, true)
      }
    }

    // Eski kurulum migration yolu: Room kaydı yoksa legacy heavy JSON'u bir kez
    // native tarafta parse et ve Room'a al. Bu fallback yeni yazımların canonical
    // deposu değildir.
    if (!file.exists()) throw IllegalStateException("Playlist Room indeksi ve legacy veri dosyası bulunamadı: $id")
    val started = SystemClock.elapsedRealtime()
    val text = file.bufferedReader(Charsets.UTF_8).use { it.readText() }
    val root = JSONTokener(text).nextValue() as? JSONObject
      ?: throw IllegalStateException("Playlist veri dosyası nesne değil: $id")
    val snapshot = indexRoot(id, root, file.lastModified(), file.length(), started)
    invalidated.remove(id)
    updateTelemetry(id, mapOf(
      "roomCacheHit" to false,
      "canonicalStore" to "Room/SQLite",
      "migratedFromLegacyFile" to true,
      "legacyFilePresent" to file.exists(),
      "bytes" to snapshot.sourceSize,
      "importMs" to snapshot.importMs,
      "channels" to snapshot.channelsCount,
      "vod" to snapshot.vodCount,
      "series" to snapshot.seriesCount,
      "database" to "Room/SQLite",
      "batchSize" to BATCH_SIZE,
    ))
    return IndexResult(snapshot, false)
  }

  private fun indexRoot(id: String, root: JSONObject, sourceStamp: Long, sourceSize: Long, started: Long): PlaylistSnapshotEntity {
    val channels = root.optJSONArray("channels") ?: JSONArray()
    val vod = root.optJSONArray("vod") ?: JSONArray()
    val series = root.optJSONArray("series") ?: JSONArray()
    val db = database()
    db.runInTransaction {
      val dao = db.mediaDao()
      dao.deletePlaylist(id)
      insertCollection(dao, id, "live", channels)
      insertCollection(dao, id, "vod", vod)
      insertCollection(dao, id, "series", series)
      val importMs = SystemClock.elapsedRealtime() - started
      db.snapshotDao().put(
        PlaylistSnapshotEntity(
          playlistId = id,
          sourceStamp = sourceStamp,
          sourceSize = sourceSize,
          channelsCount = channels.length(),
          vodCount = vod.length(),
          seriesCount = series.length(),
          importedAtEpochMs = System.currentTimeMillis(),
          importMs = importMs,
        )
      )
    }
    return db.snapshotDao().get(id) ?: throw IllegalStateException("Room snapshot yazılamadı: $id")
  }

  private fun insertCollection(dao: MediaItemDao, playlistId: String, kind: String, arr: JSONArray) {
    val batch = ArrayList<MediaItemEntity>(BATCH_SIZE)
    for (i in 0 until arr.length()) {
      val obj = arr.optJSONObject(i) ?: continue
      val itemId = obj.optString("id", "").trim().ifEmpty {
        obj.optString("stream_id", "").trim().ifEmpty {
          obj.optString("series_id", "").trim().ifEmpty { "row-$i" }
        }
      }
      val name = obj.optString("name", "")
      val group = obj.optString("group", "").trim().ifEmpty { "Diğer" }
      val normalizedName = normalizeSearch(name)
      val searchText = normalizeSearch(buildString {
        append(name); append(' ')
        append(group); append(' ')
        append(obj.optString("tvg_name", "")); append(' ')
        append(obj.optString("genre", "")); append(' ')
        append(obj.optString("cast", "")); append(' ')
        append(obj.optString("director", ""))
      })
      batch.add(
        MediaItemEntity(
          rowKey = "$playlistId|$kind|$itemId|$i",
          playlistId = playlistId,
          kind = kind,
          itemId = itemId,
          name = name,
          normalizedName = normalizedName,
          groupName = group,
          searchText = searchText,
          sortOrder = i,
          rawJson = obj.toString(),
        )
      )
      if (batch.size >= BATCH_SIZE) {
        dao.insertAll(batch.toList())
        batch.clear()
      }
    }
    if (batch.isNotEmpty()) dao.insertAll(batch)
  }

  private fun finishChunkedImport(id: String): Map<String, Any> {
    val file = chunkImportFile(id)
    if (!file.exists()) throw IllegalStateException("Chunk staging dosyası bulunamadı: $id")
    val started = SystemClock.elapsedRealtime()
    val db = database()
    var liveCount = 0
    var vodCount = 0
    var seriesCount = 0
    val orderByKind = mutableMapOf("live" to 0, "vod" to 0, "series" to 0)

    db.runInTransaction {
      val dao = db.mediaDao()
      dao.deletePlaylist(id)
      val batch = ArrayList<MediaItemEntity>(BATCH_SIZE)
      file.bufferedReader(Charsets.UTF_8, 64 * 1024).useLines { lines ->
        lines.forEach { line ->
          val sep = line.indexOf('\t')
          if (sep <= 0 || sep >= line.length - 1) return@forEach
          val kind = normalizeKind(line.substring(0, sep))
          val obj = try { JSONTokener(line.substring(sep + 1)).nextValue() as? JSONObject } catch (_: Throwable) { null }
            ?: return@forEach
          val sortOrder = orderByKind[kind] ?: 0
          orderByKind[kind] = sortOrder + 1
          val itemId = obj.optString("id", "").trim().ifEmpty {
            obj.optString("stream_id", "").trim().ifEmpty {
              obj.optString("series_id", "").trim().ifEmpty { "row-$sortOrder" }
            }
          }
          val name = obj.optString("name", "")
          val group = obj.optString("group", "").trim().ifEmpty { "Diğer" }
          val normalizedName = normalizeSearch(name)
          val searchText = normalizeSearch(buildString {
            append(name); append(' ')
            append(group); append(' ')
            append(obj.optString("tvg_name", "")); append(' ')
            append(obj.optString("genre", "")); append(' ')
            append(obj.optString("cast", "")); append(' ')
            append(obj.optString("director", ""))
          })
          batch.add(MediaItemEntity(
            rowKey = "$id|$kind|$itemId|$sortOrder",
            playlistId = id,
            kind = kind,
            itemId = itemId,
            name = name,
            normalizedName = normalizedName,
            groupName = group,
            searchText = searchText,
            sortOrder = sortOrder,
            rawJson = obj.toString(),
          ))
          when (kind) {
            "live" -> liveCount++
            "vod" -> vodCount++
            "series" -> seriesCount++
          }
          if (batch.size >= BATCH_SIZE) {
            dao.insertAll(batch.toList())
            batch.clear()
          }
        }
      }
      if (batch.isNotEmpty()) dao.insertAll(batch)
      val importMs = SystemClock.elapsedRealtime() - started
      db.snapshotDao().put(PlaylistSnapshotEntity(
        playlistId = id,
        sourceStamp = 0L,
        sourceSize = file.length(),
        channelsCount = liveCount,
        vodCount = vodCount,
        seriesCount = seriesCount,
        importedAtEpochMs = System.currentTimeMillis(),
        importMs = importMs,
      ))
    }
    invalidated.remove(id)
    val snapshot = db.snapshotDao().get(id) ?: throw IllegalStateException("Room snapshot yazılamadı: $id")
    if (!file.delete()) file.deleteOnExit()
    // Eski duplicate heavy dosya varsa canonical Room doğrulandıktan sonra temizle.
    val legacy = playlistFile(id)
    if (legacy.exists()) legacy.delete()
    updateTelemetry(id, mapOf(
      "chunkedImport" to true,
      "canonicalStore" to "Room/SQLite",
      "channels" to liveCount,
      "vod" to vodCount,
      "series" to seriesCount,
      "importMs" to snapshot.importMs,
    ))
    return summary(snapshot, cacheHit = false)
  }

  private fun summary(snapshot: PlaylistSnapshotEntity, cacheHit: Boolean): Map<String, Any> = mapOf(
    "id" to snapshot.playlistId,
    "bytes" to snapshot.sourceSize,
    "parseMs" to snapshot.importMs,
    "importMs" to snapshot.importMs,
    "channels" to snapshot.channelsCount,
    "vod" to snapshot.vodCount,
    "series" to snapshot.seriesCount,
    "roomIndexed" to true,
    "cacheHit" to cacheHit,
  )

  private fun downloadText(url: String, userAgent: String): String {
    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = 15000
      readTimeout = 30000
      instanceFollowRedirects = true
      requestMethod = "GET"
      setRequestProperty("User-Agent", userAgent.ifBlank { "VLC/3.0.20 LibVLC/3.0.20" })
      setRequestProperty("Accept", "*/*")
      setRequestProperty("Accept-Encoding", "gzip")
    }
    try {
      val status = conn.responseCode
      if (status !in 200..299) throw IllegalStateException("EPG indirilemedi (HTTP $status)")
      val raw = conn.inputStream
      val stream = if (conn.contentEncoding?.contains("gzip", true) == true || url.lowercase(Locale.ROOT).endsWith(".gz")) GZIPInputStream(raw) else raw
      return stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
    } finally {
      conn.disconnect()
    }
  }

  private fun indexEpgXml(playlistId: String, xml: String): Int {
    val programme = Regex("""<programme\b([^>]*)>([\s\S]*?)</programme>""", RegexOption.IGNORE_CASE)
    val startAttr = Regex("""start=[\"']([^\"']*)[\"']""", RegexOption.IGNORE_CASE)
    val stopAttr = Regex("""stop=[\"']([^\"']*)[\"']""", RegexOption.IGNORE_CASE)
    val channelAttr = Regex("""channel=[\"']([^\"']*)[\"']""", RegexOption.IGNORE_CASE)
    val titleTag = Regex("""<title[^>]*>([\s\S]*?)</title>""", RegexOption.IGNORE_CASE)
    val descTag = Regex("""<desc[^>]*>([\s\S]*?)</desc>""", RegexOption.IGNORE_CASE)
    val dao = database().epgDao()
    val batch = ArrayList<EpgProgramEntity>(1000)
    var count = 0
    database().runInTransaction {
      dao.deletePlaylist(playlistId)
      for (m in programme.findAll(xml)) {
        val attrs = m.groupValues[1]
        val body = m.groupValues[2]
        val channel = channelAttr.find(attrs)?.groupValues?.getOrNull(1)?.trim().orEmpty()
        if (channel.isBlank()) continue
        val start = parseXmltvEpoch(startAttr.find(attrs)?.groupValues?.getOrNull(1).orEmpty())
        val stop = parseXmltvEpoch(stopAttr.find(attrs)?.groupValues?.getOrNull(1).orEmpty())
        if (start <= 0L || stop <= start) continue
        val title = decodeXml(titleTag.find(body)?.groupValues?.getOrNull(1).orEmpty()).ifBlank { "Program" }
        val desc = decodeXml(descTag.find(body)?.groupValues?.getOrNull(1).orEmpty()).ifBlank { null }
        batch += EpgProgramEntity(
          rowKey = "$playlistId|$channel|$start|$count",
          playlistId = playlistId,
          channelId = channel,
          title = title,
          description = desc,
          startIso = Instant.ofEpochSecond(start).toString(),
          stopIso = Instant.ofEpochSecond(stop).toString(),
          startTimestamp = start,
          stopTimestamp = stop,
        )
        count++
        if (batch.size >= 1000) { dao.insertAll(batch.toList()); batch.clear() }
      }
      if (batch.isNotEmpty()) dao.insertAll(batch)
    }
    return count
  }

  private fun parseXmltvEpoch(value: String): Long {
    val text = value.trim()
    if (text.length < 14) return 0L
    return try {
      val base = text.substring(0, 14)
      val tz = text.drop(14).trim().takeIf { it.matches(Regex("[+-]\\d{4}")) }
      if (tz != null) {
        val normalized = "$base $tz"
        OffsetDateTime.parse(normalized, DateTimeFormatter.ofPattern("yyyyMMddHHmmss xx")).toEpochSecond()
      } else {
        LocalDateTime.parse(base, DateTimeFormatter.ofPattern("yyyyMMddHHmmss")).toEpochSecond(ZoneOffset.UTC)
      }
    } catch (_: Throwable) { 0L }
  }

  private fun decodeXml(value: String): String = value.trim()
    .replace("&lt;", "<").replace("&gt;", ">")
    .replace("&quot;", "\"").replace("&apos;", "'")
    .replace("&amp;", "&")

  private fun epgToMap(e: EpgProgramEntity): Map<String, Any?> = mapOf(
    "title" to e.title,
    "description" to e.description,
    "start" to e.startIso,
    "stop" to e.stopIso,
    "start_timestamp" to e.startTimestamp,
    "stop_timestamp" to e.stopTimestamp,
    "channel" to e.channelId,
  )

  private fun storageFootprint(): Map<String, Any> {
    val filesDir = context().filesDir
    val dbFile = context().getDatabasePath("kizilkan-native-core.db")
    val wal = File(dbFile.absolutePath + "-wal")
    val shm = File(dbFile.absolutePath + "-shm")
    val legacyDir = File(filesDir, "kizilkan/playlists")
    val legacyFiles = legacyDir.listFiles()?.filter { it.isFile && it.extension == "json" } ?: emptyList()
    val legacyBytes = legacyFiles.sumOf { it.length() }
    return mapOf(
      "databaseBytes" to (if (dbFile.exists()) dbFile.length() else 0L),
      "walBytes" to (if (wal.exists()) wal.length() else 0L),
      "shmBytes" to (if (shm.exists()) shm.length() else 0L),
      "legacyPlaylistBytes" to legacyBytes,
      "legacyPlaylistFiles" to legacyFiles.size,
      "canonicalStore" to "Room/SQLite",
    )
  }

  private fun normalizeKind(kind: String): String = when (kind.lowercase(Locale.ROOT)) {
    "vod" -> "vod"
    "series" -> "series"
    else -> "live"
  }

  private fun normalizeSearch(value: String): String {
    val decomposed = Normalizer.normalize(value, Normalizer.Form.NFD)
      .replace(Regex("\\p{Mn}+"), "")
    return decomposed.lowercase(Locale.ROOT).replace('ı', 'i').trim()
  }

  private fun rawToMap(raw: String): Map<String, Any?> {
    val obj = JSONTokener(raw).nextValue() as? JSONObject ?: return emptyMap()
    return jsonObjectToMap(obj)
  }

  private fun jsonObjectToMap(obj: JSONObject): Map<String, Any?> {
    val out = LinkedHashMap<String, Any?>()
    val keys = obj.keys()
    while (keys.hasNext()) { val k = keys.next(); out[k] = jsonValue(obj.opt(k)) }
    return out
  }

  private fun jsonArrayToList(arr: JSONArray): List<Any?> {
    val out = ArrayList<Any?>(arr.length())
    for (i in 0 until arr.length()) out.add(jsonValue(arr.opt(i)))
    return out
  }

  private fun jsonValue(value: Any?): Any? = when (value) {
    null, JSONObject.NULL -> null
    is JSONObject -> jsonObjectToMap(value)
    is JSONArray -> jsonArrayToList(value)
    is Boolean, is Number, is String -> value
    else -> value.toString()
  }

  private fun updateTelemetry(id: String, patch: Map<String, Any>) {
    telemetry[id] = (telemetry[id] ?: emptyMap()) + patch
  }
  private fun parseM3uToRoot(raw: String): JSONObject {
    val channels = JSONArray()
    val vod = JSONArray()
    val series = JSONArray()
    val lines = raw.removePrefix("\uFEFF").replace("\r\n", "\n").replace("\r", "\n").split('\n')
    var pending: JSONObject? = null
    for (rawLine in lines) {
      val line = rawLine.trim()
      if (line.isEmpty() || line.startsWith("#EXTM3U")) continue
      if (line.startsWith("#EXTINF")) {
        val comma = line.indexOf(',')
        val meta = if (comma >= 0) line.substring(0, comma) else line
        val name = if (comma >= 0) line.substring(comma + 1).trim() else "Kanal"
        val attrs = parseM3uAttrs(meta)
        pending = JSONObject().apply {
          put("id", "")
          put("name", name)
          put("tvg_id", attrs["tvg-id"] ?: JSONObject.NULL)
          put("tvg_name", attrs["tvg-name"] ?: JSONObject.NULL)
          put("epg_channel_id", attrs["tvg-id"] ?: attrs["channel-id"] ?: JSONObject.NULL)
          put("logo", attrs["tvg-logo"] ?: attrs["logo"] ?: JSONObject.NULL)
          put("group", attrs["group-title"] ?: attrs["group"] ?: "Genel")
          put("url", "")
          put("container_ext", JSONObject.NULL)
          put("stream_id", JSONObject.NULL)
          put("source", "m3u")
          put("headers", JSONObject())
        }
      } else if (line.startsWith("#EXTGRP")) {
        val value = line.substringAfter(':', "").trim()
        if (value.isNotEmpty()) pending?.put("group", value)
      } else if (line.startsWith("#EXTVLCOPT") || line.startsWith("#KODIPROP")) {
        val value = line.substringAfter(':', "").trim()
        val key = value.substringBefore('=', "").trim().lowercase(Locale.ROOT)
        val v = value.substringAfter('=', "")
        if (key.isNotEmpty()) (pending?.optJSONObject("headers") ?: JSONObject().also { pending?.put("headers", it) }).put(key, v)
      } else if (!line.startsWith('#')) {
        val obj = pending ?: JSONObject().apply {
          put("id", ""); put("name", line.substringAfterLast('/').ifBlank { "Kanal" }); put("group", "Genel")
          put("logo", JSONObject.NULL); put("tvg_id", JSONObject.NULL); put("tvg_name", JSONObject.NULL); put("epg_channel_id", JSONObject.NULL)
          put("source", "m3u"); put("headers", JSONObject())
        }
        obj.put("url", line)
        val ext = line.substringBefore('?').substringAfterLast('.', "").lowercase(Locale.ROOT).takeIf { it.length in 1..5 }
        if (ext != null) obj.put("container_ext", ext) else obj.put("container_ext", JSONObject.NULL)
        val tvg = obj.optString("tvg_id", "").trim()
        val name = obj.optString("name", "Kanal")
        val stable = m3uChannelId(tvg, line, name)
        when (classifyM3u(line, ext)) {
          "vod" -> vod.put(JSONObject().apply {
            put("id", "vod-$stable"); put("name", name); put("group", obj.optString("group", "Genel")); put("poster", obj.opt("logo"))
            put("url", line); put("container_ext", ext ?: "mp4"); put("stream_id", JSONObject.NULL)
            for (k in listOf("year","rating","rating_5based","plot","cast","director","genre")) put(k, JSONObject.NULL)
          })
          "series" -> series.put(JSONObject().apply {
            put("id", "ser-$stable"); put("name", name); put("group", obj.optString("group", "Genel")); put("poster", obj.opt("logo")); put("series_id", JSONObject.NULL)
            for (k in listOf("year","rating","rating_5based","plot","cast","director","genre")) put(k, JSONObject.NULL)
          })
          else -> { obj.put("id", stable); channels.put(obj) }
        }
        pending = null
      }
    }
    return JSONObject().put("channels", channels).put("vod", vod).put("series", series)
  }

  private fun parseM3uAttrs(meta: String): Map<String, String> {
    val out = LinkedHashMap<String, String>()
    val re = Regex("""([a-zA-Z0-9\-_]+)\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s,]+))""")
    for (m in re.findAll(meta)) {
      out[m.groupValues[1].lowercase(Locale.ROOT)] = m.groupValues.drop(2).firstOrNull { it.isNotEmpty() } ?: ""
    }
    return out
  }

  private fun classifyM3u(url: String, ext: String?): String {
    val u = url.lowercase(Locale.ROOT)
    if (u.contains("/series/") || u.contains("/tv-series/")) return "series"
    if (u.contains("/movie/") || u.contains("/vod/") || u.contains("/films/") || u.contains("/movies/")) return "vod"
    if (ext != null && ext in setOf("mp4","mkv","avi","mov","webm","flv","wmv")) return "vod"
    return "live"
  }

  private fun m3uChannelId(tvg: String, url: String, name: String): String {
    val basis = when {
      tvg.isNotBlank() && url.isNotBlank() -> "$tvg|$url"
      url.isNotBlank() -> url
      tvg.isNotBlank() && name.isNotBlank() -> "$tvg|$name"
      else -> name
    }
    var h1 = 0x811c9dc5.toInt()
    var h2 = 0x01000193
    for (c in basis) {
      h1 = h1 xor c.code
      h1 *= 0x01000193
      h2 = (h2 shl 5) - h2 + c.code
    }
    return "ch-${h1.toUInt().toString(16).padStart(8,'0')}${h2.toUInt().toString(16).padStart(8,'0')}"
  }

  private fun runtimeMemory(): Map<String, Any> {
    val info = Debug.MemoryInfo()
    Debug.getMemoryInfo(info)
    val runtime = Runtime.getRuntime()
    val am = context().getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    val javaUsed = runtime.totalMemory() - runtime.freeMemory()
    return mapOf(
      "totalPssKb" to info.totalPss,
      "totalPrivateDirtyKb" to info.totalPrivateDirty,
      "dalvikPssKb" to info.dalvikPss,
      "nativePssKb" to info.nativePss,
      "otherPssKb" to info.otherPss,
      "javaHeapUsedBytes" to javaUsed,
      "javaHeapCommittedBytes" to runtime.totalMemory(),
      "javaHeapMaxBytes" to runtime.maxMemory(),
      "memoryClassMb" to (am?.memoryClass ?: 0),
      "largeMemoryClassMb" to (am?.largeMemoryClass ?: 0),
      "lowRamDevice" to (am?.isLowRamDevice ?: false),
    )
  }

}
