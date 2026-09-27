package expo.modules.panelscan

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.Authenticator
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.PasswordAuthentication
import java.net.Proxy
import java.net.URL
import java.security.KeyStore
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * KIZILKAN PLAYER v18.3.0 — Taramaya özel proxy havuzu.
 * ===========================================================================
 * KAPSAM: yalnız tarama trafiği (PanelScanService.probePhysical + JS keşif için
 * proxiedProbe). Oynatma / yenileme / EPG / timeshift bu havuza DOKUNMAZ.
 *
 * TASARIM
 *  - JS tarafı satır biçimlerini ayrıştırıp yapısal giriş listesi gönderir
 *    (src/utils/scanProxy.ts). Burada yalnız yapısal giriş (scheme/host/port/
 *    user/pass) alınır, test edilir, döndürülür (rotasyon + ban).
 *  - Servis ana süreçte çalıştığı için bu `object` bellek durumunu servisle
 *    paylaşır; ayrıca yapılandırma cihazda ŞİFRELİ saklanır (Android Keystore
 *    AES-GCM, ek bağımlılık yok) → süreç yeniden başlarsa kurtarılır.
 *  - Kimlik bilgileri LOG'a yazılmaz; tanı olaylarında yalnız maskeli host.
 *
 * PROTOKOLLER
 *  - http/https  → Proxy.Type.HTTP  (http hedefte düz, https hedefte CONNECT).
 *  - socks4/5    → Proxy.Type.SOCKS.
 *  - Gerçek "https proxy" (proxy'ye TLS) HttpURLConnection ile native
 *    desteklenmez → HTTP gibi denenir (listelerdeki HTTPS satırlarının çoğu
 *    HTTP+CONNECT'tir; onlar çalışır).
 */
object ScanProxyPool {

  data class Entry(
    val scheme: String,          // http | https | socks4 | socks5
    val host: String,
    val port: Int,
    val user: String?,
    val pass: String?,
  ) {
    val key: String get() = "$scheme://$host:$port"
    val authHost: String get() = host.lowercase()
    fun proxyType(): Proxy.Type =
      if (scheme == "socks4" || scheme == "socks5") Proxy.Type.SOCKS else Proxy.Type.HTTP
    fun basicHeader(): String? {
      if (user.isNullOrEmpty()) return null
      val raw = "$user:${pass ?: ""}"
      return "Basic " + Base64.encodeToString(raw.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
    }
  }

  /** Seçim sonucu: probePhysical bunu kullanır. */
  data class Selection(
    val entry: Entry,
    val proxy: Proxy,
    val basicHeader: String?,
  )

  private const val ENC_FILE = "scan_proxy.enc"
  private const val KEY_ALIAS = "kizilkan_scan_proxy_v1"
  private const val ORDER_SOCKS5_FIRST = "socks5-first"

  @Volatile var enabled: Boolean = false; private set
  @Volatile private var order: String = ORDER_SOCKS5_FIRST
  @Volatile private var testUrl: String = "https://api.ipify.org?format=json"
  @Volatile private var testTimeoutMs: Int = 6000
  @Volatile private var lastError: String = ""

  private val allEntries = java.util.Collections.synchronizedList(mutableListOf<Entry>())
  // Çalışan havuz (test geçmiş) — round-robin bu liste üzerinde döner.
  private val working = java.util.Collections.synchronizedList(mutableListOf<Entry>())
  private val failCount = ConcurrentHashMap<String, AtomicInteger>()
  private val dead = ConcurrentHashMap.newKeySet<String>()
  private val rr = AtomicInteger(0)
  @Volatile private var authInstalled = false

  // ── Yapılandırma ──────────────────────────────────────────────────────────

  /** JS'ten gelen yapılandırma JSON'u. Havuzu sıfırlar; test warmPool ile yapılır. */
  @Synchronized
  fun configure(context: Context, json: String, persist: Boolean = true): JSONObject {
    val obj = try { JSONObject(json) } catch (_: Throwable) { JSONObject() }
    enabled = obj.optBoolean("enabled", false)
    order = obj.optString("order", ORDER_SOCKS5_FIRST)
    testUrl = obj.optString("testUrl", "https://api.ipify.org?format=json").ifBlank { "https://api.ipify.org?format=json" }
    testTimeoutMs = obj.optInt("testTimeoutMs", 6000).coerceIn(1500, 20000)
    val maxPool = obj.optInt("maxPool", 400).coerceIn(1, 5000)

    val parsed = mutableListOf<Entry>()
    val arr = obj.optJSONArray("entries") ?: JSONArray()
    val seen = HashSet<String>()
    for (i in 0 until arr.length()) {
      val e = arr.optJSONObject(i) ?: continue
      val scheme = e.optString("scheme", "http").lowercase().let {
        when (it) { "http", "https", "socks4", "socks5" -> it; "socks" -> "socks5"; else -> "http" }
      }
      val host = e.optString("host", "").trim()
      val port = e.optInt("port", 0)
      if (host.isEmpty() || port !in 1..65535) continue
      val user = e.optString("user", "").ifBlank { null }
      val pass = e.optString("pass", "").ifBlank { null }
      val entry = Entry(scheme, host, port, user, pass)
      if (!seen.add(entry.key)) continue
      parsed.add(entry)
      if (parsed.size >= maxPool) break
    }
    // Sıra: SOCKS5 > SOCKS4 > HTTP(S)
    parsed.sortBy {
      when (it.scheme) { "socks5" -> 0; "socks4" -> 1; "https" -> 2; else -> 3 }
    }

    allEntries.clear(); allEntries.addAll(parsed)
    working.clear(); failCount.clear(); dead.clear(); rr.set(0); lastError = ""
    installAuthenticator()
    if (persist) runCatching { saveEncrypted(context, json) }
    return status()
  }

  /** Süreç yeniden başladıysa şifreli yapılandırmayı geri yükle. */
  @Synchronized
  fun restoreIfNeeded(context: Context) {
    if (allEntries.isNotEmpty() || !File(context.filesDir, ENC_FILE).exists()) return
    val json = runCatching { loadEncrypted(context) }.getOrNull() ?: return
    if (json.isNotBlank()) configure(context, json, persist = false)
  }

  fun status(): JSONObject = JSONObject()
    .put("enabled", enabled)
    .put("total", allEntries.size)
    .put("working", working.size)
    .put("dead", dead.size)
    .put("lastError", lastError)

  // ── Havuz ısıtma / test ─────────────────────────────────────────────────────

  /**
   * Girişleri testUrl'e karşı sınar, çalışanları gecikmeye göre sıralar.
   * Zaman/eş zamanlılık sınırlıdır (tarama başında sonsuza kadar beklemesin).
   */
  fun warmPool(context: Context, budgetMs: Long = 20000L): JSONObject {
    if (!enabled) return status()
    val snapshot = ArrayList(allEntries)
    if (snapshot.isEmpty()) return status()
    val results = java.util.Collections.synchronizedList(mutableListOf<Pair<Entry, Long>>())
    val threads = snapshot.size.coerceIn(1, 12)
    val pool = Executors.newFixedThreadPool(threads)
    val deadline = System.currentTimeMillis() + budgetMs
    try {
      for (e in snapshot) {
        pool.submit {
          if (System.currentTimeMillis() > deadline) return@submit
          val ms = measure(e)
          if (ms >= 0) results.add(e to ms)
        }
      }
      pool.shutdown()
      pool.awaitTermination(budgetMs + 2000L, TimeUnit.MILLISECONDS)
    } catch (_: Throwable) {} finally { pool.shutdownNow() }
    val ordered = results.sortedBy { it.second }.map { it.first }
    synchronized(working) { working.clear(); working.addAll(ordered) }
    rr.set(0)
    PanelScanService.recordExternalDiagnostic(context, JSONObject()
      .put("state", "SCAN_PROXY_POOL_BUILT").put("total", snapshot.size).put("found", ordered.size))
    if (ordered.isEmpty()) lastError = "Hiçbir proxy testi geçmedi (${snapshot.size} denendi)."
    return status()
  }

  /** Tek girişin testUrl'e erişim gecikmesi (ms); -1 = başarısız. */
  private fun measure(e: Entry): Long {
    var conn: HttpURLConnection? = null
    return try {
      val start = System.currentTimeMillis()
      val proxy = Proxy(e.proxyType(), InetSocketAddress.createUnresolved(e.host, e.port))
      conn = URL(testUrl).openConnection(proxy) as HttpURLConnection
      conn.connectTimeout = testTimeoutMs
      conn.readTimeout = testTimeoutMs
      conn.requestMethod = "GET"
      e.basicHeader()?.let { if (e.proxyType() == Proxy.Type.HTTP) conn.setRequestProperty("Proxy-Authorization", it) }
      val code = conn.responseCode
      conn.inputStream.use { it.readBytes() }
      if (code in 200..399) System.currentTimeMillis() - start else -1
    } catch (_: Throwable) { -1 } finally { runCatching { conn?.disconnect() } }
  }

  // ── Seçim / rotasyon ─────────────────────────────────────────────────────────

  /** Sıradaki kullanılabilir proxy'yi döndürür; havuz boşsa null (doğrudan bağlan). */
  fun select(): Selection? {
    if (!enabled) return null
    val pool = synchronized(working) { if (working.isNotEmpty()) ArrayList(working) else ArrayList(allEntries) }
    if (pool.isEmpty()) return null
    // Round-robin, ölü olmayan ilk giriş.
    for (attempt in 0 until pool.size) {
      val idx = (rr.getAndIncrement() and Int.MAX_VALUE) % pool.size
      val e = pool[idx]
      if (dead.contains(e.key)) continue
      return buildSelection(e)
    }
    return null
  }

  private fun buildSelection(e: Entry): Selection {
    val proxy = Proxy(e.proxyType(), InetSocketAddress.createUnresolved(e.host, e.port))
    val header = if (e.proxyType() == Proxy.Type.HTTP) e.basicHeader() else null
    return Selection(e, proxy, header)
  }

  /** probePhysical sonucu geri bildirilir: başarısız/ban → ölü işaretle. */
  fun reportResult(context: Context, key: String, ok: Boolean, banned: Boolean) {
    if (ok) { failCount.remove(key); return }
    val c = failCount.computeIfAbsent(key) { AtomicInteger(0) }.incrementAndGet()
    if (banned || c >= 3) {
      if (dead.add(key)) {
        PanelScanService.recordExternalDiagnostic(context, JSONObject()
          .put("state", if (banned) "SCAN_PROXY_BANNED_HOST" else "SCAN_PROXY_ROTATE")
          .put("total", allEntries.size).put("found", working.size - dead.size))
      }
    }
  }

  // ── Dış IP testi (kullanıcı "Test et"e basınca) ─────────────────────────────

  fun testExternalIp(context: Context): JSONObject {
    val out = JSONObject()
    if (!enabled) return out.put("ok", false).put("error", "Proxy kapalı.")
    if (allEntries.isEmpty()) return out.put("ok", false).put("error", "Proxy girişi yok.")
    // İlk çalışanı bul (yoksa ilk girişi dene).
    val candidate = synchronized(working) { working.firstOrNull() } ?: allEntries.firstOrNull()
    ?: return out.put("ok", false).put("error", "Proxy girişi yok.")
    var conn: HttpURLConnection? = null
    return try {
      val proxy = Proxy(candidate.proxyType(), InetSocketAddress.createUnresolved(candidate.host, candidate.port))
      conn = URL(testUrl).openConnection(proxy) as HttpURLConnection
      conn.connectTimeout = testTimeoutMs
      conn.readTimeout = testTimeoutMs
      candidate.basicHeader()?.let { if (candidate.proxyType() == Proxy.Type.HTTP) conn.setRequestProperty("Proxy-Authorization", it) }
      val code = conn.responseCode
      val body = conn.inputStream.bufferedReader().use { it.readText() }.trim()
      val ip = runCatching { JSONObject(body).optString("ip", "") }.getOrDefault("").ifBlank {
        Regex("\\d{1,3}(?:\\.\\d{1,3}){3}").find(body)?.value ?: ""
      }
      PanelScanService.recordExternalDiagnostic(context, JSONObject()
        .put("state", "SCAN_PROXY_TEST_OK").put("total", allEntries.size).put("found", working.size))
      out.put("ok", code in 200..299 && ip.isNotEmpty()).put("ip", ip).put("httpCode", code)
        .put("proxy", maskKey(candidate))
    } catch (t: Throwable) {
      lastError = t.message ?: "test başarısız"
      PanelScanService.recordExternalDiagnostic(context, JSONObject()
        .put("state", "SCAN_PROXY_TEST_FAILED").put("total", allEntries.size))
      out.put("ok", false).put("error", lastError).put("proxy", maskKey(candidate))
    } finally { runCatching { conn?.disconnect() } }
  }

  // ── JS keşfi için proxy'li istek (serverCode.ts) ────────────────────────────

  /** GET url through selected proxy. Dönüş: {ok, status, body}. */
  fun proxiedGet(context: Context, url: String, timeoutMs: Int): JSONObject {
    val out = JSONObject()
    val sel = select()
    var conn: HttpURLConnection? = null
    return try {
      val target = URL(url)
      conn = (if (sel != null) target.openConnection(sel.proxy) else target.openConnection()) as HttpURLConnection
      conn.connectTimeout = timeoutMs
      conn.readTimeout = timeoutMs
      conn.requestMethod = "GET"
      conn.setRequestProperty("Accept", "application/json")
      sel?.basicHeader?.let { conn.setRequestProperty("Proxy-Authorization", it) }
      val code = conn.responseCode
      if (code == 429 || code == 503) sel?.let { reportResult(context, it.entry.key, ok = false, banned = true) }
      val stream = if (code in 200..399) conn.inputStream else conn.errorStream
      val body = stream?.bufferedReader()?.use { it.readText() } ?: ""
      if (code in 200..299) sel?.let { reportResult(context, it.entry.key, ok = true, banned = false) }
      out.put("ok", code in 200..299).put("status", code).put("body", body)
    } catch (t: Throwable) {
      sel?.let { reportResult(context, it.entry.key, ok = false, banned = false) }
      out.put("ok", false).put("status", 0).put("body", "").put("error", t.message ?: "")
    } finally { runCatching { conn?.disconnect() } }
  }

  // ── Authenticator (SOCKS5 + HTTP proxy kimlik doğrulaması) ───────────────────

  private fun installAuthenticator() {
    if (authInstalled) return
    authInstalled = true
    runCatching { System.setProperty("jdk.http.auth.tunneling.disabledSchemes", "") }
    Authenticator.setDefault(object : Authenticator() {
      override fun getPasswordAuthentication(): PasswordAuthentication? {
        if (requestorType != RequestorType.PROXY) return null
        val h = requestingHost?.lowercase() ?: return null
        val p = requestingPort
        val match = synchronized(allEntries) {
          allEntries.firstOrNull { it.authHost == h && it.port == p && !it.user.isNullOrEmpty() }
        } ?: return null
        return PasswordAuthentication(match.user, (match.pass ?: "").toCharArray())
      }
    })
  }

  private fun maskKey(e: Entry): String =
    if (e.user.isNullOrEmpty()) e.key else "${e.scheme}://***:***@${e.host}:${e.port}"

  // ── Şifreli saklama (Android Keystore AES-GCM) ──────────────────────────────

  private fun secretKey(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gen.init(
      KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .build()
    )
    return gen.generateKey()
  }

  private fun saveEncrypted(context: Context, plain: String) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, secretKey())
    val iv = cipher.iv
    val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
    val blob = JSONObject()
      .put("iv", Base64.encodeToString(iv, Base64.NO_WRAP))
      .put("ct", Base64.encodeToString(ct, Base64.NO_WRAP))
      .toString()
    File(context.filesDir, ENC_FILE).writeText(blob)
  }

  private fun loadEncrypted(context: Context): String {
    val blob = JSONObject(File(context.filesDir, ENC_FILE).readText())
    val iv = Base64.decode(blob.getString("iv"), Base64.NO_WRAP)
    val ct = Base64.decode(blob.getString("ct"), Base64.NO_WRAP)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
    return String(cipher.doFinal(ct), Charsets.UTF_8)
  }
}
