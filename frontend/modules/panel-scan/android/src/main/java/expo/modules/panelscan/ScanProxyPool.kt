package expo.modules.panelscan

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.InetSocketAddress
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
import java.util.concurrent.atomic.AtomicReference
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
 *  - custom: kullanıcının URL'i; 2xx + (isteğe bağlı) yanıtta metin.
 *
 * PROTOKOLLER: bağlantıya özel HTTP/CONNECT, TLS-proxy, SOCKS4a ve SOCKS5.
 * Kimlik bilgileri LOG'a yazılmaz; tanıda yalnız maskeli host.
 */
object ScanProxyPool {

  data class Entry(
    val scheme: String,
    val host: String,
    val port: Int,
    val user: String?,
    val pass: String?,
    val sourceIds: List<String> = emptyList(),
  ) {
    val key: String = java.security.MessageDigest.getInstance("SHA-256")
      .digest(JSONArray(listOf(scheme, host.lowercase(), port, user ?: "", pass ?: "")).toString().toByteArray(Charsets.UTF_8))
      .let { bytes -> val hex="0123456789abcdef";buildString(64){for(byte in bytes){val n=byte.toInt() and 255;append(hex[n shr 4]);append(hex[n and 15])}} }
    fun proxyType(): Proxy.Type =
      if (scheme == "socks4" || scheme == "socks5") Proxy.Type.SOCKS else Proxy.Type.HTTP
    fun basicHeader(): String? {
      if (user.isNullOrEmpty()) return null
      val raw = "$user:${pass ?: ""}"
      return "Basic " + Base64.encodeToString(raw.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
    }
    fun toProxy(): Proxy = Proxy(proxyType(), InetSocketAddress.createUnresolved(host, port))
    fun masked(): String { val address=if(host.contains(':'))"[$host]" else host;return if(user.isNullOrEmpty())"$scheme://$address:$port" else "$scheme://***:***@$address:$port" }
    fun schemeIndex(): Int = when (scheme) { "socks4" -> 1; "socks5" -> 2; else -> 0 }
    fun toJson(ms: Long = -1L): JSONObject {
      val o = JSONObject().put("scheme", scheme).put("host", host).put("port", port)
      if (sourceIds.isNotEmpty()) o.put("sourceIds", JSONArray(sourceIds))
      if (!user.isNullOrEmpty()) o.put("user", user)
      if (!pass.isNullOrEmpty()) o.put("pass", pass)
      if (ms >= 0) o.put("ms", ms)
      return o
    }
  }

  /** v18.5.0: anon = elite | anonymous | transparent | unknown (httpbin başlık analizi). */
  data class Tested(val entry: Entry, val ms: Long, val anon: String = "unknown", val http: Boolean? = null, val https: Boolean? = null)

  /** probePhysical / proxiedGet bunu kullanır. */
  data class Selection(val entry: Entry, val proxy: Proxy, val basicHeader: String?)

  enum class Fault { PROXY, TARGET, UNKNOWN }

  private const val ENC_FILE = "scan_proxy.enc"
  private const val GOOD_FILE = "scan_proxy_good.enc"
  private const val KEY_ALIAS = "kizilkan_scan_proxy_v1"
  private const val MAX_CANDIDATES = 200_000
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
  @Volatile private var rotation = "round_robin"

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

  fun openConnection(url: URL, entry: Entry?): HttpURLConnection =
    if (entry == null) url.openConnection(Proxy.NO_PROXY) as HttpURLConnection else ProxyHttpConnection(url, entry)

  fun setRotation(context: Context, mode: String): JSONObject {
    require(mode in setOf("round_robin", "random", "gateway")) { "Geçersiz rotasyon" }
    restoreIfNeeded(context); rotation = mode; persist(context); return status()
  }

  fun saveManualText(context: Context, text: String): Boolean {
    require(text.toByteArray(Charsets.UTF_8).size <= 8 * 1024 * 1024) { "Manuel liste 8 MiB sınırını aşıyor" }
    saveEncrypted(context, text, "scan_proxy_manual.enc"); return true
  }
  fun loadManualText(context: Context): String =
    if (encryptedFileExists(context, "scan_proxy_manual.enc")) loadEncrypted(context, "scan_proxy_manual.enc") else ""
  fun savePrivateConfig(context: Context, json: String): Boolean {
    require(json.toByteArray(Charsets.UTF_8).size <= 8 * 1024 * 1024) { "Proxy yapılandırması çok büyük" }
    JSONObject(json); saveEncrypted(context, json, "scan_proxy_private.enc"); return true
  }
  fun loadPrivateConfig(context: Context): String =
    if (encryptedFileExists(context, "scan_proxy_private.enc")) loadEncrypted(context, "scan_proxy_private.enc") else "{}"

  // Test workers and journals are owned by ProxyTestEngine.

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
  fun removeSource(context: Context, id: String): JSONObject {
    restoreIfNeeded(context)
    require(ProxyTestEngine.progress().optString("phase") !in setOf("running", "paused")) { "Önce proxy testini durdurun" }
    require(id.matches(Regex("[a-z0-9_-]{1,100}")))
    fun strip(e: Entry): Entry? = if (id !in e.sourceIds) e else e.sourceIds.filter { it != id }.takeIf { it.isNotEmpty() }?.let { e.copy(sourceIds = it) }
    synchronized(lock) {
      candidates = candidates.mapNotNull { strip(it) }
      pool = pool.mapNotNull { item -> strip(item.entry)?.let { item.copy(entry = it) } }
      val kept = good.values.mapNotNull { strip(it) }; good.clear(); for(e in kept)good[e.key]=e
    }
    persist(context); return status()
  }

  /** Süreç yeniden başladıysa şifreli durumu geri yükle. */
  fun restoreIfNeeded(context: Context) {
    if (restored) return
    synchronized(lock) {
      if (restored) return
      restored = true
      if (!encryptedFileExists(context, ENC_FILE)) return
      val o = runCatching { JSONObject(loadEncrypted(context)) }.getOrElse {
        enabled=true;lastError="Proxy havuzu okunamadı; doğrudan bağlantıya geçilmedi. Proxy merkezini kontrol edin.";return
      }
      enabled = o.optBoolean("enabled", false)
      rotation = o.optString("rotation", "round_robin").takeIf { it in setOf("round_robin", "random", "gateway") } ?: "round_robin"
      lastTestAt = o.optLong("lastTestAt", 0L)
      lastRefreshAt = o.optLong("lastRefreshAt", 0L)
      poolTested = o.optBoolean("poolTested", false)
      if (o.optInt("v", 1) >= 2) {
        candidates = parseEntries(o.optJSONArray("candidates") ?: JSONArray())
        val p = o.optJSONArray("pool") ?: JSONArray()
        val list = ArrayList<Tested>()
        for (i in 0 until p.length()) {
          val e = p.optJSONObject(i) ?: continue
          parseEntry(e)?.let { list.add(Tested(it, e.optLong("ms", -1L), e.optString("anon", "unknown"), if(e.has("http"))e.optBoolean("http") else null, if(e.has("https"))e.optBoolean("https") else null)) }
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
    val sources = linkedMapOf<String, Int>()
    val cPer = IntArray(3); val per = IntArray(3); val anon = IntArray(4)
    val (c, p, g) = synchronized(lock) {
      for (t in pool) {
        per[t.entry.schemeIndex()]++
        anon[when (t.anon) { "elite" -> 0; "anonymous" -> 1; "transparent" -> 2; else -> 3 }]++
      }
      for (e in candidates) { cPer[e.schemeIndex()]++; for(id in e.sourceIds) sources[id]=(sources[id]?:0)+1 }
      Triple(candidates.size, pool.size, good.size)
    }
    var busy = 0; for (v in inFlight.values) busy += v.get().coerceAtLeast(0)
    var ok = 0; for (v in successCount.values) ok += v.get()
    return JSONObject()
      .put("enabled", enabled)
      .put("rotation", rotation)
      .put("sources", JSONObject(sources.toMap()))
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
      .put("testPhase", ProxyTestEngine.progress().optString("phase", "idle"))
      .put("exhausted", isExhausted())
      .put("lastError", lastError)
      // Geriye dönük alanlar (v18.3.0 JS'i okuyordu).
      .put("total", c)
      .put("working", p)
  }

  // ── Canlılık testi: native foreground worker + encrypted checkpoint ──
  fun startTest(context: Context, cfgJson: String): JSONObject = ProxyTestEngine.start(context, cfgJson)
  fun pauseTest() = ProxyTestEngine.pause()
  fun resumeTest() = ProxyTestEngine.resume()
  fun stopTest(context: Context, useTested: Boolean): JSONObject { ProxyTestEngine.stop(context, useTested); return status() }
  fun getTestProgress(): JSONObject = ProxyTestEngine.progress()
  internal fun testEntries(context: Context): List<Entry> {
    restoreIfNeeded(context)
    return synchronized(lock) {
      val first = good.values.toList(); val keys = first.mapTo(HashSet()) { it.key }
      first + candidates.filter { it.key !in keys }
    }
  }
  internal fun applyTestResults(context: Context, results: List<Tested>, verified: Boolean) {
    // A failed judge/empty retest must not destroy an existing working pool.
    if (results.isEmpty()) return
    synchronized(lock) { pool = results.sortedBy { it.ms }; poolTested = verified }
    resetHealth(); lastTestAt = System.currentTimeMillis(); lastRefreshAt = lastTestAt; persist(context)
  }
  internal fun saveTestJournal(context: Context, part: String, json: String) = saveEncrypted(context, json, "scan_proxy_test_$part.enc")
  internal fun loadTestJournal(context: Context, part: String): String = loadEncrypted(context, "scan_proxy_test_$part.enc")
  private fun workFile(scope: String): String {
    require(scope.length in 1..200)
    val hash=java.security.MessageDigest.getInstance("SHA-256").digest(scope.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    return "background_work_$hash.enc"
  }
  internal fun saveWorkJournal(context: Context, scope: String, json: String): Boolean {
    require(json.toByteArray(Charsets.UTF_8).size<=16*1024*1024) { "İş kaydı çok büyük" }
    JSONObject(json);saveEncrypted(context,json,workFile(scope));return true
  }
  internal fun loadWorkJournal(context: Context, scope: String): String {
    val name=workFile(scope);return if(encryptedFileExists(context,name))loadEncrypted(context,name) else "{}"
  }
  internal fun entriesFromJson(rows: JSONArray): List<Entry> = parseEntries(rows)
  private fun tcpAlive(e: Entry, timeout: Int): Boolean = try {
    java.net.Socket().use { it.connect(InetSocketAddress(e.host, e.port), timeout); true }
  } catch (_: Throwable) { false }

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
   * (2) aynı proxy'ye en çok PER_PROXY_INFLIGHT eşzamanlı istek. Hepsi doluysa null;
   * çağıran boş/tükenmiş havuzdan ayırır ve dolu bağlantıları bekler.
   */
  fun select(targetUrl: String? = null): Selection? {
    if (!enabled) return null
    val (snap, goodAlive) = synchronized(lock) {
      val secure = targetUrl?.startsWith("https://", true)
      val entries = pool.filter { secure == null || if(secure) it.https != false else it.http != false }.map { it.entry }
      val keys = entries.mapTo(HashSet()) { it.key }
      Pair(entries, good.values.filter { it.key in keys && !dead.contains(it.key) })
    }
    if (snap.isEmpty()) return null
    if (rotation == "round_robin" && goodAlive.isNotEmpty() && rrGood.incrementAndGet() % 3 != 0) {
      for (attempt in goodAlive.indices) {
        val e = goodAlive[(rrGood.getAndIncrement() and Int.MAX_VALUE) % goodAlive.size]
        if (tryAcquire(e)) return selectionOf(e)
      }
    }
    val start = when (rotation) { "random" -> java.util.concurrent.ThreadLocalRandom.current().nextInt(snap.size); "gateway" -> 0; else -> rr.getAndIncrement() and Int.MAX_VALUE }
    for (attempt in snap.indices) {
      val e = snap[((start.toLong() + attempt) % snap.size).toInt()]
      if (dead.contains(e.key)) continue
      if (tryAcquire(e)) return selectionOf(e)
    }
    return null // A busy proxy is not permission to exceed the per-proxy connection limit.
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
      m.contains("target_") -> Fault.TARGET
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
    if (fault == Fault.UNKNOWN) return
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

  fun testExternalIp(context: Context, timeoutMs: Int = 6000): JSONObject = ProxyTestEngine.single(context, timeoutMs)

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
  private class RequestControl {
    val cancelled = AtomicBoolean(false)
    val connection = AtomicReference<HttpURLConnection?>(null)
    val createdAt = System.currentTimeMillis()
  }
  private val requestControls = ConcurrentHashMap<String, RequestControl>()

  fun cancelProxiedRequest(requestId: String): Boolean {
    require(requestId.matches(Regex("[a-zA-Z0-9_-]{1,100}"))) { "Geçersiz proxy istek kimliği" }
    val control = requestControls.computeIfAbsent(requestId) { RequestControl() }
    control.cancelled.set(true)
    runCatching { control.connection.get()?.disconnect() }
    requestControls.entries.removeIf { System.currentTimeMillis() - it.value.createdAt > 120_000 }
    return true
  }

  private class BodyLimitExceeded : java.io.IOException("BODY_LIMIT")

  fun proxiedRequest(context: Context, url: String, method: String, headersJson: String?, body: String?, timeoutMs: Int, requestId: String? = null, maxBodyBytes: Int? = null): JSONObject {
    require(maxBodyBytes == null || maxBodyBytes in 1..1048576) { "Geçersiz yanıt gövde sınırı" }
    val out = JSONObject()
    val control = requestId?.let {
      require(it.matches(Regex("[a-zA-Z0-9_-]{1,100}"))) { "Geçersiz proxy istek kimliği" }
      requestControls.computeIfAbsent(it) { RequestControl() }
    }
    try {
    var lastEx: Throwable? = null
    val headers: JSONObject? = headersJson?.takeIf { it.isNotBlank() }?.let { runCatching { JSONObject(it) }.getOrNull() }
    for (attempt in 0 until 3) {
      if (control?.cancelled?.get() == true) return out.put("ok", false).put("status", 0).put("body", "").put("error", "CANCELLED")
      var sel = select(url)
      val acquireUntil = System.currentTimeMillis() + timeoutMs
      while(sel == null && !isEmptyPool() && !isExhausted() && System.currentTimeMillis() < acquireUntil) {
        if(control?.cancelled?.get()==true) return out.put("ok",false).put("status",0).put("body","").put("error","CANCELLED")
        Thread.sleep(50); sel=select(url)
      }
      if(sel == null) break
      var conn: HttpURLConnection? = null
      try {
        val target = URL(url)
        conn = openConnection(target, sel.entry).apply {
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
          if (!body.isNullOrEmpty() && requestMethod == "POST") doOutput = true
        }
        control?.connection?.set(conn)
        if (control?.cancelled?.get() == true) throw java.io.InterruptedIOException("CANCELLED")
        if (!body.isNullOrEmpty() && conn!!.requestMethod == "POST") conn!!.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        val code = conn!!.responseCode
        if (maxBodyBytes != null && conn!!.contentLengthLong > maxBodyBytes.toLong()) throw BodyLimitExceeded()
        val stream = if (code in 200..399) conn!!.inputStream else conn!!.errorStream
        val respBody = if (maxBodyBytes == null) stream?.bufferedReader()?.use { it.readText() } ?: ""
          else stream?.use { input ->
            val output = java.io.ByteArrayOutputStream(minOf(maxBodyBytes, 4096))
            val buffer = ByteArray(4096)
            while (true) {
              if (control?.cancelled?.get() == true) throw java.io.InterruptedIOException("CANCELLED")
              // Read at most one byte beyond the limit, even without Content-Length.
              val read = input.read(buffer, 0, minOf(buffer.size, maxBodyBytes - output.size() + 1))
              if (read < 0) break
              if (output.size() + read > maxBodyBytes) throw BodyLimitExceeded()
              output.write(buffer, 0, read)
            }
            output.toString(Charsets.UTF_8.name())
          } ?: ""
        val respHeaders = JSONObject()
        conn!!.headerFields?.forEach { (k, v) -> if (k != null) respHeaders.put(k, v.joinToString(", ")) }
        reportResult(context, sel.entry.key, if (code == 407) Fault.PROXY else Fault.TARGET)
        return out.put("ok", code in 200..299).put("status", code).put("body", respBody).put("headers", respHeaders)
          .put("proxy", sel.entry.host + ":" + sel.entry.port)
      } catch (t: Throwable) {
        if (control?.cancelled?.get() == true) return out.put("ok", false).put("status", 0).put("body", "").put("error", "CANCELLED")
        if (t is BodyLimitExceeded) return out.put("ok", false).put("status", 0).put("body", "").put("error", "BODY_LIMIT")
        lastEx = t
        val fault=classify(t)
        if(fault!=Fault.TARGET)reportResult(context, sel.entry.key, fault)
        if(fault!=Fault.PROXY)return out.put("ok",false).put("status",0).put("body","").put("error",if(fault==Fault.TARGET)"TARGET_TRANSPORT" else "TRANSPORT_UNCERTAIN")
      } finally { control?.connection?.set(null); runCatching { conn?.disconnect() }; release(sel) }
    }
    return out.put("ok", false).put("status", 0).put("body", "").put("error", lastEx?.message ?: "proxy yok")
    } finally { if (requestId != null && control != null) requestControls.remove(requestId, control) }
  }

  // Credentials are scoped to ProxyHttpConnection; never install a process-global authenticator.
  private fun installAuthenticator() {
    // Kept as an internal compatibility hook for existing call sites.
  }

  // Ayristirma
  private fun parseEntry(e: JSONObject): Entry? {
    val scheme = e.optString("scheme", "http").lowercase().let {
      when (it) { "http", "https", "socks4", "socks5" -> it; "socks" -> "socks5"; else -> return null }
    }
    val host = e.optString("host", "").trim()
    val port = e.optInt("port", 0)
    if (host.isEmpty() || port !in 1..65535) return null
    val ids = e.optJSONArray("sourceIds") ?: JSONArray()
    return Entry(scheme, host, port, e.optString("user", "").ifEmpty { null }, e.optString("pass", "").ifEmpty { null },
      (0 until ids.length()).map { ids.optString(it) }.filter { it.matches(Regex("[a-z0-9_-]{1,100}")) }.distinct())
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
      .put("v", 4).put("enabled", enabled).put("rotation", rotation).put("lastTestAt", lastTestAt).put("lastRefreshAt", lastRefreshAt).put("poolTested", poolTested)
      .put("candidates", JSONArray(cand.map { it.toJson() }))
      .put("pool", JSONArray(p.map { it.entry.toJson(it.ms).put("anon", it.anon).put("http", it.http).put("https", it.https) }))
      .toString()
    saveEncrypted(context, json)
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
  @Synchronized private fun saveEncrypted(context: Context, plain: String, fileName: String = ENC_FILE) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, secretKey())
    val blob = JSONObject().put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
      .put("ct", Base64.encodeToString(cipher.doFinal(plain.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)).toString()
    val file = android.util.AtomicFile(File(context.filesDir, fileName))
    val output = file.startWrite()
    try { output.write(blob.toByteArray(Charsets.UTF_8)); file.finishWrite(output) }
    catch (t: Throwable) { file.failWrite(output); throw t }
  }
  internal fun encryptedFileExists(context: Context, fileName: String): Boolean =
    File(context.filesDir,fileName).exists() || File(context.filesDir,"$fileName.bak").exists()
  private fun loadEncrypted(context: Context, fileName: String = ENC_FILE): String {
    val blob = JSONObject(android.util.AtomicFile(File(context.filesDir, fileName)).openRead().bufferedReader().use { it.readText() })
    val iv = Base64.decode(blob.getString("iv"), Base64.NO_WRAP)
    val ct = Base64.decode(blob.getString("ct"), Base64.NO_WRAP)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
    return String(cipher.doFinal(ct), Charsets.UTF_8)
  }
}
