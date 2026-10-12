package expo.modules.panelscan

import android.content.Context
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL
import java.util.BitSet
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorCompletionService
import java.util.concurrent.Future
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/** Each run owns its workers, counters and connections. Interrupted work is encrypted and resumable. */
internal object ProxyTestEngine {
  private class State(val id: String, @Volatile var cfg: JSONObject, val work: List<ScanProxyPool.Entry>) {
    val lock = Any()
    val tcpDone = BitSet(); val tcpAlive = BitSet(); val verifyDone = BitSet()
    val results = mutableListOf<ScanProxyPool.Tested>()
    val reasons = linkedMapOf<String, Int>()
    val connections = ConcurrentHashMap.newKeySet<HttpURLConnection>()
    @Volatile var phase = "running"; @Volatile var stage = "tcp"
    @Volatile var stopped = false; @Volatile var ownIp = ""; @Volatile var error = ""
    val tcpConcurrency = if(cfg.has("verifyConcurrency")) cfg.optInt("concurrency",128).coerceIn(4,128)
      else (cfg.optInt("concurrency",32).coerceIn(4,128)*2).coerceAtMost(128)
    @Volatile var verifyConcurrency = cfg.optInt("verifyConcurrency",16).coerceIn(1,128)
    @Volatile var activeWorkers = 0
    init { cfg.put("concurrency",tcpConcurrency).put("verifyConcurrency",verifyConcurrency) }
    var startedAt = System.currentTimeMillis(); var endedAt = 0L
    var verifyStartedAt = 0L; var pausedAt = 0L; var pausedMs = 0L
    var elite = 0; var anonymous = 0; var transparent = 0; var unknown = 0
    var http = 0; var https = 0; var failed = 0; var filtered = 0
  }
  @Volatile private var active: State? = null
  private val journalLock = Any()
  private val echoes = listOf("api.ipify.org?format=json", "icanhazip.com", "checkip.amazonaws.com", "ifconfig.me/ip")
  private val proxyHeaders = setOf("via", "x-forwarded-for", "forwarded", "x-real-ip", "proxy-connection", "client-ip", "x-client-ip")
  private data class Check(val ms: Long = -1, val ip: String = "", val reason: String = "", val headers: JSONObject? = null)

  fun restore(context: Context) {
    if (active != null) return
    synchronized(journalLock) {
      if (active != null) return
      if (!ScanProxyPool.encryptedFileExists(context,"scan_proxy_test_input.enc") &&
          !ScanProxyPool.encryptedFileExists(context,"scan_proxy_test_progress.enc")) return
      try {
        val input = JSONObject(ScanProxyPool.loadTestJournal(context, "input"))
        val saved = JSONObject(ScanProxyPool.loadTestJournal(context, "progress"))
        if (input.optString("id") != saved.optString("id")) throw IllegalStateException("JOURNAL_ID_MISMATCH")
        val work = ScanProxyPool.entriesFromJson(input.getJSONArray("entries"))
        val state = State(input.getString("id"), input.getJSONObject("config"), work)
        fun bits(name: String) = BitSet.valueOf(Base64.decode(saved.optString(name, ""), Base64.NO_WRAP))
        state.tcpDone.or(bits("tcpDoneBits")); state.tcpAlive.or(bits("tcpAliveBits")); state.verifyDone.or(bits("verifyDoneBits"))
        state.stage = saved.optString("stage", "tcp"); state.ownIp = saved.optString("ownIp")
        state.phase = saved.optString("phase", "interrupted").let { if (it == "running" || it == "paused") "interrupted" else it }
        state.startedAt = saved.optLong("startedAt", System.currentTimeMillis()); state.endedAt = saved.optLong("endedAt")
        state.verifyStartedAt = saved.optLong("verifyStartedAt"); state.pausedMs = saved.optLong("pausedMs")
        if (state.phase=="interrupted") {
          state.pausedAt=saved.optLong("pausedAt").takeIf { it>0 } ?: saved.optLong("checkpointAt",System.currentTimeMillis())
        }
        state.error = saved.optString("error"); state.elite=saved.optInt("elite"); state.anonymous=saved.optInt("anonymous")
        state.transparent=saved.optInt("transparent"); state.unknown=saved.optInt("unknownAnon")
        state.http=saved.optInt("httpUsable"); state.https=saved.optInt("httpsUsable"); state.failed=saved.optInt("dead"); state.filtered=saved.optInt("filtered")
        val reasons=saved.optJSONObject("reasons") ?: JSONObject(); reasons.keys().forEach { state.reasons[it]=reasons.optInt(it) }
        val results=saved.optJSONArray("results") ?: JSONArray()
        for(i in 0 until results.length()) {
          val row=results.getJSONObject(i); val e=ScanProxyPool.entriesFromJson(JSONArray().put(row)).firstOrNull() ?: continue
          state.results.add(ScanProxyPool.Tested(e,row.optLong("ms"),row.optString("anon","unknown"),if(row.has("http"))row.optBoolean("http") else null,if(row.has("https"))row.optBoolean("https") else null))
        }
        active=state
      } catch (_: Throwable) {
        active=State("unreadable",JSONObject(),emptyList()).apply { phase="failed"; error="Kayıtlı test okunamadı; dosyalar korundu. Yeni test için listeyi kontrol edin." }
      }
    }
  }

