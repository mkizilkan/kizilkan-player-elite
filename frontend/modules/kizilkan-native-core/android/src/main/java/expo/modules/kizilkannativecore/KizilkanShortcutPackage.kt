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
 *
 * v18.7.1 — AÇILIŞ ÇÖKÜŞÜ DÜZELTMESİ (cihaz: v18.7.0 release ve DEV, her açılışta kapanıyordu).
 * KÖK NEDEN: createReactActivityLifecycleListeners, Activity'nin YAPICISI içinde çağrılır
 * (ReactActivity() → createReactActivityDelegate() → ReactActivityDelegateWrapper alan
 * başlatıcısı). O anda Activity sisteme bağlanmamıştır (attachBaseContext yok); v18.7.0 burada
 * `activityContext.applicationContext` çağırıyordu → ContextWrapper temel bağlamı boş →
 * NullPointerException → Activity oluşturulamadı.
 * KURAL: burada ve dinleyici yapıcısında bağlama DOKUNMA; bağlam yalnız geri çağrılarda alınır.
 * Kısayol özelliği uygulamayı asla çökertmesin diye yakalama try/catch içindedir.
 */
class KizilkanShortcutPackage : Package {
  override fun createReactActivityLifecycleListeners(activityContext: Context): List<ReactActivityLifecycleListener> =
    listOf(ShortcutLifecycleListener(activityContext))
}

private class ShortcutLifecycleListener(private val activityContext: Context) : ReactActivityLifecycleListener {
  override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
    // Yeniden oluşturma (döndürme vb.) yeni bir kullanıcı isteği değildir.
    if (activity == null || savedInstanceState != null) return
    try { ShortcutInbox.capture(activity.applicationContext, activity.intent, "cold") } catch (_: Throwable) {}
  }

  override fun onNewIntent(intent: Intent?): Boolean {
    // onNewIntent Activity oluşturulduktan SONRA gelir; bağlam artık hazırdır.
    try { ShortcutInbox.capture(activityContext.applicationContext, intent, "warm") } catch (_: Throwable) {}
    return false   // diğer dinleyiciler (expo-router/Linking) de isteği alsın
  }
}
