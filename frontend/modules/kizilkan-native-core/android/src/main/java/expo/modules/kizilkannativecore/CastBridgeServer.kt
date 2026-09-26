package expo.modules.kizilkannativecore

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import android.util.Base64
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.net.URI
import java.security.SecureRandom
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/**
 * v18.2.0 — CHROMECAST YAYIN KÖPRÜSÜ.
 *
 * Chromecast (Default Media Receiver) yayını KENDİSİ indirir; bu yüzden:
 *   • telefondaki yerel dosyayı (content://, file://) açamaz,
 *   • sağlayıcının istediği HTTP başlıklarını (User-Agent/Referer/Origin) gönderemez,
 *   • ham MPEG-TS canlı yayını oynatamaz (HLS ister).
 *
 * Bu sunucu telefonun ev ağı (LAN) adresinde çalışır ve Chromecast'e şunları sunar:
 *   file  : yerel dosya (Range destekli; ileri/geri sarma çalışır)
 *   proxy : uzak adres + başlıklar; HLS listelerinde segment/anahtar adresleri de köprüye çevrilir
 *   text  : uygulamanın ürettiği metin (ör. .srt → WebVTT altyazı)
 *   live  : TS canlı yayın → timeshift kaydedicisi (LiveTimeshiftManager) ile yerel HLS → proxy
 *
 * GÜVENLİK: Her yol 128 bit rastgele erişim anahtarı ister. Proxy yalnız o
 * yayının kendi kökenlerine (ilk adres + HLS listesinde görülenler) istek iletir;
 * keyfi adreslere vekillik etmez. stopAll() sunucuyu kapatır ve kaydedicileri durdurur.
 * CORS başlıkları eklenir (Cast alıcısı HLS'i tarayıcı gibi çeker).
 */
internal class CastBridgeServer(private val context: Context, private val timeshift: LiveTimeshiftManager) {
  private data class Route(
    val id: String,
    val kind: String,
    val target: String,
    val headers: Map<String, String>,
    val contentType: String,
    val allowedOrigins: MutableSet<String>,
    val inlineBody: ByteArray? = null,
    val recorderSessionId: String? = null,
  )

  private val random = SecureRandom()
  private val routes = ConcurrentHashMap<String, Route>()
  private val executor = Executors.newCachedThreadPool { r -> Thread(r, "kizilkan-cast-bridge").apply { isDaemon = true } }
  private val bytesServed = AtomicLong(0L)
  private val requests = AtomicLong(0L)
  private val rejected = AtomicLong(0L)
  @Volatile private var server: ServerSocket? = null
  @Volatile private var port = 0
  @Volatile private var token = ""
  @Volatile private var lastError = ""

