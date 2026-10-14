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
const libs=[stdlib,annotations,jar('org.json','json'),jar('com.squareup.okhttp3','okhttp','4.12.0'),jar('com.squareup.okio','okio-jvm')];
const fixture=String.raw`package expo.modules.panelscan
import android.content.Context
import android.net.*
import java.net.*
import java.io.*
import java.util.concurrent.*
import javax.net.ssl.*
import org.json.*
import expo.modules.kizilkannativecore.NativeDnsRoutes
object DnsFixture {
 fun readHead(s:Socket):String {val b=StringBuilder();while(!b.endsWith("\r\n\r\n")){val c=s.getInputStream().read();check(c>=0);b.append(c.toChar());check(b.length<8192)};return b.toString()}
 fun reply(s:Socket,body:String){s.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Length: "+body.toByteArray().size+"\r\nConnection: close\r\n\r\n"+body).toByteArray());s.getOutputStream().flush()}
 @JvmStatic fun main(args:Array<String>){val ctx=Context();val executor=Executors.newCachedThreadPool()
  try{
   ServerSocket(0,20,InetAddress.getLoopbackAddress()).use {server->
    val done=executor.submit {repeat(3){server.accept().use {s->val head=readHead(s);check(head.contains("Host: "+(if(it==1)"b.invalid" else "a.invalid")+":"+server.localPort));check(!head.contains("forged"));reply(s,"0123456789")}}}
    fun url(host:String)="http://$host:"+server.localPort+"/api"
    val a=DnsRouteRequest.request(ctx,"a",url("a.invalid"),"GET","{\"Host\":\"forged\"}","","[\"127.0.0.1\"]",3000,100);check(a.optInt("status")==200&&a.getString("url")==url("a.invalid"))
    val b=DnsRouteRequest.request(ctx,"b",url("b.invalid"),"GET","{}","","[\"127.0.0.1\"]",3000,100);check(b.getString("url")==url("b.invalid"))
    val limit=DnsRouteRequest.request(ctx,"limit",url("a.invalid"),"GET","{}","","[\"127.0.0.1\"]",3000,4);check(limit.optString("error")=="BODY_LIMIT"&&limit.optInt("status")==200&&!limit.optBoolean("ok"));done.get(5,TimeUnit.SECONDS)
    DnsRouteRequest.cancel("pre");val cancelled=DnsRouteRequest.request(ctx,"pre",url("a.invalid"),"GET","{}","","[\"127.0.0.1\"]",3000,100);check(cancelled.optString("error")=="CANCELLED")
   }
   println("PASS: production DNS route uses original virtual Host, isolates two hosts on one IP, enforces body cap and pre-cancel")
   ServerSocket(0,20,InetAddress.getLoopbackAddress()).use {server->val accepted=CountDownLatch(1);val done=executor.submit {server.accept().use{s->readHead(s);accepted.countDown();Thread.sleep(600)}}
    val request=executor.submit<JSONObject>{DnsRouteRequest.request(ctx,"running","http://a.invalid:"+server.localPort+"/","GET","{}","","[\"127.0.0.1\"]",3000,100)}
    check(accepted.await(2,TimeUnit.SECONDS));DnsRouteRequest.cancel("running");check(request.get(2,TimeUnit.SECONDS).optString("error")=="CANCELLED");done.get(2,TimeUnit.SECONDS)
   }
   ServerSocket(0,20,InetAddress.getLoopbackAddress()).use {server->val done=executor.submit {server.accept().use{s->readHead(s);Thread.sleep(600)}}
    val timed=DnsRouteRequest.request(ctx,"timeout","http://a.invalid:"+server.localPort+"/","GET","{}","","[\"127.0.0.1\"]",250,100);check(timed.optString("error")=="TIMEOUT"){timed.toString()};done.get(2,TimeUnit.SECONDS)
   }
   println("PASS: production in-flight cancellation is distinct from actual request timeout")
   (SSLServerSocketFactory.getDefault().createServerSocket(0) as SSLServerSocket).use {server->val done=executor.submit {server.accept().use {s->val tls=s as SSLSocket;tls.startHandshake();val names=(tls.session as ExtendedSSLSession).requestedServerNames;check(names.any{it is SNIHostName&&it.asciiName=="fixture.test"});val head=readHead(s);check(head.contains("Host: fixture.test:"));reply(s,"tls-ok")}}
    val secure=DnsRouteRequest.request(ctx,"tls","https://fixture.test:"+server.localPort+"/api","GET","{}","","[\"127.0.0.1\"]",3000,100);check(secure.optInt("status")==200){secure.toString()};done.get(4,TimeUnit.SECONDS)
   }
   (SSLServerSocketFactory.getDefault().createServerSocket(0) as SSLServerSocket).use {server->val done=executor.submit {server.accept().use {s->runCatching{(s as SSLSocket).startHandshake()}}}
    val wrong=DnsRouteRequest.request(ctx,"wrong","https://wrong.test:"+server.localPort+"/","GET","{}","","[\"127.0.0.1\"]",3000,100);check(wrong.optInt("status")==0&&wrong.optString("error")=="SSLPeerUnverifiedException"){wrong.toString()};done.get(4,TimeUnit.SECONDS)
   }
   println("PASS: production HTTPS original hostname and SNI preserved, trusted wrong-host certificate rejected")
   DnsRouteRequest.publish(ctx,"route.invalid",8080,"192.0.2.1",System.currentTimeMillis()+10000)
   check(NativeDnsRoutes.resolver(ctx,"route.invalid",8080).lookup("route.invalid").single().hostAddress=="192.0.2.1")
   (ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).activeNetwork=Network("mobile")
   check(runCatching{NativeDnsRoutes.resolver(ctx,"route.invalid",8080).lookup("route.invalid")}.isFailure)
   repeat(520){DnsRouteRequest.publish(ctx,"p$it.invalid",8080,"192.0.2.1",System.currentTimeMillis()+10000)}
   check(ctx.getSharedPreferences("kizilkan.dns.routes.v1",0).all.size<=512)
   println("PASS: real native shared route registry is bounded and invalidated by Android network context")
  }finally{executor.shutdownNow()}
 }
}`;
const context=String.raw`package android.content
import android.net.ConnectivityManager
class Context {
 companion object {const val CONNECTIVITY_SERVICE="connectivity";const val MODE_PRIVATE=0}
 val applicationContext get()=this;val manager=ConnectivityManager();val prefs=SharedPreferences()
 fun getSystemService(name:String):Any=manager
 fun getSharedPreferences(name:String,mode:Int)=prefs
}
class SharedPreferences {
 private val values=java.util.concurrent.ConcurrentHashMap<String,String>()
 val all:Map<String,Any> get()=values.toMap()
 fun getString(key:String,fallback:String?):String?=values[key]?:fallback
 fun edit()=Editor()
 inner class Editor {private val removals=mutableListOf<String>();private val added=mutableMapOf<String,String>()
 fun remove(key:String):Editor{removals.add(key);return this};fun putString(key:String,value:String):Editor{added[key]=value;return this}
 fun apply(){removals.forEach{values.remove(it)};values.putAll(added)}
 }
}`;
const network=String.raw`package android.net
class Network(private val name:String){override fun toString()=name}
class LinkProperties {val dnsServers=listOf(java.net.InetAddress.getByName("192.0.2.53"))}
class ConnectivityManager {
 var activeNetwork:Network?=Network("wifi")
 fun getLinkProperties(network:Network)=LinkProperties()
 fun registerDefaultNetworkCallback(callback:NetworkCallback){}
 open class NetworkCallback {open fun onAvailable(network:Network){};open fun onLost(network:Network){};open fun onLinkPropertiesChanged(network:Network,props:LinkProperties){}}
}`;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kizilkan-dns-route-test-'));
try{
 const classes=path.join(temp,'classes');fs.mkdirSync(classes);const sources=[['DnsFixture.kt',fixture],['Context.kt',context],['Network.kt',network]].map(([name,text])=>{const file=path.join(temp,name);fs.writeFileSync(file,text);return file;});
 const cp=[classes,...libs].join(path.delimiter);
 execFileSync('java',['-cp',compileCP,'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-classpath',cp,'-d',classes,...sources,path.join(base,'DnsRouteRequest.kt'),path.join(root,'frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/NativeDnsRoutes.kt')],{windowsHide:true,timeout:120000,stdio:'pipe'});
 const keystore=path.join(temp,'fixture.p12');
 execFileSync('keytool',['-genkeypair','-alias','fixture','-keyalg','RSA','-keysize','2048','-storetype','PKCS12','-keystore',keystore,'-storepass','fixturepass','-keypass','fixturepass','-dname','CN=fixture.test','-ext','SAN=dns:fixture.test','-validity','2','-noprompt'],{windowsHide:true,timeout:30000,stdio:'pipe'});
 console.log(execFileSync('java',['-Djavax.net.ssl.keyStore='+keystore,'-Djavax.net.ssl.keyStorePassword=fixturepass','-Djavax.net.ssl.trustStore='+keystore,'-Djavax.net.ssl.trustStorePassword=fixturepass','-cp',cp,'expo.modules.panelscan.DnsFixture'],{encoding:'utf8',windowsHide:true,timeout:30000}).trim());
}finally{assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('kizilkan-dns-route-test-'));fs.rmSync(temp,{recursive:true,force:true});}
