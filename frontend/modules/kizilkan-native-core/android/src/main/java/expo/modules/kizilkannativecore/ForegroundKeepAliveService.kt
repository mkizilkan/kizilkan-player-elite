package expo.modules.kizilkannativecore

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * v18.7.21 (D) — GENEL "CANLI TUT" ÖN PLAN SERVİSİ.
 *
 * Amaç: MAG çoklu tarama/ekleme ve liste güncelleme gibi işler JavaScript'te çalışır; uygulama arka plana
 * alınınca Android süreci düşük önceliğe atıp JS döngüsünü duraklatabilir/öldürebilir. Bu servis kalıcı bir
 * bildirimle (dataSync tipi) süreci FOREGROUND önceliğinde tutar → JS işi arka planda sürer. İŞ MANTIĞI
 * BURADA DEĞİL (Kotlin'e taşınmaz); servis yalnız süreci canlı tutar ve ilerlemeyi bildirimde gösterir.
 * JS iş bittiğinde servisi DURDURUR (pil güvenliği). Xtream combo ve panel taraması zaten kendi native
 * foreground servislerini kullanıyor; bu servis MAG/JS akışları içindir.
 */
class ForegroundKeepAliveService : Service() {
  companion object {
    const val ACTION_START = "expo.modules.kizilkannativecore.KEEPALIVE_START"
    const val ACTION_UPDATE = "expo.modules.kizilkannativecore.KEEPALIVE_UPDATE"
    const val ACTION_STOP = "expo.modules.kizilkannativecore.KEEPALIVE_STOP"
    const val CHANNEL_ID = "kizilkan_keepalive"
    const val NOTIF_ID = 18021
    const val EXTRA_TEXT = "text"
    const val EXTRA_TITLE = "title"
    const val EXTRA_DONE = "done"
    const val EXTRA_TOTAL = "total"

    fun start(context: Context, title: String, text: String) {
      val i = Intent(context, ForegroundKeepAliveService::class.java).apply {
        action = ACTION_START; putExtra(EXTRA_TITLE, title); putExtra(EXTRA_TEXT, text)
      }
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(i) else context.startService(i)
    }
    fun update(context: Context, text: String, done: Int, total: Int) {
      val i = Intent(context, ForegroundKeepAliveService::class.java).apply {
        action = ACTION_UPDATE; putExtra(EXTRA_TEXT, text); putExtra(EXTRA_DONE, done); putExtra(EXTRA_TOTAL, total)
      }
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(i) else context.startService(i)
    }
    fun stop(context: Context) {
      context.startService(Intent(context, ForegroundKeepAliveService::class.java).apply { action = ACTION_STOP })
    }
  }

  @Volatile private var title = "KIZILKAN PLAYER ELITE"
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT >= 26) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Arka plan işlemleri", NotificationManager.IMPORTANCE_LOW)
      )
    }
  }

  private fun notification(text: String, done: Int, total: Int): Notification {
    val b = Notification.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setOngoing(true)
    if (total > 0) b.setProgress(total, done.coerceIn(0, total), false)
    return b.build()
  }

  private fun goForeground(n: Notification) {
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIF_ID, n)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> {
        title = intent.getStringExtra(EXTRA_TITLE) ?: title
        goForeground(notification(intent.getStringExtra(EXTRA_TEXT) ?: "Arka planda çalışıyor…", 0, 0))
      }
      ACTION_UPDATE -> {
        // Güncelleme START'tan önce gelirse servis yine foreground'a geçer (bildirim gerekliliği).
        goForeground(notification(
          intent.getStringExtra(EXTRA_TEXT) ?: "Arka planda çalışıyor…",
          intent.getIntExtra(EXTRA_DONE, 0), intent.getIntExtra(EXTRA_TOTAL, 0)
        ))
      }
      ACTION_STOP -> {
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
        stopSelf()
        return START_NOT_STICKY
      }
    }
    // İş bitince JS stop çağırır; süreç ölürse yeniden başlatma (STICKY) istemiyoruz — iş JS'te, yeniden kuramaz.
    return START_NOT_STICKY
  }
}
