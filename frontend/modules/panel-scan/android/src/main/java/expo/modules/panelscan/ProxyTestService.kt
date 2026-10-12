package expo.modules.panelscan

import android.app.*
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/** Keeps proxy tests independent of React navigation; checkpoints and notifications carry no credentials. */
class ProxyTestService : Service() {
  companion object {
    private const val CHANNEL="kizilkan_proxy_tests"
    private const val ONGOING=18732
    private const val FINISHED=18733
    fun begin(context: Context) { ContextCompat.startForegroundService(context,Intent(context,ProxyTestService::class.java)) }
  }
  private val handler=Handler(Looper.getMainLooper())
  private val io=java.util.concurrent.Executors.newSingleThreadExecutor()
  private var wake: PowerManager.WakeLock?=null
  private var lastCheckpoint=0L
  private var finishing=false
  private val poll:Runnable=object: Runnable {
    override fun run() {
      if(finishing) return
      val state=ProxyTestEngine.progress()
      val phase=state.optString("phase")
      if(phase !in setOf("running","paused")) {
        finishing=true
        io.execute {
          runCatching { ProxyTestEngine.checkpoint(applicationContext) }
          handler.post {
            if(ProxyTestEngine.progress().optString("runId")!=state.optString("runId")) {
              finishing=false;handler.post(poll);return@post
            }
            val title=when(phase) { "done"->"Proxy testi tamamlandı"; "failed"->"Proxy testi kesildi"; else->"Proxy testi durduruldu" }
            runCatching { (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(FINISHED,notification(title,"${state.optInt("working")} doğrulandı · ${state.optInt("dead")} doğrulanamadı",false)) }
            stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
          }
        }
        return
      }
      if(phase=="running") { if(wake?.isHeld!=true) wake?.acquire(30_000L) } else if(wake?.isHeld==true) wake?.release()
      val tcp=state.optString("stage")=="tcp"
      val text=if(phase=="paused")"Duraklatıldı; sonuçlar korunuyor" else
        "${if(tcp)"Bağlantı" else "IP/protokol"}: ${state.optInt(if(tcp)"tcpTested" else "tested")}/${state.optInt(if(tcp)"tcpTotal" else "total")} · ${state.optInt("working")} doğrulandı · ${state.optInt(if(tcp)"tcpConcurrency" else "verifyConcurrency",16)} paralel"
      runCatching { (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(ONGOING,notification("Proxy testi",text,true)) }
      if(System.currentTimeMillis()-lastCheckpoint>=5000) {
        lastCheckpoint=System.currentTimeMillis(); io.execute {
          if(runCatching { ProxyTestEngine.checkpoint(applicationContext) }.isFailure)
            runCatching { ProxyTestEngine.stop(applicationContext,false,"Test kaydı yazılamadı; depolamayı kontrol edin. Önceki kayıtlar silinmedi.") }
        }
      }
      handler.postDelayed(this,2000)
    }
  }
  override fun onCreate() {
    super.onCreate()
    val manager=getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(NotificationChannel(CHANNEL,"Proxy testi",NotificationManager.IMPORTANCE_LOW))
    wake=(getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Kizilkan:ProxyTest").apply { setReferenceCounted(false) }
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    finishing=false
    startForeground(ONGOING,notification("Proxy testi","İlerleme hazırlanıyor",true))
    when(intent?.action) { "pause"->ProxyTestEngine.pause(); "resume"->ProxyTestEngine.resume(); "stop"->ProxyTestEngine.stop(this,false) }
    handler.removeCallbacks(poll); handler.post(poll)
    return START_NOT_STICKY
  }
  private fun notification(title: String, text: String, ongoing: Boolean): Notification {
    val open=packageManager.getLaunchIntentForPackage(packageName)?.apply {
      action=Intent.ACTION_VIEW; data=Uri.parse("kizilkan-gpt://scan-proxy"); addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    } ?: Intent()
    val content=PendingIntent.getActivity(this,ONGOING,open,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder=NotificationCompat.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.stat_sys_download_done)
      .setContentTitle(title).setContentText(text).setContentIntent(content).setOngoing(ongoing).setOnlyAlertOnce(true).setAutoCancel(!ongoing)
    if(ongoing) {
      val paused=ProxyTestEngine.progress().optString("phase")=="paused"
      val action=if(paused)"resume" else "pause"
      builder.addAction(0,if(paused)"Devam" else "Duraklat",PendingIntent.getService(this,1,Intent(this,ProxyTestService::class.java).setAction(action),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      builder.addAction(0,"Durdur",PendingIntent.getService(this,2,Intent(this,ProxyTestService::class.java).setAction("stop"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    }
    return builder.build()
  }
  override fun onTimeout(startId: Int, fgsType: Int) {
    ProxyTestEngine.stop(this,false,"Android arka plan süresi doldu; sonuçlar korundu.")
    runCatching { (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(FINISHED,notification("Proxy testi kesildi","Android süre sınırı; test kayıtları korundu.",false)) }
    stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
  }
  override fun onDestroy() { handler.removeCallbacksAndMessages(null); if(wake?.isHeld==true)wake?.release(); io.shutdown(); super.onDestroy() }
  override fun onBind(intent: Intent?): IBinder?=null
}
