package expo.modules.panelscan

import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.net.Uri
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

    AsyncFunction("startUnifiedScan") { jobsJson: String, accountCount: Int, initialTotal: Double, concurrency: Int, timeoutMs: Int ->
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
        val safeInitialTotal = initialTotal.toLong().coerceAtLeast(0L)
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

    AsyncFunction("startUnifiedScanV171") { jobsJson: String, accountCount: Int, initialTotal: Double, requestedConcurrency: Int, timeoutMs: Int, batchSize: Int, sourceFingerprint: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context yok")
      PanelScanService.installCrashRecorder(context)
      val runId = UUID.randomUUID().toString()
      val claim = PanelScanService.claimRun(context, "unified", runId)
      if (!claim.first) return@AsyncFunction mapOf("accepted" to false, "state" to "BUSY", "runId" to runId, "activeRunId" to claim.second)
      val stagingDir = File(context.filesDir, "kizilkan/panel-scan-staging").apply { mkdirs() }
      val stagingFile = File(stagingDir, "$runId.json")
      try {
        stagingDir.listFiles()?.filter { it.isFile && System.currentTimeMillis() - it.lastModified() > 24L * 60L * 60L * 1000L }?.forEach { runCatching { it.delete() } }
        stagingFile.bufferedWriter(Charsets.UTF_8).use { it.write(jobsJson) }
        val payloadBytes = stagingFile.length()
        val safeAccountCount = accountCount.coerceAtLeast(0)
        val safeInitialTotal = initialTotal.toLong().coerceAtLeast(0L)
        val safeRequested = requestedConcurrency.coerceIn(1, 250)
        val safeBatch = batchSize.coerceIn(5, 15)
        val effective = PanelScanService.computeEffectiveConcurrency(context, safeRequested, safeBatch)
        PanelScanService.recordExternalDiagnostic(context, JSONObject()
          .put("runId", runId).put("mode", "unified").put("state", "V171_STAGED")
          .put("total", safeInitialTotal).put("accountTotal", safeAccountCount).put("payloadBytes", payloadBytes)
          .put("batchSize", safeBatch).put("requestedConcurrency", safeRequested).put("effectiveConcurrency", effective))
        PanelScanService.setProcessSummary(context, "scan:V171_STAGED:a$safeAccountCount:t$safeInitialTotal:b$payloadBytes")
        val intent = Intent(context, PanelScanService::class.java).apply {
          action = PanelScanService.ACTION_UNIFIED_START
          putExtra("stagingKey", runId)
          putExtra("initialTotal", safeInitialTotal)
          putExtra("accountCount", safeAccountCount)
          putExtra("payloadBytes", payloadBytes)
          putExtra("concurrency", effective)
          putExtra("requestedConcurrency", safeRequested)
          putExtra("batchSize", safeBatch)
          putExtra("sourceFingerprint", sourceFingerprint.take(128))
          putExtra("v171", true)
          putExtra("timeoutMs", timeoutMs.coerceIn(2000, 20000))
          putExtra("runId", runId)
        }
        ContextCompat.startForegroundService(context, intent)
        mapOf("accepted" to true, "state" to "STARTING", "runId" to runId, "activeRunId" to runId)
      } catch (e: Throwable) {
        runCatching { stagingFile.delete() }
        PanelScanService.recordExternalDiagnostic(context, JSONObject()
          .put("runId", runId).put("mode", "unified").put("state", "V171_DISPATCH_FAILED")
          .put("error", "${e.javaClass.simpleName}: ${e.message ?: ""}"))
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


    Function("getRecoverableScan") {
      val context = appContext.reactContext ?: return@Function "{}"
      val rec = ScanJournalStore.get(context).recoverable() ?: return@Function "{}"
      rec.remove("payload")
      rec.put("matches", ScanJournalStore.get(context).results(rec.optString("runId"), 200))
      rec.toString()
    }

    AsyncFunction("recoverInterruptedScan") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val rec = ScanJournalStore.get(context).recoverable() ?: return@AsyncFunction false
      val runId = rec.optString("runId")
      val claim = PanelScanService.claimRun(context, rec.optString("mode"), runId)
      if (!claim.first) return@AsyncFunction false
      try {
        ContextCompat.startForegroundService(context, Intent(context, PanelScanService::class.java).apply { action=PanelScanService.ACTION_RECOVER; putExtra("runId",runId) })
        true
      } catch (e:Throwable) { PanelScanService.releaseRun(runId); false }
    }

    Function("getActiveRunId") {
      PanelScanService.activeRunId()
    }

    // v17.0.6: Uzun tarama öncesi Android güç yönetimi durumunu kullanıcıya
    // şeffaf biçimde göstermek için salt-okunur durum. Muafiyet otomatik verilmez.
    Function("getBatteryOptimizationStatus") {
      val context = appContext.reactContext ?: return@Function mapOf("supported" to false, "ignoring" to false)
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return@Function mapOf("supported" to false, "ignoring" to true)
      val pm = context.getSystemService(PowerManager::class.java)
      mapOf("supported" to true, "ignoring" to (pm?.isIgnoringBatteryOptimizations(context.packageName) == true))
    }

    AsyncFunction("requestBatteryOptimizationExemption") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return@AsyncFunction true
      val pm = context.getSystemService(PowerManager::class.java)
      if (pm?.isIgnoringBatteryOptimizations(context.packageName) == true) return@AsyncFunction true
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      try { context.startActivity(intent); true } catch (_: Throwable) { false }
    }

    AsyncFunction("openBatteryOptimizationSettings") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val direct = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      try { context.startActivity(direct); true } catch (_: Throwable) {
        val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        try { context.startActivity(fallback); true } catch (_: Throwable) { false }
      }
    }

    Function("getSnapshot") {
      val context = appContext.reactContext ?: return@Function "{}"
      val prefs = context.getSharedPreferences(PanelScanService.PREFS, 0)
      val raw = prefs.getString(PanelScanService.KEY_SNAPSHOT, "{}") ?: "{}"
      val obj = try { org.json.JSONObject(raw) } catch (_: Throwable) { org.json.JSONObject() }
      val state = obj.optString("state", "")
      val transient = state in setOf("STARTING", "RUNNING", "PAUSED", "CANCELLING") || obj.optBoolean("running", false)
      if (transient && PanelScanService.activeRunId().isBlank()) {
        ScanJournalStore.get(context).markInterrupted()
        val recoverable = ScanJournalStore.get(context).recoverable()
        obj.put("running", false)
          .put("paused", false)
          .put("state", "FAILED")
          .put("terminalReason", if (recoverable != null) "PROCESS_RESTARTED_RECOVERABLE" else "PROCESS_RESTARTED")
          .put("recoverable", recoverable != null)
          .put("error", "Tarama işlemi uygulama süreci yeniden başladığı için yarıda kaldı. O ana kadar bulunan sonuçlar korunuyor.")
          .put("updatedAt", System.currentTimeMillis())
        prefs.edit().putString(PanelScanService.KEY_SNAPSHOT, obj.toString()).commit()
        PanelScanService.recordExternalDiagnostic(context, org.json.JSONObject()
          .put("runId", obj.optString("runId", ""))
          .put("mode", obj.optString("mode", ""))
          .put("state", "ORPHANED_AFTER_PROCESS_RESTART")
          .put("tested", obj.optInt("tested", 0))
          .put("total", obj.optInt("total", 0))
          .put("found", obj.optInt("found", 0)))
      }
      obj.toString()
    }

    Function("acknowledgeSnapshot") { runId: String ->
      val context = appContext.reactContext ?: return@Function false
      if (PanelScanService.activeRunId().isNotBlank()) return@Function false
      val prefs = context.getSharedPreferences(PanelScanService.PREFS, 0)
      val raw = prefs.getString(PanelScanService.KEY_SNAPSHOT, "{}") ?: "{}"
      val obj = try { org.json.JSONObject(raw) } catch (_: Throwable) { org.json.JSONObject() }
      val storedRunId = obj.optString("runId", "")
      val state = obj.optString("state", "")
      if (runId.isBlank() || storedRunId != runId || state !in setOf("COMPLETED", "FAILED", "CANCELLED")) return@Function false
      prefs.edit().remove(PanelScanService.KEY_SNAPSHOT).commit()
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
