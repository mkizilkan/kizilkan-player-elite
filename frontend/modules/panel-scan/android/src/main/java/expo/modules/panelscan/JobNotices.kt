package expo.modules.panelscan

import android.app.*
import android.content.Context
import android.content.Intent
import android.net.Uri

internal object JobNotices {
  private const val CHANNEL="kizilkan_job_results"
  fun open(context: Context, route: String, runId: String=""): PendingIntent {
    require(route in setOf("add-playlist","mag-bulk","scan-proxy"))
    val uri=Uri.Builder().scheme("kizilkan-gpt").authority(route).apply { if(runId.isNotEmpty())appendQueryParameter("scanRunId",runId) }.build()
    val intent=context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      action=Intent.ACTION_VIEW;data=uri;addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    } ?: Intent()
    return PendingIntent.getActivity(context,(route+runId).hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
  fun show(context: Context, id: String, title: String, text: String, route: String): Boolean = try {
    val manager=context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL,"Tamamlanan işler",NotificationManager.IMPORTANCE_DEFAULT))
    val notice=Notification.Builder(context,CHANNEL).setContentTitle(title.take(100)).setContentText(text.take(240))
      .setSmallIcon(android.R.drawable.stat_sys_download_done).setAutoCancel(true).setContentIntent(open(context,route,id)).build()
    manager.notify(id.hashCode(),notice);true
  } catch (_:Throwable) { false }
}