  fun start(context: Context, json: String): JSONObject {
    restore(context)
    if (active?.phase in setOf("running", "paused")) return JSONObject().put("started",false).put("error","Test zaten çalışıyor.")
    val cfg=runCatching { JSONObject(json) }.getOrDefault(JSONObject())
    if (cfg.optString("mode") == "custom" && !cfg.optString("url").matches(Regex("(?i)^https?://.+")))
      return JSONObject().put("started",false).put("error","Kontrol adresi http(s):// ile başlamalı.")
    val resume=cfg.optBoolean("resume",false)
    val old=active
    val state = if (resume && old?.phase == "interrupted") old else State(UUID.randomUUID().toString(),cfg,ScanProxyPool.testEntries(context))
    if (state.work.isEmpty()) return JSONObject().put("started",false).put("error","Önce proxy listesi yükleyin.")
    state.phase="running"; state.stopped=false; state.error=""; state.endedAt=0
    if(resume) {
      if(cfg.has("verifyConcurrency")) {
        state.verifyConcurrency=cfg.optInt("verifyConcurrency",16).coerceIn(1,128)
        state.cfg=JSONObject(state.cfg.toString()).put("verifyConcurrency",state.verifyConcurrency)
      }
      state.ownIp="" // A resumed test may use a different network than the checkpoint.
      if(state.pausedAt>0) { state.pausedMs+=System.currentTimeMillis()-state.pausedAt; state.pausedAt=0 }
    }
    synchronized(journalLock) {
      active=state
      ScanProxyPool.saveTestJournal(context,"input",JSONObject().put("id",state.id).put("config",state.cfg)
        .put("entries",JSONArray(state.work.map { it.toJson() })).toString())
      checkpoint(context)
    }
    try { ProxyTestService.begin(context) } catch (_: Throwable) {
      state.phase="failed"; state.error="Arka plan servisi başlatılamadı. Uygulamayı ön plana alıp tekrar deneyin."; checkpoint(context)
      return JSONObject().put("started",false).put("error",state.error)
    }
    Thread({ run(context,state) },"ProxyTest-${state.id.take(8)}").apply { isDaemon=true }.start()
    return JSONObject().put("started",true).put("runId",state.id)
  }

  private fun workers(state: State, indices: List<Int>, limit: ()->Int, task: (Int)->Unit) {
    if(indices.isEmpty()) return
    // Only a bounded number of candidates are submitted. Resize between completions;
    // lowering speed drains existing requests without losing or repeating their results.
    val executor=ThreadPoolExecutor(1,128,30L,TimeUnit.SECONDS,LinkedBlockingQueue<Runnable>())
    executor.allowCoreThreadTimeOut(true)
    val completed=ExecutorCompletionService<Unit>(executor)
    val pending=mutableSetOf<Future<Unit>>()
    var next=0
    try {
      while(!state.stopped && (next<indices.size || pending.isNotEmpty())) {
        val n=limit().coerceIn(1,128).coerceAtMost(indices.size)
        if(executor.corePoolSize!=n) executor.corePoolSize=n
        while(!state.stopped && state.phase=="running" && next<indices.size && pending.size<n) {
          val i=indices[next++]
          pending.add(completed.submit(java.util.concurrent.Callable {
            if(!state.stopped) task(i)
            Unit
          }))
        }
        state.activeWorkers=pending.size
        if(pending.isEmpty()) Thread.sleep(100)
        else {
          val finished=completed.poll(100,TimeUnit.MILLISECONDS)
          if(finished!=null) {
            pending.remove(finished)
            state.activeWorkers=pending.size
            finished.get()
          }
        }
      }
    } finally {
      pending.forEach { it.cancel(true) }
      executor.shutdownNow()
      state.activeWorkers=0
    }
  }

