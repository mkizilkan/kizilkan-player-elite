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
  override fun definition() = ModuleDefinition {
    Name("KizilkanMpv")

    // v16.14.2 — runtime kanıtı. Dependency satırı tek başına "MPV fixed" sayılmaz.
    // Class yükleme + desteklenen ABI + paket nativeLibraryDir bilgisi güvenli biçimde
    // JS telemetry/gate'e açılır; URL/credential içermez.
    Function("getRuntimeStatus") {
      val info = appContext.reactContext?.applicationInfo
      var classLoadError = ""
      val classLoaded = try {
        Class.forName("dev.jdtech.mpv.MPVLib", false, javaClass.classLoader)
        true
      } catch (t: Throwable) {
        classLoadError = "${t.javaClass.simpleName}:${t.message.orEmpty()}".take(220)
        false
      }
      val nativeDir = try { info?.nativeLibraryDir ?: "" } catch (_: Throwable) { "" }
      val extractedLibmpv = nativeDir.isNotBlank() && File(nativeDir, "libmpv.so").exists()
      val extractedLibcxx = nativeDir.isNotBlank() && File(nativeDir, "libc++_shared.so").exists()
      var apkLibmpv = false
      var apkLibcxx = false
      var apkAbi = ""
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
      } catch (_: Throwable) {}
      val nativeLibrariesVerified = classLoaded && apkLibmpv && apkLibcxx && apkAbi.isNotBlank()
      mapOf(
        "classLoaded" to classLoaded,
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
