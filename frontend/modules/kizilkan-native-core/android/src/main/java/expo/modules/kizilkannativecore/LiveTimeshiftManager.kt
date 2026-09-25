package expo.modules.kizilkannativecore

import android.content.Context
import android.os.SystemClock
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URI
import java.security.MessageDigest
import java.util.ArrayDeque
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/**
 * v17.10.2 RC1 — application-owned rolling live timeshift.
 *
 * The player consumes a private localhost HLS window. Upstream HLS media
 * segments are cached verbatim. A linear MPEG-TS HTTP stream is packet-aligned
 * and cut into short local HLS segments. This makes pause/rewind independent of
 * provider-side DVR while keeping the actual media bytes on app-owned disk.
 */
internal class LiveTimeshiftManager(private val context: Context) {
  companion object {
    private const val MIN_WINDOW_SECONDS = 60
    private const val MAX_WINDOW_SECONDS = 3 * 60 * 60
    private const val DEFAULT_WINDOW_SECONDS = 30 * 60
    private const val MIN_MAX_BYTES = 64L * 1024L * 1024L
    private const val DEFAULT_MAX_BYTES = 768L * 1024L * 1024L
    private const val TS_PACKET = 188
    private const val TS_SEGMENT_MS = 2_000L
    /**
     * v17.10.3 — İLK SEGMENT KISA KESİLİR (açılış gecikmesi)
     * Oynatıcı ilk segment tamamlanana kadar beklemek zorunda. 2 sn eşiği ve
     * "kontrol yalnız yeni paket gelince" kuralı, sağlayıcı yayını düzensiz
     * gönderdiğinde ilk kesimi saniyelerce geciktiriyordu (25.09 cihaz kaydı:
     * ilk segment 7,6 sn, READY 8,2 sn). İlk segment 0,5 sn'de kesilir;
     * sonrakiler yine 2 sn. HLS'te kısa bir ilk segment geçerlidir.
     */
    private const val FIRST_TS_SEGMENT_MS = 500L
    private const val MIN_KEEP_SEGMENTS = 5
  }

  private data class Segment(
    val seq: Long,
    val file: File,
    val duration: Double,
    val createdAtMs: Long,
    val discontinuity: Boolean = false,
    val keyTag: String? = null,
    val mapTag: String? = null,
  )

  private data class HlsSegmentSpec(
    val upstreamSeq: Long,
    val uri: String,
    val playlistBaseUrl: String,
    val duration: Double,
    val discontinuity: Boolean,
    val keyLine: String?,
    val mapLine: String?,
    val byteRange: String?,
  )

  private data class ParsedMediaPlaylist(
    val targetDuration: Int,
    val segments: List<HlsSegmentSpec>,
    val endList: Boolean,
  )

