package expo.modules.kizilkannativecore

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import expo.modules.kotlin.Promise
import java.security.MessageDigest

/** On-device Drive access uses Google's Android AuthorizationClient, no Web redirect. */
class GoogleDriveAuthorization(private val context: Context) {
  companion object { const val REQUEST_CODE = 18726; const val SCOPE = "https://www.googleapis.com/auth/drive.file" }
  private val main = Handler(Looper.getMainLooper())
  private var pending: Promise? = null
  private var activeRequestCode = -1
  private var requestSequence = REQUEST_CODE
  private val timeout = Runnable { cancel("Google Drive yetkilendirmesi zaman aşımı; tekrar deneyin.") }

  fun config(): Map<String, String> {
    val pm = context.packageManager
    val signatures = if (Build.VERSION.SDK_INT >= 28) {
      val info = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES).signingInfo
      if (info?.hasMultipleSigners() == true) info.apkContentsSigners else info?.signingCertificateHistory
    } else { @Suppress("DEPRECATION") pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES).signatures }
    val sha1 = signatures?.firstOrNull()?.let { MessageDigest.getInstance("SHA-1").digest(it.toByteArray()).joinToString(":") { b -> "%02X".format(b.toInt() and 255) } }.orEmpty()
    return mapOf("packageName" to context.packageName, "sha1" to sha1, "scope" to SCOPE)
  }

  fun authorize(activity: Activity?, promise: Promise) {
    main.post {
      if (activity == null || activity.isFinishing) { promise.reject("DRIVE_NO_ACTIVITY", "Drive için açık Android ekranı gerekli.", null); return@post }
      if (pending != null) { promise.reject("DRIVE_BUSY", "Google yetkilendirmesi zaten açık.", null); return@post }
      pending = promise
      activeRequestCode = (++requestSequence % 60000) + 1000
      main.postDelayed(timeout, 120000)
      val request = AuthorizationRequest.builder().setRequestedScopes(listOf(Scope(SCOPE))).build()
      Identity.getAuthorizationClient(activity).authorize(request).addOnSuccessListener { result ->
        if (pending !== promise) return@addOnSuccessListener
        if (result.hasResolution()) {
          try { activity.startIntentSenderForResult(result.pendingIntent!!.intentSender, activeRequestCode, null, 0, 0, 0) }
          catch (e: Exception) { cancel("Google izin ekranı açılamadı: ${e.message}") }
        } else complete(result)
      }.addOnFailureListener { if (pending === promise) cancel("Google Drive yetkilendirilemedi. Android OAuth paket/SHA-1 ve Drive API ayarlarını kontrol edin: ${it.message}") }
    }
  }

  fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != activeRequestCode || pending == null) return
    if (resultCode != Activity.RESULT_OK) { cancel("Google Drive izni kullanıcı tarafından verilmedi."); return }
    try { complete(Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data)) }
    catch (e: Exception) { cancel("Google Drive izin sonucu okunamadı: ${e.message}") }
  }

  private fun complete(result: AuthorizationResult) {
    val promise = pending ?: return
    val token = result.accessToken
    if (token.isNullOrBlank() || result.grantedScopes.none { it == SCOPE }) { cancel("Drive dosya erişim izni verilmedi."); return }
    pending = null; activeRequestCode = -1; main.removeCallbacks(timeout)
    promise.resolve(mapOf("accessToken" to token, "expiresIn" to 3600))
  }

  fun cancel(message: String = "Google Drive yetkilendirmesi kapatıldı.") {
    if (Looper.myLooper() != Looper.getMainLooper()) { main.post { cancel(message) }; return }
    main.removeCallbacks(timeout); val promise = pending; pending = null; activeRequestCode = -1
    promise?.reject("DRIVE_AUTH_FAILED", message, null)
  }
}
