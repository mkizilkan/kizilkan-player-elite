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

  /** v18.5.0: anon = elite | anonymous | transparent | unknown (httpbin başlık analizi). */
  data class Tested(val entry: Entry, val ms: Long, val anon: String = "unknown")

  /** probePhysical / proxiedGet bunu kullanır. */
  data class Selection(val entry: Entry, val proxy: Proxy, val basicHeader: String?)

  enum class Fault { PROXY, TARGET, UNKNOWN }

  private const val ENC_FILE = "scan_proxy.enc"
  private const val GOOD_FILE = "scan_proxy_good.enc"
  private const val KEY_ALIAS = "kizilkan_scan_proxy_v1"
  private const val MAX_CANDIDATES = 200_000
  private val SYSTEM_ECHO = listOf(
    "http://api.ipify.org?format=json",
    "http://icanhazip.com",
    "http://checkip.amazonaws.com",
    "http://ifconfig.me/ip",
  )
  private val IPV4 = Regex("\\b\\d{1,3}(?:\\.\\d{1,3}){3}\\b")
  /**
   * v18.5.0 — Anonimlik yargıcı (kullanıcı onayı 28.09.2026). Proxy üzerinden düz HTTP ile
   * istenir; yanıt, sunucuya ulaşan başlıkları ve çıkış IP'sini (origin) döndürür. Xtream
   * hesap bilgisi GİTMEZ (yalnız bu adrese GET).
   */
  private const val JUDGE_URL = "http://httpbin.org/get"
  private val PROXY_HEADERS = setOf(
    "via", "x-forwarded-for", "forwarded", "forwarded-for", "x-forwarded", "x-real-ip",
    "proxy-connection", "x-proxy-id", "client-ip", "x-client-ip", "x-originating-ip", "x-proxy-connection",
  )
  /** Aynı proxy'ye aynı anda en çok bu kadar tarama isteği (yük dağıtımı). */
  private const val PER_PROXY_INFLIGHT = 4
  /** Havuz bundan eskiyse tarama başında hızlı TCP tazelemesi yapılır. */
  private const val STALE_POOL_MS = 15 * 60_000L
  private const val GOOD_MAX = 500

  @Volatile var enabled: Boolean = false; private set
  @Volatile private var lastTestAt: Long = 0L
  @Volatile private var lastRefreshAt: Long = 0L
  @Volatile private var poolTested: Boolean = false
  @Volatile private var lastError: String = ""
  @Volatile private var lastProxyMasked: String = ""
  @Volatile private var restored = false

  private val lock = Any()
  private var candidates: List<Entry> = emptyList()      // lock
  private var pool: List<Tested> = emptyList()           // lock (gecikmeye göre sıralı)
  /** v18.5.0: gerçek panel yanıtı almış proxy'ler (kalıcı, sonraki testte ilk denenir). */
  private val good = LinkedHashMap<String, Entry>()      // lock
  private val failCount = ConcurrentHashMap<String, AtomicInteger>()
  private val successCount = ConcurrentHashMap<String, AtomicInteger>()
  private val inFlight = ConcurrentHashMap<String, AtomicInteger>()
  private val dead = ConcurrentHashMap.newKeySet<String>()
  private val rr = AtomicInteger(0)
  private val rrGood = AtomicInteger(0)
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
    /** v18.5.0: "tcp" (hızlı bağlantı elemesi) → "verify" (IP/protokol + anonimlik). */
    @Volatile var stage: String = ""
    @Volatile var tcpTotal: Int = 0
    val tcpTested = AtomicInteger(0)
    val tcpAlive = AtomicInteger(0)
    val tcpResults = java.util.Collections.synchronizedList(mutableListOf<Entry>())
    val elite = AtomicInteger(0)
    val anonymous = AtomicInteger(0)
    val unknownAnon = AtomicInteger(0)
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
    synchronized(lock) { candidates = emptyList(); pool = emptyList(); poolTested = false; good.clear() }
    resetHealth(); lastTestAt = 0L; lastRefreshAt = 0L
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
      lastRefreshAt = o.optLong("lastRefreshAt", 0L)
      poolTested = o.optBoolean("poolTested", false)
      if (o.optInt("v", 1) >= 2) {
        candidates = parseEntries(o.optJSONArray("candidates") ?: JSONArray())
        val p = o.optJSONArray("pool") ?: JSONArray()
        val list = ArrayList<Tested>()
        for (i in 0 until p.length()) {
          val e = p.optJSONObject(i) ?: continue
          parseEntry(e)?.let { list.add(Tested(it, e.optLong("ms", -1L), e.optString("anon", "unknown"))) }
        }
        pool = list
        good.clear()
        val goodJson = runCatching { loadEncrypted(context, GOOD_FILE) }.getOrNull()
        if (goodJson != null) for (g in parseEntries(runCatching { JSONArray(goodJson) }.getOrDefault(JSONArray()))) good[g.key] = g
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
    val cPer = IntArray(3); val per = IntArray(3); val anon = IntArray(4)
    val (c, p, g) = synchronized(lock) {
      for (t in pool) {
        per[t.entry.schemeIndex()]++
        anon[when (t.anon) { "elite" -> 0; "anonymous" -> 1; "transparent" -> 2; else -> 3 }]++
      }
      for (e in candidates) cPer[e.schemeIndex()]++
      Triple(candidates.size, pool.size, good.size)
    }
    var busy = 0; for (v in inFlight.values) busy += v.get().coerceAtLeast(0)
    var ok = 0; for (v in successCount.values) ok += v.get()
    return JSONObject()
      .put("enabled", enabled)
      .put("candidates", c)
      .put("candidatesByScheme", JSONObject().put("http", cPer[0]).put("socks4", cPer[1]).put("socks5", cPer[2]))
      .put("pool", p)
      .put("poolByScheme", JSONObject().put("http", per[0]).put("socks4", per[1]).put("socks5", per[2]))
      .put("poolByAnon", JSONObject().put("elite", anon[0]).put("anonymous", anon[1]).put("transparent", anon[2]).put("unknown", anon[3]))
      .put("poolTested", poolTested)
      .put("dead", dead.size)
      .put("alive", (p - dead.size).coerceAtLeast(0))
      .put("good", g)
      .put("inUse", busy)
      .put("panelSuccess", ok)
      .put("lastProxy", lastProxyMasked)
      .put("lastTestAt", lastTestAt)
      .put("lastRefreshAt", lastRefreshAt)
      .put("testPhase", T.phase)
      .put("exhausted", isExhausted())
      .put("lastError", lastError)
      // Geriye dönük alanlar (v18.3.0 JS'i okuyordu).
      .put("total", c)
      .put("working", p)
  }

  // ── Canlılık testi ──────────────────────────────────────────────────────────

  /**
   * cfg: {mode:"system"|"custom", url, expectText, concurrency, timeoutMs, rejectTransparent, eliteOnly}
   *
   * v18.5.0 — İKİ AŞAMALI TEST (kullanıcı önerisi):
   *  1) TCP: yalnız proxy portuna bağlantı açılıyor mu (kısa zaman aşımı, yüksek paralellik).
   *     Ölü adresler saniyeler içinde elenir; eskiden her ölü proxy tam HTTP zaman aşımını bekletiyordu.
   *  2) Doğrulama: yalnız hayatta kalanlara yargıç (httpbin) isteği → çalışıyor mu + anonimlik
   *     (elite / anonim / şeffaf). Özel modda kullanıcının adresi.
   * "Yeter, kullan": 1. aşamadaysa bağlantısı açılanlar (doğrulanmamış), 2. aşamadaysa doğrulananlar havuz olur.
   * Önceki taramalarda panel yanıtı almış "iyi" proxy'ler en önce denenir.
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
    val eliteOnly = cfg.optBoolean("eliteOnly", false)
    val work: List<Entry> = synchronized(lock) {
      val goodFirst = good.values.toList()
      val keys = goodFirst.map { it.key }.toHashSet()
      goodFirst + candidates.filter { it.key !in keys }.shuffled()
    }
    if (work.isEmpty()) return JSONObject().put("started", false).put("error", "Test edilecek proxy yok. Önce liste indirin veya girin.")

    val myRun = ++T.runId
    T.mode = mode; T.error = ""; T.stage = "tcp"; T.tcpTotal = work.size; T.total = 0
    T.tcpTested.set(0); T.tcpAlive.set(0); T.tcpResults.clear()
    T.elite.set(0); T.anonymous.set(0); T.unknownAnon.set(0)
    T.tested.set(0); T.working.set(0); T.deadCount.set(0); T.transparent.set(0)
    for (i in 0 until 3) T.perScheme.set(i, 0)
    T.results.clear(); T.paused.set(false); T.stop.set(false)
    T.startedAt = System.currentTimeMillis(); T.endedAt = 0L; T.pausedAccumMs = 0L; T.pausedSince = 0L
    T.phase = "running"
    val tcpTimeout = (timeoutMs / 2).coerceIn(1500, 3000)
    val tcpThreads = (concurrency * 2).coerceIn(32, 256)

    Thread {
      try {
        T.ownIp = if (mode == "system") runCatching { fetchOwnIp(timeoutMs) }.getOrDefault("") else ""
        // ── Aşama 1: TCP ──
        runWorkers(tcpThreads, work.size, myRun) { i ->
          val e = work[i]
          if (tcpAlive(e, tcpTimeout)) { T.tcpAlive.incrementAndGet(); T.tcpResults.add(e) }
          T.tcpTested.incrementAndGet()
        }
        if (!T.stop.get() && myRun == T.runId) {
          // ── Aşama 2: doğrulama + anonimlik ──
          val alive = ArrayList(T.tcpResults)
          T.stage = "verify"; T.total = alive.size
          runWorkers(concurrency, alive.size, myRun) { i ->
            val e = alive[i]
            val (ms, anon) = if (mode == "custom") Pair(measureCustom(e, customUrl, expectText, timeoutMs), "unknown")
                             else verifyJudge(e, timeoutMs, rejectTransparent)
            T.tested.incrementAndGet()
            when {
              ms >= 0 -> {
                when (anon) {
                  "elite" -> T.elite.incrementAndGet()
                  "anonymous" -> T.anonymous.incrementAndGet()
                  "transparent" -> T.transparent.incrementAndGet()
                  else -> T.unknownAnon.incrementAndGet()
                }
                if (!eliteOnly || anon == "elite") {
                  T.working.incrementAndGet(); T.perScheme.incrementAndGet(e.schemeIndex())
                  T.results.add(Tested(e, ms, anon))
                }
              }
              ms == -2L -> T.transparent.incrementAndGet()
              else -> T.deadCount.incrementAndGet()
            }
          }
        }
      } catch (_: Throwable) {} finally {
        if (myRun == T.runId) {
          commitTestResults(context)
          T.phase = if (T.stop.get()) "stopped" else "done"
          T.endedAt = System.currentTimeMillis()
          PanelScanService.recordExternalDiagnostic(context, JSONObject()
            .put("state", "SCAN_PROXY_POOL_BUILT").put("total", T.tcpTotal).put("found", T.working.get())
            .put("tested", T.tcpAlive.get()))
        }
      }
    }.apply { isDaemon = true }.start()
    return JSONObject().put("started", true)
  }

  /** Paylaşılan işçi havuzu: duraklatma/durdurma/run kimliğine uyar. */
  private fun runWorkers(threads: Int, count: Int, myRun: Int, body: (Int) -> Unit) {
    if (count <= 0) return
    val n = threads.coerceIn(1, 256).coerceAtMost(count)
    val ex = Executors.newFixedThreadPool(n)
    T.executor = ex
    val idx = AtomicInteger(0)
    try {
      val futures = (0 until n).map {
        ex.submit {
          while (true) {
            if (T.stop.get() || myRun != T.runId) break
            while (T.paused.get() && !T.stop.get()) Thread.sleep(120)
            val i = idx.getAndIncrement()
            if (i >= count) break
            try { body(i) } catch (_: Throwable) {}
          }
        }
      }
      for (f in futures) runCatching { f.get() }
    } finally { runCatching { ex.shutdownNow() } }
  }

  /** Aşama 1: proxy portuna TCP bağlantısı açılıyor mu. */
  private fun tcpAlive(e: Entry, timeoutMs: Int): Boolean = try {
    java.net.Socket().use { s -> s.connect(InetSocketAddress(e.host, e.port), timeoutMs); true }
  } catch (_: Throwable) { false }

  /**
   * Aşama 2 (sistem modu): yargıç üzerinden çalışıyor mu + anonimlik.
   *  - transparent: çıkış IP'si veya başlıklarda KENDİ IP'miz görünüyor (kimlik gizlenmiyor)
   *  - anonymous  : IP gizli ama proxy olduğunu belli eden başlık (Via, X-Forwarded-For…) var
   *  - elite      : IP gizli, proxy izi yok
   * Dönüş: (gecikme ms | -1 ölü | -2 şeffaf-reddedildi, sınıf).
   */
  private fun verifyJudge(e: Entry, timeoutMs: Int, rejectTransparent: Boolean): Pair<Long, String> {
    var conn: HttpURLConnection? = null
    var judgeAnswered = false
    try {
      val start = System.currentTimeMillis()
      conn = (URL(JUDGE_URL).openConnection(e.toProxy()) as HttpURLConnection).apply {
        connectTimeout = timeoutMs; readTimeout = timeoutMs; requestMethod = "GET"
        setRequestProperty("Accept", "application/json")
        if (e.proxyType() == Proxy.Type.HTTP) e.basicHeader()?.let { setRequestProperty("Proxy-Authorization", it) }
      }
      val code = conn!!.responseCode
      judgeAnswered = true
      if (code in 200..299) {
        val body = conn!!.inputStream.bufferedReader().use { it.readText() }
        val ms = System.currentTimeMillis() - start
        val o = runCatching { JSONObject(body) }.getOrNull()
        if (o != null && o.has("origin")) {
          val origin = o.optString("origin")
          val hdrs = o.optJSONObject("headers")
          val own = T.ownIp
          val leaks = own.isNotEmpty() && (origin.contains(own) || (hdrs?.toString()?.contains(own) == true))
          if (leaks) return Pair(if (rejectTransparent) -2L else ms, "transparent")
          var proxyHeader = false
          hdrs?.keys()?.forEach { k -> if (k.lowercase() in PROXY_HEADERS) proxyHeader = true }
          return Pair(ms, if (proxyHeader || origin.contains(",")) "anonymous" else "elite")
        }
      }
    } catch (_: Throwable) {
      // Bağlantı/zaman aşımı: proxy ölü (TCP açıktı ama HTTP/SOCKS konuşmuyor).
      return Pair(-1L, "unknown")
    } finally { runCatching { conn?.disconnect() } }
    // Proxy yanıt verdi ama yargıç engellendi / beklenmeyen yanıt → IP-yankı yolu (anonimlik bilinmez).
    if (!judgeAnswered) return Pair(-1L, "unknown")
    val ms = measureSystem(e, timeoutMs, rejectTransparent)
    return Pair(ms, if (ms == -2L) "transparent" else "unknown")
  }

  private fun commitTestResults(context: Context) {
    // 1. aşamada "yeter" → bağlantısı açılanlar (doğrulanmamış, gecikme bilinmiyor).
    val ordered: List<Tested> = if (T.stage == "tcp") T.tcpResults.toList().map { Tested(it, -1L, "unknown") }
                                else T.results.sortedBy { it.ms }
    synchronized(lock) { pool = ordered; poolTested = T.stage != "tcp" }
    resetHealth(); lastTestAt = System.currentTimeMillis(); lastRefreshAt = lastTestAt
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
    val tcp = T.stage == "tcp"
    val done = if (tcp) T.tcpTested.get() else T.tested.get()
    val all = if (tcp) T.tcpTotal else T.total
    val rate = if (elapsed > 0) done * 1000.0 / elapsed else 0.0
    val etaMs = if (rate > 0 && all > done) ((all - done) / rate * 1000).toLong() else 0L
    val fastest = T.results.sortedBy { it.ms }.take(10).map { JSONObject().put("proxy", it.entry.masked()).put("ms", it.ms).put("anon", it.anon) }
    return JSONObject()
      .put("phase", T.phase).put("mode", T.mode).put("stage", T.stage)
      .put("tcpTotal", T.tcpTotal).put("tcpTested", T.tcpTested.get()).put("tcpAlive", T.tcpAlive.get())
      .put("total", T.total).put("tested", T.tested.get())
      .put("working", T.working.get()).put("dead", T.deadCount.get()).put("transparent", T.transparent.get())
      .put("elite", T.elite.get()).put("anonymous", T.anonymous.get()).put("unknownAnon", T.unknownAnon.get())
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

  /**
   * v18.5.0 — Proxy AÇIK ama havuz BOŞ (test yapılmamış / "test etmeden kullan" seçilmemiş).
   * v18.4.0'da bu durumda her deneme hiç istek gönderilmeden "bulunamadı" sayılıyordu
   * (sessiz yanlış negatif). Artık servis taramayı "SCAN_PROXY_EMPTY" ile duraklatır.
   */
  fun isEmptyPool(): Boolean = enabled && synchronized(lock) { pool.isEmpty() }

  private fun selectionOf(e: Entry): Selection {
    lastProxyMasked = e.masked()
    return Selection(e, e.toProxy(), if (e.proxyType() == Proxy.Type.HTTP) e.basicHeader() else null)
  }

  private fun tryAcquire(e: Entry): Boolean {
    val c = inFlight.computeIfAbsent(e.key) { AtomicInteger(0) }
    if (c.incrementAndGet() > PER_PROXY_INFLIGHT) { c.decrementAndGet(); return false }
    return true
  }

  /** Her select() sonrası istek bitince çağrılır (yük sayacı). */
  fun release(sel: Selection?) {
    if (sel == null) return
    inFlight[sel.entry.key]?.let { if (it.decrementAndGet() < 0) it.set(0) }
  }

  /**
   * v18.5.0 — Seçim: (1) panel yanıtı almış "iyi" proxy'ler öncelikli (3 seçimin 2'si),
   * (2) aynı proxy'ye en çok PER_PROXY_INFLIGHT eşzamanlı istek, (3) hepsi doluysa ölü
   * olmayan herhangi biri (tarama durmasın). Ölü yoksa null → servis duraklar.
   */
  fun select(): Selection? {
    if (!enabled) return null
    val (snap, goodAlive) = synchronized(lock) {
      val entries = pool.map { it.entry }
      val keys = entries.mapTo(HashSet()) { it.key }
      Pair(entries, good.values.filter { it.key in keys && !dead.contains(it.key) })
    }
    if (snap.isEmpty()) return null
    if (goodAlive.isNotEmpty() && rrGood.incrementAndGet() % 3 != 0) {
      for (attempt in goodAlive.indices) {
        val e = goodAlive[(rrGood.getAndIncrement() and Int.MAX_VALUE) % goodAlive.size]
        if (tryAcquire(e)) return selectionOf(e)
      }
    }
    var fallback: Entry? = null
    for (attempt in snap.indices) {
      val e = snap[(rr.getAndIncrement() and Int.MAX_VALUE) % snap.size]
      if (dead.contains(e.key)) continue
      if (tryAcquire(e)) return selectionOf(e)
      if (fallback == null) fallback = e
    }
    return fallback?.let { inFlight.computeIfAbsent(it.key) { AtomicInteger(0) }.incrementAndGet(); selectionOf(it) }
  }

  /**
   * v18.5.0 — TARAMA ÖNCESİ TAZELEME. Ücretsiz proxy'ler dakikalar içinde ölür; havuz
   * STALE_POOL_MS'den eskiyse tarama başlamadan hızlı TCP kontrolüyle ölüler çıkarılır
   * (bütçe ~15 sn; kontrol edilemeyenler havuzda kalır). Dönüş: çıkarılan sayısı.
   */
  fun refreshPoolIfStale(context: Context, budgetMs: Long = 15_000L): Int {
    restoreIfNeeded(context)
    if (!enabled) return 0
    val snap = synchronized(lock) { pool }
    if (snap.isEmpty()) return 0
    val last = maxOf(lastTestAt, lastRefreshAt)
    if (System.currentTimeMillis() - last < STALE_POOL_MS) return 0
    val deadNow = ConcurrentHashMap.newKeySet<String>()
    val n = 64.coerceAtMost(snap.size)
    val ex = Executors.newFixedThreadPool(n)
    val deadline = System.currentTimeMillis() + budgetMs
    val idx = AtomicInteger(0)
    try {
      val futures = (0 until n).map {
        ex.submit {
          while (System.currentTimeMillis() < deadline) {
            val i = idx.getAndIncrement()
            if (i >= snap.size) break
            val e = snap[i].entry
            if (e.user.isNullOrEmpty() && !tcpAlive(e, 2000)) deadNow.add(e.key)
          }
        }
      }
      for (f in futures) runCatching { f.get() }
    } finally { runCatching { ex.shutdownNow() } }
    val kept = snap.filter { it.entry.key !in deadNow }
    synchronized(lock) { pool = kept }
    lastRefreshAt = System.currentTimeMillis()
    persist(context)
    PanelScanService.recordExternalDiagnostic(context, JSONObject()
      .put("state", "SCAN_PROXY_REFRESH").put("total", snap.size).put("found", kept.size))
    return snap.size - kept.size
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

  /**
   * Sonuc geri bildirimi. PROXY hatasi 3 ustunde olu isaretle.
   * v18.5.0: TARGET = proxy panelden gerçek yanıt getirdi → başarı sayılır, "iyi" listeye girer
   * (kalıcı; sonraki testlerde ilk denenir, taramada öncelikli seçilir).
   */
  fun reportResult(context: Context, key: String, fault: Fault) {
    if (fault == Fault.TARGET) {
      failCount.remove(key)
      val first = successCount.computeIfAbsent(key) { AtomicInteger(0) }.incrementAndGet() == 1
      if (first) {
        val entry = synchronized(lock) { pool.firstOrNull { it.entry.key == key }?.entry }
        if (entry != null) {
          synchronized(lock) {
            good.remove(key); good[key] = entry
            while (good.size > GOOD_MAX) good.remove(good.keys.first())
          }
          persistGoodThrottled(context)
        }
      }
      return
    }
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
    // v18.5.0: proxy KAPALIYKEN de test edilebilir (proxy merkezi her durumda çalışır).
    restoreIfNeeded(context)
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
  fun proxiedGet(context: Context, url: String, timeoutMs: Int): JSONObject =
    proxiedRequest(context, url, "GET", null, null, timeoutMs)

  /**
   * v18.7.0 — GENEL PROXY İSTEĞİ (özel başlık + gövde). proxiedGet buradan türer.
   * MAG çoklu-MAC taraması stalker handshake/profil isteklerini (Cookie + Authorization +
   * X-User-Agent başlıkları, bazen POST gövdesi) proxy üzerinden gönderir; proxiedGet'in
   * yalnız "Accept: application/json" GET'i bunun için yetmiyordu. Rotasyon/hata sınıflandırma
   * aynı havuzu kullanır (proxy ölürse diğerine geçilir). Yanıt başlıkları da döner (Set-Cookie
   * MAG oturumunda gerekebilir). Yönlendirme İZLENMEZ (stalker Location'ı kendi yönetir).
   */
  fun proxiedRequest(context: Context, url: String, method: String, headersJson: String?, body: String?, timeoutMs: Int): JSONObject {
    val out = JSONObject()
    var lastEx: Throwable? = null
    val headers: JSONObject? = headersJson?.takeIf { it.isNotBlank() }?.let { runCatching { JSONObject(it) }.getOrNull() }
    for (attempt in 0 until 3) {
      val sel = select() ?: break
      var conn: HttpURLConnection? = null
      try {
        val target = URL(url)
        conn = (target.openConnection(sel.proxy) as HttpURLConnection).apply {
          connectTimeout = timeoutMs; readTimeout = timeoutMs
          requestMethod = method.uppercase().let { if (it in setOf("GET", "POST", "HEAD")) it else "GET" }
          instanceFollowRedirects = false
          if (headers != null) {
            val it2 = headers.keys()
            while (it2.hasNext()) { val k = it2.next(); setRequestProperty(k, headers.optString(k, "")) }
          } else {
            setRequestProperty("Accept", "application/json")
          }
          sel.basicHeader?.let { setRequestProperty("Proxy-Authorization", it) }
          if (!body.isNullOrEmpty() && requestMethod == "POST") {
            doOutput = true
            outputStream.use { os -> os.write(body.toByteArray(Charsets.UTF_8)) }
          }
        }
        val code = conn!!.responseCode
        val stream = if (code in 200..399) conn!!.inputStream else conn!!.errorStream
        val respBody = stream?.bufferedReader()?.use { it.readText() } ?: ""
        val respHeaders = JSONObject()
        conn!!.headerFields?.forEach { (k, v) -> if (k != null) respHeaders.put(k, v.joinToString(", ")) }
        reportResult(context, sel.entry.key, Fault.TARGET)
        return out.put("ok", code in 200..299).put("status", code).put("body", respBody).put("headers", respHeaders)
          .put("proxy", sel.entry.host + ":" + sel.entry.port)
      } catch (t: Throwable) {
        lastEx = t
        reportResult(context, sel.entry.key, if (classify(t) == Fault.UNKNOWN) Fault.PROXY else classify(t))
      } finally { runCatching { conn?.disconnect() }; release(sel) }
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
      .put("v", 3).put("enabled", enabled).put("lastTestAt", lastTestAt).put("lastRefreshAt", lastRefreshAt).put("poolTested", poolTested)
      .put("candidates", JSONArray(cand.map { it.toJson() }))
      .put("pool", JSONArray(p.map { it.entry.toJson(it.ms).put("anon", it.anon) }))
      .toString()
    runCatching { saveEncrypted(context, json) }
    persistGood(context)
  }

  /** v18.5.0: "iyi" proxy listesi ayrı küçük dosyada (büyük aday listesi her başarıda yazılmasın). */
  private fun persistGood(context: Context) {
    val list = synchronized(lock) { good.values.toList() }
    runCatching { saveEncrypted(context, JSONArray(list.map { it.toJson() }).toString(), GOOD_FILE) }
  }
  @Volatile private var lastGoodPersistAt = 0L
  private fun persistGoodThrottled(context: Context) {
    val now = System.currentTimeMillis()
    if (now - lastGoodPersistAt < 30_000L) return
    lastGoodPersistAt = now
    persistGood(context)
  }
  private fun secretKey(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gen.init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    return gen.generateKey()
  }
  private fun saveEncrypted(context: Context, plain: String, fileName: String = ENC_FILE) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, secretKey())
    val blob = JSONObject().put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
      .put("ct", Base64.encodeToString(cipher.doFinal(plain.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)).toString()
    File(context.filesDir, fileName).writeText(blob)
  }
  private fun loadEncrypted(context: Context, fileName: String = ENC_FILE): String {
    val blob = JSONObject(File(context.filesDir, fileName).readText())
    val iv = Base64.decode(blob.getString("iv"), Base64.NO_WRAP)
    val ct = Base64.decode(blob.getString("ct"), Base64.NO_WRAP)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
    return String(cipher.doFinal(ct), Charsets.UTF_8)
  }
}
