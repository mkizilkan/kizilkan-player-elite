package expo.modules.kizilkanmpv

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.util.Log
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.widget.FrameLayout
import dev.jdtech.mpv.MPVLib
import dev.jdtech.mpv.MPVLib.MpvEvent
import dev.jdtech.mpv.MPVLib.MpvFormat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

/**
 * KIZILKAN MPV native view.
 *
 * Tasarım kaynakları:
 * - libmpv-android/mpv-android SurfaceHolder attach/detach modeli
 * - Streamyfin Expo native MPV modülünün SurfaceView + throttled progress deseni
 *
 * Kod bu projeye özgü yeniden yazılmıştır; başka projenin kaynak dosyası kopyası değildir.
 */
class KizilkanMpvView(context: Context, appContext: AppContext) : ExpoView(context, appContext), SurfaceHolder.Callback, MPVLib.EventObserver, MPVLib.LogObserver {
  companion object {
    private const val TAG = "KizilkanMpv"
    private const val PROGRESS_INTERVAL_MS = 1000L
  }

  val onLoad by EventDispatcher()
  val onPlayingChange by EventDispatcher()
  val onBufferingChange by EventDispatcher()
  val onProgress by EventDispatcher()
  val onVideoReady by EventDispatcher()
  val onTracks by EventDispatcher()
  val onError by EventDispatcher()

  private val surfaceView = SurfaceView(context)
  private var initialized = false
  private var surfaceReady = false
  private var pendingSource: Map<String, Any?>? = null
  private var currentUrl: String? = null
  private var currentHeaders: Map<String, String> = emptyMap()
  private var currentBufferMs: Int = 1500
  private var playbackStarted: Boolean = false
  private var lastPosition = 0.0
  private var lastDuration = 0.0
  private var lastProgressDispatch = 0L
  private var width = 0
  private var height = 0
  private var lastError: String? = null
  private val destroyed = AtomicBoolean(false)

  init {
    // TV compositor policy:
    // - Parent + child tamamen opaque siyah.
    // - SurfaceView normal window arkasındaki video katmanında kalır.
    // - RGBA/transparent surface kullanılmaz; tema/arka plan rengi hole-punch
    //   üzerinden sızamaz.
    setBackgroundColor(Color.BLACK)
    surfaceView.setBackgroundColor(Color.BLACK)
    surfaceView.setZOrderOnTop(false)
    surfaceView.holder.setFormat(PixelFormat.OPAQUE)

    // Android 14+: Surface ömrünü visibility yerine attachment'a bağla.
    // PlayerHost gizlenirken view ekran dışına taşınır; surface destroy/recreate
    // döngüsü ve ilk karede renk/şerit flash'ı oluşmaz.
    if (Build.VERSION.SDK_INT >= 34) {
      surfaceView.setSurfaceLifecycle(SurfaceView.SURFACE_LIFECYCLE_FOLLOWS_ATTACHMENT)
    }

    surfaceView.layoutParams = FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    surfaceView.holder.addCallback(this)
    addView(surfaceView)
    initializeMpv()
  }

