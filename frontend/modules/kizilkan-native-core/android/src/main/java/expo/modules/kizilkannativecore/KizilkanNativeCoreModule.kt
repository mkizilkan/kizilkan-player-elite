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
import java.io.ByteArrayInputStream
import java.util.UUID
import java.io.BufferedWriter
import java.io.FileOutputStream
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream
import java.time.Instant
import java.security.MessageDigest
import java.net.InetAddress
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Connection
import okhttp3.EventListener
import okhttp3.Call
import java.util.concurrent.TimeUnit
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
    // v16.14.2 Exact Wire V2: ortak pool gerçek keep-alive/connection reuse'a izin verir.
    private val magBaseClient = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).build()
    private val magSeenConnections = ConcurrentHashMap.newKeySet<String>()
  }

  override fun definition() = ModuleDefinition {
    Name("KizilkanNativeCore")

    // v16.13.8 — Native MAG exact-wire transport.
    // JS'nin "göndermek istediği" başlıklar yerine OkHttp Request'in gerçekten
    // taşıdığı başlık isimleri/şekilleri raporlanır. Gizli değerler asla dönmez.
    AsyncFunction("magExactRequest") { url: String, headersJson: String, timeoutMs: Int ->
      val headersObj = JSONObject(headersJson)
      val redirectTrace = JSONArray()
      var connectionKey = ""
      var connectionReused = false
      var routeAddressFamily = ""
      val listener = object : EventListener() {
        override fun connectionAcquired(call: Call, connection: Connection) {
          val key = Integer.toHexString(System.identityHashCode(connection))
          connectionKey = key
          connectionReused = !magSeenConnections.add(key)
          routeAddressFamily = try { if (connection.route().socketAddress.address.address.size == 4) "IPv4" else "IPv6" } catch (_: Throwable) { "" }
        }
      }
      val client = magBaseClient.newBuilder()
        .connectTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        .readTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        .writeTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        .eventListener(listener)
        .build()
      fun fp(value: String): String {
        if (value.isBlank()) return ""
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        return digest.take(6).joinToString("") { "%02x".format(it) }
      }
      fun buildRequest(target: String): Request {
        val b = Request.Builder().url(target).get()
        headersObj.keys().forEach { name -> b.header(name, headersObj.optString(name, "")) }
        return b.build()
      }
      var request = buildRequest(url)
      var response: okhttp3.Response? = null
      var redirects = 0
      val started = SystemClock.elapsedRealtime()
      try {
        while (true) {
          response?.close()
          response = client.newCall(request).execute()
          if (response.code !in listOf(301,302,303,307,308) || redirects >= 5) break
          val location = response.header("Location") ?: break
          val next = request.url.resolve(location) ?: break
          val fromHost = request.url.host
          val sameOrigin = fromHost.equals(next.host, true) && request.url.port == next.port && request.url.scheme == next.scheme
          redirectTrace.put(JSONObject().apply {
            put("status", response.code); put("fromHost", fromHost); put("toHost", next.host); put("sameOrigin", sameOrigin)
          })
          val nextHeaders = JSONObject(headersJson)
          if (!sameOrigin) { nextHeaders.remove("Authorization"); nextHeaders.remove("Cookie") }
          val b = Request.Builder().url(next).get()
          nextHeaders.keys().forEach { name -> b.header(name, nextHeaders.optString(name, "")) }
          request = b.build(); redirects++
        }
        val r = response ?: throw IllegalStateException("MAG response yok")
        val rawBody = r.body?.bytes() ?: ByteArray(0)
        val gzipByHeader = r.header("Content-Encoding")?.contains("gzip", true) == true
        val gzipByMagic = rawBody.size >= 2 && rawBody[0] == 0x1f.toByte() && rawBody[1] == 0x8b.toByte()
        val decodedBody = if (gzipByHeader || gzipByMagic) {
          try { GZIPInputStream(ByteArrayInputStream(rawBody)).use { it.readBytes() } } catch (_: Throwable) { rawBody }
        } else rawBody
        val body = decodedBody.toString(Charsets.UTF_8)
        val cookie = request.header("Cookie") ?: ""
        val auth = request.header("Authorization") ?: ""
        mapOf(
          "status" to r.code,
          "body" to body,
          "contentType" to (r.header("Content-Type") ?: ""),
          "finalUrl" to r.request.url.toString(),
          "elapsedMs" to (SystemClock.elapsedRealtime() - started),
          "redirectCount" to redirects,
          "redirects" to redirectTrace.toString(),
          "wireHeaderNames" to r.request.headers.names().sorted().joinToString(","),
          "wireHeaderSequence" to r.request.headers.map { it.first }.joinToString(","),
          "httpProtocol" to r.protocol.toString(),
          "connectionKey" to connectionKey,
          "connectionReused" to connectionReused,
          "routeAddressFamily" to routeAddressFamily,
          "tlsVersion" to (r.handshake?.tlsVersion?.javaName ?: ""),
          "cipherSuite" to (r.handshake?.cipherSuite?.javaName ?: ""),
          "addressFamilies" to try {
            InetAddress.getAllByName(r.request.url.host).map { if (it.address.size == 4) "IPv4" else "IPv6" }.distinct().joinToString(",")
          } catch (_: Throwable) { "" },
          "contentEncoding" to (r.header("Content-Encoding") ?: ""),
          "bodyBytes" to decodedBody.size,
          "rawBodyBytes" to rawBody.size,
          "gzipDecoded" to ((gzipByHeader || gzipByMagic) && decodedBody !== rawBody),
          "connectionHeader" to (r.request.header("Connection") ?: ""),
          "acceptHeader" to (r.request.header("Accept") ?: ""),
          "acceptEncodingHeader" to (r.request.header("Accept-Encoding") ?: ""),
          "cookieLength" to cookie.toByteArray(Charsets.UTF_8).size,
          "cookieTrailingSemicolon" to cookie.trimEnd().endsWith(";"),
          "cookieHasEncodedMac" to Regex("mac=[0-9A-Fa-f]{2}%3A[0-9A-Fa-f]{2}%3A").containsMatchIn(cookie),
          "cookiePresent" to cookie.isNotBlank(),
          "cookieFingerprint" to fp(cookie),
          "authorizationPresent" to auth.isNotBlank(),
          "authorizationFingerprint" to fp(auth),
          "userAgent" to (r.request.header("User-Agent") ?: ""),
          "referer" to (r.request.header("Referer") ?: ""),
          "xUserAgent" to (r.request.header("X-User-Agent") ?: "")
        )
      } finally { response?.close() }
    }

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


    // v16.14.2 — INCREMENTAL SYNC V2 (client snapshot diff, server-delta değildir).
    // JS yalnız elde ettiği yeni snapshot'ları gönderir. SHA-256 Android tarafında
    // hesaplanır; değişmeyen kind atlanır, değişen TÜM kind'lar TEK Room transaction
    // içinde commit edilir. Fingerprint/changedKinds ancak transaction + count verify
    // başarıyla bittikten sonra JS'e döner; metadata commit kararı JS tarafındadır.
    AsyncFunction("syncPlaylistKindsJson") { id: String, payloadJson: String, previousFingerprintsJson: String ->
      val root = JSONTokener(payloadJson).nextValue() as? JSONObject
        ?: throw IllegalStateException("Incremental sync payload nesne değil: $id")
      val previous = try { JSONObject(previousFingerprintsJson) } catch (_: Throwable) { JSONObject() }
      val kinds = listOf("live", "vod", "series")
      fun digest(arr: JSONArray): String {
        val md = MessageDigest.getInstance("SHA-256")
        val bytes = arr.toString().toByteArray(Charsets.UTF_8)
        md.update(bytes)
        return md.digest().joinToString("") { "%02x".format(it) }
      }
      val arrays = linkedMapOf<String, JSONArray>()
      val fingerprints = linkedMapOf<String, String>()
      kinds.forEach { kind ->
        if (root.has(kind) && !root.isNull(kind)) {
          val arr = root.optJSONArray(kind)
            ?: throw IllegalStateException("Incremental sync kind array değil: $id/$kind")
          arrays[kind] = arr
          fingerprints[kind] = digest(arr)
        }
      }
      if (arrays.isEmpty()) throw IllegalStateException("Incremental sync payload boş: $id")
      val db = database()
      val dao = db.mediaDao()
      var snapshotRecovered = false
      var snapshotRecoveryState = "SNAPSHOT_READY"
      var before = db.snapshotDao().get(id)
      if (before == null) {
        val liveRows = dao.count(id, "live")
        val vodRows = dao.count(id, "vod")
        val seriesRows = dao.count(id, "series")
        val hasRows = liveRows + vodRows + seriesRows > 0
        val fullPayload = kinds.all { arrays.containsKey(it) }
        if (hasRows) {
          before = PlaylistSnapshotEntity(id, 0L, 0L, liveRows, vodRows, seriesRows, System.currentTimeMillis(), 0L)
          db.snapshotDao().put(before!!)
          snapshotRecovered = true
          snapshotRecoveryState = "SNAPSHOT_REBUILT_FROM_ROWS"
        } else if (fullPayload) {
          before = PlaylistSnapshotEntity(id, 0L, 0L, 0, 0, 0, System.currentTimeMillis(), 0L)
          db.snapshotDao().put(before!!)
          snapshotRecovered = true
          snapshotRecoveryState = "SNAPSHOT_BOOTSTRAP_EMPTY_FULL_PAYLOAD"
        } else {
          snapshotRecoveryState = "SNAPSHOT_MISSING_EMPTY_PARTIAL"
          throw IllegalStateException("Room snapshot bulunamadı ve partial payload ile güvenli onarım mümkün değil: $id")
        }
      }
      val verifiedBefore = before!!
      if (dao.count(id, "live") != verifiedBefore.channelsCount || dao.count(id, "vod") != verifiedBefore.vodCount || dao.count(id, "series") != verifiedBefore.seriesCount) {
        throw IllegalStateException("Room snapshot recovery verify başarısız: $id")
      }
      val changed = mutableListOf<String>()
      val skipped = mutableListOf<String>()
      val repaired = mutableListOf<String>()
      fun snapshotCount(kind: String): Int = when (kind) {
        "live" -> verifiedBefore.channelsCount
        "vod" -> verifiedBefore.vodCount
        "series" -> verifiedBefore.seriesCount
        else -> -1
      }
      // v16.14.3 — fingerprint tek başına skip yetkisi VERMEZ. Metadata aynı olsa
      // bile Room satırları crash/restore/corruption sonrası eksilmiş olabilir.
      // Skip ancak fingerprint + gerçek Room row-count + snapshot-count üçlüsü
      // incoming snapshot ile birebir eşleşiyorsa yapılır; aksi halde kind repair-write'a alınır.
      arrays.forEach { (kind, arr) ->
        val fp = fingerprints[kind].orEmpty()
        val fingerprintMatches = previous.optString(kind, "").equals(fp, ignoreCase = true)
        val expected = arr.length()
        val actualRows = dao.count(id, kind)
        val actualSnapshot = snapshotCount(kind)
        if (fingerprintMatches && actualRows == expected && actualSnapshot == expected) {
          skipped += kind
        } else {
          changed += kind
          if (fingerprintMatches) repaired += kind
        }
      }
      val started = SystemClock.elapsedRealtime()
      if (changed.isNotEmpty()) {
        db.runInTransaction {
          val dao = db.mediaDao()
          changed.forEach { kind ->
            val arr = arrays[kind] ?: return@forEach
            dao.deleteKind(id, kind)
            insertCollection(dao, id, kind, arr)
          }
          val liveCount = arrays["live"]?.let { if ("live" in changed) it.length() else verifiedBefore.channelsCount } ?: verifiedBefore.channelsCount
          val vodCount = arrays["vod"]?.let { if ("vod" in changed) it.length() else verifiedBefore.vodCount } ?: verifiedBefore.vodCount
          val seriesCount = arrays["series"]?.let { if ("series" in changed) it.length() else verifiedBefore.seriesCount } ?: verifiedBefore.seriesCount
          db.snapshotDao().put(verifiedBefore.copy(
            sourceStamp = 0L, sourceSize = 0L,
            channelsCount = liveCount, vodCount = vodCount, seriesCount = seriesCount,
            importedAtEpochMs = System.currentTimeMillis(),
            importMs = SystemClock.elapsedRealtime() - started,
          ))
          // Transaction içi gerçek row-count doğrulaması. Herhangi biri saparsa rollback.
          changed.forEach { kind ->
            val expected = arrays[kind]?.length() ?: 0
            val actual = dao.count(id, kind)
            if (actual != expected) throw IllegalStateException("Room kind verify başarısız: $id/$kind expected=$expected actual=$actual")
          }
        }
      }
      invalidated.remove(id)
      val snapshot = db.snapshotDao().get(id) ?: throw IllegalStateException("Room snapshot sync sonrası yok: $id")
      // v16.14.3 fail-closed final verification: supplied TÜM kind'lar (changed + skipped)
      // commit sonrasında canonical Room row-count ve snapshot count ile tekrar doğrulanır.
      arrays.forEach { (kind, arr) ->
        val expected = arr.length()
        val actualRows = dao.count(id, kind)
        val actualSnapshot = when (kind) {
          "live" -> snapshot.channelsCount
          "vod" -> snapshot.vodCount
          "series" -> snapshot.seriesCount
          else -> -1
        }
        if (actualRows != expected || actualSnapshot != expected) {
          throw IllegalStateException("Room supplied-kind final verify başarısız: $id/$kind expected=$expected rows=$actualRows snapshot=$actualSnapshot")
        }
      }
      val outFp = linkedMapOf<String, String>()
      kinds.forEach { kind ->
        val current = fingerprints[kind] ?: previous.optString(kind, "")
        if (current.isNotBlank()) outFp[kind] = current
      }
      updateTelemetry(id, mapOf(
        "canonicalStore" to "Room/SQLite",
        "incrementalSyncV2" to true,
        "changedKinds" to changed.joinToString(","),
        "skippedKinds" to skipped.joinToString(","),
        "repairedKinds" to repaired.joinToString(","),
        "snapshotRecovered" to snapshotRecovered,
        "snapshotRecoveryState" to snapshotRecoveryState,
        "syncMs" to (SystemClock.elapsedRealtime() - started),
        "channels" to snapshot.channelsCount, "vod" to snapshot.vodCount, "series" to snapshot.seriesCount,
      ))
      mapOf(
        "summary" to summary(snapshot, cacheHit = changed.isEmpty()),
        "changedKinds" to changed,
        "skippedKinds" to skipped,
        "repairedKinds" to repaired,
        "fingerprints" to outFp,
        "roomVerified" to true,
        "snapshotRecovered" to snapshotRecovered,
        "snapshotRecoveryState" to snapshotRecoveryState,
        "elapsedMs" to (SystemClock.elapsedRealtime() - started),
      )
    }

    // v15.2.25 RC1: MAG live-first commit sonrasında VOD/Series enrichment,
    // mevcut LIVE satırlarını JS'e geri taşımadan yalnız hedef Room kind'ını
    // transaction içinde atomik değiştirir. Böylece 20k+ live katalog tekrar
    // stringify edilmez ve updatePlaylist ağır merge yolu tetiklenmez.
    AsyncFunction("replacePlaylistKindJson") { id: String, kindRaw: String, jsonArray: String ->
      val kind = normalizeKind(kindRaw)
      val started = SystemClock.elapsedRealtime()
      val arr = JSONTokener(jsonArray).nextValue() as? JSONArray
        ?: throw IllegalStateException("Playlist kind JSON array değil: $id/$kind")
      val db = database()
      val daoBefore = db.mediaDao()
      var baseSnapshot = db.snapshotDao().get(id)
      if (baseSnapshot == null) {
        val liveRows = daoBefore.count(id, "live")
        val vodRows = daoBefore.count(id, "vod")
        val seriesRows = daoBefore.count(id, "series")
        if (liveRows + vodRows + seriesRows <= 0) {
          throw IllegalStateException("Room snapshot bulunamadı; boş canonical store üzerinde partial replace fail-closed: $id/$kind")
        }
        baseSnapshot = PlaylistSnapshotEntity(id, 0L, 0L, liveRows, vodRows, seriesRows, System.currentTimeMillis(), 0L)
        db.snapshotDao().put(baseSnapshot!!)
      }
      val verifiedBase = baseSnapshot!!
      if (daoBefore.count(id, "live") != verifiedBase.channelsCount || daoBefore.count(id, "vod") != verifiedBase.vodCount || daoBefore.count(id, "series") != verifiedBase.seriesCount) {
        throw IllegalStateException("Room snapshot partial recovery verify başarısız: $id")
      }
      db.runInTransaction {
        val dao = db.mediaDao()
        dao.deleteKind(id, kind)
        insertCollection(dao, id, kind, arr)
        val old = db.snapshotDao().get(id) ?: verifiedBase
        val liveCount = if (kind == "live") arr.length() else old.channelsCount
        val vodCount = if (kind == "vod") arr.length() else old.vodCount
        val seriesCount = if (kind == "series") arr.length() else old.seriesCount
        db.snapshotDao().put(old.copy(
          sourceStamp = 0L,
          sourceSize = 0L,
          channelsCount = liveCount,
          vodCount = vodCount,
          seriesCount = seriesCount,
          importedAtEpochMs = System.currentTimeMillis(),
          importMs = SystemClock.elapsedRealtime() - started,
        ))
      }
      invalidated.remove(id)
      val snapshot = db.snapshotDao().get(id) ?: throw IllegalStateException("Room snapshot güncellenemedi: $id")
      updateTelemetry(id, mapOf(
        "canonicalStore" to "Room/SQLite",
        "partialKindReplace" to kind,
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
      BufferedWriter(OutputStreamWriter(FileOutputStream(file, true), Charsets.UTF_8), 64 * 1024).use { out ->
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

    // v15.2.14: Tam yedek restore, gerçek playlist ID'lerine doğrudan yazmaz.
    // Önce __kzb_stage_* ID'leri tamamen doğrulanır; ardından TEK Room transaction
    // içinde mevcut snapshot rollback alanına taşınır ve staging canlı ID'ye alınır.
    AsyncFunction("applyAtomicPlaylistRestore") { sessionId: String, mappingsJson: String ->
      applyAtomicPlaylistRestore(sessionId, mappingsJson)
    }

    AsyncFunction("finalizeAtomicPlaylistRestore") { sessionId: String, targetIdsJson: String ->
      finalizeAtomicPlaylistRestore(sessionId, targetIdsJson)
    }

    AsyncFunction("rollbackAtomicPlaylistRestore") { sessionId: String, targetIdsJson: String ->
      rollbackAtomicPlaylistRestore(sessionId, targetIdsJson)
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

    // v16.13.0: Database Health Center. Salt-okuma yolu DB/WAL/SHM boyutunu,
    // SQLite page/freelist durumunu, orphan/retention adaylarini ve playlist bazli
    // gercek satir sayilarini raporlar. includeIntegrity=true disinda mutasyon yapmaz.
    AsyncFunction("getDatabaseHealth") { includeIntegrity: Boolean ->
      databaseHealth(includeIntegrity)
    }

    // v16.13.0: Bakim tek bir "VACUUM" dugmesi degildir. diagnose salt-okuma,
    // quick checkpoint/optimize, normal orphan+retention+checkpoint, deep ise bunlara
    // ek olarak kullanicinin acik istegiyle VACUUM uygular. Her kosu before/after
    // olcumu ve gercek silinen satir sayilarini dondurur.
    AsyncFunction("runDatabaseMaintenance") { modeRaw: String ->
      runDatabaseMaintenance(modeRaw)
    }

    // v15.2.4: cihaz üstünde gerçek RAM görünürlüğü. Bu telemetri tahmin değil,
    // Android Debug.MemoryInfo + Runtime/ActivityManager değerlerinden gelir.
    Function("getRuntimeMemory") {
      runtimeMemory()
    }

    Function("getLastExitInfo") {
      exitHistory(1).firstOrNull() ?: emptyMap<String, Any>()
    }

    Function("getExitHistory") { maxNum: Int ->
      exitHistory(maxNum.coerceIn(1, 10))
    }

    // v15.2.22: KIZILKAN Flight Recorder v4 — native Room/WAL + kritik crash/ANR journal.
    Function("initializeBlackBox") {
      NativeBlackBox.initialize(context())
    }

    AsyncFunction("appendBlackBoxEvent") { rawJson: String ->
      NativeBlackBox.appendJson(context(), rawJson)
    }

    Function("appendCriticalBlackBoxEvent") { rawJson: String ->
      NativeBlackBox.appendCriticalJson(context(), rawJson)
    }

    AsyncFunction("getBlackBoxSnapshot") { limit: Int ->
      NativeBlackBox.snapshot(context(), limit.coerceIn(1, 50000))
    }

    AsyncFunction("getBlackBoxHealth") {
      NativeBlackBox.health(context())
    }

    Function("setBlackBoxCheckpoint") { summary: String ->
      NativeBlackBox.setCheckpoint(context(), summary)
    }

    AsyncFunction("clearBlackBox") {
      NativeBlackBox.clear(context())
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

    /**
     * v17.0.0 TV/PLAYER NAVIGATION: Prev/Next için full playlist hydrate ETME.
     * Room'un canonical sortOrder + group/search scope'u üzerinden yalnız iki
     * komşuyu döndürür. wrap=true canlı TV zapping davranışını (son->ilk) korur.
     */
    AsyncFunction("getPlaybackNeighbors") { id: String, kind: String, itemId: String, group: String, search: String, wrap: Boolean ->
      val started = SystemClock.elapsedRealtime()
      ensureIndexed(id)
      val dao = database().mediaDao()
      val k = normalizeKind(kind)
      val wantedGroup = group.trim().ifEmpty { "__all__" }
      val q = normalizeSearch(search)
      val currentSort = dao.getSortOrder(id, k, itemId)
      if (currentSort == null) {
        mapOf<String, Any?>(
          "currentId" to itemId, "previous" to null, "next" to null,
          "position" to 0, "total" to 0, "found" to false,
          "elapsedMs" to (SystemClock.elapsedRealtime() - started),
        )
      } else {
        val total = dao.scopedCount(id, k, wantedGroup, q)
        var prevRaw = dao.previousRaw(id, k, wantedGroup, q, currentSort)
        var nextRaw = dao.nextRaw(id, k, wantedGroup, q, currentSort)
        if (wrap && total > 1) {
          if (prevRaw == null) prevRaw = dao.lastRaw(id, k, wantedGroup, q)
          if (nextRaw == null) nextRaw = dao.firstRaw(id, k, wantedGroup, q)
        }
        mapOf<String, Any?>(
          "currentId" to itemId,
          "previous" to prevRaw?.let(::rawToMap),
          "next" to nextRaw?.let(::rawToMap),
          "position" to (dao.scopedCountBefore(id, k, wantedGroup, q, currentSort) + 1),
          "total" to total,
          "found" to true,
          "elapsedMs" to (SystemClock.elapsedRealtime() - started),
        )
      }
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
      val runId = UUID.randomUUID().toString()
      BulkPlaylistImportService.seedStartingSnapshot(ctx, runId)
      val intent = Intent(ctx, BulkPlaylistImportService::class.java).apply {
        action = BulkPlaylistImportService.ACTION_START
        putExtra("jobsJson", jobsJson)
        putExtra("concurrency", concurrency.coerceIn(1, 4))
        putExtra("runId", runId)
      }
      if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(intent) else ctx.startService(intent)
      runId
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

  private fun restoreRollbackId(sessionId: String, targetId: String): String =
    "__kzb_rollback_${sessionId}_${targetId}"

  /**
   * Room içindeki bir playlist'i kopyalamadan yeniden adlandırır. Hedef önceden
   * temizlenir; bütün çağrılar dışarıdaki runInTransaction içinde yapılmalıdır.
   */
  private fun movePlaylistRows(db: KizilkanNativeDatabase, fromId: String, toId: String) {
    if (fromId == toId) return
    db.mediaDao().deletePlaylist(toId)
    db.epgDao().deletePlaylist(toId)
    db.snapshotDao().delete(toId)
    db.mediaDao().movePlaylist(fromId, toId)
    db.epgDao().movePlaylist(fromId, toId)
    val snap = db.snapshotDao().get(fromId)
    if (snap != null) {
      db.snapshotDao().put(snap.copy(playlistId = toId))
      db.snapshotDao().delete(fromId)
    }
  }

  /**
   * mappingsJson: [{"targetId":"...","stageId":"..."|null}]
   * stageId null ise playlist tam snapshot'ta yoktur ve başarı halinde silinir.
   * Her stage snapshot daha transaction başlamadan doğrulanır.
   */
  private fun applyAtomicPlaylistRestore(sessionId: String, mappingsJson: String): Boolean {
    if (sessionId.isBlank()) throw IllegalArgumentException("Restore sessionId boş")
    val arr = JSONTokener(mappingsJson).nextValue() as? JSONArray
      ?: throw IllegalArgumentException("Restore mapping JSON array değil")
    val mappings = ArrayList<Pair<String, String?>>(arr.length())
    val db = database()
    for (i in 0 until arr.length()) {
      val obj = arr.optJSONObject(i) ?: throw IllegalArgumentException("Restore mapping nesne değil: $i")
      val targetId = obj.optString("targetId", "").trim()
      val stageId = if (obj.isNull("stageId")) null else obj.optString("stageId", "").trim().ifEmpty { null }
      if (targetId.isEmpty()) throw IllegalArgumentException("Restore targetId eksik: $i")
      if (targetId.startsWith("__kzb_")) throw IllegalArgumentException("Restore targetId ayrılmış namespace kullanıyor: $targetId")
      if (stageId != null && db.snapshotDao().get(stageId) == null) {
        throw IllegalStateException("Restore staging Room snapshot bulunamadı: $targetId")
      }
      mappings.add(targetId to stageId)
    }
    db.runInTransaction {
      for ((targetId, stageId) in mappings) {
        val rollbackId = restoreRollbackId(sessionId, targetId)
        // Önce geçmiş yarım session kalıntısı varsa temizle.
        db.mediaDao().deletePlaylist(rollbackId)
        db.epgDao().deletePlaylist(rollbackId)
        db.snapshotDao().delete(rollbackId)
        // Boş snapshot veya yalnız EPG içeren eski playlist de rollback'e taşınır.
        movePlaylistRows(db, targetId, rollbackId)
        if (stageId != null) movePlaylistRows(db, stageId, targetId)
      }
    }
    for ((targetId, stageId) in mappings) {
      invalidated.remove(targetId); telemetry.remove(targetId)
      if (stageId != null) { invalidated.remove(stageId); telemetry.remove(stageId); indexLocks.remove(stageId) }
    }
    return true
  }

  private fun finalizeAtomicPlaylistRestore(sessionId: String, targetIdsJson: String): Boolean {
    val arr = JSONTokener(targetIdsJson).nextValue() as? JSONArray
      ?: throw IllegalArgumentException("Restore target list JSON array değil")
    val ids = (0 until arr.length()).map { arr.optString(it, "").trim() }.filter { it.isNotEmpty() }
    val db = database()
    db.runInTransaction {
      for (targetId in ids) {
        val rollbackId = restoreRollbackId(sessionId, targetId)
        db.mediaDao().deletePlaylist(rollbackId)
        db.epgDao().deletePlaylist(rollbackId)
        db.snapshotDao().delete(rollbackId)
      }
    }
    return true
  }

  private fun rollbackAtomicPlaylistRestore(sessionId: String, targetIdsJson: String): Boolean {
    val arr = JSONTokener(targetIdsJson).nextValue() as? JSONArray
      ?: throw IllegalArgumentException("Restore target list JSON array değil")
    val ids = (0 until arr.length()).map { arr.optString(it, "").trim() }.filter { it.isNotEmpty() }
    val db = database()
    db.runInTransaction {
      for (targetId in ids) {
        val rollbackId = restoreRollbackId(sessionId, targetId)
        // Yeni restore edilmiş target'ı kaldır. Eski snapshot varsa geri taşı.
        db.mediaDao().deletePlaylist(targetId)
        db.epgDao().deletePlaylist(targetId)
        db.snapshotDao().delete(targetId)
        movePlaylistRows(db, rollbackId, targetId)
      }
    }
    for (targetId in ids) invalidated.remove(targetId)
    return true
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


  private val DB_NAME = "kizilkan-native-core.db"
  private val NORMAL_TELEMETRY_RETENTION_MS = 7L * 24L * 60L * 60L * 1000L
  private val CRITICAL_TELEMETRY_RETENTION_MS = 30L * 24L * 60L * 60L * 1000L
  private val EPG_RETENTION_SEC = 14L * 24L * 60L * 60L
  private val WAL_WARN_BYTES = 64L * 1024L * 1024L

  private fun sqliteLong(sql: String, fallback: Long = 0L): Long {
    val cursor = database().openHelper.writableDatabase.query(sql)
    return cursor.use { if (it.moveToFirst()) it.getLong(0) else fallback }
  }

  private fun sqliteString(sql: String, fallback: String = ""): String {
    val cursor = database().openHelper.writableDatabase.query(sql)
    return cursor.use { if (it.moveToFirst()) it.getString(0) ?: fallback else fallback }
  }

  private fun foreignKeyViolationCount(): Int {
    val cursor = database().openHelper.writableDatabase.query("PRAGMA foreign_key_check")
    return cursor.use { var n = 0; while (it.moveToNext()) n++; n }
  }

  private fun walCheckpoint(modeRaw: String): Map<String, Any> {
    val mode = when (modeRaw.uppercase(Locale.ROOT)) {
      "FULL" -> "FULL"
      "RESTART" -> "RESTART"
      "TRUNCATE" -> "TRUNCATE"
      else -> "PASSIVE"
    }
    val cursor = database().openHelper.writableDatabase.query("PRAGMA wal_checkpoint($mode)")
    return cursor.use {
      if (!it.moveToFirst()) mapOf("mode" to mode, "busy" to -1, "logFrames" to -1, "checkpointedFrames" to -1)
      else mapOf(
        "mode" to mode,
        "busy" to it.getInt(0),
        "logFrames" to it.getInt(1),
        "checkpointedFrames" to it.getInt(2),
      )
    }
  }

  private fun playlistDatabaseRows(): List<Map<String, Any>> {
    val sql = """
      SELECT s.playlistId,
             s.channelsCount, s.vodCount, s.seriesCount, s.importedAtEpochMs, s.importMs,
             COALESCE((SELECT COUNT(*) FROM media_items m WHERE m.playlistId=s.playlistId AND m.kind='live'),0) AS liveActual,
             COALESCE((SELECT COUNT(*) FROM media_items m WHERE m.playlistId=s.playlistId AND m.kind='vod'),0) AS vodActual,
             COALESCE((SELECT COUNT(*) FROM media_items m WHERE m.playlistId=s.playlistId AND m.kind='series'),0) AS seriesActual,
             COALESCE((SELECT COUNT(*) FROM epg_programs e WHERE e.playlistId=s.playlistId),0) AS epgActual,
             COALESCE((SELECT SUM(LENGTH(CAST(m.rawJson AS BLOB))) FROM media_items m WHERE m.playlistId=s.playlistId),0) AS mediaPayloadBytes
      FROM playlist_snapshots s
      ORDER BY (liveActual + vodActual + seriesActual + epgActual) DESC
      LIMIT 500
    """.trimIndent()
    val cursor = database().openHelper.writableDatabase.query(sql)
    return cursor.use {
      val out = ArrayList<Map<String, Any>>()
      while (it.moveToNext()) {
        out += mapOf(
          "playlistId" to it.getString(0),
          "snapshotLive" to it.getInt(1),
          "snapshotVod" to it.getInt(2),
          "snapshotSeries" to it.getInt(3),
          "importedAtEpochMs" to it.getLong(4),
          "lastImportMs" to it.getLong(5),
          "live" to it.getInt(6),
          "vod" to it.getInt(7),
          "series" to it.getInt(8),
          "epg" to it.getInt(9),
          // Gercek SQLite payload byte toplamidir; index/page overhead dahil edilmedigi icin
          // kullaniciya fiziksel "disk kullanimi" diye sunulmaz.
          "logicalMediaPayloadBytes" to it.getLong(10),
        )
      }
      out
    }
  }

  private fun databaseHealth(includeIntegrity: Boolean): Map<String, Any> {
    // DB instance'i once acar; boyutlar daha sonra okunur ki WAL dosyasi gercek durumu gostersin.
    val db = database()
    val dbFile = context().getDatabasePath(DB_NAME)
    val wal = File(dbFile.absolutePath + "-wal")
    val shm = File(dbFile.absolutePath + "-shm")
    val pageCount = sqliteLong("PRAGMA page_count")
    val freelistCount = sqliteLong("PRAGMA freelist_count")
    val pageSize = sqliteLong("PRAGMA page_size", 4096L).coerceAtLeast(1L)
    val reclaimableBytes = freelistCount * pageSize
    val allocatedBytes = pageCount * pageSize
    val reclaimablePercent = if (pageCount > 0L) ((freelistCount * 10000L) / pageCount).toDouble() / 100.0 else 0.0
    val mediaOrphans = try { db.mediaDao().orphanCount() } catch (_: Throwable) { -1 }
    val epgOrphans = try { db.epgDao().orphanCount() } catch (_: Throwable) { -1 }
    val now = System.currentTimeMillis()
    val oldNormal = try { db.diagnosticDao().expiredNormalCount(now - NORMAL_TELEMETRY_RETENTION_MS) } catch (_: Throwable) { -1 }
    val oldCritical = try { db.diagnosticDao().expiredCriticalCount(now - CRITICAL_TELEMETRY_RETENTION_MS) } catch (_: Throwable) { -1 }
    val oldEpg = try { db.epgDao().expiredCount((now / 1000L) - EPG_RETENTION_SEC) } catch (_: Throwable) { -1 }
    val quickCheck = if (includeIntegrity) try { sqliteString("PRAGMA quick_check", "unknown") } catch (t: Throwable) { "error:${t.javaClass.simpleName}" } else "not_requested"
    val fkViolations = if (includeIntegrity) try { foreignKeyViolationCount() } catch (_: Throwable) { -1 } else -1
    val dbBytes = if (dbFile.exists()) dbFile.length() else 0L
    val walBytes = if (wal.exists()) wal.length() else 0L
    val shmBytes = if (shm.exists()) shm.length() else 0L
    val healthReasons = ArrayList<String>()
    if (includeIntegrity && quickCheck != "ok") healthReasons += "integrity_check"
    if (includeIntegrity && fkViolations > 0) healthReasons += "foreign_key_violation"
    if (mediaOrphans > 0) healthReasons += "media_orphans"
    if (epgOrphans > 0) healthReasons += "epg_orphans"
    if (oldEpg > 0) healthReasons += "expired_epg"
    if (oldNormal > 0 || oldCritical > 0) healthReasons += "expired_telemetry"
    if (walBytes >= WAL_WARN_BYTES) healthReasons += "large_wal"
    if (reclaimablePercent >= 20.0) healthReasons += "high_freelist"
    val status = when {
      includeIntegrity && (quickCheck != "ok" || fkViolations > 0) -> "critical"
      healthReasons.isNotEmpty() -> "attention"
      else -> "healthy"
    }
    // Otomatik silme yapmiyoruz; olculen duruma gore en dusuk gerekli bakim seviyesini oneriyoruz.
    val recommendedMaintenance = when {
      status == "critical" -> "diagnose"
      reclaimablePercent >= 20.0 && dbBytes >= 150L * 1024L * 1024L -> "deep"
      mediaOrphans > 0 || epgOrphans > 0 || oldEpg > 0 || oldNormal > 0 || oldCritical > 0 -> "normal"
      walBytes >= WAL_WARN_BYTES -> "quick"
      else -> "none"
    }
    return mapOf(
      "schemaVersion" to 4,
      "databaseName" to DB_NAME,
      "status" to status,
      "healthReasons" to healthReasons,
      "recommendedMaintenance" to recommendedMaintenance,
      "integrityChecked" to includeIntegrity,
      "databaseBytes" to dbBytes,
      "walBytes" to walBytes,
      "shmBytes" to shmBytes,
      "totalBytes" to (dbBytes + walBytes + shmBytes),
      "pageCount" to pageCount,
      "pageSize" to pageSize,
      "freelistCount" to freelistCount,
      "allocatedBytesFromPages" to allocatedBytes,
      "reclaimableBytes" to reclaimableBytes,
      "reclaimablePercent" to reclaimablePercent,
      "journalMode" to try { sqliteString("PRAGMA journal_mode", "unknown") } catch (_: Throwable) { "unknown" },
      "snapshotCount" to sqliteLong("SELECT COUNT(*) FROM playlist_snapshots"),
      "mediaCount" to try { db.mediaDao().totalCount() } catch (_: Throwable) { 0 },
      "epgCount" to try { db.epgDao().totalCount() } catch (_: Throwable) { 0 },
      "diagnosticEventCount" to try { db.diagnosticDao().count() } catch (_: Throwable) { 0 },
      "criticalDiagnosticEventCount" to try { db.diagnosticDao().criticalCount() } catch (_: Throwable) { 0 },
      "mediaOrphans" to mediaOrphans,
      "epgOrphans" to epgOrphans,
      "expiredEpgCandidates" to oldEpg,
      "expiredNormalTelemetryCandidates" to oldNormal,
      "expiredCriticalTelemetryCandidates" to oldCritical,
      "telemetryRetentionNormalDays" to 7,
      "telemetryRetentionCriticalDays" to 30,
      "epgRetentionDays" to 14,
      "quickCheck" to quickCheck,
      "foreignKeyViolations" to fkViolations,
      "playlists" to playlistDatabaseRows(),
      "measuredAtEpochMs" to now,
    )
  }

  private fun runDatabaseMaintenance(modeRaw: String): Map<String, Any> {
    val mode = when (modeRaw.trim().lowercase(Locale.ROOT)) {
      "diagnose", "quick", "normal", "deep" -> modeRaw.trim().lowercase(Locale.ROOT)
      else -> throw IllegalArgumentException("Bilinmeyen DB bakim modu: $modeRaw")
    }
    val startedWall = System.currentTimeMillis()
    val started = SystemClock.elapsedRealtime()
    val operationId = "dbm-${startedWall.toString(36)}-${UUID.randomUUID().toString().take(8)}"
    val before = databaseHealth(includeIntegrity = mode == "diagnose" || mode == "deep")
    if (mode == "diagnose") {
      return mapOf(
        "mode" to mode, "operationId" to operationId, "changed" to false,
        "durationMs" to (SystemClock.elapsedRealtime() - started), "before" to before, "after" to before,
      )
    }

    NativeBlackBox.appendJson(context(), JSONObject()
      .put("id", "$operationId-start")
      .put("at", startedWall)
      .put("domain", "database")
      .put("event", "DB_MAINTENANCE_START")
      .put("traceId", operationId)
      .put("operationId", operationId)
      .put("stage", "maintenance")
      .put("outcome", "started")
      .put("data", JSONObject().put("mode", mode).put("beforeTotalBytes", before["totalBytes"] ?: 0L))
      .toString())

    var removedMediaOrphans = 0
    var removedEpgOrphans = 0
    var removedExpiredEpg = 0
    var removedNormalTelemetry = 0
    var removedCriticalTelemetry = 0
    var checkpoint: Map<String, Any> = emptyMap()
    var vacuumRan = false
    var optimizeRan = false
    try {
      val db = database()
      if (mode == "normal" || mode == "deep") {
        val now = System.currentTimeMillis()
        db.runInTransaction {
          removedMediaOrphans = db.mediaDao().deleteOrphans()
          removedEpgOrphans = db.epgDao().deleteOrphans()
          removedExpiredEpg = db.epgDao().deleteExpired((now / 1000L) - EPG_RETENTION_SEC)
          removedNormalTelemetry = db.diagnosticDao().deleteExpiredNormal(now - NORMAL_TELEMETRY_RETENTION_MS)
          removedCriticalTelemetry = db.diagnosticDao().deleteExpiredCritical(now - CRITICAL_TELEMETRY_RETENTION_MS)
        }
      }
      // optimize, istatistikleri ihtiyaca gore gunceller; REINDEX gibi korlemesine tum indeksi yeniden kurmaz.
      db.openHelper.writableDatabase.execSQL("PRAGMA optimize")
      optimizeRan = true
      checkpoint = walCheckpoint(if (mode == "deep") "TRUNCATE" else "PASSIVE")
      if (mode == "deep") {
        // VACUUM transaction disinda calismalidir. Deep bakim kullanici tarafindan acikca secilmis pahali yoldur.
        db.openHelper.writableDatabase.execSQL("VACUUM")
        vacuumRan = true
      }
      val after = databaseHealth(includeIntegrity = mode == "deep")
      val duration = SystemClock.elapsedRealtime() - started
      val sizeDelta = ((after["totalBytes"] as? Number)?.toLong() ?: 0L) - ((before["totalBytes"] as? Number)?.toLong() ?: 0L)
      // WAL/checkpoint davranisi nedeniyle fiziksel toplam bazen gecici buyuyebilir.
      // "reclaimed" hicbir zaman negatif raporlanmaz; signed delta ayri alanda korunur.
      val reclaimed = (-sizeDelta).coerceAtLeast(0L)
      val result = mapOf<String, Any>(
        "mode" to mode,
        "operationId" to operationId,
        "changed" to (removedMediaOrphans + removedEpgOrphans + removedExpiredEpg + removedNormalTelemetry + removedCriticalTelemetry > 0 || vacuumRan),
        "durationMs" to duration,
        "removedMediaOrphans" to removedMediaOrphans,
        "removedEpgOrphans" to removedEpgOrphans,
        "removedExpiredEpg" to removedExpiredEpg,
        "removedNormalTelemetry" to removedNormalTelemetry,
        "removedCriticalTelemetry" to removedCriticalTelemetry,
        "checkpoint" to checkpoint,
        "optimizeRan" to optimizeRan,
        "vacuumRan" to vacuumRan,
        "reclaimedTotalBytes" to reclaimed,
        "totalBytesDelta" to sizeDelta,
        "before" to before,
        "after" to after,
      )
      NativeBlackBox.appendJson(context(), JSONObject()
        .put("id", "$operationId-done")
        .put("domain", "database")
        .put("event", "DB_MAINTENANCE_COMPLETED")
        .put("traceId", operationId)
        .put("operationId", operationId)
        .put("stage", "maintenance")
        .put("durationMs", duration)
        .put("outcome", "success")
        .put("data", JSONObject()
          .put("mode", mode)
          .put("removedMediaOrphans", removedMediaOrphans)
          .put("removedEpgOrphans", removedEpgOrphans)
          .put("removedExpiredEpg", removedExpiredEpg)
          .put("removedNormalTelemetry", removedNormalTelemetry)
          .put("removedCriticalTelemetry", removedCriticalTelemetry)
          .put("vacuumRan", vacuumRan)
          .put("reclaimedTotalBytes", reclaimed)
          .put("totalBytesDelta", sizeDelta))
        .toString())
      return result
    } catch (t: Throwable) {
      val duration = SystemClock.elapsedRealtime() - started
      NativeBlackBox.appendJson(context(), JSONObject()
        .put("id", "$operationId-failed")
        .put("domain", "database")
        .put("event", "DB_MAINTENANCE_FAILED")
        .put("severity", "error")
        .put("traceId", operationId)
        .put("operationId", operationId)
        .put("stage", "maintenance")
        .put("durationMs", duration)
        .put("outcome", "failed")
        .put("errorClass", t.javaClass.simpleName.take(96))
        .put("data", JSONObject().put("mode", mode).put("message", (t.message ?: "").take(500)))
        .toString())
      throw t
    }
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
        when (classifyM3u(line, ext, obj.optString("group", ""), name)) {
          "vod" -> vod.put(JSONObject().apply {
            put("id", "vod-$stable"); put("name", name); put("group", obj.optString("group", "Genel")); put("poster", obj.opt("logo"))
            put("url", line); put("container_ext", ext ?: "mp4"); put("stream_id", JSONObject.NULL)
            for (k in listOf("year","rating","rating_5based","plot","cast","director","genre")) put(k, JSONObject.NULL)
          })
          "series" -> series.put(JSONObject().apply {
            put("id", "ser-$stable"); put("name", name); put("group", obj.optString("group", "Genel")); put("poster", obj.opt("logo")); put("series_id", JSONObject.NULL)
            put("url", line); put("container_ext", ext ?: JSONObject.NULL)
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

  private fun classifyM3u(url: String, ext: String?, group: String, name: String): String {
    val u = url.lowercase(Locale.ROOT)
    val g = group.lowercase(Locale.ROOT)
    val text = "$g ${name.lowercase(Locale.ROOT)}"
    if (Regex("/(series|tv-series|episodes?)/").containsMatchIn(u)) return "series"
    if (Regex("/(movie|vod|films?|movies?)/").containsMatchIn(u)) return "vod"
    if (Regex("\\b(s\\d{1,2}e\\d{1,3}|\\d{1,2}x\\d{1,3}|season\\s*\\d+|sezon\\s*\\d+|episode\\s*\\d+|bölüm\\s*\\d+)\\b", RegexOption.IGNORE_CASE).containsMatchIn(text) ||
        Regex("\\b(dizi|diziler|series|tv shows?|serials?)\\b", RegexOption.IGNORE_CASE).containsMatchIn(g)) return "series"
    if (Regex("\\b(film|filmler|movie|movies|vod|sinema|cinema)\\b", RegexOption.IGNORE_CASE).containsMatchIn(g)) return "vod"
    if (ext != null && ext in setOf("mp4","mkv","avi","mov","webm","flv","wmv","m4v")) return "vod"
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

  private fun exitReasonLabel(reason: Int): String = if (Build.VERSION.SDK_INT >= 30) when (reason) {
    android.app.ApplicationExitInfo.REASON_CRASH -> "CRASH"
    android.app.ApplicationExitInfo.REASON_CRASH_NATIVE -> "CRASH_NATIVE"
    android.app.ApplicationExitInfo.REASON_ANR -> "ANR"
    android.app.ApplicationExitInfo.REASON_LOW_MEMORY -> "LOW_MEMORY"
    android.app.ApplicationExitInfo.REASON_USER_REQUESTED -> "USER_REQUESTED"
    android.app.ApplicationExitInfo.REASON_USER_STOPPED -> "USER_STOPPED"
    android.app.ApplicationExitInfo.REASON_SIGNALED -> "SIGNALED"
    android.app.ApplicationExitInfo.REASON_EXIT_SELF -> "EXIT_SELF"
    android.app.ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "DEPENDENCY_DIED"
    android.app.ApplicationExitInfo.REASON_OTHER -> "OTHER"
    else -> "REASON_$reason"
  } else "UNAVAILABLE"

  private fun exitHistory(maxNum: Int): List<Map<String, Any>> {
    if (Build.VERSION.SDK_INT < 30) return emptyList()
    val am = context().getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    return am.getHistoricalProcessExitReasons(context().packageName, 0, maxNum).map { info ->
      val traceAvailable = try { info.traceInputStream?.use { true } ?: false } catch (_: Throwable) { false }
      val stateSummary = try { info.processStateSummary?.toString(Charsets.UTF_8) ?: "" } catch (_: Throwable) { "" }
      mapOf<String, Any>(
        "reason" to info.reason,
        "reasonLabel" to exitReasonLabel(info.reason),
        "status" to info.status,
        "importance" to info.importance,
        "timestamp" to info.timestamp,
        "processName" to (info.processName ?: ""),
        "description" to (info.description?.toString() ?: ""),
        "pssKb" to info.pss,
        "rssKb" to info.rss,
        "traceAvailable" to traceAvailable,
        "processStateSummary" to stateSummary,
      )
    }
  }

  private fun runtimeMemory(): Map<String, Any> {
    val info = Debug.MemoryInfo()
    Debug.getMemoryInfo(info)
    val runtime = Runtime.getRuntime()
    val am = context().getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    val javaUsed = runtime.totalMemory() - runtime.freeMemory()
    val sys = ActivityManager.MemoryInfo()
    am?.getMemoryInfo(sys)
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
      "systemAvailMemBytes" to sys.availMem,
      "systemTotalMemBytes" to sys.totalMem,
      "systemThresholdBytes" to sys.threshold,
      "systemLowMemory" to sys.lowMemory,
      "threadCount" to try { Thread.getAllStackTraces().size } catch (_: Throwable) { -1 },
      "fdCount" to try { File("/proc/self/fd").list()?.size ?: -1 } catch (_: Throwable) { -1 },
      "uptimeMs" to SystemClock.uptimeMillis(),
      "elapsedRealtimeMs" to SystemClock.elapsedRealtime(),
    )
  }

}