  private fun run(context: Context, state: State) {
    val timeout=state.cfg.optInt("timeoutMs",6000).coerceIn(2000,20000)
    try {
      if(state.ownIp.isEmpty() && state.cfg.optString("mode")!="custom") {
        for(echo in echoes.take(2)) { if(state.stopped) break; val check=request(state,null,"https://$echo",timeout); if(check.ip.isNotEmpty()) { state.ownIp=check.ip; break } }
      }
      if(state.stage=="tcp") {
        workers(state,state.work.indices.filter { synchronized(state.lock) { !state.tcpDone[it] } },{state.tcpConcurrency}) { i ->
          val e=state.work[i]
          val alive=try { Socket().use { it.connect(InetSocketAddress(e.host,e.port),(timeout/2).coerceIn(1500,3000)); true } } catch (_: Throwable) { false }
          synchronized(state.lock) { if(!state.stopped) { state.tcpDone.set(i); if(alive) state.tcpAlive.set(i) } }
        }
        if(state.stopped) return
        synchronized(state.lock) { state.stage="verify"; state.verifyStartedAt=System.currentTimeMillis() }
        checkpoint(context)
      }
      // The user's verification limit is independent from the TCP stage.
      workers(state,state.work.indices.filter { synchronized(state.lock) { state.tcpAlive[it] && !state.verifyDone[it] } },{state.verifyConcurrency}) { i ->
        val e=state.work[i]
        val custom=state.cfg.optString("mode")=="custom"
        val h=if(custom) request(state,e,state.cfg.getString("url"),timeout,state.cfg.optString("expectText"),true)
          else request(state,e,"http://${echoes[i%echoes.size]}",timeout)
        val s=if(custom) Check() else request(state,e,"https://${echoes[(i+1)%echoes.size]}",timeout)
        var anon="unknown"
        val works=h.ms>=0 || s.ms>=0
        if(works && !custom && state.ownIp.isNotEmpty()) {
          if(state.ownIp in h.ip.split(',') || state.ownIp in s.ip.split(',')) anon="transparent"
          else {
            val judge=request(state,e,"https://httpbin.org/get",timeout)
            if(judge.ip.isNotEmpty() && judge.headers!=null) {
              val leaks=state.ownIp in judge.ip.split(',') || judge.headers.keys().asSequence().any { key ->
                Regex("[0-9a-fA-F:.]+").findAll(judge.headers.optString(key)).any { validIp(it.value)==state.ownIp }
              }
              anon=if(leaks) "transparent" else if(judge.headers.keys().asSequence().any { it.lowercase() in proxyHeaders }) "anonymous" else "elite"
            }
          }
        }
        val accepted=works && !(anon=="transparent" && state.cfg.optBoolean("rejectTransparent",true)) &&
          !(state.cfg.optBoolean("eliteOnly",false) && anon!="elite")
        synchronized(state.lock) {
          if(!state.stopped) {
            state.verifyDone.set(i)
            if(works) {
              if(h.ms>=0 && (!custom || state.cfg.optString("url").startsWith("http://"))) state.http++
              if(s.ms>=0 || custom && h.ms>=0 && state.cfg.optString("url").startsWith("https://")) state.https++
              when(anon) { "elite"->state.elite++; "anonymous"->state.anonymous++; "transparent"->state.transparent++; else->state.unknown++ }
              if(accepted) state.results.add(ScanProxyPool.Tested(e,listOf(h.ms,s.ms).filter { it>=0 }.minOrNull()!!,anon,
                if((custom && state.cfg.optString("url").startsWith("http://")) || (!custom && h.ms>=0)) true else null,
                if((custom && state.cfg.optString("url").startsWith("https://")) || (!custom && s.ms>=0)) true else null))
              else { state.filtered++; val reason=if(anon=="transparent")"transparent-filter" else "elite-filter"; state.reasons[reason]=(state.reasons[reason]?:0)+1 }
            } else {
              state.failed++; val reason=if(h.reason in setOf("proxy-auth","protocol","tls","rate-limit")) h.reason else s.reason.ifEmpty { h.reason }.ifEmpty { "connection" }
              state.reasons[reason]=(state.reasons[reason]?:0)+1
            }
          }
        }
      }
      if(!state.stopped) {
        ScanProxyPool.applyTestResults(context,synchronized(state.lock) { state.results.toList() },true)
        state.phase="done"; state.endedAt=System.currentTimeMillis()
      }
    } catch (error: Throwable) {
      if(!state.stopped) { state.phase="failed"; state.error="Test kesildi: ${error.javaClass.simpleName}"; state.endedAt=System.currentTimeMillis() }
    } finally { if(active===state) checkpoint(context) }
  }

