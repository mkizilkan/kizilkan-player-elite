package expo.modules.kizilkannativecore

import android.content.Context
import android.net.ConnectivityManager
import okhttp3.Dns
import org.json.JSONObject
import java.net.InetAddress

/** Shared with panel-scan through private app preferences, never by rewriting HTTPS URLs. */
internal object NativeDnsRoutes {
  private fun network(context:Context):String {
    val manager=context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val active=manager.activeNetwork?:return "offline"
    return active.toString()+"|"+(manager.getLinkProperties(active)?.dnsServers?.joinToString(","){it.hostAddress?:""}?:"")
  }
  fun resolver(context:Context,targetHost:String,targetPort:Int):Dns = object:Dns {
    override fun lookup(hostname:String):List<InetAddress>{
      if(hostname.equals(targetHost,true))try{
        val raw=context.applicationContext.getSharedPreferences("kizilkan.dns.routes.v1",Context.MODE_PRIVATE).getString("${targetHost.lowercase()}:$targetPort",null)
        if(raw!=null){val row=JSONObject(raw);if(row.optLong("expiresAt")>System.currentTimeMillis()&&row.optString("network")==network(context)){
          val ip=row.getString("ip");if(ip.matches(Regex("[0-9a-fA-F:.]+")))return listOf(InetAddress.getByName(ip))
        }}
      }catch(_:Exception){}
      return Dns.SYSTEM.lookup(hostname)
    }
  }
}
