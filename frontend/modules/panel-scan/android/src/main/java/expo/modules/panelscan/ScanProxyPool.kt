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
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicIntegerArray
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * KIZILKAN PLAYER v18.4.0 — Taramaya özel proxy havuzu + canlılık test motoru.
 * ===========================================================================
 * KAPSAM: yalnız tarama trafiği (PanelScanService.probePhysical + JS keşfi için
 * proxiedGet). Oynatma / yenileme / EPG / timeshift bu havuza DOKUNMAZ.
 *
 * AKIŞ (v18.4.0)
 *  1) JS listeleri indirir, tür bazında ayrıştırır → loadCandidates (aday liste).
 *  2) Kullanıcı canlılık testini başlatır (startTest): arka planda iş parçacığı
 *     havuzu; Duraklat / Devam / "Yeter — test edilenleri kullan" / İptal.
 *     İlerleme getTestProgress ile okunur (JS 500 ms'de bir).
 *  3) Çalışanlar gecikmeye göre sıralanıp HAVUZ olur; cihazda ŞİFRELİ saklanır.
 *     Test edilmeden kullanmak da mümkün (commitCandidatesAsPool — ödemeli
 *     rotating gateway için).
 *  4) Tarama: select() round-robin; hata sınıflandırılır (classify):
 *     PROXY → proxy ölü sayılır ve AYNI deneme sıradaki proxy ile tekrarlanır;
 *     TARGET → sunucu gerçekten ulaşılmaz (proxy sağlam). Havuz tükenirse tarama
 *     doğrudan bağlantıya DÜŞMEZ (IP sızmasın): servis taramayı duraklatır.
 *
 * TEST MODLARI
 *  - system: birden çok IP-yankı adresi (sırayla; tek servise yüklenmez) +
 *    şeffaf proxy tespiti (yanıttaki IP = kendi IP'miz → kimliği gizlemiyor).
 *  - custom: kullanıcının URL'i; 2xx/3xx + (isteğe bağlı) yanıtta metin.
 *
 * PROTOKOLLER: http/https → Proxy.Type.HTTP; socks4/5 → Proxy.Type.SOCKS.
 * Kimlik bilgileri LOG'a yazılmaz; tanıda yalnız maskeli host.
 */
object ScanProxyPool {

  data class Entry(
    val scheme: String,
    val host: String,
    val port: Int,
    val user: String?,
    val pass: String?,
  ) {
    val key: String get() = "$scheme://${user ?: ""}@${host.lowercase()}:$port"
    fun proxyType(): Proxy.Type =
      if (scheme == "socks4" || scheme == "socks5") Proxy.Type.SOCKS else Proxy.Type.HTTP
    fun basicHeader(): String? {
      if (user.isNullOrEmpty()) return null
      val raw = "$user:${pass ?: ""}"
      return "Basic " + Base64.encodeToString(raw.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
    }
    fun toProxy(): Proxy = Proxy(proxyType(), InetSocketAddress.createUnresolved(host, port))
    fun masked(): String = if (user.isNullOrEmpty()) "$scheme://$host:$port" else "$scheme://***:***@$host:$port"
    fun schemeIndex(): Int = when (scheme) { "socks4" -> 1; "socks5" -> 2; else -> 0 }
    fun toJson(ms: Long = -1L): JSONObject {
      val o = JSONObject().put("scheme", scheme).put("host", host).put("port", port)
      if (!user.isNullOrEmpty()) o.put("user", user)
      if (!pass.isNullOrEmpty()) o.put("pass", pass)
      if (ms >= 0) o.put("ms", ms)
      return o
    }
  }

  data class Tested(val entry: Entry, val ms: Long)

  /** probePhysical / proxiedGet bunu kullanır. */
  data class Selection(val entry: Entry, val proxy: Proxy, val basicHeader: String?)

  enum class Fault { PROXY, TARGET, UNKNOWN }

  private const val ENC_FILE = "scan_proxy.enc"
  private const val KEY_ALIAS = "kizilkan_scan_proxy_v1"
  private const val MAX_CANDIDATES = 200_000
  private val SYSTEM_ECHO = listOf(
    "http://api.ipify.org?format=json",
    "http://icanhazip.com",
    "http://checkip.amazonaws.com",
    "http://ifconfig.me/ip",
  )
  private val IPV4 = Regex("\\b\\d{1,3}(?:\\.\\d{1,3}){3}\\b")

  @Volatile var enabled: Boolean = false; private set
  @Volatile private var lastTestAt: Long = 0L
  @Volatile private var poolTested: Boolean = false
  @Volatile private var lastError: String = ""
  @Volatile private var restored = false

  private val lock = Any()
  private var candidates: List<Entry> = emptyList()      // lock
  private var pool: List<Tested> = emptyList()           // lock (gecikmeye göre sıralı)
  private val failCount = ConcurrentHashMap<String, AtomicInteger>()
  private val dead = ConcurrentHashMap.newKeySet<String>()
  private val rr = AtomicInteger(0)
  @Volatile private var authInstalled = false

  // ── Test motoru durumu ──────────────────────────────────────────────────────
  private object T {
    @Volatile var phase: String = "idle"            // idle|running|paused|done|stopped|cancelled|failed
    @Volatile var mode: String = "system"
    @Volatile var startedAt: Long = 0L
    @Volatile var endedAt: Long = 0L
    @Volatile var pausedAccumMs: Long = 0L
    @Volatile var pausedSince: Long = 0L
    @Volatile var total: Int = 0
    @Volatile var ownIp: String = ""
    @Volatile var error: String = ""
    val tested = AtomicInteger(0)
    val working = AtomicInteger(0)
    val deadCount = AtomicInteger(0)
    val transparent = AtomicInteger(0)
    val perScheme = AtomicIntegerArray(3)
    val paused = AtomicBoolean(false)
    val stop = AtomicBoolean(false)
    val results = java.util.Collections.synchronizedList(mutableListOf<Tested>())
    @Volatile var executor: ExecutorService? = null
    @Volatile var runId: Int = 0
  }

  // ── Yapılandırma ────────────────────────────────────────────────────────────

  fun setEnabled(context: Context, on: Boolean): JSONObject {
    restoreIfNeeded(context)
    enabled = on
    if (on) installAuthenticator()
    persist(context)
    PanelScanService.recordExternalDiagnostic(context, JSONObject()
      .put("state", if (on) "SCAN_PROXY_ENABLED" else "SCAN_PROXY_DISABLED").put("total", poolSize()))
    return status()
  }

  /** JS'ten yapısal aday listesi (tür bazında ayrıştırılmış). replace=false → ekle. */
  fun loadCandidates(context: Context, json: String, replace: Boolean): JSONObject {
    restoreIfNeeded(context)
    val arr = try { JSONArray(json) } catch (_: Throwable) { JSONArray() }
    val incoming = parseEntries(arr)
    synchronized(lock) {
      val seen = LinkedHashMap<String, Entry>()
      if (!replace) for (e in candidates) seen[e.key] = e
      for (e in incoming) { if (seen.size >= MAX_CANDIDATES) break; seen.putIfAbsent(e.key, e) }
      candidates = seen.values.toList()
    }
    installAuthenticator()
    persist(context)
    return status()
  }

  /** Test etmeden kullan (ödemeli rotating gateway / elle girilen güvenilir proxy). */
  fun commitCandidatesAsPool(context: Context): JSONObject {
    restoreIfNeeded(context)
    synchronized(lock) { pool = candidates.map { Tested(it, -1L) }; poolTested = false }
    resetHealth()
    persist(context)
    return status()
  }

  fun clearAll(context: Context): JSONObject {
    stopTest(context, useTested = false)
    synchronized(lock) { candidates = emptyList(); pool = emptyList(); poolTested = false }
    resetHealth(); lastTestAt = 0L
    persist(context)
    return status()
  }

  /** Süreç yeniden başladıysa şifreli durumu geri yükle. */
  fun restoreIfNeeded(context: Context) {
    if (restored) return
    synchronized(lock) {
      if (restored) return
      restored = true
      val f = File(context.filesDir, ENC_FILE)
      if (!f.exists()) return
      val json = runCatching { loadEncrypted(context) }.getOrNull() ?: return
      val o = runCatching { JSONObject(json) }.getOrNull() ?: return
      enabled = o.optBoolean("enabled", false)
      lastTestAt = o.optLong("lastTestAt", 0L)
      poolTested = o.optBoolean("poolTested", false)
      if (o.optInt("v", 1) >= 2) {
        candidates = parseEntries(o.optJSONArray("candidates") ?: JSONArray())
        val p = o.optJSONArray("pool") ?: JSONArray()
        val list = ArrayList<Tested>()
        for (i in 0 until p.length()) {
          val e = p.optJSONObject(i) ?: continue
          parseEntry(e)?.let { list.add(Tested(it, e.optLong("ms", -1L))) }
        }
        pool = list
      } else {
        // v18.3.0 biçimi: "entries" → aday + test edilmemiş havuz.
        candidates = parseEntries(o.optJSONArray("entries") ?: JSONArray())
        pool = candidates.map { Tested(it, -1L) }
      }
    }
    if (enabled) installAuthenticator()
  }

  fun poolSize(): Int = synchronized(lock) { pool.size }

  fun status(): JSONObject {
    val (c, p, per) = synchronized(lock) {
      val per = IntArray(3); for (t in pool) per[t.entry.schemeIndex()]++
      Triple(candidates.size, pool.size, per)
    }
    val cPer = IntArray(3); synchronized(lock) { for (e in candidates) cPer[e.schemeIndex()]++ }
    return JSONObject()
      .put("enabled", enabled)
      .put("candidates", c)
      .put("candidatesByScheme", JSONObject().put("http", cPer[0]).put("socks4", cPer[1]).put("socks5", cPer[2]))
      .put("pool", p)
      .put("poolByScheme", JSONObject().put("http", per[0]).put("socks4", per[1]).put("socks5", per[2]))
      .put("poolTested", poolTested)
      .put("dead", dead.size)
      .put("alive", (p - dead.size).coerceAtLeast(0))
      .put("lastTestAt", lastTestAt)
      .put("testPhase", T.phase)
      .put("exhausted", isExhausted())
      .put("lastError", lastError)
      // Geriye dönük alanlar (v18.3.0 JS'i okuyordu).
      .put("total", c)
      .put("working", p)
  }

  // ── Canlılık testi ──────────────────────────────────────────────────────────

  /**
   * cfg: {mode:"system"|"custom", url, expectText, concurrency, timeoutMs, rejectTransparent}
   */
  fun startTest(context: Context, cfgJson: String): JSONObject {
    restoreIfNeeded(context)
    if (T.phase == "running" || T.phase == "paused") return JSONObject().put("started", false).put("error", "Test zaten çalışıyor.")
    val cfg = runCatching { JSONObject(cfgJson) }.getOrDefault(JSONObject())
    val mode = if (cfg.optString("mode") == "custom") "custom" else "system"
    val customUrl = cfg.optString("url", "").trim()
    if (mode == "custom" && !customUrl.matches(Regex("(?i)^https?://.+"))) {
      return JSONObject().put("started", false).put("error", "Kontrol adresi http(s):// ile başlamalı.")
    }
    val expectText = cfg.optString("expectText", "")
    val concurrency = cfg.optInt("concurrency", 64).coerceIn(4, 160)
    val timeoutMs = cfg.optInt("timeoutMs", 6000).coerceIn(2000, 20000)
    val rejectTransparent = cfg.optBoolean("rejectTransparent", true)
    val work = synchronized(lock) { candidates.shuffled() }
    if (work.isEmpty()) return JSONObject().put("started", false).put("error", "Test edilecek proxy yok. Önce liste indirin veya girin.")

    val myRun = ++T.runId
    T.mode = mode; T.total = work.size; T.error = ""
    T.tested.set(0); T.working.set(0); T.deadCount.set(0); T.transparent.set(0)
    for (i in 0 until 3) T.perScheme.set(i, 0)
    T.results.clear(); T.paused.set(false); T.stop.set(false)
    T.startedAt = System.currentTimeMillis(); T.endedAt = 0L; T.pausedAccumMs = 0L; T.pausedSince = 0L
    T.ownIp = if (mode == "system") runCatching { fetchOwnIp(timeoutMs) }.getOrDefault("") else ""
    T.phase = "running"

    val threads = concurrency.coerceAtMost(work.size)
    val pool0 = Executors.newFixedThreadPool(threads)
    T.executor = pool0
    Thread {
      try {
        val idx = AtomicInteger(0)
        val workers = (0 until threads).map {
          pool0.submit {
            while (true) {
              if (T.stop.get() || myRun != T.runId) break
              while (T.paused.get() && !T.stop.get()) Thread.sleep(120)
              val i = idx.getAndIncrement()
              if (i >= work.size) break
              val e = work[i]
              val ms = if (mode == "custom") measureCustom(e, customUrl, expectText, timeoutMs)
                       else measureSystem(e, timeoutMs, rejectTransparent)
              T.tested.incrementAndGet()
              if (ms >= 0) {
                T.working.incrementAndGet(); T.perScheme.incrementAndGet(e.schemeIndex())
                T.results.add(Tested(e, ms))
              } else if (ms == -2L) {
                T.transparent.incrementAndGet()
              } else {
                T.deadCount.incrementAndGet()
              }
            }
          }
        }
        for (w in workers) runCatching { w.get() }
      } catch (_: Throwable) {} finally {
        if (myRun == T.runId) {
          commitTestResults(context)
          T.phase = if (T.stop.get()) "stopped" else "done"
          T.endedAt = System.currentTimeMillis()
          PanelScanService.recordExternalDiagnostic(context, JSONObject()
            .put("state", "SCAN_PROXY_POOL_BUILT").put("total", T.total).put("found", T.working.get()))
        }
        runCatching { pool0.shutdownNow() }
      }
    }.apply { isDaemon = true }.start()
    return JSONObject().put("started", true)
  }

  private fun commitTestResults(context: Context) {
    val ordered = T.results.sortedBy { it.ms }
    synchronized(lock) { pool = ordered; poolTested = true }
    resetHealth(); lastTestAt = System.currentTimeMillis()
    persist(context)
  }

  fun pauseTest() { if (T.phase == "running") { T.paused.set(true); T.pausedSince = System.currentTimeMillis(); T.phase = "paused" } }
  fun resumeTest() { if (T.phase == "paused") { if (T.pausedSince > 0) T.pausedAccumMs += System.currentTimeMillis() - T.pausedSince; T.pausedSince = 0; T.paused.set(false); T.phase = "running" } }

  /** Durdur. useTested=true → o ana kadar çalışanlar havuz olur ("bu kadar yeter"). */
  fun stopTest(context: Context, useTested: Boolean): JSONObject {
    if (T.phase == "running" || T.phase == "paused") {
      T.stop.set(true); T.paused.set(false)
      if (useTested) commitTestResults(context)
      T.phase = "stopped"; T.endedAt = System.currentTimeMillis()
      T.runId++
      runCatching { T.executor?.shutdownNow() }
    }
    return status()
  }

  fun getTestProgress(): JSONObject {
    val now = System.currentTimeMillis()
    val elapsed = if (T.startedAt == 0L) 0L else (now - T.startedAt - T.pausedAccumMs - (if (T.pausedSince > 0) now - T.pausedSince else 0L)).coerceAtLeast(0L)
    val tested = T.tested.get(); val total = T.total
    val rate = if (elapsed > 0) tested * 1000.0 / elapsed else 0.0
    val etaMs = if (rate > 0 && total > tested) ((total - tested) / rate * 1000).toLong() else 0L
    val fastest = T.results.sortedBy { it.ms }.take(10).map { JSONObject().put("proxy", it.entry.masked()).put("ms", it.ms) }
    return JSONObject()
      .put("phase", T.phase).put("mode", T.mode)
      .put("total", total).put("tested", tested)
      .put("working", T.working.get()).put("dead", T.deadCount.get()).put("transparent", T.transparent.get())
      .put("http", T.perScheme.get(0)).put("socks4", T.perScheme.get(1)).put("socks5", T.perScheme.get(2))
      .put("elapsedMs", elapsed).put("etaMs", etaMs).put("ratePerSec", Math.round(rate * 10) / 10.0)
      .put("ownIp", T.ownIp).put("error", T.error)
      .put("fastest", JSONArray(fastest))
  }

  private fun fetchOwnIp(timeoutMs: Int): String {
    for (u in SYSTEM_ECHO) {
      val r = runCatching {
        val c = URL(u).openConnection() as HttpURLConnection
        c.connectTimeout = timeoutMs; c.readTimeout = timeoutMs
        val body = c.inputStream.bufferedReader().use { it.readText() }
        c.disconnect(); IPV4.find(body)?.value ?: ""
      }.getOrDefault("")
      if (r.isNotEmpty()) return r
    }
    return ""
  }

  /** Sistem testi: IP-yankı; şeffaf proxy (yanıt IP = kendi IP) reddedilebilir.
   *  Dönüş: >=0 gecikme(ms) çalışıyor · -1 ölü · -2 şeffaf(reddedildi). */
  private fun measureSystem(e: Entry, timeoutMs: Int, rejectTransparent: Boolean): Long {
    for (u in SYSTEM_ECHO) {
      var conn: HttpURLConnection? = null
      val ms = runCatching {
        val start = System.currentTimeMillis()
        conn = (URL(u).openConnection(e.toProxy()) as HttpURLConnection).apply {
          connectTimeout = timeoutMs; readTimeout = timeoutMs; requestMethod = "GET"
          if (e.proxyType() == Proxy.Type.HTTP) e.basicHeader()?.let { setRequestProperty("Proxy-Authorization", it) }
        }
        val code = conn!!.responseCode
        val body = conn!!.inputStream.bufferedReader().use { it.readText() }
        if (code !in 200..399) return@runCatching -1L
        val seen = IPV4.find(body)?.value ?: ""
        if (rejectTransparent && T.ownIp.isNotEmpty() && seen == T.ownIp) return@runCatching -2L
        System.currentTimeMillis() - start
      }.getOrDefault(-1L)
      runCatching { conn?.disconnect() }
      if (ms == -2L) return -2L
      if (ms >= 0) return ms
    }
    return -1L
  }

  /** Özel URL testi: 2xx/3xx + (varsa) yanıtta beklenen metin. */
  private fun measureCustom(e: Entry, url: String, expectText: String, timeoutMs: Int): Long {
    var conn: HttpURLConnection? = null
    return runCatching {
      val start = System.currentTimeMillis()
      conn = (URL(url).openConnection(e.toProxy()) as HttpURLConnection).apply {
        connectTimeout = timeoutMs; readTimeout = timeoutMs; requestMethod = "GET"
        if (e.proxyType() == Proxy.Type.HTTP) e.basicHeader()?.let { setRequestProperty("Proxy-Authorization", it) }
      }
      val code = conn!!.responseCode
      if (code !in 200..399) return@runCatching -1L
      if (expectText.isNotEmpty()) {
        val body = conn!!.inputStream.bufferedReader().use { it.readText() }
        if (!body.contains(expectText, ignoreCase = true)) return@runCatching -1L
      } else {
        conn!!.inputStream.use { it.readBytes() }
      }
      System.currentTimeMillis() - start
    }.getOrDefault(-1L).also { runCatching { conn?.disconnect() } }
  }

  // ── Seçim / rotasyon / sağlık ───────────────────────────────────────────────

  private fun resetHealth() { failCount.clear(); dead.clear(); rr.set(0) }

  /** Havuzda ölü olmayan proxy kaldı mı. Tükendiyse servis taramayı duraklatır. */
  fun isExhausted(): Boolean = synchronized(lock) { pool.isNotEmpty() && dead.size >= pool.size }

  fun select(): Selection? {
    if (!enabled) return null
    val snap = synchronized(lock) { pool.map { it.entry } }
    if (snap.isEmpty()) return null
    for (attempt in 0 until snap.size) {
      val idx = (rr.getAndIncrement() and Int.MAX_VALUE) % snap.size
      val e = snap[idx]
      if (dead.contains(e.key)) continue
      return Selection(e, e.toProxy(), if (e.proxyType() == Proxy.Type.HTTP) e.basicHeader() else null)
    }
    return null
  }

  /** Hata siniflandirma: proxy mi suclu, sunucu mu? Istisnadan kaba tahmin. */
  fun classify(t: Throwable?): Fault {
    val m = (t?.message ?: "").lowercase()
    return when {
      m.contains("through proxy") || m.contains("socks") || m.contains("proxy") -> Fault.PROXY
      m.contains("connect") && (m.contains("timed out") || m.contains("refused")) -> Fault.PROXY
      m.contains("unable to tunnel") || m.contains("407") -> Fault.PROXY
      else -> Fault.UNKNOWN
    }
  }

  /** Sonuc geri bildirimi. PROXY hatasi 3 ustunde olu isaretle. */
  fun reportResult(context: Context, key: String, fault: Fault) {
    if (fault == Fault.TARGET) { failCount.remove(key); return }
    val c = failCount.computeIfAbsent(key) { AtomicInteger(0) }.incrementAndGet()
    if (c >= 3) {
      if (dead.add(key)) {
        PanelScanService.recordExternalDiagnostic(context, JSONObject()
          .put("state", "SCAN_PROXY_ROTATE").put("total", poolSize()).put("found", (poolSize() - dead.size)))
        if (isExhausted()) PanelScanService.recordExternalDiagnostic(context, JSONObject()
          .put("state", "SCAN_PROXY_EXHAUSTED").put("total", poolSize()))
      }
    }
  }

  // Tek proxy dis IP testi (Test et dugmesi; secili/ilk calisan)
  fun testExternalIp(context: Context, timeoutMs: Int = 6000): JSONObject {
    val out = JSONObject()
    if (!enabled) return out.put("ok", false).put("error", "Proxy kapali.")
    val cand = synchronized(lock) { pool.firstOrNull()?.entry } ?: synchronized(lock) { candidates.firstOrNull() }
    ?: return out.put("ok", false).put("error", "Proxy yok.")
    var conn: HttpURLConnection? = null
    return try {
      conn = (URL(SYSTEM_ECHO[0]).openConnection(cand.toProxy()) as HttpURLConnection).apply {
        connectTimeout = timeoutMs; readTimeout = timeoutMs
        if (cand.proxyType() == Proxy.Type.HTTP) cand.basicHeader()?.let { setRequestProperty("Proxy-Authorization", it) }
      }
      val code = conn!!.responseCode
      val body = conn!!.inputStream.bufferedReader().use { it.readText() }
      val ip = IPV4.find(body)?.value ?: ""
      PanelScanService.recordExternalDiagnostic(context, JSONObject()
        .put("state", if (ip.isNotEmpty()) "SCAN_PROXY_TEST_OK" else "SCAN_PROXY_TEST_FAILED").put("total", poolSize()))
      out.put("ok", code in 200..299 && ip.isNotEmpty()).put("ip", ip).put("httpCode", code).put("proxy", cand.masked())
    } catch (t: Throwable) {
      lastError = t.message ?: "test hata"
      PanelScanService.recordExternalDiagnostic(context, JSONObject().put("state", "SCAN_PROXY_TEST_FAILED").put("total", poolSize()))
      out.put("ok", false).put("error", lastError).put("proxy", cand.masked())
    } finally { runCatching { conn?.disconnect() } }
  }

  // JS kesfi icin proxy uzerinden GET (serverCode.ts); olen proxy'de siradakine gecer.
  fun proxiedGet(context: Context, url: String, timeoutMs: Int): JSONObject {
    val out = JSONObject()
    var lastEx: Throwable? = null
    for (attempt in 0 until 3) {
      val sel = select() ?: break
      var conn: HttpURLConnection? = null
      try {
        val target = URL(url)
        conn = (target.openConnection(sel.proxy) as HttpURLConnection).apply {
          connectTimeout = timeoutMs; readTimeout = timeoutMs; requestMethod = "GET"
          setRequestProperty("Accept", "application/json")
          sel.basicHeader?.let { setRequestProperty("Proxy-Authorization", it) }
        }
        val code = conn!!.responseCode
        val stream = if (code in 200..399) conn!!.inputStream else conn!!.errorStream
        val body = stream?.bufferedReader()?.use { it.readText() } ?: ""
        reportResult(context, sel.entry.key, Fault.TARGET)
        return out.put("ok", code in 200..299).put("status", code).put("body", body)
      } catch (t: Throwable) {
        lastEx = t
        reportResult(context, sel.entry.key, if (classify(t) == Fault.UNKNOWN) Fault.PROXY else classify(t))
      } finally { runCatching { conn?.disconnect() } }
    }
    return out.put("ok", false).put("status", 0).put("body", "").put("error", lastEx?.message ?: "proxy yok")
  }

  // Authenticator (SOCKS5 + HTTP proxy auth)
  private fun installAuthenticator() {
    if (authInstalled) return
    authInstalled = true
    runCatching { System.setProperty("jdk.http.auth.tunneling.disabledSchemes", "") }
    Authenticator.setDefault(object : Authenticator() {
      override fun getPasswordAuthentication(): PasswordAuthentication? {
        if (requestorType != RequestorType.PROXY) return null
        val h = requestingHost?.lowercase() ?: return null
        val p = requestingPort
        val match = synchronized(lock) {
          (pool.map { it.entry } + candidates).firstOrNull { it.host.lowercase() == h && it.port == p && !it.user.isNullOrEmpty() }
        } ?: return null
        return PasswordAuthentication(match.user, (match.pass ?: "").toCharArray())
      }
    })
  }

  // Ayristirma
  private fun parseEntry(e: JSONObject): Entry? {
    val scheme = e.optString("scheme", "http").lowercase().let {
      when (it) { "http", "https", "socks4", "socks5" -> it; "socks" -> "socks5"; else -> "http" }
    }
    val host = e.optString("host", "").trim()
    val port = e.optInt("port", 0)
    if (host.isEmpty() || port !in 1..65535) return null
    return Entry(scheme, host, port, e.optString("user", "").ifBlank { null }, e.optString("pass", "").ifBlank { null })
  }
  private fun parseEntries(arr: JSONArray): List<Entry> {
    val seen = LinkedHashMap<String, Entry>()
    for (i in 0 until arr.length()) { val e = arr.optJSONObject(i)?.let { parseEntry(it) } ?: continue; seen.putIfAbsent(e.key, e) }
    return seen.values.toList()
  }

  // Sifreli saklama (Android Keystore AES-GCM)
  private fun persist(context: Context) {
    val (cand, p) = synchronized(lock) { Pair(candidates, pool) }
    val json = JSONObject()
      .put("v", 2).put("enabled", enabled).put("lastTestAt", lastTestAt).put("poolTested", poolTested)
      .put("candidates", JSONArray(cand.map { it.toJson() }))
      .put("pool", JSONArray(p.map { it.entry.toJson(it.ms) }))
      .toString()
    runCatching { saveEncrypted(context, json) }
  }
  private fun secretKey(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gen.init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    return gen.generateKey()
  }
  private fun saveEncrypted(context: Context, plain: String) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, secretKey())
    val blob = JSONObject().put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
      .put("ct", Base64.encodeToString(cipher.doFinal(plain.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)).toString()
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
