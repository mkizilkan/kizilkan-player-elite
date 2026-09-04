package expo.modules.kizilkanmpv

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import android.os.Build
import dev.jdtech.mpv.MPVLib
import java.io.File
import java.util.zip.ZipFile

/**
 * GPT KIZILKAN PLAYER ELITE v15 — Android MPV bridge.
 *
 * Bu modül UI/player kararlarını içermez. Yalnız native libmpv instance/view
 * yeteneklerini Expo tarafına açar. AUTO fallback kararı PlayerHost/Player V2'dedir.
 */
class KizilkanMpvModule : Module() {
  companion object {
    init {
      try { System.loadLibrary("c++_shared") } catch (_: Throwable) { }
    }
  }
  private fun throwableChain(t: Throwable): List<String> {
    val out = mutableListOf<String>()
    val seen = java.util.Collections.newSetFromMap(java.util.IdentityHashMap<Throwable, Boolean>())
    var cur: Throwable? = t
    while (cur != null && out.size < 8 && seen.add(cur)) {
      out += "${cur.javaClass.name}: ${cur.message.orEmpty()}".take(420)
      cur = cur.cause
    }
    return out
  }
  override fun definition() = ModuleDefinition {
    Name("KizilkanMpv")

    // v16.14.2 — runtime kanıtı. Dependency satırı tek başına "MPV fixed" sayılmaz.
    // Class yükleme + desteklenen ABI + paket nativeLibraryDir bilgisi güvenli biçimde
    // JS telemetry/gate'e açılır; URL/credential içermez.
    Function("getRuntimeStatus") {
      val info = appContext.reactContext?.applicationInfo
      var classLoadError = ""
      var classLoadThrowable: List<String> = emptyList()
      val classLoaded = try {
        Class.forName("dev.jdtech.mpv.MPVLib", false, javaClass.classLoader)
        true
      } catch (t: Throwable) {
        classLoadError = "${t.javaClass.simpleName}:${t.message.orEmpty()}".take(220)
        classLoadThrowable = throwableChain(t)
        false
      }

      var classInitError = ""
      var classInitThrowable: List<String> = emptyList()
      val classInitialized = if (!classLoaded) false else try {
        Class.forName("dev.jdtech.mpv.MPVLib", true, javaClass.classLoader)
        true
      } catch (t: Throwable) {
        classInitError = "${t.javaClass.simpleName}:${t.message.orEmpty()}".take(220)
        classInitThrowable = throwableChain(t)
        false
      }

      val nativeDir = try { info?.nativeLibraryDir ?: "" } catch (_: Throwable) { "" }
      val extractedLibmpv = nativeDir.isNotBlank() && File(nativeDir, "libmpv.so").exists()
      val extractedLibcxx = nativeDir.isNotBlank() && File(nativeDir, "libc++_shared.so").exists()
      var apkLibmpv = false
      var apkLibcxx = false
      var apkAbi = ""
      var apkScanError = ""
      var apkScanThrowable: List<String> = emptyList()
      try {
        val sourceDir = info?.sourceDir.orEmpty()
        if (sourceDir.isNotBlank()) {
          ZipFile(sourceDir).use { zip ->
            Build.SUPPORTED_ABIS.forEach { abi ->
              val hasMpv = zip.getEntry("lib/$abi/libmpv.so") != null
              val hasCxx = zip.getEntry("lib/$abi/libc++_shared.so") != null
              if (hasMpv && hasCxx && apkAbi.isBlank()) apkAbi = abi
              apkLibmpv = apkLibmpv || hasMpv
              apkLibcxx = apkLibcxx || hasCxx
            }
          }
        }
      } catch (t: Throwable) {
        apkScanError = "${t.javaClass.simpleName}:${t.message.orEmpty()}".take(220)
        apkScanThrowable = throwableChain(t)
      }
      val nativeLibrariesVerified = classLoaded && classInitialized && apkLibmpv && apkLibcxx && apkAbi.isNotBlank()
      mapOf(
        "classLoaded" to classLoaded,
        "classInitialized" to classInitialized,
        "libmpvApi" to "1.0.0",
        "supportedAbis" to Build.SUPPORTED_ABIS.toList(),
        "nativeLibraryDirPresent" to nativeDir.isNotBlank(),
        "extractedLibmpvPresent" to extractedLibmpv,
        "extractedLibcxxPresent" to extractedLibcxx,
        "apkLibmpvPresent" to apkLibmpv,
        "apkLibcxxPresent" to apkLibcxx,
        "apkAbiMatch" to apkAbi,
        "nativeLibrariesVerified" to nativeLibrariesVerified,
        "classLoadError" to classLoadError,
        "classLoadThrowable" to classLoadThrowable,
        "classInitError" to classInitError,
        "classInitThrowable" to classInitThrowable,
        "apkScanError" to apkScanError,
        "apkScanThrowable" to apkScanThrowable,
        "moduleClassLoader" to (javaClass.classLoader?.javaClass?.name ?: ""),
      )
    }

    View(KizilkanMpvView::class) {
      Prop("source") { view: KizilkanMpvView, source: Map<String, Any?>? ->
        view.setSource(source)
      }
      Prop("volume") { view: KizilkanMpvView, value: Double -> view.setVolume(value) }
      Prop("rate") { view: KizilkanMpvView, value: Double -> view.setRate(value) }
      Prop("fit") { view: KizilkanMpvView, value: String -> view.setFit(value) }
      Prop("audioDelayMs") { view: KizilkanMpvView, value: Int -> view.setAudioDelay(value) }

      AsyncFunction("play") { view: KizilkanMpvView -> view.play() }
      AsyncFunction("pause") { view: KizilkanMpvView -> view.pause() }
      AsyncFunction("stop") { view: KizilkanMpvView -> view.stop() }
      AsyncFunction("seekTo") { view: KizilkanMpvView, seconds: Double -> view.seekTo(seconds) }
      AsyncFunction("seekBy") { view: KizilkanMpvView, seconds: Double -> view.seekBy(seconds) }
      AsyncFunction("setAudioTrack") { view: KizilkanMpvView, id: Int -> view.setAudioTrack(id) }
      AsyncFunction("setSubtitleTrack") { view: KizilkanMpvView, id: Int -> view.setSubtitleTrack(id) }
      AsyncFunction("getTracks") { view: KizilkanMpvView -> view.getTracks() }
      AsyncFunction("reload") { view: KizilkanMpvView -> view.reload() }

      OnViewDestroys { view: KizilkanMpvView ->
        view.destroyPlayer()
      }

      Events("onLoad", "onPlayingChange", "onBufferingChange", "onProgress", "onVideoReady", "onTracks", "onError", "onDiagnostic")
    }
  }
}