  private fun initializeMpv() {
    if (initialized || destroyed.get()) return
    try {
      val configDir = File(context.filesDir, "kizilkan-mpv").apply { mkdirs() }
      val cacheDir = File(context.cacheDir, "kizilkan-mpv").apply { mkdirs() }

      MPVLib.create(context)
      MPVLib.setOptionString("config", "no")
      MPVLib.setOptionString("config-dir", configDir.absolutePath)
      MPVLib.setOptionString("gpu-shader-cache-dir", cacheDir.absolutePath)
      MPVLib.setOptionString("icc-cache-dir", cacheDir.absolutePath)
      MPVLib.setOptionString("profile", "fast")
      MPVLib.setOptionString("vo", "gpu")
      MPVLib.setOptionString("gpu-context", "android")
      MPVLib.setOptionString("opengl-es", "yes")
      // Donanım uygunsa kullan; MediaCodec başarısızsa mpv/FFmpeg software decode'a düşebilir.
      MPVLib.setOptionString("hwdec", "mediacodec,mediacodec-copy")
      MPVLib.setOptionString("hwdec-codecs", "all")
      MPVLib.setOptionString("ao", "audiotrack,opensles")
      MPVLib.setOptionString("audio-set-media-role", "yes")
      MPVLib.setOptionString("demuxer-max-bytes", (64L * 1024L * 1024L).toString())
      MPVLib.setOptionString("demuxer-max-back-bytes", (32L * 1024L * 1024L).toString())
      MPVLib.setOptionString("cache", "yes")
      MPVLib.setOptionString("cache-pause", "yes")

      // mpv-android BaseMPVView ile aynı lifecycle sırası:
      // normal options -> init -> force-window/idle -> observer/surface.
      MPVLib.init()
      MPVLib.setOptionString("force-window", "no")
      MPVLib.setOptionString("idle", "yes")

      MPVLib.addObserver(this)
      MPVLib.addLogObserver(this)
      MPVLib.observeProperty("time-pos", MpvFormat.MPV_FORMAT_DOUBLE)
      MPVLib.observeProperty("duration/full", MpvFormat.MPV_FORMAT_DOUBLE)
      MPVLib.observeProperty("pause", MpvFormat.MPV_FORMAT_FLAG)
      MPVLib.observeProperty("paused-for-cache", MpvFormat.MPV_FORMAT_FLAG)
      MPVLib.observeProperty("video-params/w", MpvFormat.MPV_FORMAT_INT64)
      MPVLib.observeProperty("video-params/h", MpvFormat.MPV_FORMAT_INT64)
      initialized = true
    } catch (e: Throwable) {
      emitError("MPV başlatılamadı: ${e.message ?: e.javaClass.simpleName}")
    }
  }

  override fun surfaceCreated(holder: SurfaceHolder) {
    surfaceReady = true
    if (!initialized) initializeMpv()
    try {
      if (initialized) {
        MPVLib.attachSurface(holder.surface)
        MPVLib.setOptionString("force-window", "yes")
        MPVLib.setPropertyString("vo", "gpu")
        pendingSource?.let {
          pendingSource = null
          loadSource(it)
        }
      }
    } catch (e: Throwable) {
      emitError("MPV video yüzeyi bağlanamadı: ${e.message ?: e.javaClass.simpleName}")
    }
  }

