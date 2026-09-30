package expo.modules.kizilkannativecore

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/**
 * v18.7.0 — Kısayol isteğini Activity yaşam döngüsünden yakalar (bkz. ShortcutInbox).
 * Expo otomatik bağlama, `...Package.kt` ile biten ve `expo.modules.core.interfaces.Package`
 * içe aktaran sınıfları kaynak taramasıyla kaydeder (expo-modules-autolinking android.ts
 * findAndroidPackagesAsync) — ayrıca yapılandırma gerekmez.
 */
class KizilkanShortcutPackage : Package {
  override fun createReactActivityLifecycleListeners(activityContext: Context): List<ReactActivityLifecycleListener> =
    listOf(ShortcutLifecycleListener(activityContext.applicationContext))
}

private class ShortcutLifecycleListener(private val appContext: Context) : ReactActivityLifecycleListener {
  override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
    // Yeniden oluşturma (döndürme vb.) yeni bir kullanıcı isteği değildir.
    if (activity == null || savedInstanceState != null) return
    ShortcutInbox.capture(appContext, activity.intent, "cold")
  }

  override fun onNewIntent(intent: Intent?): Boolean {
    ShortcutInbox.capture(appContext, intent, "warm")
    return false   // diğer dinleyiciler (expo-router/Linking) de isteği alsın
  }
}
