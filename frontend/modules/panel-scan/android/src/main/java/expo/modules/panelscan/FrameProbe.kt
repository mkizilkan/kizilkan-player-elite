package expo.modules.panelscan

import android.content.Context
import android.graphics.SurfaceTexture
import android.os.Handler
import android.os.Looper
import android.view.Surface
import androidx.media3.common.MediaItem
import androidx.media3.common.C
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.HttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/** Real decoder/render evidence on a detached surface; readiness/catalogue are never frame evidence. */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
internal object FrameProbe {
  private val main=Handler(Looper.getMainLooper())
  private class Control {
    val cancelled=AtomicBoolean(false); val finished=AtomicBoolean(false); val latch=CountDownLatch(1)
    var player: ExoPlayer?=null; var texture: SurfaceTexture?=null; var surface: Surface?=null
    var result=JSONObject().put("frame",false).put("reason","CANCELLED")
  }
  private val requests=ConcurrentHashMap<String,Control>()
  private val cancelledBeforeStart=ConcurrentHashMap.newKeySet<String>()
  private fun httpError(error: Throwable): Int? = generateSequence(error) { it.cause }
    .take(16).filterIsInstance<HttpDataSource.InvalidResponseCodeException>().firstOrNull()?.responseCode
  fun probe(context: Context,id: String,url: String,headersJson: String,timeout: Int): JSONObject {
    require(id.matches(Regex("[a-zA-Z0-9_-]{1,100}")))
    require(url.matches(Regex("(?i)^https?://.+"))) { "Görüntü testi HTTP/HTTPS kaynak gerektirir" }
    val control=Control(); val started=android.os.SystemClock.elapsedRealtime()
    synchronized(requests) {
      if(requests.isNotEmpty()) return JSONObject().put("frame",false).put("reason","PLAYER_BUSY")
      requests[id]=control
      if(cancelledBeforeStart.remove(id))control.cancelled.set(true)
    }
    fun finish(frame: Boolean,reason: String) {
      if(!control.finished.compareAndSet(false,true))return
      main.removeCallbacksAndMessages(control)
      runCatching { control.player?.stop(); control.player?.release() }; control.player=null
      runCatching { control.surface?.release() }; runCatching { control.texture?.release() }
      control.result=JSONObject().put("frame",frame).put("reason",reason).put("elapsedMs",android.os.SystemClock.elapsedRealtime()-started)
      requests.remove(id,control); control.latch.countDown()
    }
    main.postAtTime({
      if(control.cancelled.get()) { finish(false,"CANCELLED");return@postAtTime }
      try {
        val headers=JSONObject(headersJson);val map=linkedMapOf<String,String>();headers.keys().forEach { key->if(!key.equals("Proxy-Authorization",true))map[key]=headers.optString(key) }
        val http=DefaultHttpDataSource.Factory().setConnectTimeoutMs(timeout).setReadTimeoutMs(timeout).setDefaultRequestProperties(map)
        val policy=object:DefaultLoadErrorHandlingPolicy() {
          override fun getRetryDelayMsFor(info: LoadErrorHandlingPolicy.LoadErrorInfo): Long =
            if(httpError(info.exception) in setOf(401,403,429))C.TIME_UNSET else super.getRetryDelayMsFor(info)
        }
        val source=DefaultMediaSourceFactory(DefaultDataSource.Factory(context,http)).setLoadErrorHandlingPolicy(policy)
        val player=ExoPlayer.Builder(context).setMediaSourceFactory(source).build();control.player=player
        val texture=SurfaceTexture(false);texture.setDefaultBufferSize(640,360);control.texture=texture
        val surface=Surface(texture);control.surface=surface;player.setVideoSurface(surface);player.volume=0f
        player.addListener(object:Player.Listener {
          override fun onRenderedFirstFrame() { finish(true,"") }
          override fun onPlayerError(error: PlaybackException) { finish(false,when(val status=httpError(error)) {
            429->"RATE_LIMIT";401,403->"HTTP_$status";else->"DECODER_${error.errorCode}"
          }) }
        })
        player.setMediaItem(MediaItem.fromUri(url));player.prepare();player.play()
        main.postAtTime({ finish(false,if(control.cancelled.get())"CANCELLED" else "NO_FRAME") },control,android.os.SystemClock.uptimeMillis()+timeout)
      } catch (_:Throwable) { finish(false,"DECODER_SETUP") }
    },control,android.os.SystemClock.uptimeMillis())
    // Cancellation and completion release the only upstream before resolving the bridge promise.
    while(!control.latch.await(100,java.util.concurrent.TimeUnit.MILLISECONDS)) {
      if(control.cancelled.get())main.post { finish(false,"CANCELLED") }
    }
    return control.result
  }
  fun cancel(id: String): Boolean {
    require(id.matches(Regex("[a-zA-Z0-9_-]{1,100}")))
    requests[id]?.cancelled?.set(true) ?: cancelledBeforeStart.add(id)
    if(cancelledBeforeStart.size>1000)cancelledBeforeStart.clear()
    return true
  }
}