  private fun validIp(raw: String): String {
    val value=raw.trim()
    if(Regex("\\d{1,3}(\\.\\d{1,3}){3}").matches(value)) return if(value.split('.').all { it.toInt() in 0..255 }) value.split('.').joinToString(".") { it.toInt().toString() } else ""
    if(value.contains(':') && Regex("[0-9a-fA-F:.]+").matches(value)) return runCatching { java.net.InetAddress.getByName(value).hostAddress?.substringBefore('%') ?: "" }.getOrDefault("")
    return ""
  }
  private fun request(state: State, e: ScanProxyPool.Entry?, address: String, timeout: Int, expected: String="", custom: Boolean=false): Check {
    var conn: HttpURLConnection?=null
    val began=System.currentTimeMillis()
    return try {
      if(state.stopped) return Check(reason="cancelled")
      conn=ScanProxyPool.openConnection(URL(address),e)
      state.connections.add(conn)
      conn.connectTimeout=timeout; conn.readTimeout=timeout; conn.instanceFollowRedirects=false
      conn.setRequestProperty("Accept","application/json, text/plain")
      if(state.stopped) return Check(reason="cancelled")
      val code=conn.responseCode
      if(code==407) return Check(reason="proxy-auth")
      if(code==429 || code==503) return Check(reason="rate-limit")
      if(code !in 200..299) return Check(reason="HTTP-$code")
      val body=conn.inputStream.use { input ->
        val out=java.io.ByteArrayOutputStream(); val buffer=ByteArray(2048)
        while(true) { val n=input.read(buffer); if(n<0)break; if(out.size()+n>65536)return Check(reason="body-limit"); out.write(buffer,0,n) }; out.toString("UTF-8")
      }
      if(custom) return if(expected.isEmpty() || body.contains(expected,true)) Check(ms=System.currentTimeMillis()-began) else Check(reason="content-mismatch")
      val json=runCatching { JSONObject(body) }.getOrNull()
      val value=json?.optString("ip")?.ifEmpty { json.optString("origin") } ?: body.trim()
      val parts=value.split(',').map { validIp(it) }
      val ip=if(parts.any { it.isEmpty() }) "" else parts.joinToString(",")
      if(ip.isEmpty()) Check(reason="not-ip") else Check(System.currentTimeMillis()-began,ip,headers=json?.optJSONObject("headers"))
    } catch(error: Throwable) {
      val message=(error.message?:"").lowercase()
      Check(reason=when { state.stopped->"cancelled"; message.contains("auth")->"proxy-auth"; message.contains("protocol")||message.contains("socks")->"protocol";
        error is javax.net.ssl.SSLException->"tls"; error is java.net.SocketTimeoutException || message.contains("timeout")->"timeout"; else->"connection" })
    } finally { conn?.let { state.connections.remove(it); runCatching { it.disconnect() } } }
  }