  private inner class Session(
    val id: String,
    val sourceUrl: String,
    val headers: Map<String, String>,
    requestedWindowSec: Int,
    requestedMaxBytes: Long,
  ) {
    val root = File(context.cacheDir, "kizilkan-timeshift/$id")
    val segments = ArrayDeque<Segment>()
    val seenUpstream = ConcurrentHashMap.newKeySet<String>()
    val assetFiles = ConcurrentHashMap<String, File>()
    val lock = Any()
    val localSeq = AtomicLong(0L)
    val executor = Executors.newCachedThreadPool { r ->
      Thread(r, "kizilkan-timeshift-$id").apply { isDaemon = true }
    }

    val maxWindowSec = requestedWindowSec.coerceIn(MIN_WINDOW_SECONDS, MAX_WINDOW_SECONDS)
    val maxBytes: Long

    @Volatile var running = true
    @Volatile var ready = false
    @Volatile var mode = "probing"
    @Volatile var error = ""
    @Volatile var targetDuration = 2
    @Volatile var totalBytes = 0L
    @Volatile var highestUpstreamSeq = Long.MIN_VALUE
    @Volatile var startedAtMs = System.currentTimeMillis()
    @Volatile var lastSegmentAtMs = 0L
    @Volatile var workerCall: Call? = null
    @Volatile var server: ServerSocket? = null
    @Volatile var port: Int = 0

    init {
      root.deleteRecursively()
      root.mkdirs()
      val usable = try { root.parentFile?.usableSpace ?: 0L } catch (_: Throwable) { 0L }
      val storageBound = if (usable > 0) max(MIN_MAX_BYTES, usable / 4L) else DEFAULT_MAX_BYTES
      val requested = if (requestedMaxBytes > 0) requestedMaxBytes else DEFAULT_MAX_BYTES
      maxBytes = min(requested.coerceAtLeast(MIN_MAX_BYTES), storageBound)
    }

    fun localUrl(): String = if (port > 0) "http://127.0.0.1:$port/playlist.m3u8" else ""

    fun start() {
      startServer()
      executor.execute { runWorker() }
    }


    fun stop(deleteFiles: Boolean = true) {
      running = false
      try { workerCall?.cancel() } catch (_: Throwable) {}
      try { server?.close() } catch (_: Throwable) {}
      executor.shutdownNow()
      if (deleteFiles) {
        try { root.deleteRecursively() } catch (_: Throwable) {}
      }
    }

    fun status(): Map<String, Any> {
      val snapshot = synchronized(lock) { segments.toList() }
      val window = snapshot.sumOf { it.duration }
      return linkedMapOf(
        "sessionId" to id,
        "ready" to ready,
        "running" to running,
        "mode" to mode,
        "localUrl" to localUrl(),
        "segmentCount" to snapshot.size,
        "windowSeconds" to window,
        "diskBytes" to totalBytes,
        "maxBytes" to maxBytes,
        "maxWindowSeconds" to maxWindowSec,
        "targetDuration" to targetDuration,
        "startedAtMs" to startedAtMs,
        "lastSegmentAtMs" to lastSegmentAtMs,
        "error" to error,
      )
    }

    private fun startServer() {
      val socket = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
      server = socket
      port = socket.localPort
      executor.execute {
        while (running) {
          try {
            val client = socket.accept()
            executor.execute { serve(client) }
          } catch (_: Throwable) {
            if (!running) break
          }
        }
      }
    }

    private fun serve(socket: Socket) {
      socket.use { client ->
        client.soTimeout = 12_000
        val input = BufferedInputStream(client.getInputStream())
        val out = BufferedOutputStream(client.getOutputStream())
        val requestLine = readAsciiLine(input) ?: return
        val parts = requestLine.split(' ')
        val method = parts.getOrNull(0)?.uppercase(Locale.ROOT) ?: "GET"
        val rawPath = parts.getOrNull(1) ?: "/"
        var rangeHeader: String? = null
        while (true) {
          val line = readAsciiLine(input) ?: break
          if (line.isEmpty()) break
          if (line.startsWith("Range:", true)) rangeHeader = line.substringAfter(':').trim()
        }
        if (method != "GET" && method != "HEAD") {
          writeTextResponse(out, 405, "text/plain", "Method Not Allowed", method == "HEAD")
          return
        }
        val path = rawPath.substringBefore('?')
        when {
          path == "/" || path == "/playlist.m3u8" -> {
            if (!ready) {
              writeTextResponse(out, 503, "text/plain", if (error.isNotBlank()) error else "Timeshift preparing", method == "HEAD")
            } else {
              writeTextResponse(out, 200, "application/vnd.apple.mpegurl", buildPlaylist(), method == "HEAD", noCache = true)
            }
          }
          path.startsWith("/segment/") -> {
            val seq = path.substringAfterLast('/').substringBefore('.').toLongOrNull()
            val seg = synchronized(lock) { segments.firstOrNull { it.seq == seq } }
            if (seg == null || !seg.file.exists()) writeTextResponse(out, 404, "text/plain", "Not Found", method == "HEAD")
            else writeFileResponse(out, seg.file, contentTypeFor(seg.file), rangeHeader, method == "HEAD")
          }
          path.startsWith("/asset/") -> {
            val key = path.substringAfter("/asset/").substringBefore('/')
            val file = assetFiles[key]
            if (file == null || !file.exists()) writeTextResponse(out, 404, "text/plain", "Not Found", method == "HEAD")
            else writeFileResponse(out, file, contentTypeFor(file), rangeHeader, method == "HEAD")
          }
          else -> writeTextResponse(out, 404, "text/plain", "Not Found", method == "HEAD")
        }
      }
    }

    private fun buildPlaylist(): String {
      val snapshot = synchronized(lock) { segments.toList() }
      if (snapshot.isEmpty()) return "#EXTM3U\n#EXT-X-VERSION:3\n"
      val maxDuration = max(targetDuration, ceil(snapshot.maxOf { it.duration }).toInt().coerceAtLeast(1))
      val sb = StringBuilder()
      sb.append("#EXTM3U\n")
      sb.append("#EXT-X-VERSION:6\n")
      sb.append("#EXT-X-TARGETDURATION:").append(maxDuration).append('\n')
      sb.append("#EXT-X-MEDIA-SEQUENCE:").append(snapshot.first().seq).append('\n')
      var lastKey: String? = null
      var lastMap: String? = null
      for (seg in snapshot) {
        if (seg.discontinuity) sb.append("#EXT-X-DISCONTINUITY\n")
        if (seg.keyTag != null && seg.keyTag != lastKey) { sb.append(seg.keyTag).append('\n'); lastKey = seg.keyTag }
        if (seg.mapTag != null && seg.mapTag != lastMap) { sb.append(seg.mapTag).append('\n'); lastMap = seg.mapTag }
        sb.append("#EXTINF:").append(String.format(Locale.US, "%.3f", seg.duration.coerceAtLeast(0.05))).append(",\n")
        sb.append("/segment/").append(seg.seq).append('.').append(seg.file.extension.ifBlank { "ts" }).append('\n')
      }
      return sb.toString()
    }

    private fun runWorker() {
      val client = streamingClient()
      var response: Response? = null
      try {
        val req = requestBuilder(sourceUrl).build()
        val call = client.newCall(req)
        workerCall = call
        response = call.execute()
        if (!response.isSuccessful) throw IllegalStateException("HTTP ${response.code}")
        val finalUrl = response.request.url.toString()
        val contentType = response.header("Content-Type", "") ?: ""
        if (looksLikeHls(finalUrl, contentType)) {
          val text = response.body?.string() ?: throw IllegalStateException("HLS body empty")
          response?.close(); response = null
          mode = "hls"
          runHls(finalUrl, text)
          return
        }

        val body = response.body ?: throw IllegalStateException("Stream body empty")
        val input = BufferedInputStream(body.byteStream(), 128 * 1024)
        val probe = ByteArrayOutputStream()
        val tmp = ByteArray(4096)
        while (running && probe.size() < 16 * 1024) {
          val n = input.read(tmp)
          if (n <= 0) break
          probe.write(tmp, 0, n)
          val bytes = probe.toByteArray()
          val textHead = bytes.take(min(bytes.size, 256)).toByteArray().toString(Charsets.UTF_8).trimStart('\uFEFF', ' ', '\r', '\n', '\t')
          if (textHead.startsWith("#EXTM3U")) {
            val rest = input.readBytes()
            probe.write(rest)
            response?.close(); response = null
            mode = "hls"
            runHls(finalUrl, probe.toByteArray().toString(Charsets.UTF_8))
            return
          }
          if (findTsSync(bytes) >= 0 && bytes.size >= TS_PACKET * 4) break
        }
        val initial = probe.toByteArray()
        if (findTsSync(initial) < 0) throw IllegalStateException("UNSUPPORTED_LINEAR_FORMAT")
        mode = "ts"
        runTs(input, initial)
      } catch (t: Throwable) {
        if (running) {
          error = (t.message ?: t.javaClass.simpleName).take(220)
          running = false
        }
      } finally {
        try { response?.close() } catch (_: Throwable) {}
      }
    }

    private fun runHls(initialUrl: String, initialText: String) {
      var mediaUrl = initialUrl
      var firstText: String? = initialText
      if (isMasterPlaylist(initialText)) {
        mediaUrl = selectVariant(initialUrl, initialText) ?: throw IllegalStateException("HLS_VARIANT_UNSUPPORTED")
        firstText = null
      }
      var firstPass = true
      var consecutivePlaylistFailures = 0
      while (running) {
        try {
          val text = firstText ?: fetchText(mediaUrl)
          firstText = null
          if (isMasterPlaylist(text)) {
            mediaUrl = selectVariant(mediaUrl, text) ?: throw IllegalStateException("HLS_VARIANT_UNSUPPORTED")
            continue
          }
          val parsed = parseMediaPlaylist(mediaUrl, text)
          targetDuration = parsed.targetDuration.coerceAtLeast(1)
          val candidates = if (firstPass) {
            parsed.segments.takeLast(2)
          } else {
            parsed.segments.filter { it.upstreamSeq > highestUpstreamSeq }
          }
          firstPass = false
          for (spec in candidates) {
            if (!running) break
            val identity = "${spec.upstreamSeq}|${spec.uri}|${spec.byteRange.orEmpty()}"
            if (!seenUpstream.add(identity)) continue
            try {
              val localKey = spec.keyLine?.let { rewriteAssetTag(it, spec.playlistBaseUrl) }
              val localMap = spec.mapLine?.let { rewriteAssetTag(it, spec.playlistBaseUrl) }
              val ext = extensionFromUrl(spec.uri, "ts")
              val seq = localSeq.getAndIncrement()
              val file = File(root, "seg-$seq.$ext")
              downloadToFile(spec.uri, file, spec.byteRange)
              addSegment(Segment(seq, file, spec.duration, System.currentTimeMillis(), spec.discontinuity, localKey, localMap))
              highestUpstreamSeq = max(highestUpstreamSeq, spec.upstreamSeq)
            } catch (t: Throwable) {
              seenUpstream.remove(identity)
              if (segments.isEmpty()) throw t
            }
          }
          consecutivePlaylistFailures = 0
          if (parsed.endList) {
            throw IllegalStateException("HLS_ENDLIST_NOT_LIVE")
          }
          Thread.sleep((targetDuration * 500L).coerceIn(500L, 4_000L))
        } catch (t: Throwable) {
          if (!running) break
          consecutivePlaylistFailures += 1
          if (segments.isEmpty() || consecutivePlaylistFailures >= 4 || t.message == "HLS_VARIANT_UNSUPPORTED" || t.message == "HLS_ENDLIST_NOT_LIVE") throw t
          Thread.sleep((500L * consecutivePlaylistFailures).coerceAtMost(2_000L))
        }
      }
    }

    private fun runTs(input: BufferedInputStream, initialBytes: ByteArray) {
      var patPacket: ByteArray? = null
      var pmtPacket: ByteArray? = null
      var pmtPid = -1
      var carry = initialBytes
      var out: FileOutputStream? = null
      var currentFile: File? = null
      var currentSeq = -1L
      var segmentStartedElapsed = 0L
      var payloadBytes = 0L

      fun startSegment(nowElapsed: Long) {
        currentSeq = localSeq.getAndIncrement()
        currentFile = File(root, "seg-$currentSeq.ts")
        out = FileOutputStream(currentFile!!)
        segmentStartedElapsed = nowElapsed
        payloadBytes = 0L
        patPacket?.let { out?.write(it); payloadBytes += it.size }
        pmtPacket?.let { out?.write(it); payloadBytes += it.size }
      }

      var producedSegments = 0
      fun finishSegment(nowElapsed: Long) {
        val file = currentFile ?: return
        try { out?.flush(); out?.fd?.sync() } catch (_: Throwable) {}
        try { out?.close() } catch (_: Throwable) {}
        out = null
        val elapsed = max(250L, nowElapsed - segmentStartedElapsed)
        if (file.length() >= TS_PACKET * 10L) {
          addSegment(Segment(currentSeq, file, elapsed / 1000.0, System.currentTimeMillis()))
          producedSegments++
        } else file.delete()
        currentFile = null
      }

      val readBuf = ByteArray(128 * 1024)
      while (running) {
        if (carry.size < TS_PACKET * 4) {
          val n = input.read(readBuf)
          if (n <= 0) break
          carry += readBuf.copyOf(n)
        }
        val sync = findTsSync(carry)
        if (sync < 0) {
          carry = if (carry.size > TS_PACKET * 3) carry.takeLast(TS_PACKET * 3).toByteArray() else carry
          val n = input.read(readBuf)
          if (n <= 0) break
          carry += readBuf.copyOf(n)
          continue
        }
        if (sync > 0) carry = carry.copyOfRange(sync, carry.size)
        val packetCount = carry.size / TS_PACKET
        if (packetCount <= 0) continue
        val nowElapsed = SystemClock.elapsedRealtime()
        if (out == null) startSegment(nowElapsed)
        for (i in 0 until packetCount) {
          val packet = carry.copyOfRange(i * TS_PACKET, (i + 1) * TS_PACKET)
          if (packet[0] != 0x47.toByte()) continue
          val pid = ((packet[1].toInt() and 0x1F) shl 8) or (packet[2].toInt() and 0xFF)
          if (pid == 0) {
            patPacket = packet
            parsePmtPid(packet)?.let { pmtPid = it }
          } else if (pid == pmtPid && pmtPid >= 0) {
            pmtPacket = packet
          }
          out?.write(packet)
          payloadBytes += packet.size
          val packetNow = SystemClock.elapsedRealtime()
          val minSegmentMs = if (producedSegments == 0) FIRST_TS_SEGMENT_MS else TS_SEGMENT_MS
          if (packetNow - segmentStartedElapsed >= minSegmentMs && payloadBytes >= TS_PACKET * 64L) {
            finishSegment(packetNow)
            startSegment(packetNow)
          }
        }
        carry = carry.copyOfRange(packetCount * TS_PACKET, carry.size)
      }
      finishSegment(SystemClock.elapsedRealtime())
      if (running) {
        if (segments.isEmpty()) throw IllegalStateException("TS_STREAM_ENDED_BEFORE_BUFFER")
        throw IllegalStateException("TS_UPSTREAM_ENDED")
      }
    }

    private fun addSegment(segment: Segment) {
      synchronized(lock) {
        segments.addLast(segment)
        totalBytes += segment.file.length()
        lastSegmentAtMs = segment.createdAtMs
        pruneLocked()
        if (!ready && segments.isNotEmpty()) {
          ready = true
        }
      }
    }

    private fun pruneLocked() {
      fun windowSeconds(): Double = segments.sumOf { it.duration }
      while (segments.size > MIN_KEEP_SEGMENTS && (windowSeconds() > maxWindowSec || totalBytes > maxBytes || lowStorage())) {
        val old = segments.removeFirst()
        totalBytes = (totalBytes - old.file.length()).coerceAtLeast(0L)
        try { old.file.delete() } catch (_: Throwable) {}
      }
    }

    private fun lowStorage(): Boolean = try { root.usableSpace in 1 until (256L * 1024L * 1024L) } catch (_: Throwable) { false }

    private fun fetchText(url: String): String {
      val call = requestClient().newCall(requestBuilder(url).build())
      workerCall = call
      call.execute().use { response ->
        if (!response.isSuccessful) throw IllegalStateException("HLS HTTP ${response.code}")
        return response.body?.string() ?: throw IllegalStateException("HLS body empty")
      }
    }

    private fun downloadToFile(url: String, file: File, byteRange: String?) {
      val b = requestBuilder(url)
      if (!byteRange.isNullOrBlank()) {
        parseByteRange(byteRange)?.let { (start, end) -> b.header("Range", "bytes=$start-$end") }
      }
      val call = requestClient().newCall(b.build())
      workerCall = call
      call.execute().use { response ->
        if (!response.isSuccessful && response.code != 206) throw IllegalStateException("SEGMENT HTTP ${response.code}")
        val body = response.body ?: throw IllegalStateException("Segment body empty")
        FileOutputStream(file).use { output -> body.byteStream().copyTo(output, 128 * 1024) }
      }
    }

    private fun cacheAsset(url: String, base: String): String {
      val resolved = resolveUrl(base, url)
      val id = sha256(resolved).take(20)
      assetFiles[id]?.takeIf { it.exists() }?.let { return id }
      val ext = extensionFromUrl(resolved, "bin")
      val file = File(root, "asset-$id.$ext")
      downloadToFile(resolved, file, null)
      assetFiles[id] = file
      return id
    }

    private fun rewriteAssetTag(line: String, base: String): String {
      if (line.contains("METHOD=NONE", true)) return line
      val uri = Regex("""URI=(?:\"([^\"]+)\"|'([^']+)'|([^,]+))""").find(line)?.groupValues?.drop(1)?.firstOrNull { it.isNotBlank() } ?: return line
      val id = cacheAsset(uri, base)
      val file = assetFiles[id] ?: return line
      return line.replace(Regex("""URI=(?:\"[^\"]+\"|'[^']+'|[^,]+)"""), "URI=\"/asset/$id/${file.name}\"")
    }

    private fun parseMediaPlaylist(baseUrl: String, text: String): ParsedMediaPlaylist {
      val lines = text.replace("\r\n", "\n").replace('\r', '\n').lines()
      var mediaSequence = 0L
      var target = 2
      var duration = 0.0
      var discontinuity = false
      var keyLine: String? = null
      var mapLine: String? = null
      var byteRange: String? = null
      var rangeNextOffset = 0L
      var seqOffset = 0L
      val specs = ArrayList<HlsSegmentSpec>()
      for (raw in lines) {
        val line = raw.trim()
        when {
          line.startsWith("#EXT-X-MEDIA-SEQUENCE:", true) -> mediaSequence = line.substringAfter(':').trim().toLongOrNull() ?: 0L
          line.startsWith("#EXT-X-TARGETDURATION:", true) -> target = line.substringAfter(':').trim().toIntOrNull() ?: target
          line.startsWith("#EXTINF:", true) -> duration = line.substringAfter(':').substringBefore(',').trim().toDoubleOrNull() ?: target.toDouble()
          line.equals("#EXT-X-DISCONTINUITY", true) -> discontinuity = true
          line.startsWith("#EXT-X-KEY:", true) -> keyLine = line
          line.startsWith("#EXT-X-MAP:", true) -> mapLine = line
          line.startsWith("#EXT-X-BYTERANGE:", true) -> {
            val rawRange = line.substringAfter(':').trim()
            val len = rawRange.substringBefore('@').toLongOrNull()
            val explicit = rawRange.substringAfter('@', "").toLongOrNull()
            if (len != null) {
              val start = explicit ?: rangeNextOffset
              val end = start + len - 1
              byteRange = "$start-$end"
              rangeNextOffset = end + 1
            }
          }
          line.isNotEmpty() && !line.startsWith('#') -> {
            specs.add(HlsSegmentSpec(
              upstreamSeq = mediaSequence + seqOffset,
              uri = resolveUrl(baseUrl, line),
              playlistBaseUrl = baseUrl,
              duration = if (duration > 0) duration else target.toDouble(),
              discontinuity = discontinuity,
              keyLine = keyLine,
              mapLine = mapLine,
              byteRange = byteRange,
            ))
            seqOffset += 1
            duration = 0.0
            discontinuity = false
            byteRange = null
          }
        }
      }
      return ParsedMediaPlaylist(target.coerceAtLeast(1), specs, lines.any { it.trim().equals("#EXT-X-ENDLIST", true) })
    }

    private fun selectVariant(baseUrl: String, text: String): String? {
      val lines = text.replace("\r\n", "\n").replace('\r', '\n').lines()
      data class Variant(val bandwidth: Long, val url: String, val externalAudio: Boolean)
      val variants = ArrayList<Variant>()
      var pending: String? = null
      for (raw in lines) {
        val line = raw.trim()
        if (line.startsWith("#EXT-X-STREAM-INF:", true)) {
          pending = line.substringAfter(':')
        } else if (pending != null && line.isNotBlank() && !line.startsWith('#')) {
          val attrs = pending!!
          val bw = Regex("(?:AVERAGE-)?BANDWIDTH=(\\d+)", RegexOption.IGNORE_CASE).find(attrs)?.groupValues?.getOrNull(1)?.toLongOrNull() ?: 0L
          val externalAudio = Regex("(?:^|,)AUDIO=", RegexOption.IGNORE_CASE).containsMatchIn(attrs)
          variants.add(Variant(bw, resolveUrl(baseUrl, line), externalAudio))
          pending = null
        }
      }
      val muxed = variants.filter { !it.externalAudio }
      // Serving only the selected media playlist cannot reproduce an external
      // AUDIO rendition graph from the master playlist without a second local
      // rendition playlist. Fall back to the upstream player instead of
      // silently dropping audio.
      return muxed.maxByOrNull { it.bandwidth }?.url
    }

    private fun isMasterPlaylist(text: String): Boolean = text.lineSequence().any { it.trim().startsWith("#EXT-X-STREAM-INF:", true) }

    private fun requestBuilder(url: String): Request.Builder {
      val b = Request.Builder().url(url).get()
      headers.forEach { (k, v) -> if (k.isNotBlank() && v.isNotBlank()) b.header(k, v) }
      return b
    }

    private fun requestClient(): OkHttpClient = OkHttpClient.Builder()
      .followRedirects(true)
      .followSslRedirects(true)
      .connectTimeout(12, TimeUnit.SECONDS)
      .readTimeout(20, TimeUnit.SECONDS)
      .writeTimeout(12, TimeUnit.SECONDS)
      .build()

    private fun streamingClient(): OkHttpClient = requestClient().newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).build()
  }

  private val sessions = ConcurrentHashMap<String, Session>()

  init {
    // Previous process death cannot leave a hidden cache forever. Active files
    // exist only in this manager instance, so startup cleanup is safe.
    try { File(context.cacheDir, "kizilkan-timeshift").deleteRecursively() } catch (_: Throwable) {}
  }

  fun start(sourceUrl: String, headersJson: String, windowSeconds: Int = DEFAULT_WINDOW_SECONDS, maxBytes: Long = DEFAULT_MAX_BYTES): Map<String, Any> {
    if (!sourceUrl.startsWith("http://", true) && !sourceUrl.startsWith("https://", true)) {
      return mapOf("ready" to false, "running" to false, "error" to "UNSUPPORTED_SCHEME", "localUrl" to "", "sessionId" to "")
    }
    val headersObj = try { JSONObject(headersJson) } catch (_: Throwable) { JSONObject() }
    val headers = LinkedHashMap<String, String>()
    headersObj.keys().forEach { key -> headers[key] = headersObj.optString(key, "") }
    val id = "ts-${System.currentTimeMillis().toString(36)}-${sha256(sourceUrl + headersJson).take(10)}"
    val session = Session(id, sourceUrl, headers, windowSeconds, maxBytes)
    sessions[id] = session
    session.start()
    // Return immediately. JS keeps the player source gated while polling this
    // session for the first physically committed segment; unsupported sources
    // therefore fall back without blocking an Expo native worker thread.
    return session.status()
  }

  fun status(id: String): Map<String, Any> = sessions[id]?.status() ?: mapOf(
    "sessionId" to id, "ready" to false, "running" to false, "localUrl" to "", "error" to "NOT_FOUND",
  )

  fun stop(id: String): Boolean {
    val s = sessions.remove(id) ?: return false
    s.stop()
    return true
  }

  fun stopAll(): Int {
    val copy = sessions.values.toList()
    sessions.clear()
    copy.forEach { it.stop() }
    return copy.size
  }

  private fun looksLikeHls(url: String, contentType: String): Boolean {
    val u = url.lowercase(Locale.ROOT)
    val c = contentType.lowercase(Locale.ROOT)
    return u.substringBefore('?').endsWith(".m3u8") || c.contains("mpegurl") || c.contains("vnd.apple.mpegurl")
  }

  private fun findTsSync(bytes: ByteArray): Int {
    if (bytes.isEmpty()) return -1
    val limit = min(bytes.size - 1, TS_PACKET * 3)
    for (i in 0..max(0, limit)) {
      if (bytes[i] != 0x47.toByte()) continue
      var good = 1
      var pos = i + TS_PACKET
      while (pos < bytes.size && good < 4) {
        if (bytes[pos] != 0x47.toByte()) break
        good += 1; pos += TS_PACKET
      }
      if (good >= 3 || (good >= 2 && bytes.size < TS_PACKET * 3)) return i
    }
    return -1
  }

  private fun parsePmtPid(packet: ByteArray): Int? {
    if (packet.size != TS_PACKET || packet[0] != 0x47.toByte()) return null
    val payloadStart = (packet[1].toInt() and 0x40) != 0
    val afc = (packet[3].toInt() shr 4) and 0x03
    if (afc == 0 || afc == 2) return null
    var off = 4
    if (afc == 3) {
      val adaptation = packet[off].toInt() and 0xFF
      off += 1 + adaptation
    }
    if (off >= packet.size) return null
    if (payloadStart) {
      val pointer = packet[off].toInt() and 0xFF
      off += 1 + pointer
    }
    if (off + 12 >= packet.size || (packet[off].toInt() and 0xFF) != 0x00) return null
    val sectionLength = ((packet[off + 1].toInt() and 0x0F) shl 8) or (packet[off + 2].toInt() and 0xFF)
    val sectionEnd = min(packet.size, off + 3 + sectionLength - 4)
    var p = off + 8
    while (p + 4 <= sectionEnd) {
      val program = ((packet[p].toInt() and 0xFF) shl 8) or (packet[p + 1].toInt() and 0xFF)
      val pid = ((packet[p + 2].toInt() and 0x1F) shl 8) or (packet[p + 3].toInt() and 0xFF)
      if (program != 0) return pid
      p += 4
    }
    return null
  }

  private fun resolveUrl(base: String, ref: String): String = try { URI(base).resolve(ref).toString() } catch (_: Throwable) { ref }

  private fun extensionFromUrl(url: String, fallback: String): String = try {
    val name = URI(url).path.substringAfterLast('/')
    val ext = name.substringAfterLast('.', "").lowercase(Locale.ROOT)
    if (ext.matches(Regex("[a-z0-9]{1,5}"))) ext else fallback
  } catch (_: Throwable) { fallback }

  private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

  private fun parseByteRange(value: String): Pair<Long, Long>? {
    val parts = value.split('-', limit = 2)
    val start = parts.getOrNull(0)?.toLongOrNull() ?: return null
    val end = parts.getOrNull(1)?.toLongOrNull() ?: return null
    return start to end
  }

  private fun readAsciiLine(input: BufferedInputStream): String? {
    val out = ByteArrayOutputStream()
    while (true) {
      val b = input.read()
      if (b < 0) return if (out.size() == 0) null else out.toString(Charsets.US_ASCII.name()).trimEnd('\r')
      if (b == '\n'.code) return out.toString(Charsets.US_ASCII.name()).trimEnd('\r')
      if (out.size() < 8192) out.write(b)
    }
  }

  private fun writeTextResponse(out: BufferedOutputStream, code: Int, contentType: String, body: String, headOnly: Boolean, noCache: Boolean = false) {
    val bytes = body.toByteArray(Charsets.UTF_8)
    val reason = when (code) { 200 -> "OK"; 404 -> "Not Found"; 405 -> "Method Not Allowed"; 503 -> "Service Unavailable"; else -> "OK" }
    val headers = buildString {
      append("HTTP/1.1 $code $reason\r\n")
      append("Content-Type: $contentType\r\n")
      append("Content-Length: ${bytes.size}\r\n")
      append("Access-Control-Allow-Origin: *\r\n")
      if (noCache) append("Cache-Control: no-cache, no-store, must-revalidate\r\n")
      append("Connection: close\r\n\r\n")
    }
    out.write(headers.toByteArray(Charsets.US_ASCII))
    if (!headOnly) out.write(bytes)
    out.flush()
  }

  private fun writeFileResponse(out: BufferedOutputStream, file: File, contentType: String, range: String?, headOnly: Boolean) {
    val size = file.length()
    if (size <= 0L) {
      writeTextResponse(out, 404, "text/plain", "Not Found", headOnly)
      return
    }
    var start = 0L
    var end = size - 1
    var partial = false
    if (!range.isNullOrBlank() && range.startsWith("bytes=")) {
      val spec = range.substringAfter("bytes=").substringBefore(',')
      val a = spec.substringBefore('-').toLongOrNull()
      val b = spec.substringAfter('-', "").toLongOrNull()
      if (a != null && a in 0 until size) {
        start = a; end = (b ?: end).coerceIn(start, size - 1); partial = true
      }
    }
    val length = if (size <= 0) 0 else end - start + 1
    val headers = buildString {
      append(if (partial) "HTTP/1.1 206 Partial Content\r\n" else "HTTP/1.1 200 OK\r\n")
      append("Content-Type: $contentType\r\n")
      append("Accept-Ranges: bytes\r\n")
      if (partial) append("Content-Range: bytes $start-$end/$size\r\n")
      append("Content-Length: $length\r\n")
      append("Cache-Control: no-cache\r\n")
      append("Connection: close\r\n\r\n")
    }
    out.write(headers.toByteArray(Charsets.US_ASCII))
    if (!headOnly && length > 0) {
      FileInputStream(file).use { input ->
        var skipped = 0L
        while (skipped < start) {
          val n = input.skip(start - skipped)
          if (n <= 0) break
          skipped += n
        }
        val buf = ByteArray(64 * 1024)
        var remaining = length
        while (remaining > 0) {
          val n = input.read(buf, 0, min(buf.size.toLong(), remaining).toInt())
          if (n <= 0) break
          out.write(buf, 0, n)
          remaining -= n
        }
      }
    }
    out.flush()
  }

  private fun contentTypeFor(file: File): String = when (file.extension.lowercase(Locale.ROOT)) {
    "m3u8" -> "application/vnd.apple.mpegurl"
    "ts" -> "video/mp2t"
    "m4s", "mp4" -> "video/mp4"
    "aac" -> "audio/aac"
    "key", "bin" -> "application/octet-stream"
    else -> "application/octet-stream"
  }
}
