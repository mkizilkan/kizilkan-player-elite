package expo.modules.panelscan

import okhttp3.*
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.*
import java.util.concurrent.TimeUnit

/** HttpURLConnection-shaped adapter keeps native cancellation and bounded readers intact. */
internal class ProxyHttpConnection(url: URL, private val entry: ScanProxyPool.Entry) : HttpURLConnection(url) {
  private val headers = linkedMapOf<String, String>()
  private val outgoing = ByteArrayOutputStream()
  @Volatile private var call: Call? = null
  @Volatile private var response: Response? = null
  @Volatile private var cancelled = false
  override fun setRequestProperty(key: String, value: String) { check(response == null); headers[key] = value }
  override fun getRequestProperty(key: String): String? = headers[key]
  override fun getOutputStream(): OutputStream = outgoing
  @Synchronized override fun connect() {
    if (response != null) return
    if (cancelled) throw java.io.InterruptedIOException("CANCELLED")
    val builder = OkHttpClient.Builder().retryOnConnectionFailure(false)
      .followRedirects(instanceFollowRedirects).followSslRedirects(instanceFollowRedirects)
      .connectTimeout(connectTimeout.toLong(), TimeUnit.MILLISECONDS).readTimeout(readTimeout.toLong(), TimeUnit.MILLISECONDS)
      .callTimeout((connectTimeout.toLong() + readTimeout).coerceAtLeast(1000), TimeUnit.MILLISECONDS)
      .connectionPool(ConnectionPool(0, 1, TimeUnit.SECONDS))
    if (entry.scheme.startsWith("socks")) {
      builder.proxy(Proxy.NO_PROXY).socketFactory(ProxySocketFactory(entry.scheme, entry.host, entry.port, entry.user, entry.pass))
        // Remote DNS; never resolve the target on the device before the SOCKS handshake.
        .dns(object : Dns { override fun lookup(hostname: String): List<InetAddress> = listOf(InetAddress.getByAddress(hostname, byteArrayOf(0, 0, 0, 1))) })
    } else {
      builder.proxy(entry.toProxy()).proxyAuthenticator { _, previous ->
        if (previous.request.header("Proxy-Authorization") != null || entry.user.isNullOrEmpty()) null
        else previous.request.newBuilder().header("Proxy-Authorization", entry.basicHeader()!!).build()
      }
      if (entry.scheme == "https") builder.socketFactory(ProxySocketFactory("https", entry.host, entry.port, entry.user, entry.pass))
    }
    val request = Request.Builder().url(url)
    for ((key, value) in headers) {
      // Proxy credentials must never become target HTTP headers, including after CONNECT.
      if (!key.equals("Proxy-Authorization", true)) request.header(key, value)
    }
    val body = if (method == "POST") outgoing.toByteArray().toRequestBody(null) else null
    request.method(method, body)
    val active = builder.build().newCall(request.build()); call = active
    if (cancelled) active.cancel()
    response = active.execute(); connected = true
  }
  override fun getResponseCode(): Int { connect(); return response!!.code }
  override fun getInputStream(): InputStream { connect(); if (response!!.code >= 400) throw java.io.FileNotFoundException("HTTP ${response!!.code}"); return response!!.body!!.byteStream() }
  override fun getErrorStream(): InputStream? { connect(); return if (response!!.code >= 400) response!!.body?.byteStream() else null }
  override fun getHeaderFields(): Map<String, List<String>> { connect(); return response!!.headers.toMultimap() }
  override fun getHeaderField(name: String?): String? { connect(); return name?.let { response!!.header(it) } }
  override fun getContentLengthLong(): Long { connect(); return response!!.body?.contentLength() ?: -1 }
  override fun disconnect() { cancelled = true; call?.cancel(); response?.close() }
  override fun usingProxy(): Boolean = true
}