  fun pause() { active?.let { synchronized(it.lock) { if(it.phase=="running") { it.phase="paused"; it.pausedAt=System.currentTimeMillis() } } } }
  fun updateConcurrency(context: Context, runId: String, parallel: Int): JSONObject {
    require(parallel in 1..128) { "Doğrulama paralelliği 1–128 arasında olmalı." }
    val state=active ?: throw IllegalStateException("Aktif test yok.")
    synchronized(journalLock) {
      val nextConfig=synchronized(state.lock) {
        require(active===state && state.id==runId && state.phase in setOf("running","paused","interrupted")) { "Test değişmiş veya bitmiş; hızı yeni testte seçin." }
        JSONObject(state.cfg.toString()).put("verifyConcurrency",parallel)
      }
      // A large encrypted input write must not block progress polling/result commits.
      ScanProxyPool.saveTestJournal(context,"input",JSONObject().put("id",state.id).put("config",nextConfig)
        .put("entries",JSONArray(state.work.map { it.toJson() })).toString())
      synchronized(state.lock) {
        require(active===state && state.phase in setOf("running","paused","interrupted")) { "Test hız kaydı sırasında tamamlandı; seçiminiz sonraki testte kullanılacak." }
        state.cfg=nextConfig
        state.verifyConcurrency=parallel
      }
      checkpoint(context)
    }
    return snapshot(state,false)
  }
  fun resume() { active?.let { synchronized(it.lock) { if(it.phase=="paused") { it.pausedMs+=System.currentTimeMillis()-it.pausedAt; it.pausedAt=0; it.phase="running" } } } }
  fun stop(context: Context, useTested: Boolean, failure: String="") {
    val state=active ?: return
    if(state.phase !in setOf("running","paused","interrupted")) return
    state.stopped=true; state.connections.forEach { runCatching { it.disconnect() } }
    if(useTested) ScanProxyPool.applyTestResults(context,synchronized(state.lock) { state.results.toList() },true)
    state.phase=if(failure.isEmpty()) "stopped" else "failed"; state.error=failure; state.endedAt=System.currentTimeMillis(); checkpoint(context)
  }
  fun checkpoint(context: Context) {
    val state=active ?: return
    synchronized(journalLock) { if(active===state) ScanProxyPool.saveTestJournal(context,"progress",snapshot(state,true).toString()) }
  }
  fun progress(): JSONObject = active?.let { snapshot(it,false) } ?: JSONObject().put("phase","idle").put("total",0).put("tested",0)
  private fun snapshot(state: State, journal: Boolean): JSONObject = synchronized(state.lock) {
    val end=state.endedAt.takeIf { it>0 } ?: System.currentTimeMillis()
    val elapsed=(end-state.startedAt-state.pausedMs-(if(state.pausedAt>0) end-state.pausedAt else 0L)).coerceAtLeast(0)
    val done=if(state.stage=="tcp")state.tcpDone.cardinality() else state.verifyDone.cardinality()
    val total=if(state.stage=="tcp")state.work.size else state.tcpAlive.cardinality()
    val stageElapsed=if(state.stage=="tcp")elapsed else (end-state.verifyStartedAt-state.pausedMs-(if(state.pausedAt>0)end-state.pausedAt else 0L)).coerceAtLeast(0)
    val rate=if(stageElapsed>0) done*1000.0/stageElapsed else 0.0
    val per=IntArray(3); state.results.forEach { per[it.entry.schemeIndex()]++ }
    val result=JSONObject().put("runId",state.id).put("phase",state.phase).put("mode",state.cfg.optString("mode","system")).put("stage",state.stage)
      .put("tcpTotal",state.work.size).put("tcpTested",state.tcpDone.cardinality()).put("tcpAlive",state.tcpAlive.cardinality())
      .put("tcpConcurrency",state.tcpConcurrency).put("verifyConcurrency",state.verifyConcurrency).put("activeWorkers",state.activeWorkers)
      .put("total",state.tcpAlive.cardinality()).put("tested",state.verifyDone.cardinality()).put("working",state.results.size).put("dead",state.failed).put("filtered",state.filtered)
      .put("elite",state.elite).put("anonymous",state.anonymous).put("transparent",state.transparent).put("unknownAnon",state.unknown)
      .put("httpUsable",state.http).put("httpsUsable",state.https).put("http",per[0]).put("socks4",per[1]).put("socks5",per[2])
      .put("elapsedMs",elapsed).put("etaMs",if(rate>0 && total>done)((total-done)/rate*1000).toLong() else 0).put("ratePerSec",Math.round(rate*10)/10.0)
      .put("ownIp",state.ownIp).put("error",state.error).put("reasons",JSONObject(state.reasons.toMap()))
      .put("fastest",JSONArray(state.results.sortedBy { it.ms }.take(10).map { JSONObject().put("proxy",it.entry.masked()).put("ms",it.ms).put("anon",it.anon).put("http",it.http).put("https",it.https) }))
    if(journal) {
      result.put("id",state.id).put("startedAt",state.startedAt).put("endedAt",state.endedAt).put("verifyStartedAt",state.verifyStartedAt).put("pausedMs",state.pausedMs).put("pausedAt",state.pausedAt).put("checkpointAt",System.currentTimeMillis())
      fun encode(bits: BitSet)=Base64.encodeToString(bits.toByteArray(),Base64.NO_WRAP)
      result.put("tcpDoneBits",encode(state.tcpDone)).put("tcpAliveBits",encode(state.tcpAlive)).put("verifyDoneBits",encode(state.verifyDone))
        .put("results",JSONArray(state.results.map { it.entry.toJson(it.ms).put("anon",it.anon).put("http",it.http).put("https",it.https) }))
    }
    result
  }
  fun single(context: Context, timeout: Int): JSONObject {
    val e=ScanProxyPool.testEntries(context).firstOrNull() ?: return JSONObject().put("ok",false).put("error","Proxy yok.")
    val state=State("single",JSONObject(),listOf(e)); val checked=request(state,e,"https://${echoes[0]}",timeout)
    return JSONObject().put("ok",checked.ms>=0).put("ip",checked.ip).put("proxy",e.masked()).put("error",checked.reason)
  }
}
