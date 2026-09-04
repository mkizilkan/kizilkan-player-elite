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
import dev.jdtech.mpv.MPVLib.MpvLogLevel
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
    private val NEXT_INSTANCE_ID = java.util.concurrent.atomic.AtomicLong(0)

    init {
      try { System.loadLibrary("c++_shared") } catch (_: Throwable) { }
    }
  }

  val onLoad by EventDispatcher()
  val onPlayingChange by EventDispatcher()
  val onBufferingChange by EventDispatcher()
  val onProgress by EventDispatcher()
  val onVideoReady by EventDispatcher()
  val onTracks by EventDispatcher()
  val onError by EventDispatcher()
  val onDiagnostic by EventDispatcher()

  private val surfaceView = SurfaceView(context)
  private val instanceId = NEXT_INSTANCE_ID.incrementAndGet()
  private var mpv: MPVLib? = null
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
  private var videoCodec: String? = null
  private var videoFormat: String? = null
  private var hwdecCurrent: String? = null
  private val destroyed = AtomicBoolean(false)

  init {
    // TV compositor policy:
    // - Parent + child tamamen opaque siyah.
    // - SurfaceView normal window arkasındaki video katmanında kalır.
    // - RGBA/transparent surface kullanılmaz; tema/arka plan rengi hole-punch
    //   üzerinden sızamaz.
    setBackgroundColor(Color.BLACK)
    // v17.0.13: SurfaceView pencerenin arkasındaki ayrı video surface'ini
    // hole-punch ile gösterir. Child SurfaceView'e opak background vermek bu
    // görünür alanı yeniden boyayıp "ses var / görüntü yok" üretebilir.
    // Siyah boşluk parent ExpoView tarafından sağlanır; video surface background'sızdır.
    surfaceView.background = null
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

  private fun emitThrowable(stage: String, error: Throwable, fatal: Boolean) {
    Log.e(TAG, "#$instanceId $stage", error)
    val chain = throwableChain(error)
    val joined = chain.joinToString(" | ")
    val nativeLinkError = joined.contains("UnsatisfiedLinkError") || joined.contains("cannot locate symbol", ignoreCase = true)
    val missingCxxSymbol = nativeLinkError && (joined.contains("libc++_shared.so") || joined.contains("__ndk1"))
    val classification = when {
      missingCxxSymbol -> "MPV_NATIVE_LINK_ERROR_MISSING_CXX_SYMBOL"
      nativeLinkError -> "MPV_NATIVE_LINK_ERROR"
      else -> "MPV_RUNTIME_ERROR"
    }
    emitDiagnostic("NATIVE_THROWABLE", mapOf(
      "stage" to stage,
      "fatal" to fatal,
      "classification" to classification,
      "errorClass" to error.javaClass.name,
      "message" to error.message.orEmpty().take(420),
      "causeChain" to chain,
    ))
  }

  private fun initializeMpv() {
    if (initialized || destroyed.get()) return
    try {
      val configDir = File(context.filesDir, "kizilkan-mpv").apply { mkdirs() }
      val cacheDir = File(context.cacheDir, "kizilkan-mpv").apply { mkdirs() }

      // libmpv-android 1.0.0 breaking change: her native view kendi MPVLib
      // instance'ına sahiptir. Global/static player state artık kullanılmaz.
      emitDiagnostic("MPV_CREATE_BEGIN")
      val player = MPVLib.create(context) ?: throw IllegalStateException("MPVLib.create null döndürdü")
      mpv = player
      emitDiagnostic("MPV_CREATE_OK")
      player.setOptionString("config", "no")
      player.setOptionString("config-dir", configDir.absolutePath)
      player.setOptionString("gpu-shader-cache-dir", cacheDir.absolutePath)
      player.setOptionString("icc-cache-dir", cacheDir.absolutePath)
      player.setOptionString("profile", "fast")
      player.setOptionString("vo", "gpu")
      player.setOptionString("gpu-context", "android")
      player.setOptionString("opengl-es", "yes")
      player.setOptionString("hwdec", "mediacodec,mediacodec-copy")
      player.setOptionString("hwdec-codecs", "all")
      player.setOptionString("hwdec-software-fallback", "1")
      player.setOptionString("ao", "audiotrack,opensles")
      player.setOptionString("audio-set-media-role", "yes")
      player.setOptionString("demuxer-max-bytes", (64L * 1024L * 1024L).toString())
      player.setOptionString("demuxer-max-back-bytes", (32L * 1024L * 1024L).toString())
      player.setOptionString("cache", "yes")
      player.setOptionString("cache-pause", "yes")

      emitDiagnostic("MPV_INIT_BEGIN")
      player.init()
      emitDiagnostic("MPV_INIT_OK")
      player.setOptionString("force-window", "no")
      player.setOptionString("idle", "yes")
      player.addObserver(this)
      player.addLogObserver(this)
      player.observeProperty("time-pos", MpvFormat.MPV_FORMAT_DOUBLE)
      player.observeProperty("duration/full", MpvFormat.MPV_FORMAT_DOUBLE)
      player.observeProperty("pause", MpvFormat.MPV_FORMAT_FLAG)
      player.observeProperty("paused-for-cache", MpvFormat.MPV_FORMAT_FLAG)
      player.observeProperty("video-params/w", MpvFormat.MPV_FORMAT_INT64)
      player.observeProperty("video-params/h", MpvFormat.MPV_FORMAT_INT64)
      player.observeProperty("video-codec", MpvFormat.MPV_FORMAT_STRING)
      player.observeProperty("video-params/format", MpvFormat.MPV_FORMAT_STRING)
      player.observeProperty("hwdec-current", MpvFormat.MPV_FORMAT_STRING)
      initialized = true
      emitDiagnostic("NATIVE_CREATE", mapOf("libmpv" to "1.0.0"))
    } catch (e: Throwable) {
      emitThrowable("INITIALIZE_MPV", e, true)
      emitError("MPV başlatılamadı: ${e.message ?: e.javaClass.simpleName}")
    }
  }

  override fun surfaceCreated(holder: SurfaceHolder) {
    surfaceReady = true
    emitDiagnostic("SURFACE_CREATE", surfaceSnapshot(holder))
    if (!initialized) initializeMpv()
    try {
      if (initialized) {
        mpv?.attachSurface(holder.surface)
        emitDiagnostic("SURFACE_ATTACH", surfaceSnapshot(holder))
        mpv?.setOptionString("force-window", "yes")
        mpv?.setPropertyString("vo", "gpu")
        pendingSource?.let {
          pendingSource = null
          loadSource(it)
        }
      }
    } catch (e: Throwable) {
      emitThrowable("SURFACE_ATTACH", e, true)
      emitError("MPV video yüzeyi bağlanamadı: ${e.message ?: e.javaClass.simpleName}")
    }
  }

  override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
    emitDiagnostic("SURFACE_CHANGED", surfaceSnapshot(holder) + mapOf("holderFormat" to format, "surfaceWidth" to width, "surfaceHeight" to height))
    try { if (initialized) mpv?.setPropertyString("android-surface-size", "${width}x$height") } catch (e: Throwable) { emitThrowable("SURFACE_RESIZE", e, false) }
  }

  override fun surfaceDestroyed(holder: SurfaceHolder) {
    surfaceReady = false
    emitDiagnostic("SURFACE_DESTROY", surfaceSnapshot(holder))
    try {
      if (initialized) {
        mpv?.setPropertyString("vo", "null")
        mpv?.setPropertyString("force-window", "no")
        mpv?.detachSurface()
        emitDiagnostic("SURFACE_DETACH")
      }
    } catch (e: Throwable) { emitThrowable("SURFACE_DETACH", e, false) }
  }

  private fun surfaceSnapshot(holder: SurfaceHolder? = null): Map<String, Any?> {
    val surface = holder?.surface ?: surfaceView.holder.surface
    val frame = surfaceView.holder.surfaceFrame
    return mapOf(
      "surfaceValid" to (surface?.isValid == true),
      "viewAttached" to surfaceView.isAttachedToWindow,
      "viewShown" to surfaceView.isShown,
      "viewVisibility" to surfaceView.visibility,
      "viewWidth" to surfaceView.width,
      "viewHeight" to surfaceView.height,
      "viewAlpha" to surfaceView.alpha,
      "hasBackground" to (surfaceView.background != null),
      "holderWidth" to frame.width(),
      "holderHeight" to frame.height(),
    )
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
    videoCodec = null
    videoFormat = null
    hwdecCurrent = null
    val softwareDecode = source["softwareDecode"] as? Boolean ?: false
    emitDiagnostic("SOURCE_LOAD", mapOf("bufferMs" to currentBufferMs, "decodeMode" to if (softwareDecode) "software" else "hardware-auto"))

    try {
      // v15.1 RC: first-frame watchdog software recovery always runs on a FRESH
      // MPV instance (React key remount). Set hwdec before loadfile so a failed
      // MediaCodec instance is never reused for the software retry.
      mpv?.setPropertyString("hwdec", if (softwareDecode) "no" else "mediacodec,mediacodec-copy")
      val ua = headers.entries.firstOrNull { it.key.equals("User-Agent", true) }?.value
      val referer = headers.entries.firstOrNull { it.key.equals("Referer", true) || it.key.equals("Referrer", true) }?.value
      if (!ua.isNullOrBlank()) mpv?.setPropertyString("user-agent", ua)
      if (!referer.isNullOrBlank()) mpv?.setPropertyString("referrer", referer)

      val otherHeaders = headers.entries
        .filterNot { it.key.equals("User-Agent", true) || it.key.equals("Referer", true) || it.key.equals("Referrer", true) }
        .joinToString(",") { "${it.key}: ${it.value}" }
      if (otherHeaders.isNotBlank()) mpv?.setPropertyString("http-header-fields", otherHeaders)
      else mpv?.setPropertyString("http-header-fields", "")

      val readahead = max(0.35, currentBufferMs / 1000.0)
      mpv?.setPropertyDouble("demuxer-readahead-secs", readahead)
      mpv?.command(arrayOf("loadfile", url, "replace"))
      mpv?.setPropertyBoolean("pause", false)
      post { onLoad(mapOf("url" to url)) }
    } catch (e: Throwable) {
      emitThrowable("LOAD_SOURCE", e, true)
      emitError("MPV kaynak yüklenemedi: ${e.message ?: e.javaClass.simpleName}")
    }
  }

  fun play() { try { if (initialized) mpv?.setPropertyBoolean("pause", false) } catch (e: Throwable) { emitError(e.message ?: "MPV play hatası") } }
  fun pause() { try { if (initialized) mpv?.setPropertyBoolean("pause", true) } catch (e: Throwable) { emitError(e.message ?: "MPV pause hatası") } }
  fun stop() { try { if (initialized) mpv?.command(arrayOf("stop")) } catch (_: Throwable) {} }
  fun reload() {
    currentUrl?.let {
      setSource(mapOf("url" to it, "headers" to currentHeaders, "bufferMs" to currentBufferMs))
    }
  }
  fun seekTo(seconds: Double) {
    try {
      if (initialized) {
        // mpv'nin belgelenmiş seek komutunu kullan. `time-pos` yazmak bazı
        // demuxer/HLS kaynaklarında sessizce uygulanmayabiliyor. Keyframe seek
        // özellikle uzun IPTV VOD'larında exact decode zincirine göre daha sağlam.
        mpv?.command(arrayOf("seek", max(0.0, seconds).toString(), "absolute+keyframes"))
      }
    } catch (_: Throwable) {}
  }
  fun seekBy(seconds: Double) { try { if (initialized) mpv?.command(arrayOf("seek", seconds.toString(), "relative+exact")) } catch (_: Throwable) {} }
  fun setVolume(value: Double) { try { if (initialized) mpv?.setPropertyDouble("volume", value.coerceIn(0.0, 100.0)) } catch (_: Throwable) {} }
  fun setRate(value: Double) { try { if (initialized) mpv?.setPropertyDouble("speed", value.coerceIn(0.25, 4.0)) } catch (_: Throwable) {} }
  fun setAudioDelay(ms: Int) { try { if (initialized) mpv?.setPropertyDouble("audio-delay", ms / 1000.0) } catch (_: Throwable) {} }
  fun setAudioTrack(id: Int) { try { if (initialized) if (id < 0) mpv?.setPropertyString("aid", "no") else mpv?.setPropertyInt("aid", id) } catch (_: Throwable) {} }
  fun setSubtitleTrack(id: Int) { try { if (initialized) if (id < 0) mpv?.setPropertyString("sid", "no") else mpv?.setPropertyInt("sid", id) } catch (_: Throwable) {} }

  fun setFit(mode: String) {
    try {
      if (!initialized) return
      when (mode) {
        "cover" -> {
          mpv?.setPropertyDouble("panscan", 1.0)
          mpv?.setPropertyString("video-aspect-override", "-1")
        }
        "fill" -> {
          mpv?.setPropertyDouble("panscan", 0.0)
          mpv?.setPropertyString("video-aspect-override", "0")
        }
        else -> {
          mpv?.setPropertyDouble("panscan", 0.0)
          mpv?.setPropertyString("video-aspect-override", "-1")
        }
      }
    } catch (_: Throwable) {}
  }

  fun getTracks(): Map<String, Any> {
    val audio = mutableListOf<Map<String, Any?>>()
    val subtitle = mutableListOf<Map<String, Any?>>()
    try {
      val count = mpv?.getPropertyInt("track-list/count") ?: 0
      for (i in 0 until count) {
        val type = mpv?.getPropertyString("track-list/$i/type") ?: continue
        val id = mpv?.getPropertyInt("track-list/$i/id") ?: continue
        val title = mpv?.getPropertyString("track-list/$i/title")
        val lang = mpv?.getPropertyString("track-list/$i/lang")
        val selected = mpv?.getPropertyBoolean("track-list/$i/selected") == true
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
  override fun eventProperty(property: String, value: String) {
    when (property) {
      "video-codec" -> videoCodec = value
      "video-params/format" -> videoFormat = value
      "hwdec-current" -> hwdecCurrent = value
    }
    if (property == "video-codec" || property == "video-params/format" || property == "hwdec-current") {
      emitDiagnostic("VIDEO_PROPERTY", mapOf("property" to property, "value" to value))
    }
  }

  override fun event(eventId: Int) {
    when (eventId) {
      MpvEvent.MPV_EVENT_FILE_LOADED -> {
        emitDiagnostic("FILE_LOADED")
        post {
          onLoad(mapOf("url" to (currentUrl ?: "")))
          onTracks(getTracks())
        }
      }
      MpvEvent.MPV_EVENT_VIDEO_RECONFIG -> { emitDiagnostic("VIDEO_RECONFIG"); emitVideoReadyIfPossible() }
      MpvEvent.MPV_EVENT_PLAYBACK_RESTART -> { emitDiagnostic("PLAYBACK_RESTART"); emitVideoReadyIfPossible() }
      MpvEvent.MPV_EVENT_END_FILE -> {
        emitDiagnostic("END_FILE")
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
    if (level <= MpvLogLevel.MPV_LOG_LEVEL_ERROR) {
      lastError = "$prefix: ${text.trim()}"
      Log.w(TAG, lastError ?: "MPV error")
    }
  }

  private fun emitVideoReadyIfPossible() {
    if (width > 0 && height > 0) {
      if (lastPosition > 0.0) playbackStarted = true
      emitDiagnostic("VIDEO_READY", mapOf("width" to width, "height" to height, "codec" to (videoCodec ?: ""), "format" to (videoFormat ?: ""), "hwdec" to (hwdecCurrent ?: "")) + surfaceSnapshot())
      post {
        onVideoReady(
          mapOf<String, Any>(
            "width" to width,
            "height" to height,
            "codec" to (videoCodec ?: ""),
            "format" to (videoFormat ?: ""),
            "hwdec" to (hwdecCurrent ?: ""),
          )
        )
      }
    }
  }

  private fun emitDiagnostic(event: String, extra: Map<String, Any?> = emptyMap()) {
    // Expo EventDispatcher Map<String, Any> bekler. Native telemetry property'leri
    // libmpv ilk değerini üretmeden önce null olabilir; nullability'yi JS bridge'e
    // sızdırmak yerine event sınırında deterministik olarak normalize ediyoruz.
    val payload = linkedMapOf<String, Any>(
      "event" to event,
      "instanceId" to instanceId,
      "surfaceReady" to surfaceReady,
      "initialized" to initialized,
      "width" to width,
      "height" to height,
      "codec" to (videoCodec ?: ""),
      "format" to (videoFormat ?: ""),
      "hwdec" to (hwdecCurrent ?: ""),
    )
    for ((key, value) in extra) {
      if (value != null) payload[key] = value
    }
    Log.d(TAG, "#$instanceId $event ${extra.entries.joinToString(" ") { "${it.key}=${it.value}" }}")
    post { onDiagnostic(payload) }
  }

  private fun emitError(message: String) {
    emitDiagnostic("ERROR", mapOf("message" to message))
    post { onError(mapOf("message" to message)) }
  }

  fun destroyPlayer() {
    cleanup()
  }

  private fun cleanup() {
    if (!destroyed.compareAndSet(false, true)) return
    emitDiagnostic("NATIVE_DESTROY_BEGIN")
    val player = mpv
    fun cleanupStage(stage: String, block: () -> Unit) {
      try { block(); emitDiagnostic("CLEANUP_STAGE_OK", mapOf("stage" to stage)) }
      catch (e: Throwable) { emitThrowable(stage, e, false) }
    }
    cleanupStage("REMOVE_SURFACE_CALLBACK") { surfaceView.holder.removeCallback(this) }
    cleanupStage("STOP_ON_DESTROY") { if (initialized) player?.command(arrayOf("stop")) }
    cleanupStage("SURFACE_DETACH_ON_DESTROY") { if (initialized && surfaceReady) player?.detachSurface() }
    cleanupStage("REMOVE_EVENT_OBSERVER") { if (initialized) player?.removeObserver(this) }
    cleanupStage("REMOVE_LOG_OBSERVER") { if (initialized) player?.removeLogObserver(this) }
    cleanupStage("MPV_DESTROY") { player?.destroy() }
    mpv = null
    surfaceReady = false
    initialized = false
    Log.d(TAG, "#$instanceId NATIVE_DESTROY_DONE")
  }

}
