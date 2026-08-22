package expo.modules.kizilkannativecore

import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * KIZILKAN Native Core — Phase 1
 *
 * Büyük playlist JSON parse işini Hermes/JS thread'den çıkarır. Expo
 * AsyncFunction varsayılan olarak JS runtime thread'inden farklı native queue'da
 * çalışır. Böylece native ScrollView akıcıyken Pressable/navigation event'lerinin
 * dakikalarca beklemesine yol açan JSON.parse darboğazı kaldırılır.
 */
class KizilkanNativeCoreModule : Module() {
  data class CacheEntry(val stamp: Long, val size: Long, val root: JSONObject, val parseMs: Long)

  companion object {
    private val cache = ConcurrentHashMap<String, CacheEntry>()
    private val telemetry = ConcurrentHashMap<String, Map<String, Any?>>()
  }

  override fun definition() = ModuleDefinition {
    Name("KizilkanNativeCore")

    AsyncFunction("warmPlaylist") { id: String -> summary(id, loadEntry(id)) }

    AsyncFunction("readPlaylistHeavy") { id: String ->
      val started = SystemClock.elapsedRealtime()
      val entry = loadEntry(id)
      val converted = jsonObjectToMap(entry.root)
      telemetry[id] = (telemetry[id] ?: emptyMap()) + mapOf(
        "nativeReadMs" to (SystemClock.elapsedRealtime() - started),
        "bytes" to entry.size,
        "parseMs" to entry.parseMs,
      )
      converted
    }

    AsyncFunction("getPlaylistSummary") { id: String -> summary(id, loadEntry(id)) }

    AsyncFunction("getCategories") { id: String, kind: String ->
      val arr = collection(loadEntry(id).root, kind)
      val counts = linkedMapOf<String, Int>()
      for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        val g = o.optString("group", "").trim().ifEmpty { "Diğer" }
        counts[g] = (counts[g] ?: 0) + 1
      }
      counts.entries.map { mapOf<String, Any>("name" to it.key, "count" to it.value) }
    }

    AsyncFunction("queryItems") { id: String, kind: String, group: String, search: String, offset: Int, limit: Int ->
      val arr = collection(loadEntry(id).root, kind)
      val wantedGroup = group.trim()
      val q = search.trim().lowercase()
      val start = offset.coerceAtLeast(0)
      val take = limit.coerceIn(1, 500)
      val out = ArrayList<Map<String, Any?>>(take)
      var matched = 0
      var scanIndex = 0
      while (scanIndex < arr.length() && out.size < take) {
        val o = arr.optJSONObject(scanIndex)
        scanIndex += 1
        if (o == null) continue
        val g = o.optString("group", "").trim().ifEmpty { "Diğer" }
        if (wantedGroup.isNotEmpty() && wantedGroup != "__all__" && g != wantedGroup) continue
        if (q.isNotEmpty()) {
          val hay = buildString {
            append(o.optString("name", "")); append(' ')
            append(g); append(' ')
            append(o.optString("tvg_name", "")); append(' ')
            append(o.optString("genre", "")); append(' ')
            append(o.optString("cast", "")); append(' ')
            append(o.optString("director", ""))
          }.lowercase()
          if (!hay.contains(q)) continue
        }
        if (matched++ < start) continue
        out.add(jsonObjectToMap(o))
      }
      mapOf<String, Any>("items" to out, "offset" to start, "returned" to out.size, "hasMore" to (scanIndex < arr.length()))
    }

    AsyncFunction("getItem") { id: String, kind: String, itemId: String ->
      val arr = collection(loadEntry(id).root, kind)
      for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        if (o.optString("id") == itemId) return@AsyncFunction jsonObjectToMap(o)
      }
      null
    }

    Function("invalidatePlaylist") { id: String -> cache.remove(id); telemetry.remove(id); true }
    Function("clearCache") { cache.clear(); telemetry.clear(); true }
    Function("getTelemetry") { id: String -> telemetry[id] ?: emptyMap<String, Any?>() }
  }

  private fun safeId(id: String) = id.replace(Regex("[^a-zA-Z0-9_.-]"), "_")

  private fun playlistFile(id: String): File {
    val context = appContext.reactContext ?: throw IllegalStateException("Android context yok")
    return File(context.filesDir, "kizilkan/playlists/${safeId(id)}.json")
  }

  private fun loadEntry(id: String): CacheEntry {
    val file = playlistFile(id)
    if (!file.exists()) throw IllegalStateException("Playlist veri dosyası bulunamadı: $id")
    val stamp = file.lastModified()
    val size = file.length()
    val cached = cache[id]
    if (cached != null && cached.stamp == stamp && cached.size == size) {
      telemetry[id] = mapOf("cacheHit" to true, "bytes" to size, "parseMs" to cached.parseMs)
      return cached
    }
    val started = SystemClock.elapsedRealtime()
    val text = file.bufferedReader(Charsets.UTF_8).use { it.readText() }
    val root = JSONTokener(text).nextValue() as? JSONObject
      ?: throw IllegalStateException("Playlist veri dosyası nesne değil: $id")
    val parseMs = SystemClock.elapsedRealtime() - started
    val entry = CacheEntry(stamp, size, root, parseMs)
    cache[id] = entry
    telemetry[id] = mapOf(
      "cacheHit" to false, "bytes" to size, "parseMs" to parseMs,
      "channels" to (root.optJSONArray("channels")?.length() ?: 0),
      "vod" to (root.optJSONArray("vod")?.length() ?: 0),
      "series" to (root.optJSONArray("series")?.length() ?: 0),
    )
    return entry
  }

  private fun summary(id: String, entry: CacheEntry): Map<String, Any?> = mapOf(
    "id" to id, "bytes" to entry.size, "parseMs" to entry.parseMs,
    "channels" to (entry.root.optJSONArray("channels")?.length() ?: 0),
    "vod" to (entry.root.optJSONArray("vod")?.length() ?: 0),
    "series" to (entry.root.optJSONArray("series")?.length() ?: 0),
  )

  private fun collection(root: JSONObject, kind: String): JSONArray = when (kind.lowercase()) {
    "vod" -> root.optJSONArray("vod") ?: JSONArray()
    "series" -> root.optJSONArray("series") ?: JSONArray()
    else -> root.optJSONArray("channels") ?: JSONArray()
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
}
