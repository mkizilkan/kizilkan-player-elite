package expo.modules.panelscan

import android.content.Intent
import java.util.UUID
import java.io.File
import org.json.JSONObject
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

    AsyncFunction("startUnifiedScan") { jobsJson: String, accountCount: Int, initialTotal: Int, concurrency: Int, timeoutMs: Int ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context yok")
      PanelScanService.installCrashRecorder(context)
      val runId = UUID.randomUUID().toString()
      val claim = PanelScanService.claimRun(context, "unified", runId)
      if (!claim.first) return@AsyncFunction mapOf("accepted" to false, "state" to "BUSY", "runId" to runId, "activeRunId" to claim.second)
      val stagingDir = File(context.filesDir, "kizilkan/panel-scan-staging").apply { mkdirs() }
      val stagingFile = File(stagingDir, "$runId.json")
      try {
        // v15.2.17: Büyük birleşik tarama payload'ını Intent/Bundle içine koyma.
        // Android Binder transaction buffer'ı process genelinde sınırlıdır; servis yalnız
        // küçük metadata alır, asıl payload app-private staging dosyasından okunur.
        stagingDir.listFiles()?.filter { it.isFile && System.currentTimeMillis() - it.lastModified() > 24L * 60L * 60L * 1000L }?.forEach { runCatching { it.delete() } }
        stagingFile.bufferedWriter(Charsets.UTF_8).use { it.write(jobsJson) }
        val payloadBytes = stagingFile.length()
        val safeAccountCount = accountCount.coerceAtLeast(0)
        val safeInitialTotal = initialTotal.coerceAtLeast(0)
        PanelScanService.recordExternalDiagnostic(context, JSONObject()
          .put("runId", runId).put("mode", "unified").put("state", "STAGED")
          .put("total", safeInitialTotal).put("accountTotal", safeAccountCount).put("payloadBytes", payloadBytes))
        PanelScanService.setProcessSummary(context, "scan:STAGED:a$safeAccountCount:t$safeInitialTotal:b$payloadBytes")
        val intent = Intent(context, PanelScanService::class.java).apply {
          action = PanelScanService.ACTION_UNIFIED_START
          putExtra("stagingKey", runId)
          putExtra("initialTotal", safeInitialTotal)
          putExtra("accountCount", safeAccountCount)
          putExtra("payloadBytes", payloadBytes)
          putExtra("concurrency", concurrency.coerceIn(1, 32))
          putExtra("timeoutMs", timeoutMs.coerceIn(2000, 20000))
          putExtra("runId", runId)
        }
        PanelScanService.recordExternalDiagnostic(context, JSONObject()
          .put("runId", runId).put("mode", "unified").put("state", "SERVICE_DISPATCH")
          .put("total", safeInitialTotal).put("accountTotal", safeAccountCount).put("payloadBytes", payloadBytes))
        PanelScanService.setProcessSummary(context, "scan:DISPATCH:a$safeAccountCount:t$safeInitialTotal:b$payloadBytes")
        ContextCompat.startForegroundService(context, intent)
        mapOf("accepted" to true, "state" to "STARTING", "runId" to runId, "activeRunId" to runId)
      } catch (e: Throwable) {
        runCatching { stagingFile.delete() }
        PanelScanService.recordExternalDiagnostic(context, JSONObject()
          .put("runId", runId).put("mode", "unified").put("state", "DISPATCH_FAILED")
          .put("error", "${e.javaClass.simpleName}: ${e.message ?: ""}"))
        PanelScanService.setProcessSummary(context, "scan:DISPATCH_FAILED:${e.javaClass.simpleName}")
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

    Function("getLastCrash") {
      val context = appContext.reactContext ?: return@Function "{}"
      context.getSharedPreferences(PanelScanService.PREFS, 0)
        .getString(PanelScanService.KEY_LAST_CRASH, "{}") ?: "{}"
    }

    // v15.2.23-RC2: "Geçmişi Temizle" gerçekten bembeyaz başlangıç verir.
    // Aktif scan varsa çalışma snapshot'ını koruruz; aktif scan YOKSA geçmiş
    // snapshot da silinir. diagnostic_events + last_crash her durumda temizlenir.
    Function("clearDiagnostics") {
      val context = appContext.reactContext ?: return@Function false
      val prefs = context.getSharedPreferences(PanelScanService.PREFS, 0)
      val editor = prefs.edit()
        .remove(PanelScanService.KEY_EVENTS)
        .remove(PanelScanService.KEY_LAST_CRASH)
      if (PanelScanService.activeRunId().isBlank()) {
        editor.remove(PanelScanService.KEY_SNAPSHOT)
      }
      editor.commit()
    }
  }
}
