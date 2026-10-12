#!/usr/bin/env node
// PC-only: production Kotlin test engine with deterministic HTTP fixtures and real local TCP sockets.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base=path.join(root,'frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan');
function jar(group,name,preferred){const dir=path.join(process.env.GRADLE_USER_HOME||path.join(os.homedir(),'.gradle'),'caches/modules-2/files-2.1',group,name);assert.ok(fs.existsSync(dir),'Compile Android first: '+name);
 const versions=fs.readdirSync(dir).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));if(preferred)versions.unshift(preferred);for(const v of versions){if(!fs.existsSync(path.join(dir,v)))continue;for(const h of fs.readdirSync(path.join(dir,v))){const file=path.join(dir,v,h,`${name}-${v}.jar`);if(fs.existsSync(file))return file;}}throw Error(name);}
const compiler=jar('org.jetbrains.kotlin','kotlin-compiler-embeddable','2.1.20'),v=path.basename(compiler).match(/embeddable-(.+)\.jar/)[1],stdlib=jar('org.jetbrains.kotlin','kotlin-stdlib',v),annotations=jar('org.jetbrains','annotations');
const compilerCP=[compiler,stdlib,annotations,jar('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),jar('org.jetbrains.kotlin','kotlin-reflect',v),jar('org.jetbrains.kotlin','kotlin-script-runtime',v),jar('org.jetbrains.intellij.deps','trove4j')].join(path.delimiter);
const libs=[stdlib,annotations,jar('org.json','json')];
const fixture=String.raw`package expo.modules.panelscan
import android.content.Context
import org.json.*
import java.net.*
import java.util.concurrent.*
import java.util.concurrent.atomic.*
object ScanProxyPool {
 data class Entry(val scheme:String,val host:String,val port:Int,val user:String) {val key=user;fun masked()=user;fun schemeIndex()=0;fun toJson(ms:Long=-1)=JSONObject().put("scheme",scheme).put("host",host).put("port",port).put("user",user).put("ms",ms)}
 data class Tested(val entry:Entry,val ms:Long,val anon:String="unknown",val http:Boolean?=null,val https:Boolean?=null)
 var work=listOf<Entry>();var pool=listOf<Tested>();val disk=ConcurrentHashMap<String,String>();var baseline=true;var delay=0L
 val calls=ConcurrentHashMap<String,AtomicInteger>();val inflight=AtomicInteger();val peak=AtomicInteger()
 fun entriesFromJson(arr:JSONArray)=(0 until arr.length()).map {arr.getJSONObject(it).let {o->Entry(o.getString("scheme"),o.getString("host"),o.getInt("port"),o.getString("user"))}}
 fun encryptedFileExists(context:Context,file:String)=disk.containsKey(file.removePrefix("scan_proxy_test_").removeSuffix(".enc"))
 fun loadTestJournal(context:Context,part:String)=disk[part]?:throw java.io.FileNotFoundException()
 fun saveTestJournal(context:Context,part:String,text:String){disk[part]=text}
 fun testEntries(context:Context)=work
 fun applyTestResults(context:Context,results:List<Tested>,tested:Boolean){if(results.isNotEmpty())pool=results}
 fun openConnection(url:URL,e:Entry?)=object:HttpURLConnection(url){var ended=false
   override fun disconnect(){ended=true};override fun usingProxy()=e!=null;override fun connect(){}
   override fun getResponseCode():Int {val n=inflight.incrementAndGet();peak.updateAndGet{maxOf(it,n)}
     try {if(delay>0)Thread.sleep(delay);if(ended)throw java.io.InterruptedIOException();calls.computeIfAbsent(e?.user?:"own"){AtomicInteger()}.incrementAndGet()
       return when {e==null&&!baseline->503;e?.user=="auth"->407;e?.user=="rate"->429;url.host=="httpbin.org"&&e?.user=="judge-failed"->503;else->200}
     }finally{inflight.decrementAndGet()}}
   override fun getInputStream():java.io.InputStream {
     val own="203.0.113.1";val name=e?.user?:"own"
     val ip=if(e==null||name=="transparent"||name=="leak")own else "198.51.100.9"
     val body=if(name=="html")"<html>198.51.100.9</html>" else if(url.host=="httpbin.org")JSONObject().put("origin",ip).put("headers",when(name){"anonymous"->JSONObject().put("Via","proxy");"substring"->JSONObject().put("X-Forwarded-For","203.0.113.10");"leak"->JSONObject().put("X-Forwarded-For",own);else->JSONObject().put("Accept","application/json")}).toString() else JSONObject().put("ip",ip).toString()
     return body.byteInputStream()
   }
 }
}
object ProxyTestService {fun begin(c:Context){}}
object EngineFixture {
 private fun reset() {val f=ProxyTestEngine::class.java.getDeclaredField("active");f.isAccessible=true;f.set(null,null)}
 private fun waitFor(accept:(JSONObject)->Boolean):JSONObject {val end=System.currentTimeMillis()+10000;while(true){val p=ProxyTestEngine.progress();if(accept(p))return p;check(System.currentTimeMillis()<end){p.toString()};Thread.sleep(10)}}
 @JvmStatic fun main(args:Array<String>){val context=Context();val tcp=ServerSocket(0,100,InetAddress.getLoopbackAddress());val server=Executors.newSingleThreadExecutor();server.submit{while(!tcp.isClosed)runCatching{tcp.accept().close()}}
  try {
   fun entries(names:List<String>)=names.map {ScanProxyPool.Entry("http","127.0.0.1",tcp.localPort,it)}
   ScanProxyPool.work=entries(listOf("elite","anonymous","substring","transparent","leak","judge-failed","html","auth","rate"))
   check(ProxyTestEngine.start(context,"{}").optBoolean("started"));val p=waitFor{it.optString("phase")=="done"}
   check(p.optInt("tcpAlive")==9&&p.optInt("tested")==9);check(p.optInt("working")==4){p.toString()}
   check(p.optInt("transparent")==2&&p.optInt("unknownAnon")==1);check(ScanProxyPool.pool.first{it.entry.user=="substring"}.anon=="anonymous")
   check(p.getJSONObject("reasons").getInt("proxy-auth")==1&&p.getJSONObject("reasons").getInt("rate-limit")==1&&p.getJSONObject("reasons").getInt("not-ip")==1)
   check(ScanProxyPool.peak.get()<=16)
   ScanProxyPool.baseline=false;ScanProxyPool.work=entries(listOf("elite"));check(ProxyTestEngine.start(context,"{}").optBoolean("started"));val unknown=waitFor{it.optString("phase")=="done"}
   check(unknown.optInt("unknownAnon")==1&&unknown.optInt("elite")==0)
   ScanProxyPool.baseline=true;ScanProxyPool.delay=80;ScanProxyPool.work=entries((0..15).map{"elite$it"});ScanProxyPool.calls.clear()
   check(ProxyTestEngine.start(context,"{\"concurrency\":4}").optBoolean("started"));waitFor{it.optInt("tested")>=1};ProxyTestEngine.pause();Thread.sleep(300);ProxyTestEngine.checkpoint(context)
   ProxyTestEngine.stop(context,false);Thread.sleep(300);val before=JSONObject(ScanProxyPool.disk.getValue("progress"));val completed=before.optInt("tested")
   check(completed in 1..15);before.put("phase","running").put("endedAt",0);ScanProxyPool.disk["progress"]=before.toString();reset();ProxyTestEngine.restore(context)
   check(ProxyTestEngine.progress().optString("phase")=="interrupted");check(ProxyTestEngine.start(context,"{\"resume\":true}").optBoolean("started"));val recovered=waitFor{it.optString("phase")=="done"}
   check(recovered.optInt("tested")==16&&recovered.optInt("working")==16){recovered.toString()}
   val doneKeys=(0 until before.getJSONArray("results").length()).map{before.getJSONArray("results").getJSONObject(it).getString("user")}
   check(doneKeys.all {ScanProxyPool.calls[it]!!.get()==3}) {"completed proxies retested"}
   println("PASS: actual Kotlin IP/HTML/auth/rate-limit/anonymous/unknown-baseline classification and verification limit")
   println("PASS: actual Kotlin encrypted-journal interface, paused work recovery and completed-bitset no-repeat")
  }finally{tcp.close();server.shutdownNow()}
 }
}`;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kizilkan-proxy-engine-test-'));
try {const classes=path.join(temp,'classes');fs.mkdirSync(classes);
 const files=[['Context.kt','package android.content\nclass Context'],['Base64.kt','package android.util\nobject Base64 {const val NO_WRAP=2;fun decode(s:String,f:Int)=java.util.Base64.getDecoder().decode(s);fun encodeToString(b:ByteArray,f:Int)=java.util.Base64.getEncoder().encodeToString(b)}'],['EngineFixture.kt',fixture]].map(([name,text])=>{const file=path.join(temp,name);fs.writeFileSync(file,text);return file;});
 const cp=[classes,...libs].join(path.delimiter);
 execFileSync('java',['-cp',compilerCP,'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-classpath',cp,'-d',classes,...files,path.join(base,'ProxyTestEngine.kt')],{windowsHide:true,timeout:120000});
 console.log(execFileSync('java',['-cp',cp,'expo.modules.panelscan.EngineFixture'],{encoding:'utf8',windowsHide:true,timeout:30000}).trim());
}finally{assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('kizilkan-proxy-engine-test-'));fs.rmSync(temp,{recursive:true,force:true});}
