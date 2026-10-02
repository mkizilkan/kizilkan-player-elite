package expo.modules.panelscan

import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicLongArray

/** Reservation and registration share one lock, so checkpoints never skip a claimed job. */
internal class ConservativeCursorTracker(workerCount: Int, committedTestedStart: Long = 0L) {
  private val inFlight = AtomicLongArray(workerCount)
  private val completedAccounts = java.util.TreeMap<Long, Long>()
  private var committedTested = committedTestedStart.coerceAtLeast(0L)
  init { for (i in 0 until workerCount) inFlight.set(i, Long.MAX_VALUE) }

  @Synchronized
  fun claim(workerId: Int, cursor: AtomicInteger, total: Int): Int? {
    val index = cursor.get()
    if (index >= total) return null
    inFlight.set(workerId, index.toLong())
    cursor.incrementAndGet()
    return index
  }

  @Synchronized
  fun claim(workerId: Int, cursor: AtomicLong, total: Long): Long? {
    val index = cursor.get()
    if (index >= total) return null
    inFlight.set(workerId, index)
    cursor.incrementAndGet()
    return index
  }

  /** Nonblocking poll: waiting for the producer must never hold the checkpoint lock. */
  @Synchronized
  fun <T> claimQueued(workerId: Int, queue: ArrayBlockingQueue<T>, nextAssigned: AtomicLong, ordinal: (T) -> Long): T? {
    val value = queue.poll() ?: return null
    val index = ordinal(value)
    if (index >= 0L) {
      inFlight.set(workerId, index)
      nextAssigned.set(maxOf(nextAssigned.get(), index + 1L))
    }
    return value
  }

  @Synchronized
  fun finish(workerId: Int) { inFlight.set(workerId, Long.MAX_VALUE) }

  @Synchronized
  fun finishAccount(workerId: Int, ordinal: Long, tested: Long) {
    completedAccounts[ordinal] = tested
    inFlight.set(workerId, Long.MAX_VALUE)
    // The producer/queue claims ordinals in order. Between completed accounts,
    // only currently in-flight ordinals can still be unfinished. Merge around
    // those holes so a slow account cannot retain millions of map entries.
    var current: Map.Entry<Long, Long> = completedAccounts.floorEntry(ordinal) ?: return
    while (true) {
      val left = completedAccounts.lowerEntry(current.key)
      if (left != null && !hasInFlightBetween(left.key, current.key)) {
        val sum = left.value + current.value
        completedAccounts.remove(left.key)
        completedAccounts[current.key] = sum
        current = completedAccounts.floorEntry(current.key) ?: break
        continue
      }
      val right = completedAccounts.higherEntry(current.key)
      if (right != null && !hasInFlightBetween(current.key, right.key)) {
        val sum = current.value + right.value
        completedAccounts.remove(current.key)
        completedAccounts[right.key] = sum
        current = completedAccounts.floorEntry(right.key) ?: break
        continue
      }
      break
    }
  }

  private fun hasInFlightBetween(left: Long, right: Long): Boolean {
    for (i in 0 until inFlight.length()) if (inFlight.get(i) in left..right) return true
    return false
  }

  @Synchronized
  fun pendingAccountGroups(): Int = completedAccounts.size

  /** Out-of-order probes are excluded until their whole account joins the committed prefix. */
  @Synchronized
  fun streamingProgress(nextAssigned: Long): Pair<Long, Long> {
    val safe = safeCursor(nextAssigned)
    while (completedAccounts.isNotEmpty() && completedAccounts.firstKey() < safe) {
      val entry = completedAccounts.pollFirstEntry() ?: break
      committedTested += entry.value
    }
    return safe to committedTested
  }

  @Synchronized
  fun safeCursor(nextAssigned: Long): Long {
    var safe = nextAssigned
    for (i in 0 until inFlight.length()) safe = minOf(safe, inFlight.get(i))
    return safe.coerceAtLeast(0L)
  }
}

/** Local queue contention is not an authentication failure; cancellation wakes every 100 ms. */
internal fun awaitScanHostPermit(permit: Semaphore, cancelled: AtomicBoolean): Boolean {
  while (!cancelled.get() && !Thread.currentThread().isInterrupted) {
    if (permit.tryAcquire(100L, TimeUnit.MILLISECONDS)) {
      if (!cancelled.get() && !Thread.currentThread().isInterrupted) return true
      permit.release()
      return false
    }
  }
  return false
}

/** Only positive login or an explicit auth rejection may enter the persistent probe cache. */
internal data class ScanProbeOutcome<T>(val value: T?, val cacheable: Boolean = false)

internal const val SCAN_AUTH_REJECTED_CACHE = "auth-rejected:v18.7.3"
internal const val SCAN_CHECKPOINT_VERSION = 2

/** Legacy cursors could skip a claimed job or include probes beyond the committed account. */
internal fun scanCheckpointResumePoint(version: Int, account: Long, tested: Long): Pair<Long, Long> =
  if (version == SCAN_CHECKPOINT_VERSION) account.coerceAtLeast(0L) to tested.coerceAtLeast(0L) else 0L to 0L

internal fun scanAuthStatus(value: Any?): Boolean? = when (value?.toString()?.lowercase(java.util.Locale.ROOT)) {
  "1", "true" -> true
  "0", "false" -> false
  else -> null
}

internal fun scanRetryAfterMillis(value: String?, now: Long): Long {
  val raw = value?.trim().orEmpty()
  if (raw.matches(Regex("\\d+"))) {
    val seconds = raw.toLongOrNull() ?: Long.MAX_VALUE
    return seconds.coerceIn(0L, Long.MAX_VALUE / 1000L) * 1000L
  }
  // RFC 9110 permits IMF-fixdate and both legacy HTTP-date forms.
  val patterns = listOf("EEE, dd MMM yyyy HH:mm:ss zzz", "EEEE, dd-MMM-yy HH:mm:ss zzz", "EEE MMM d HH:mm:ss yyyy")
  val date = patterns.firstNotNullOfOrNull { pattern -> runCatching {
    val position = java.text.ParsePosition(0)
    val parsed = java.text.SimpleDateFormat(pattern, java.util.Locale.US).apply {
      isLenient = false
      timeZone = java.util.TimeZone.getTimeZone("GMT")
    }.parse(raw, position)
    parsed?.time?.takeIf { position.index == raw.length }
  }.getOrNull() }
  return date?.let { (it - now).coerceAtLeast(0L) } ?: 2000L
}

/** Reread the deadline after every short wait: a concurrent 429 may extend the cooldown. */
internal fun awaitScanHostBackoff(deadline: () -> Long, cancelled: AtomicBoolean): Boolean {
  while (!cancelled.get() && !Thread.currentThread().isInterrupted) {
    val remaining = deadline() - System.currentTimeMillis()
    if (remaining <= 0L) return true
    Thread.sleep(minOf(remaining, 100L))
  }
  return false
}
