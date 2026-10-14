package expo.modules.panelscan

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.LinkProperties
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.net.InetAddress
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/** Direct DNS route, original URL/SNI/certificate verification intact. Never used for proxy traffic. */
internal object DnsRouteRequest {
  private val calls=ConcurrentHashMap<String,Call>()
  private val cancelled=ConcurrentHashMap<String,Long>()
  private var watching=false
  @Volatile private var networkKey="initial"
  @Synchronized fun networkContext(context:Context):String {
    if(!watching){
      val manager=context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      networkKey=manager.activeNetwork?.toString()?:"offline"
      manager.registerDefaultNetworkCallback(object:ConnectivityManager.NetworkCallback(){
        override fun onAvailable(network:Network){networkKey=network.toString()}
        override fun onLost(network:Network){if(networkKey.startsWith(network.toString()+"|")||networkKey==network.toString())networkKey="offline"}
        override fun onLinkPropertiesChanged(network:Network,props:LinkProperties){if(manager.activeNetwork==network)networkKey=network.toString()+"|"+props.dnsServers.joinToString(","){it.hostAddress?:""}}
      })
      watching=true
    }
    val manager=context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val active=manager.activeNetwork
    networkKey=if(active==null)"offline" else active.toString()+"|"+(manager.getLinkProperties(active)?.dnsServers?.joinToString(","){it.hostAddress?:""}?:"")
    return networkKey
  }
  fun publish(context:Context,host:String,port:Int,ip:String,expiresAt:Long):Boolean {
    require(host.length in 1..253&&port in 1..65535&&ip.matches(Regex("[0-9a-fA-F:.]+")))
    val prefs=context.applicationContext.getSharedPreferences("kizilkan.dns.routes.v1",Context.MODE_PRIVATE)
    val editor=prefs.edit();val key="${host.lowercase()}:$port"
    val expired=prefs.all.filterValues{raw->try{JSONObject(raw as String).optLong("expiresAt")<=System.currentTimeMillis()}catch(_:Exception){true}}.keys
    expired.forEach{editor.remove(it)}
    val remaining=prefs.all.keys.filter{it !in expired&&it!=key};if(remaining.size>=512)remaining.take(remaining.size-511).forEach{editor.remove(it)}
    editor.putString(key,JSONObject().put("ip",ip).put("expiresAt",expiresAt.coerceAtMost(System.currentTimeMillis()+300000)).put("network",networkContext(context)).toString()).apply()
    return true
  }
  fun cancel(id:String){cancelled[id]=System.currentTimeMillis();calls[id]?.cancel();cancelled.entries.removeIf{System.currentTimeMillis()-it.value>60000}}
  fun request(context:Context,id:String,address:String,method:String,headerJson:String,body:String,ipJson:String,timeoutMs:Int,maxBytes:Int):JSONObject {
    networkContext(context)
    require(maxBytes in 1..1048576 && method in setOf("GET","POST","HEAD")){"DNS isteği sınırı geçersiz"}
    val url=address.toHttpUrlOrNull()?:throw IllegalArgumentException("Geçersiz URL")
    require(url.username.isEmpty()&&url.password.isEmpty()){"URL userinfo desteklenmiyor"}
    val raw=JSONArray(ipJson);require(raw.length() in 1..16){"DNS aday sınırı geçersiz"}
    val ips=(0 until raw.length()).map{raw.getString(it)}.map{
      require(it.matches(Regex("[0-9a-fA-F:.]+"))&&(it.contains(':')||it.matches(Regex("\\d{1,3}(\\.\\d{1,3}){3}")))){"DNS adayı IP değil"}
      InetAddress.getByName(it)
    }
    var connectedIp=""
    val client=OkHttpClient.Builder().proxy(java.net.Proxy.NO_PROXY).retryOnConnectionFailure(false).followRedirects(false).followSslRedirects(false)
      .connectTimeout(timeoutMs.toLong(),TimeUnit.MILLISECONDS).readTimeout(timeoutMs.toLong(),TimeUnit.MILLISECONDS)
      .callTimeout(timeoutMs.toLong(),TimeUnit.MILLISECONDS).connectionPool(ConnectionPool(0,1,TimeUnit.SECONDS))
      .dns(object:Dns {override fun lookup(host:String):List<InetAddress> = if(host.equals(url.host,true))ips else Dns.SYSTEM.lookup(host)})
      .eventListener(object:EventListener(){override fun connectStart(call:Call,addr:java.net.InetSocketAddress,proxy:java.net.Proxy){connectedIp=addr.address?.hostAddress?:""}}).build()
    val builder=Request.Builder().url(url);val headers=JSONObject(headerJson)
    headers.keys().forEach{key->if(!key.equals("Host",true)&&!key.equals("Proxy-Authorization",true))builder.header(key,headers.getString(key))}
    builder.method(method,if(method=="POST")body.toRequestBody(null) else null)
    val call=client.newCall(builder.build());calls[id]=call
    if(cancelled.containsKey(id))call.cancel()
    try {
      call.execute().use { response ->
        val out=java.io.ByteArrayOutputStream();var tooLarge=false
        response.body?.byteStream()?.use {stream->val buffer=ByteArray(4096);while(true){val n=stream.read(buffer);if(n<0)break;if(out.size()+n>maxBytes){tooLarge=true;break};out.write(buffer,0,n)}}
        val hs=JSONObject();response.headers.names().forEach{key->hs.put(key,response.header(key))}
        return JSONObject().put("ok",response.isSuccessful&&!tooLarge).put("status",response.code).put("body",if(tooLarge)"" else out.toString("UTF-8"))
          .put("headers",hs).put("url",response.request.url.toString()).put("ip",connectedIp).put("error",if(tooLarge)"BODY_LIMIT" else "")
      }
    }catch(error:Throwable){return JSONObject().put("ok",false).put("status",0).put("body","").put("error",when{cancelled.containsKey(id)->"CANCELLED";error is java.io.InterruptedIOException->"TIMEOUT";else->error.javaClass.simpleName})}
    finally {calls.remove(id);cancelled.remove(id)}
  }
}
