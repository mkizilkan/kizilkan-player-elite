package expo.modules.kizilkanmpv

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * GPT KIZILKAN PLAYER ELITE v15 — Android MPV bridge.
 *
 * Bu modül UI/player kararlarını içermez. Yalnız native libmpv instance/view
 * yeteneklerini Expo tarafına açar. AUTO fallback kararı PlayerHost/Player V2'dedir.
 */
class KizilkanMpvModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KizilkanMpv")

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

      Events("onLoad", "onPlayingChange", "onBufferingChange", "onProgress", "onVideoReady", "onTracks", "onError")
    }
  }
}
