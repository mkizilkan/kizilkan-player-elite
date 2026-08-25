package expo.modules.panelscan

import android.content.Intent
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
      val claim = PanelScanService.claimRun(context, "single", runId)
      if (!claim.first) return@AsyncFunction mapOf("accepted" to false, "state" to "BUSY", "runId" to runId, "activeRunId" to claim.second)
      try {
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
        mapOf("accepted" to true, "state" to "STARTING", "runId" to runId, "activeRunId" to runId)
      } catch (e: Throwable) {
        PanelScanService.releaseRun(runId)
        throw e
      }
    }

    AsyncFunction("startBulkScan") { candidatesJson: String, accountsJson: String, concurrency: Int, timeoutMs: Int ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context yok")
      val runId = UUID.randomUUID().toString()
      val claim = PanelScanService.claimRun(context, "bulk", runId)
      if (!claim.first) return@AsyncFunction mapOf("accepted" to false, "state" to "BUSY", "runId" to runId, "activeRunId" to claim.second)
      try {
        val intent = Intent(context, PanelScanService::class.java).apply {
          action = PanelScanService.ACTION_BULK_START
          putExtra("candidatesJson", candidatesJson)
          putExtra("accountsJson", accountsJson)
          putExtra("concurrency", concurrency.coerceIn(1, 32))
          putExtra("timeoutMs", timeoutMs.coerceIn(2000, 20000))
          putExtra("runId", runId)
        }
        ContextCompat.startForegroundService(context, intent)
        mapOf("accepted" to true, "state" to "STARTING", "runId" to runId, "activeRunId" to runId)
      } catch (e: Throwable) {
        PanelScanService.releaseRun(runId)
        throw e
      }
    }

    AsyncFunction("startUnifiedScan") { jobsJson: String, concurrency: Int, timeoutMs: Int ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context yok")
      val runId = UUID.randomUUID().toString()
      val claim = PanelScanService.claimRun(context, "unified", runId)
      if (!claim.first) return@AsyncFunction mapOf("accepted" to false, "state" to "BUSY", "runId" to runId, "activeRunId" to claim.second)
      try {
        val intent = Intent(context, PanelScanService::class.java).apply {
          action = PanelScanService.ACTION_UNIFIED_START
          putExtra("jobsJson", jobsJson)
          putExtra("concurrency", concurrency.coerceIn(1, 32))
          putExtra("timeoutMs", timeoutMs.coerceIn(2000, 20000))
          putExtra("runId", runId)
        }
        ContextCompat.startForegroundService(context, intent)
        mapOf("accepted" to true, "state" to "STARTING", "runId" to runId, "activeRunId" to runId)
      } catch (e: Throwable) {
        PanelScanService.releaseRun(runId)
        throw e
      }
    }

    AsyncFunction("cancelScan") { runId: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      if (runId.isBlank()) return@AsyncFunction false
      context.startService(Intent(context, PanelScanService::class.java).apply {
        action = PanelScanService.ACTION_CANCEL
        putExtra("runId", runId)
      })
      true
    }

    AsyncFunction("pauseScan") { runId: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      if (runId.isBlank()) return@AsyncFunction false
      context.startService(Intent(context, PanelScanService::class.java).apply {
        action = PanelScanService.ACTION_PAUSE
        putExtra("runId", runId)
      })
      true
    }

    AsyncFunction("resumeScan") { runId: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      if (runId.isBlank()) return@AsyncFunction false
      context.startService(Intent(context, PanelScanService::class.java).apply {
        action = PanelScanService.ACTION_RESUME
        putExtra("runId", runId)
      })
      true
    }


    Function("getActiveRunId") {
      PanelScanService.activeRunId()
    }

    Function("getSnapshot") {
      val context = appContext.reactContext ?: return@Function "{}"
      context.getSharedPreferences(PanelScanService.PREFS, 0)
        .getString(PanelScanService.KEY_SNAPSHOT, "{}") ?: "{}"
    }

    Function("getDiagnosticEvents") {
      val context = appContext.reactContext ?: return@Function "[]"
      context.getSharedPreferences(PanelScanService.PREFS, 0)
        .getString(PanelScanService.KEY_EVENTS, "[]") ?: "[]"
    }
  }
}
