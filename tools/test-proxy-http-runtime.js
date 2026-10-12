#!/usr/bin/env node
// PC-only native fixture after Gradle compilation: production OkHttp adapter, local HTTP proxy.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base=path.join(root,'frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan');
function jar(group,name,preferred) {
  const dir=path.join(process.env.GRADLE_USER_HOME||path.join(os.homedir(),'.gradle'),'caches/modules-2/files-2.1',group,name);
  assert.ok(fs.existsSync(dir),'Compile Android before this PC-only test: '+name);
  const versions=fs.readdirSync(dir).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));if(preferred)versions.unshift(preferred);
  for(const version of versions){if(!fs.existsSync(path.join(dir,version)))continue;for(const hash of fs.readdirSync(path.join(dir,version))){const file=path.join(dir,version,hash,`${name}-${version}.jar`);if(fs.existsSync(file))return file;}}
  throw Error('Missing JAR '+name);
}
const compiler=jar('org.jetbrains.kotlin','kotlin-compiler-embeddable','2.1.20'),version=path.basename(compiler).match(/embeddable-(.+)\.jar/)[1];
const stdlib=jar('org.jetbrains.kotlin','kotlin-stdlib',version),annotations=jar('org.jetbrains','annotations');
const compileCP=[compiler,stdlib,annotations,jar('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),jar('org.jetbrains.kotlin','kotlin-reflect',version),jar('org.jetbrains.kotlin','kotlin-script-runtime',version),jar('org.jetbrains.intellij.deps','trove4j')].join(path.delimiter);
const libs=[stdlib,annotations,jar('com.squareup.okhttp3','okhttp','4.12.0'),jar('com.squareup.okio','okio-jvm')];
const fixture=String.raw`package expo.modules.panelscan
import java.net.*
import java.util.concurrent.*
import java.util.concurrent.atomic.*
import java.io.*
import javax.net.ssl.*
object ScanProxyPool {
  data class Entry(val scheme:String,val host:String,val port:Int,val user:String?,val pass:String?) {
    fun toProxy()=Proxy(Proxy.Type.HTTP,InetSocketAddress.createUnresolved(host,port))
    fun basicHeader()="Basic "+java.util.Base64.getEncoder().encodeToString("$user:$pass".toByteArray())
  }
}
fun requestHead(s:Socket):String {val text=StringBuilder();while(!text.endsWith("\r\n\r\n")){val c=s.getInputStream().read();check(c>=0);text.append(c.toChar());check(text.length<8192)};return text.toString()}
fun reply(s:Socket,code:Int,body:String,headers:String="") {s.getOutputStream().write(("HTTP/1.1 $code fixture\r\nContent-Length: "+body.toByteArray().size+"\r\nConnection: close\r\n$headers\r\n$body").toByteArray());s.getOutputStream().flush()}
object HttpFixture {
 @JvmStatic fun main(args:Array<String>) {
  ServerSocket(0,20,InetAddress.getLoopbackAddress()).use { server ->
    val worker=Executors.newSingleThreadExecutor();val errors=CopyOnWriteArrayList<Throwable>();val checked=AtomicInteger();
    val serverJob=worker.submit {try {repeat(5){server.accept().use {s->s.soTimeout=3000;val head=requestHead(s)
      check(head.startsWith("GET http://target.invalid/"));check(!head.contains("Proxy-Authorization: Basic forged"))
      if(!head.contains("Proxy-Authorization:"))reply(s,407,"","Proxy-Authenticate: Basic realm=fixture\r\n")
      else {checked.incrementAndGet();val expected=if(checked.get()==1)"p:@#" else "different";check(head.contains("Basic "+java.util.Base64.getEncoder().encodeToString("same:$expected".toByteArray())));reply(s,200,"ok")}
    }}}catch(t:Throwable){errors.add(t)}}
    for(pass in listOf("p:@#","different")) {
      val conn=ProxyHttpConnection(URL("http://target.invalid/account"),ScanProxyPool.Entry("http","127.0.0.1",server.localPort,"same",pass));conn.connectTimeout=1000;conn.readTimeout=1000
      conn.setRequestProperty("Proxy-Authorization","Basic forged");check(conn.responseCode==200);check(conn.inputStream.bufferedReader().readText()=="ok");conn.disconnect()
    }
    // Cancellation before connect must not open a sixth socket or touch provider.
    val cancelled=ProxyHttpConnection(URL("http://target.invalid/cancel"),ScanProxyPool.Entry("http","127.0.0.1",server.localPort,null,null));cancelled.disconnect()
    try{cancelled.responseCode;error("cancelled request opened")}catch(e:InterruptedIOException){check(e.message=="CANCELLED")}
    check(checked.get()==2);server.close();worker.shutdownNow();runCatching{serverJob.get(2,TimeUnit.SECONDS)}
    check(errors.isEmpty()||errors.all{it is SocketException}) {errors.toString()}
  }
  // No credentials: real HTTP 407 is preserved as proxy auth failure, not retried indefinitely.
  ServerSocket(0,1,InetAddress.getLoopbackAddress()).use {server->val executor=Executors.newSingleThreadExecutor();val served=executor.submit {server.accept().use {s->requestHead(s);reply(s,407,"")}}
    val conn=ProxyHttpConnection(URL("http://target.invalid/"),ScanProxyPool.Entry("http","127.0.0.1",server.localPort,null,null));conn.connectTimeout=1000;conn.readTimeout=1000;check(conn.responseCode==407);conn.disconnect();served.get(2,TimeUnit.SECONDS);executor.shutdownNow()
  }
  // TLS to the proxy and TLS inside its CONNECT tunnel, with a trusted fixture certificate.
  for(secureTarget in listOf(false,true)) {
    val executor=Executors.newCachedThreadPool()
    val origin=if(secureTarget)SSLServerSocketFactory.getDefault().createServerSocket(0) else null
    val originJob=origin?.let { executor.submit {it.accept().use {s->val head=requestHead(s);check(head.startsWith("GET /"));check(!head.contains("Proxy-Authorization",true));reply(s,200,"nested-tls")}} }
    (SSLServerSocketFactory.getDefault().createServerSocket(0) as SSLServerSocket).use {server->
      val proxyJob=executor.submit {server.accept().use {s->val head=requestHead(s)
        if(!secureTarget){check(head.startsWith("GET http://target.invalid/"));reply(s,200,"tls-proxy")}
        else {check(head.startsWith("CONNECT localhost:"));check(head.contains("Proxy-Authorization: Basic"));
          s.getOutputStream().write("HTTP/1.1 200 Connection established\r\n\r\n".toByteArray());s.getOutputStream().flush()
          Socket("127.0.0.1",origin!!.localPort).use {upstream->val upload=executor.submit {runCatching{s.getInputStream().copyTo(upstream.getOutputStream())}};runCatching{upstream.getInputStream().copyTo(s.getOutputStream())};s.close();upload.get(3,TimeUnit.SECONDS)}
        }
      }}
      val url=if(secureTarget)URL("https://localhost:"+origin!!.localPort+"/video") else URL("http://target.invalid/video")
      val conn=ProxyHttpConnection(url,ScanProxyPool.Entry("https","localhost",server.localPort,"paid","fixture"));conn.connectTimeout=2000;conn.readTimeout=2000
      conn.setRequestProperty("Proxy-Authorization","Basic forged");check(conn.responseCode==200);check(conn.inputStream.bufferedReader().readText()==if(secureTarget)"nested-tls" else "tls-proxy");conn.disconnect();proxyJob.get(4,TimeUnit.SECONDS)
    }
    originJob?.get(4,TimeUnit.SECONDS);origin?.close();executor.shutdownNow()
  }
  // A trusted proxy certificate for localhost still must not authenticate an IP hostname.
  (SSLServerSocketFactory.getDefault().createServerSocket(0) as SSLServerSocket).use {server->val executor=Executors.newSingleThreadExecutor();val served=executor.submit {server.accept().use {s->runCatching{(s as SSLSocket).startHandshake()}}}
    val conn=ProxyHttpConnection(URL("http://target.invalid/"),ScanProxyPool.Entry("https","127.0.0.1",server.localPort,null,null));conn.connectTimeout=1000;conn.readTimeout=1000
    try{conn.responseCode;error("proxy hostname mismatch accepted")}catch(_:SSLHandshakeException){}finally{conn.disconnect()};served.get(3,TimeUnit.SECONDS);executor.shutdownNow()
  }
  println("PASS: production HTTP proxy 407/auth retry, same gateway different passwords, forged header removal, cancellation and remote target DNS")
  println("PASS: production HTTPS proxy, nested target TLS/CONNECT credential isolation and hostname mismatch rejection")
 }
}`;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kizilkan-http-proxy-test-'));
try{
  const classes=path.join(temp,'classes');fs.mkdirSync(classes);const file=path.join(temp,'HttpFixture.kt');
  fs.writeFileSync(file,fixture);
  execFileSync('javac',['-encoding','UTF-8','-d',classes,path.join(base,'ProxySocketFactory.java')],{windowsHide:true,timeout:30000});
  const cp=[classes,...libs].join(path.delimiter);
  execFileSync('java',['-cp',compileCP,'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-classpath',cp,'-d',classes,file,path.join(base,'ProxyHttpConnection.kt')],{windowsHide:true,timeout:120000});
  const keystore=path.join(temp,'fixture.p12');
  execFileSync('keytool',['-genkeypair','-alias','fixture','-keyalg','RSA','-keysize','2048','-storetype','PKCS12','-keystore',keystore,'-storepass','fixturepass','-keypass','fixturepass','-dname','CN=localhost','-ext','SAN=dns:localhost','-validity','2','-noprompt'],{windowsHide:true,timeout:30000,stdio:'pipe'});
  console.log(execFileSync('java',['-Djavax.net.ssl.keyStore='+keystore,'-Djavax.net.ssl.keyStorePassword=fixturepass','-Djavax.net.ssl.trustStore='+keystore,'-Djavax.net.ssl.trustStorePassword=fixturepass','-cp',cp,'expo.modules.panelscan.HttpFixture'],{encoding:'utf8',windowsHide:true,timeout:25000}).trim());
}finally{assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('kizilkan-http-proxy-test-'));fs.rmSync(temp,{recursive:true,force:true});}
