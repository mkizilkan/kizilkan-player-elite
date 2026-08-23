package expo.modules.panelscan

import android.content.Intent
import android.os.Build
import java.util.UUID
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PanelScanModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PanelScan")

    AsyncFunction("startScan") { candidatesJson: String, username: String, password: String, concurrency: Int, timeoutMs: Int ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context yok")
      val runId = UUID.randomUUID().toString()
      PanelScanService.seedStartingSnapshot(context, "single", runId)
      val intent = Intent(context, PanelScanService::class.java).apply {
        action = PanelScanService.ACTION_START
        putExtra("candidatesJson", candidatesJson)
        putExtra("username", username)
        putExtra("password", password)
        putExtra("concurrency", concurrency.coerceIn(1, 20))
        putExtra("timeoutMs", timeoutMs.coerceIn(2000, 20000))
        putExtra("runId", runId)
      }
      ContextCompat.startForegroundService(context, intent)
      runId
    }

    AsyncFunction("startBulkScan") { candidatesJson: String, accountsJson: String, concurrency: Int, timeoutMs: Int ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context yok")
      val runId = UUID.randomUUID().toString()
      PanelScanService.seedStartingSnapshot(context, "bulk", runId)
      val intent = Intent(context, PanelScanService::class.java).apply {
        action = PanelScanService.ACTION_BULK_START
        putExtra("candidatesJson", candidatesJson)
        putExtra("accountsJson", accountsJson)
        putExtra("concurrency", concurrency.coerceIn(1, 32))
        putExtra("timeoutMs", timeoutMs.coerceIn(2000, 20000))
        putExtra("runId", runId)
      }
      ContextCompat.startForegroundService(context, intent)
      runId
    }

    AsyncFunction("startUnifiedScan") { jobsJson: String, concurrency: Int, timeoutMs: Int ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context yok")
      val runId = UUID.randomUUID().toString()
      PanelScanService.seedStartingSnapshot(context, "unified", runId)
      val intent = Intent(context, PanelScanService::class.java).apply {
        action = PanelScanService.ACTION_UNIFIED_START
        putExtra("jobsJson", jobsJson)
        putExtra("concurrency", concurrency.coerceIn(1, 32))
        putExtra("timeoutMs", timeoutMs.coerceIn(2000, 20000))
        putExtra("runId", runId)
      }
      ContextCompat.startForegroundService(context, intent)
      runId
    }

    AsyncFunction("cancelScan") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      context.startService(Intent(context, PanelScanService::class.java).apply { action = PanelScanService.ACTION_CANCEL })
      true
    }

    AsyncFunction("pauseScan") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      context.startService(Intent(context, PanelScanService::class.java).apply { action = PanelScanService.ACTION_PAUSE })
      true
    }

    AsyncFunction("resumeScan") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      context.startService(Intent(context, PanelScanService::class.java).apply { action = PanelScanService.ACTION_RESUME })
      true
    }

    Function("getSnapshot") {
      val context = appContext.reactContext ?: return@Function "{}"
      context.getSharedPreferences(PanelScanService.PREFS, 0)
        .getString(PanelScanService.KEY_SNAPSHOT, "{}") ?: "{}"
    }
  }
}