  private val client: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .followRedirects(true)
      .followSslRedirects(true)
      .connectTimeout(12, TimeUnit.SECONDS)
      .readTimeout(30, TimeUnit.SECONDS)
      .build()
  }

  private fun randomHex(bytes: Int): String {
    val b = ByteArray(bytes); random.nextBytes(b)
    return b.joinToString("") { "%02x".format(it) }
  }

  /** Telefonun Wi-Fi/Ethernet IPv4 adresi (Chromecast'in erişeceği). */
  fun lanIp(): String? = try {
    val candidates = NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
      .filter { it.isUp && !it.isLoopback && !it.isVirtual }
      .flatMap { nif -> nif.inetAddresses.toList().filterIsInstance<Inet4Address>().map { nif.name to it } }
      .filter { (_, a) -> a.isSiteLocalAddress && !a.isLoopbackAddress }
    (candidates.firstOrNull { (n, _) -> n.startsWith("wlan") || n.startsWith("eth") } ?: candidates.firstOrNull())?.second?.hostAddress
  } catch (_: Throwable) { null }

  @Synchronized
  private fun ensureStarted(): Boolean {
    if (server?.isClosed == false && port > 0) return true
    return try {
      val s = ServerSocket(0, 50, InetAddress.getByName("0.0.0.0"))
      server = s
      port = s.localPort
      token = randomHex(16)
      executor.execute {
        while (!s.isClosed) {
          try {
            val c = s.accept()
            executor.execute { serve(c) }
          } catch (_: Throwable) { if (s.isClosed) break }
        }
      }
      true
    } catch (t: Throwable) {
      lastError = (t.message ?: t.javaClass.simpleName).take(160)
      false
    }
  }

  private fun originOf(url: String): String = try {
    val u = URI(url); "${u.scheme}://${u.rawAuthority}".lowercase(Locale.ROOT)
  } catch (_: Throwable) { "" }

  private fun b64url(s: String): String = Base64.encodeToString(s.toByteArray(Charsets.UTF_8), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
  private fun unb64url(s: String): String? = try { String(Base64.decode(s, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING), Charsets.UTF_8) } catch (_: Throwable) { null }

  private fun baseUrl(): String? {
    val ip = lanIp() ?: return null
    return "http://$ip:$port/$token"
  }

  private fun lastName(url: String, fallback: String): String {
    val p = url.substringBefore('?').substringBefore('#').substringAfterLast('/')
    return p.ifBlank { fallback }.replace(Regex("[^A-Za-z0-9._-]"), "_").take(80)
  }

  private fun register(route: Route, name: String): Map<String, Any> {
    if (!ensureStarted()) return mapOf("ok" to false, "error" to "SERVER_START_FAILED: $lastError")
    val base = baseUrl() ?: return mapOf("ok" to false, "error" to "NO_LAN_IP (Wi-Fi bağlı değil)")
    routes[route.id] = route
    return mapOf("ok" to true, "url" to "$base/${route.id}/$name", "routeId" to route.id, "port" to port)
  }

  private fun parseHeaders(json: String): Map<String, String> = try {
    val o = JSONObject(json); val out = LinkedHashMap<String, String>()
    o.keys().forEach { k -> val v = o.optString(k, ""); if (k.isNotBlank() && v.isNotBlank()) out[k] = v }
    out
  } catch (_: Throwable) { emptyMap() }

  fun registerFile(uri: String, contentType: String): Map<String, Any> =
    register(Route(randomHex(6), "file", uri, emptyMap(), contentType.ifBlank { "video/mp4" }, mutableSetOf()), lastName(uri, "media"))

  fun registerProxy(url: String, headersJson: String, contentType: String): Map<String, Any> =
    register(Route(randomHex(6), "proxy", url, parseHeaders(headersJson), contentType, mutableSetOf(originOf(url))), lastName(url, "stream"))

  fun registerText(body: String, contentType: String, name: String): Map<String, Any> =
    register(Route(randomHex(6), "text", "", emptyMap(), contentType.ifBlank { "text/plain; charset=utf-8" }, mutableSetOf(), body.toByteArray(Charsets.UTF_8)), name.ifBlank { "text.txt" })

  /**
   * TS canlı yayını HLS olarak sunar: kaydediciyi başlatır, ilk segment yazılana
   * kadar bekler (en fazla timeoutMs), sonra yerel HLS adresini proxy olarak kaydeder.
   * Önceki canlı köprü kaydedicileri durdurulur (tek bağlantı kuralı).
   */
  fun startLiveHls(url: String, headersJson: String, timeoutMs: Long): Map<String, Any> {
    stopLiveRecorders()
    val started = SystemClock.elapsedRealtime()
    val initial = timeshift.start(url, headersJson, 600, 256L * 1024L * 1024L)
    val sessionId = initial["sessionId"]?.toString().orEmpty()
    if (sessionId.isBlank()) return mapOf("ok" to false, "error" to (initial["error"]?.toString() ?: "RECORDER_START_FAILED"))
    var localUrl = ""
    while (SystemClock.elapsedRealtime() - started < timeoutMs) {
      val st = timeshift.status(sessionId)
      if (st["ready"] == true && st["running"] == true && !st["localUrl"]?.toString().isNullOrBlank()) { localUrl = st["localUrl"].toString(); break }
      if (st["running"] == false && !st["error"]?.toString().isNullOrBlank()) { timeshift.stop(sessionId); return mapOf("ok" to false, "error" to st["error"].toString()) }
      try { Thread.sleep(200) } catch (_: InterruptedException) { break }
    }
    if (localUrl.isBlank()) { timeshift.stop(sessionId); return mapOf("ok" to false, "error" to "RECORDER_READY_TIMEOUT") }
    val route = Route(randomHex(6), "proxy", localUrl, emptyMap(), "application/x-mpegURL", mutableSetOf(originOf(localUrl)), recorderSessionId = sessionId)
    val res = register(route, "live.m3u8")
    if (res["ok"] != true) timeshift.stop(sessionId)
    return res + mapOf("recorderSessionId" to sessionId, "elapsedMs" to (SystemClock.elapsedRealtime() - started))
  }

  private fun stopLiveRecorders() {
    routes.values.filter { it.recorderSessionId != null }.forEach { r ->
      routes.remove(r.id)
      try { timeshift.stop(r.recorderSessionId!!) } catch (_: Throwable) {}
    }
  }

  @Synchronized
  fun stopAll(): Int {
    stopLiveRecorders()
    val n = routes.size
    routes.clear()
    try { server?.close() } catch (_: Throwable) {}
    server = null; port = 0; token = ""
    return n
  }

  fun status(): Map<String, Any> = linkedMapOf(
    "running" to (server?.isClosed == false),
    "port" to port,
    "lanIp" to (lanIp() ?: ""),
    "routes" to routes.size,
    "liveRecorders" to routes.values.count { it.recorderSessionId != null },
    "requests" to requests.get(),
    "rejected" to rejected.get(),
    "bytesServed" to bytesServed.get(),
    "lastError" to lastError,
  )

  // ── HTTP ──────────────────────────────────────────────────────────────────
  private fun readLine(input: BufferedInputStream): String? {
    val sb = StringBuilder()
    while (true) {
      val c = input.read()
      if (c < 0) return if (sb.isEmpty()) null else sb.toString()
      if (c == '\n'.code) return sb.toString().trimEnd('\r')
      if (sb.length > 8192) return null
      sb.append(c.toChar())
    }
  }

  private fun writeHead(out: OutputStream, code: Int, reason: String, headers: Map<String, String>) {
    val sb = StringBuilder("HTTP/1.1 $code $reason\r\n")
    sb.append("Access-Control-Allow-Origin: *\r\n")
    sb.append("Access-Control-Allow-Headers: Range, Content-Type\r\n")
    sb.append("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n")
    sb.append("Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges\r\n")
    sb.append("Connection: close\r\n")
    headers.forEach { (k, v) -> sb.append(k).append(": ").append(v).append("\r\n") }
    sb.append("\r\n")
    out.write(sb.toString().toByteArray(Charsets.ISO_8859_1))
  }

  private fun writeText(out: OutputStream, code: Int, body: String, type: String = "text/plain; charset=utf-8", head: Boolean = false) {
    val bytes = body.toByteArray(Charsets.UTF_8)
    writeHead(out, code, if (code == 200) "OK" else if (code == 404) "Not Found" else "Error", mapOf("Content-Type" to type, "Content-Length" to bytes.size.toString(), "Cache-Control" to "no-cache"))
    if (!head) out.write(bytes)
    bytesServed.addAndGet(bytes.size.toLong())
  }

  private fun serve(socket: Socket) {
    socket.use { s ->
      s.soTimeout = 30_000
      val input = BufferedInputStream(s.getInputStream())
      val out = BufferedOutputStream(s.getOutputStream(), 64 * 1024)
      try {
        val requestLine = readLine(input) ?: return
        val parts = requestLine.split(' ')
        val method = parts.getOrNull(0)?.uppercase(Locale.ROOT) ?: "GET"
        val path = (parts.getOrNull(1) ?: "/").substringBefore('?')
        var range: String? = null
        while (true) {
          val line = readLine(input) ?: break
          if (line.isEmpty()) break
          if (line.startsWith("Range:", true)) range = line.substringAfter(':').trim()
        }
        requests.incrementAndGet()
        if (method == "OPTIONS") { writeHead(out, 204, "No Content", mapOf("Content-Length" to "0")); out.flush(); return }
        val head = method == "HEAD"
        val seg = path.trim('/').split('/')
        if (seg.size < 2 || token.isBlank() || seg[0] != token) { rejected.incrementAndGet(); writeText(out, 404, "Not Found", head = head); out.flush(); return }
        val route = routes[seg[1]] ?: run { writeText(out, 404, "Gone", head = head); out.flush(); return }
        when (route.kind) {
          "text" -> {
            val body = route.inlineBody ?: ByteArray(0)
            writeHead(out, 200, "OK", mapOf("Content-Type" to route.contentType, "Content-Length" to body.size.toString()))
            if (!head) out.write(body)
            bytesServed.addAndGet(body.size.toLong())
          }
          "file" -> serveFile(out, route, range, head)
          "proxy" -> {
            // /token/route/<ad>  → ana hedef;  /token/route/x/<b64url>/<ad> → alt kaynak
            val target = if (seg.size >= 4 && seg[2] == "x") unb64url(seg[3]) else route.target
            if (target.isNullOrBlank() || originOf(target) !in route.allowedOrigins) {
              rejected.incrementAndGet(); writeText(out, 403, "Forbidden", head = head)
            } else serveProxy(out, route, target, range, head)
          }
          else -> writeText(out, 404, "Not Found", head = head)
        }
        out.flush()
      } catch (_: Throwable) {
        // İstemci bağlantıyı kapattı (Cast sarma/geçiş) — normal.
      }
    }
  }

  private fun parseRange(range: String?, size: Long): Pair<Long, Long>? {
    if (range.isNullOrBlank() || size <= 0) return null
    val m = Regex("bytes=(\\d*)-(\\d*)").find(range) ?: return null
    val a = m.groupValues[1]; val b = m.groupValues[2]
    return if (a.isEmpty()) {
      val n = b.toLongOrNull() ?: return null
      (size - n).coerceAtLeast(0) to size - 1
    } else {
      val start = a.toLongOrNull() ?: return null
      val end = (b.toLongOrNull() ?: (size - 1)).coerceAtMost(size - 1)
      if (start > end) null else start to end
    }
  }

  private fun serveFile(out: OutputStream, route: Route, range: String?, head: Boolean) {
    val uri = Uri.parse(route.target)
    var size = -1L
    val stream: InputStream = if (uri.scheme == "file") {
      val f = File(uri.path ?: ""); size = f.length(); FileInputStream(f)
    } else {
      val afd = context.contentResolver.openAssetFileDescriptor(uri, "r")
      size = afd?.length ?: -1L
      if (size < 0) size = afd?.parcelFileDescriptor?.statSize ?: -1L
      afd?.createInputStream() ?: context.contentResolver.openInputStream(uri) ?: throw IllegalStateException("OPEN_FAILED")
    }
    stream.use { input ->
      val r = parseRange(range, size)
      if (r != null) {
        val (start, end) = r
        var toSkip = start
        while (toSkip > 0) { val n = input.skip(toSkip); if (n <= 0) break; toSkip -= n }
        val len = end - start + 1
        writeHead(out, 206, "Partial Content", mapOf("Content-Type" to route.contentType, "Content-Length" to len.toString(), "Content-Range" to "bytes $start-$end/$size", "Accept-Ranges" to "bytes"))
        if (!head) copyLimited(input, out, len)
      } else {
        val hdr = LinkedHashMap<String, String>()
        hdr["Content-Type"] = route.contentType
        hdr["Accept-Ranges"] = "bytes"
        if (size >= 0) hdr["Content-Length"] = size.toString()
        writeHead(out, 200, "OK", hdr)
        if (!head) copyLimited(input, out, if (size >= 0) size else Long.MAX_VALUE)
      }
    }
  }

  private fun copyLimited(input: InputStream, out: OutputStream, limit: Long) {
    val buf = ByteArray(64 * 1024)
    var left = limit
    while (left > 0) {
      val n = input.read(buf, 0, minOf(buf.size.toLong(), left).toInt())
      if (n <= 0) break
      out.write(buf, 0, n)
      left -= n
      bytesServed.addAndGet(n.toLong())
    }
  }

  private fun isHls(url: String, contentType: String): Boolean {
    val c = contentType.lowercase(Locale.ROOT)
    return c.contains("mpegurl") || url.substringBefore('?').lowercase(Locale.ROOT).endsWith(".m3u8")
  }

  private fun bridgeUrlFor(route: Route, absolute: String): String {
    route.allowedOrigins.add(originOf(absolute))
    return "${baseUrl()}/${route.id}/x/${b64url(absolute)}/${lastName(absolute, "part")}"
  }

  private fun resolve(base: String, ref: String): String = try { URI(base).resolve(ref.trim()).toString() } catch (_: Throwable) { ref }

  private fun rewritePlaylist(route: Route, finalUrl: String, text: String): String {
    val uriAttr = Regex("URI=\"([^\"]+)\"")
    return text.lineSequence().joinToString("\n") { raw ->
      val line = raw.trim()
      when {
        line.isEmpty() -> raw
        line.startsWith("#") -> uriAttr.replace(raw) { m -> "URI=\"${bridgeUrlFor(route, resolve(finalUrl, m.groupValues[1]))}\"" }
        else -> bridgeUrlFor(route, resolve(finalUrl, line))
      }
    }
  }

  private fun serveProxy(out: OutputStream, route: Route, target: String, range: String?, head: Boolean) {
    val b = Request.Builder().url(target).get()
    route.headers.forEach { (k, v) -> b.header(k, v) }
    if (!range.isNullOrBlank()) b.header("Range", range)
    client.newCall(b.build()).execute().use { resp ->
      val ct = resp.header("Content-Type", "") ?: ""
      val finalUrl = resp.request.url.toString()
      val body = resp.body ?: run { writeText(out, 502, "Empty upstream", head = head); return }
      if (resp.isSuccessful && isHls(target, ct)) {
        val text = body.string().take(4 * 1024 * 1024)
        if (text.trimStart('﻿', ' ', '\r', '\n').startsWith("#EXTM3U")) {
          writeText(out, 200, rewritePlaylist(route, finalUrl, text), "application/vnd.apple.mpegurl", head)
          return
        }
        writeText(out, resp.code, text, ct.ifBlank { "application/octet-stream" }, head)
        return
      }
      val hdr = LinkedHashMap<String, String>()
      hdr["Content-Type"] = ct.ifBlank { route.contentType.ifBlank { "application/octet-stream" } }
      resp.header("Content-Length")?.let { hdr["Content-Length"] = it }
      resp.header("Content-Range")?.let { hdr["Content-Range"] = it }
      resp.header("Accept-Ranges")?.let { hdr["Accept-Ranges"] = it }
      writeHead(out, resp.code, resp.message.ifBlank { "OK" }, hdr)
      if (!head) body.byteStream().use { copyLimited(it, out, Long.MAX_VALUE) }
    }
  }
}
