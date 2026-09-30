package expo.modules.kizilkannativecore

import android.content.Context
import android.content.Intent
import org.json.JSONObject

/**
 * v18.7.0 — ANA EKRAN KISAYOLU GELEN KUTUSU
 * ===========================================================================
 * KANIT (v18.6.0 cihaz logları 17:49 + 18:08): kısayollara basıldığı halde
 * APP_SHORTCUT_WAITING / OPEN / UNKNOWN olaylarının HİÇBİRİ yok (0) — "bekliyor"
 * bile yazılmadı. Yani kısayol kimliği JS katmanına HİÇ ulaşmadı. Açılışlar soğuktu
 * (PROCESS_START); soğuk açılışta modülün OnNewIntent'i çalışmaz, yedek olarak okunan
 * `currentActivity.intent` ise JS'in sorduğu anda kimliği taşımıyordu.
 *
 * ÇÖZÜM: kimlik, Activity OLUŞTURULURKEN (ReactActivityLifecycleListener.onCreate,
 * React/expo-router intent'e dokunmadan önce) ve her yeni istekte (onNewIntent)
 * yakalanıp bu tek, süreç çapında kutuya yazılır. Modül (JS köprüsü) buradan okur.
 * Kimlik önce ek veriden, yoksa eylem sonekinden (<paket>.SHORTCUT_<AD>) çıkarılır
 * (bazı başlatıcılar ek veriyi taşımayabilir).
 *
 * Her adım native telemetriye yazılır (SHORTCUT_INTENT_RECEIVED): bir sonraki logda
 * kısayolun cihaza ulaşıp ulaşmadığı, hangi yoldan geldiği KESİN görünür.
 * ===========================================================================
 */
object ShortcutInbox {
  const val EXTRA = "kizilkanShortcut"

  @Volatile private var pending: String? = null
  @Volatile var lastVia: String = ""
    private set

  /** Intent'ten kısayol kimliği: önce ek veri, yoksa eylem soneki. Kısayol değilse null. */
  fun idFrom(intent: Intent?, packageName: String): String? {
    if (intent == null) return null
    intent.getStringExtra(EXTRA)?.trim()?.takeIf { it.isNotEmpty() }?.let { return it.lowercase() }
    val action = intent.action ?: return null
    val prefix = "$packageName.SHORTCUT_"
    if (action.startsWith(prefix)) {
      val id = action.removePrefix(prefix).trim().lowercase()
      if (id.isNotEmpty()) return id
    }
    return null
  }

  /**
   * Gelen isteği işler. `via`: "cold" (Activity oluşturuldu) / "warm" (onNewIntent).
   * Kısayol değilse bile telemetri yazılır (hangi isteğin geldiği görülsün) — ama yalnız
   * kısayol eylemi/ek verisi olan istekler için; normal açılışlar logu doldurmasın.
   */
  fun capture(context: Context, intent: Intent?, via: String) {
    val pkg = context.packageName
    val action = intent?.action ?: ""
    val hasExtra = !intent?.getStringExtra(EXTRA).isNullOrEmpty()
    val looksLikeShortcut = hasExtra || action.startsWith("$pkg.SHORTCUT_")
    if (!looksLikeShortcut) return
    val id = idFrom(intent, pkg)
    if (id != null) {
      pending = id
      lastVia = via
      // Aynı istek, döndürme gibi yeniden oluşturmalarda tekrar yönlendirmesin.
      try { intent?.removeExtra(EXTRA) } catch (_: Throwable) {}
      try { intent?.action = Intent.ACTION_MAIN } catch (_: Throwable) {}
    }
    record(context, "SHORTCUT_INTENT_RECEIVED", JSONObject()
      .put("via", via)
      .put("action", action.takeLast(64))
      .put("hasExtra", hasExtra)
      .put("id", id ?: "")
      .put("accepted", id != null))
  }

  /** Tüketmeden bak (JS: kullanıcı henüz profil/PIN ekranında → "bekliyor"). */
  fun peek(): String = pending ?: ""

  /** Tüket: yönlendirme bir kez yapılır. */
  fun consume(): String {
    val s = pending ?: ""
    pending = null
    return s
  }

  fun record(context: Context, event: String, data: JSONObject) {
    try {
      NativeBlackBox.appendJson(context, JSONObject()
        .put("domain", "navigation")
        .put("event", event)
        .put("severity", "info")
        .put("stage", "shortcut")
        .put("data", data)
        .toString())
    } catch (_: Throwable) {}
  }
}