  override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
    try { if (initialized) MPVLib.setPropertyString("android-surface-size", "${width}x$height") } catch (_: Throwable) {}
  }

  override fun surfaceDestroyed(holder: SurfaceHolder) {
    surfaceReady = false
    try {
      if (initialized) {
        MPVLib.setPropertyString("vo", "null")
        MPVLib.setPropertyString("force-window", "no")
        MPVLib.detachSurface()
      }
    } catch (_: Throwable) {}
  }

  fun setSource(source: Map<String, Any?>?) {
    if (source == null) return
    if (!surfaceReady) {
      pendingSource = source
      return
    }
    loadSource(source)
  }

  private fun loadSource(source: Map<String, Any?>) {
    if (!initialized || destroyed.get()) return
    val url = source["url"]?.toString()?.trim().orEmpty()
    if (url.isBlank()) return

    @Suppress("UNCHECKED_CAST")
    val headersRaw = source["headers"] as? Map<Any?, Any?> ?: emptyMap<Any?, Any?>()
    val headers = linkedMapOf<String, String>()
    headersRaw.forEach { (k, v) ->
      if (k != null && v != null) headers[k.toString()] = v.toString()
    }
    currentHeaders = headers
    currentUrl = url
    playbackStarted = false
    currentBufferMs = (source["bufferMs"] as? Number)?.toInt() ?: 1500
    lastPosition = 0.0
    lastDuration = 0.0
    width = 0
    height = 0
    lastError = null

    try {
      val ua = headers.entries.firstOrNull { it.key.equals("User-Agent", true) }?.value
      val referer = headers.entries.firstOrNull { it.key.equals("Referer", true) || it.key.equals("Referrer", true) }?.value
      if (!ua.isNullOrBlank()) MPVLib.setPropertyString("user-agent", ua)
      if (!referer.isNullOrBlank()) MPVLib.setPropertyString("referrer", referer)

      val otherHeaders = headers.entries
        .filterNot { it.key.equals("User-Agent", true) || it.key.equals("Referer", true) || it.key.equals("Referrer", true) }
        .joinToString(",") { "${it.key}: ${it.value}" }
      if (otherHeaders.isNotBlank()) MPVLib.setPropertyString("http-header-fields", otherHeaders)
      else MPVLib.setPropertyString("http-header-fields", "")

      val readahead = max(0.35, currentBufferMs / 1000.0)
      MPVLib.setPropertyDouble("demuxer-readahead-secs", readahead)
      MPVLib.command(arrayOf("loadfile", url, "replace"))
      MPVLib.setPropertyBoolean("pause", false)
      post { onLoad(mapOf("url" to url)) }
    } catch (e: Throwable) {
      emitError("MPV kaynak yüklenemedi: ${e.message ?: e.javaClass.simpleName}")
    }
  }

  fun play() { try { if (initialized) MPVLib.setPropertyBoolean("pause", false) } catch (e: Throwable) { emitError(e.message ?: "MPV play hatası") } }
  fun pause() { try { if (initialized) MPVLib.setPropertyBoolean("pause", true) } catch (e: Throwable) { emitError(e.message ?: "MPV pause hatası") } }
  fun stop() { try { if (initialized) MPVLib.command(arrayOf("stop")) } catch (_: Throwable) {} }
  fun reload() {
    currentUrl?.let {
      setSource(mapOf("url" to it, "headers" to currentHeaders, "bufferMs" to currentBufferMs))
    }
  }
  fun seekTo(seconds: Double) { try { if (initialized) MPVLib.setPropertyDouble("time-pos", max(0.0, seconds)) } catch (_: Throwable) {} }
  fun seekBy(seconds: Double) { try { if (initialized) MPVLib.command(arrayOf("seek", seconds.toString(), "relative+exact")) } catch (_: Throwable) {} }
  fun setVolume(value: Double) { try { if (initialized) MPVLib.setPropertyDouble("volume", value.coerceIn(0.0, 100.0)) } catch (_: Throwable) {} }
  fun setRate(value: Double) { try { if (initialized) MPVLib.setPropertyDouble("speed", value.coerceIn(0.25, 4.0)) } catch (_: Throwable) {} }
  fun setAudioDelay(ms: Int) { try { if (initialized) MPVLib.setPropertyDouble("audio-delay", ms / 1000.0) } catch (_: Throwable) {} }
  fun setAudioTrack(id: Int) { try { if (initialized) if (id < 0) MPVLib.setPropertyString("aid", "no") else MPVLib.setPropertyInt("aid", id) } catch (_: Throwable) {} }
  fun setSubtitleTrack(id: Int) { try { if (initialized) if (id < 0) MPVLib.setPropertyString("sid", "no") else MPVLib.setPropertyInt("sid", id) } catch (_: Throwable) {} }

  fun setFit(mode: String) {
    try {
      if (!initialized) return
      when (mode) {
        "cover" -> {
          MPVLib.setPropertyDouble("panscan", 1.0)
          MPVLib.setPropertyString("video-aspect-override", "-1")
        }
        "fill" -> {
          MPVLib.setPropertyDouble("panscan", 0.0)
          MPVLib.setPropertyString("video-aspect-override", "0")
        }
        else -> {
          MPVLib.setPropertyDouble("panscan", 0.0)
          MPVLib.setPropertyString("video-aspect-override", "-1")
        }
      }
    } catch (_: Throwable) {}
  }

  fun getTracks(): Map<String, Any> {
    val audio = mutableListOf<Map<String, Any?>>()
    val subtitle = mutableListOf<Map<String, Any?>>()
    try {
      val count = MPVLib.getPropertyInt("track-list/count") ?: 0
      for (i in 0 until count) {
        val type = MPVLib.getPropertyString("track-list/$i/type") ?: continue
        val id = MPVLib.getPropertyInt("track-list/$i/id") ?: continue
        val title = MPVLib.getPropertyString("track-list/$i/title")
        val lang = MPVLib.getPropertyString("track-list/$i/lang")
        val selected = MPVLib.getPropertyBoolean("track-list/$i/selected") == true
        val item = mapOf<String, Any?>(
          "id" to id,
          "name" to (title ?: lang ?: "$type $id"),
          "label" to (title ?: lang ?: "$type $id"),
          "language" to lang,
          "selected" to selected,
        )
        if (type == "audio") audio.add(item) else if (type == "sub") subtitle.add(item)
      }
    } catch (_: Throwable) {}
    return mapOf("audio" to audio, "subtitle" to subtitle)
  }

  override fun eventProperty(property: String) {}
  override fun eventProperty(property: String, value: Long) {
    when (property) {
      "video-params/w" -> { width = value.toInt(); emitVideoReadyIfPossible() }
      "video-params/h" -> { height = value.toInt(); emitVideoReadyIfPossible() }
    }
  }
  override fun eventProperty(property: String, value: Double) {
    when (property) {
      "time-pos" -> {
        lastPosition = value
        if (value > 0.05) playbackStarted = true
        val now = System.currentTimeMillis()
        if (now - lastProgressDispatch >= PROGRESS_INTERVAL_MS) {
          lastProgressDispatch = now
          post { onProgress(mapOf("position" to lastPosition, "duration" to lastDuration)) }
        }
      }
      "duration/full" -> lastDuration = value
    }
  }
  override fun eventProperty(property: String, value: Boolean) {
    when (property) {
      "pause" -> post { onPlayingChange(mapOf("isPlaying" to !value)) }
      "paused-for-cache" -> post { onBufferingChange(mapOf("isBuffering" to value)) }
    }
  }
  override fun eventProperty(property: String, value: String) {}

  override fun event(eventId: Int) {
    when (eventId) {
      MpvEvent.MPV_EVENT_FILE_LOADED -> {
        post {
          onLoad(mapOf("url" to (currentUrl ?: "")))
          onTracks(getTracks())
        }
      }
      MpvEvent.MPV_EVENT_VIDEO_RECONFIG, MpvEvent.MPV_EVENT_PLAYBACK_RESTART -> emitVideoReadyIfPossible()
      MpvEvent.MPV_EVENT_END_FILE -> {
        post { onPlayingChange(mapOf("isPlaying" to false)) }
        val err = lastError

        // libmpv log'u daha önceki/non-fatal bir decoder satırını lastError'da
        // bırakabilir. Yayın gerçekten başladıysa END_FILE bunu fatal UI
        // hatasına çevirmemeli.
        if (!playbackStarted && lastPosition <= 0.25 && width <= 0 && height <= 0 && !err.isNullOrBlank()) {
          emitError(err)
        }
      }
    }
  }

  override fun logMessage(prefix: String, level: Int, text: String) {
    // Yalnız gerçek error/fatal logu son hata adayı olarak sakla. Log tek başına
    // çalışan playback'i kesmez; END_FILE/onError akışında kullanılır.
    if (level <= MPVLib.MpvLogLevel.MPV_LOG_LEVEL_ERROR) {
      lastError = "$prefix: ${text.trim()}"
      Log.w(TAG, lastError ?: "MPV error")
    }
  }

  private fun emitVideoReadyIfPossible() {
    if (width > 0 && height > 0) {
      if (lastPosition > 0.0) playbackStarted = true
      post { onVideoReady(mapOf("width" to width, "height" to height)) }
    }
  }

  private fun emitError(message: String) {
    post { onError(mapOf("message" to message)) }
  }

  fun destroyPlayer() {
    cleanup()
  }

  private fun cleanup() {
    if (!destroyed.compareAndSet(false, true)) return
    try { surfaceView.holder.removeCallback(this) } catch (_: Throwable) {}
    try { if (initialized) MPVLib.removeObserver(this) } catch (_: Throwable) {}
    try { if (initialized) MPVLib.removeLogObserver(this) } catch (_: Throwable) {}
    try { if (initialized) MPVLib.command(arrayOf("stop")) } catch (_: Throwable) {}
    try { if (initialized) MPVLib.destroy() } catch (_: Throwable) {}
    initialized = false
  }

}
