package expo.modules.kizilkannativecore

import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.File
import java.text.Normalizer
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

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
  }

  override fun definition() = ModuleDefinition {
    Name("KizilkanNativeCore")

    AsyncFunction("warmPlaylist") { id: String ->
      val result = ensureIndexed(id)
      summary(result.snapshot, cacheHit = result.cacheHit)
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
      }
      invalidated.clear()
      telemetry.clear()
      indexLocks.clear()
      true
    }

    Function("getTelemetry") { id: String -> telemetry[id] ?: emptyMap<String, Any>() }
  }

  private fun context() = appContext.reactContext ?: throw IllegalStateException("Android context yok")
  private fun database() = KizilkanNativeDatabase.get(context())

  private fun safeId(id: String) = id.replace(Regex("[^a-zA-Z0-9_.-]"), "_")
  private fun playlistFile(id: String): File = File(context().filesDir, "kizilkan/playlists/${safeId(id)}.json")

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
    if (!file.exists()) throw IllegalStateException("Playlist veri dosyası bulunamadı: $id")
    val db = database()
    val existing = db.snapshotDao().get(id)
    if (existing != null && snapshotMatchesFile(id, existing)) {
      updateTelemetry(id, mapOf(
        "roomCacheHit" to true,
        "bytes" to existing.sourceSize,
        "importMs" to existing.importMs,
        "channels" to existing.channelsCount,
        "vod" to existing.vodCount,
        "series" to existing.seriesCount,
      ))
      return IndexResult(existing, true)
    }

    val started = SystemClock.elapsedRealtime()
    val text = file.bufferedReader(Charsets.UTF_8).use { it.readText() }
    val root = JSONTokener(text).nextValue() as? JSONObject
      ?: throw IllegalStateException("Playlist veri dosyası nesne değil: $id")

    val channels = root.optJSONArray("channels") ?: JSONArray()
    val vod = root.optJSONArray("vod") ?: JSONArray()
    val series = root.optJSONArray("series") ?: JSONArray()

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
          sourceStamp = file.lastModified(),
          sourceSize = file.length(),
          channelsCount = channels.length(),
          vodCount = vod.length(),
          seriesCount = series.length(),
          importedAtEpochMs = System.currentTimeMillis(),
          importMs = importMs,
        )
      )
    }

    invalidated.remove(id)
    val snapshot = db.snapshotDao().get(id) ?: throw IllegalStateException("Room snapshot yazılamadı: $id")
    updateTelemetry(id, mapOf(
      "roomCacheHit" to false,
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
}
