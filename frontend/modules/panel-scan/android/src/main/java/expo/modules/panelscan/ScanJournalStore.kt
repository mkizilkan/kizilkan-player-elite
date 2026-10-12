package expo.modules.panelscan

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * KIZILKAN PLAYER v17.1.0 — dayanıklı panel tarama journal'ı.
 *
 * v17.0.7 sözleşmesi korunur: bulunan her sonuç anında AES-GCM ile kalıcılaştırılır.
 * v17.1.0 ekleri:
 * - batch sınırı atomik checkpoint olur;
 * - committed_account + committed_tested ile process recovery güvenli batch başından devam eder;
 * - requested/effective concurrency ve source fingerprint journal'a yazılır;
 * - eski v1 DB şeması migration ile korunur.
 */
class ScanJournalStore private constructor(context: Context) : SQLiteOpenHelper(context.applicationContext, "kizilkan-panel-scan-journal.db", null, 5) {
  private val applicationContext = context.applicationContext
  @Volatile private var cachedKey: SecretKey? = null
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE scan_session(run_id TEXT PRIMARY KEY, mode TEXT NOT NULL, payload_enc TEXT NOT NULL, concurrency INTEGER NOT NULL, timeout_ms INTEGER NOT NULL, committed_cursor INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, committed_account INTEGER NOT NULL DEFAULT 0, committed_tested INTEGER NOT NULL DEFAULT 0, batch_size INTEGER NOT NULL DEFAULT 0, requested_concurrency INTEGER NOT NULL DEFAULT 0, effective_concurrency INTEGER NOT NULL DEFAULT 0, source_fingerprint TEXT NOT NULL DEFAULT '')")
    db.execSQL("CREATE TABLE scan_result(id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, result_key TEXT NOT NULL, payload_enc TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(run_id,result_key) ON CONFLICT IGNORE)")
    db.execSQL("CREATE INDEX idx_scan_result_run ON scan_result(run_id,id)")
    createProbeCache(db)
    createOwnerTable(db)
    createRetryTable(db)
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    if (oldVersion < 5) createRetryTable(db)
    if (oldVersion < 4) createOwnerTable(db)
    if(oldVersion<3)createProbeCache(db)
    if (oldVersion < 2) {
      db.execSQL("ALTER TABLE scan_session ADD COLUMN committed_account INTEGER NOT NULL DEFAULT 0")
      db.execSQL("ALTER TABLE scan_session ADD COLUMN committed_tested INTEGER NOT NULL DEFAULT 0")
      db.execSQL("ALTER TABLE scan_session ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 0")
      db.execSQL("ALTER TABLE scan_session ADD COLUMN requested_concurrency INTEGER NOT NULL DEFAULT 0")
      db.execSQL("ALTER TABLE scan_session ADD COLUMN effective_concurrency INTEGER NOT NULL DEFAULT 0")
      db.execSQL("ALTER TABLE scan_session ADD COLUMN source_fingerprint TEXT NOT NULL DEFAULT ''")
    }
  }

  private fun createProbeCache(db:SQLiteDatabase){
    db.execSQL("CREATE TABLE IF NOT EXISTS scan_probe_cache(run_id TEXT NOT NULL, probe_key TEXT NOT NULL, payload_enc TEXT NOT NULL, PRIMARY KEY(run_id,probe_key))")
  }
  private fun createOwnerTable(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE IF NOT EXISTS scan_session_owner(run_id TEXT PRIMARY KEY,profile_id TEXT NOT NULL)")
  }
  private fun createRetryTable(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE IF NOT EXISTS scan_retry(run_id TEXT NOT NULL,job_key TEXT NOT NULL,payload_enc TEXT NOT NULL,due_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'pending',PRIMARY KEY(run_id,job_key))")
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_scan_retry_pending ON scan_retry(run_id,state,due_at)")
  }
  @Synchronized fun enqueueRetry(runId: String, key: String, payload: JSONObject, dueAt: Long) {
    val v = ContentValues().apply { put("run_id",runId);put("job_key",key);put("payload_enc",enc(payload.toString()));put("due_at",dueAt);put("attempts",0);put("state","pending") }
    check(writableDatabase.insertWithOnConflict("scan_retry",null,v,SQLiteDatabase.CONFLICT_IGNORE) != -1L || retryState(runId,key) != null)
  }
  @Synchronized private fun retryState(runId: String, key: String): String? = readableDatabase.rawQuery("SELECT state FROM scan_retry WHERE run_id=? AND job_key=?",arrayOf(runId,key)).use { if(it.moveToFirst())it.getString(0) else null }
  @Synchronized fun retryCount(runId: String, state: String = "pending"): Int = readableDatabase.rawQuery("SELECT COUNT(*) FROM scan_retry WHERE run_id=? AND state=?",arrayOf(runId,state)).use { if(it.moveToFirst())it.getInt(0) else 0 }
  @Synchronized fun nextRetry(runId: String): JSONObject? = readableDatabase.rawQuery("SELECT job_key,payload_enc,due_at,attempts FROM scan_retry WHERE run_id=? AND state='pending' ORDER BY due_at LIMIT 1",arrayOf(runId)).use { c ->
    if(!c.moveToFirst())null else JSONObject(dec(c.getString(1))).put("jobKey",c.getString(0)).put("dueAt",c.getLong(2)).put("attempts",c.getInt(3))
  }
  @Synchronized fun updateRetry(runId: String, key: String, attempts: Int, state: String, dueAt: Long, payload: JSONObject) {
    val v = ContentValues().apply {put("attempts",attempts);put("state",state);put("due_at",dueAt);put("payload_enc",enc(payload.toString()))}
    check(writableDatabase.update("scan_retry",v,"run_id=? AND job_key=?",arrayOf(runId,key)) == 1)
  }
  @Synchronized fun seedArchiveRetries(runId: String, profileId: String, rows: JSONArray) {
    check(ownerOf(runId)==profileId) { "Tarama başka profile ait" }
    check(rows.length()<=128) { "Kuyruk partisi çok büyük" }
    val db=writableDatabase;db.beginTransaction()
    try {
      for(i in 0 until rows.length()) {
        val row=rows.getJSONObject(i);val key=row.getString("key");val payload=row.getJSONObject("payload")
        check(key.length<=4096 && payload.toString().toByteArray(Charsets.UTF_8).size<=250000)
        enqueueRetry(runId,key,payload,System.currentTimeMillis())
      }
      db.setTransactionSuccessful()
    } finally { db.endTransaction() }
  }
  @Synchronized fun archiveRetries(runId: String, afterKey: String): JSONObject {
    val rows=JSONArray();var last=afterKey;var bytes=0
    readableDatabase.rawQuery("SELECT job_key,payload_enc FROM scan_retry WHERE run_id=? AND state IN ('pending','unresolved') AND job_key>? ORDER BY job_key LIMIT 100",arrayOf(runId,afterKey)).use { c ->
      while(c.moveToNext()){val body=dec(c.getString(1));val size=body.toByteArray(Charsets.UTF_8).size;check(size<=250000){"Yeniden deneme kaydı sayfa sınırını aşıyor"};if(bytes+size>250000)break;rows.put(JSONObject(body).put("jobKey",c.getString(0)));last=c.getString(0);bytes+=size}
    }
    return JSONObject().put("jobs",rows).put("nextKey",if(rows.length()>0)last else "")
  }
  @Synchronized fun replaceArchiveResult(runId: String, key: String, payload: String) {
    val v=ContentValues().apply{put("payload_enc",enc(payload))}
    writableDatabase.update("scan_result",v,"run_id=? AND result_key=?",arrayOf(runId,key))
  }
  @Synchronized fun ownerOf(runId: String): String? = readableDatabase.rawQuery("SELECT profile_id FROM scan_session_owner WHERE run_id=?", arrayOf(runId)).use { c -> if(c.moveToFirst()) c.getString(0) else null }
  @Synchronized fun bindOwner(runId: String, profileId: String) {
    check(runId.isNotBlank() && profileId.isNotBlank()) { "Tarama sahibi eksik" }
    val existing = ownerOf(runId)
    check(existing == null || existing == profileId) { "Tarama başka profile ait" }
    val values = ContentValues().apply { put("run_id", runId); put("profile_id", profileId) }
    check(writableDatabase.insertWithOnConflict("scan_session_owner", null, values, SQLiteDatabase.CONFLICT_REPLACE) != -1L)
  }
  @Synchronized fun readProbe(runId:String,probeKey:String):String? =
    readableDatabase.rawQuery("SELECT payload_enc FROM scan_probe_cache WHERE run_id=? AND probe_key=?",arrayOf(runId,probeKey)).use{c->if(c.moveToFirst())dec(c.getString(0))else null}
  @Synchronized fun writeProbe(runId:String,probeKey:String,payload:String){
    val values=ContentValues().apply{put("run_id",runId);put("probe_key",probeKey);put("payload_enc",enc(payload))}
    writableDatabase.insertWithOnConflict("scan_probe_cache",null,values,SQLiteDatabase.CONFLICT_REPLACE)
  }

  private fun key(): SecretKey {
    cachedKey?.let { return it }
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { cachedKey = it; return it }
    val kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    kg.init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .build())
    return kg.generateKey().also { cachedKey = it }
  }

  private fun enc(raw: String): String {
    val c = Cipher.getInstance("AES/GCM/NoPadding")
    c.init(Cipher.ENCRYPT_MODE, key())
    return Base64.encodeToString(c.iv + c.doFinal(raw.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
  }

  private fun dec(raw: String): String {
    val bytes = Base64.decode(raw, Base64.NO_WRAP)
    val iv = bytes.copyOfRange(0, 12)
    val body = bytes.copyOfRange(12, bytes.size)
    val c = Cipher.getInstance("AES/GCM/NoPadding")
    c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
    return String(c.doFinal(body), Charsets.UTF_8)
  }

  @Synchronized fun createSession(runId:String, mode:String, payload:String, concurrency:Int, timeoutMs:Int, total:Long) {
    createSessionV171(runId, mode, payload, concurrency, concurrency, timeoutMs, total, 0, "")
  }

  @Synchronized fun createSessionV171(
    runId:String,
    mode:String,
    payload:String,
    requestedConcurrency:Int,
    effectiveConcurrency:Int,
    timeoutMs:Int,
    total:Long,
    batchSize:Int,
    sourceFingerprint:String,
  ) {
    val now = System.currentTimeMillis()
    val v = ContentValues().apply {
      put("run_id", runId)
      put("mode", mode)
      put("payload_enc", enc(payload))
      put("concurrency", effectiveConcurrency)
      put("timeout_ms", timeoutMs)
      put("committed_cursor", 0L)
      put("total", total)
      put("state", "RUNNING")
      put("created_at", now)
      put("updated_at", now)
      put("committed_account", 0)
      put("committed_tested", 0L)
      put("batch_size", batchSize)
      put("requested_concurrency", requestedConcurrency)
      put("effective_concurrency", effectiveConcurrency)
      put("source_fingerprint", sourceFingerprint.take(128))
    }
    writableDatabase.insertWithOnConflict("scan_session", null, v, SQLiteDatabase.CONFLICT_REPLACE)
  }

  @Synchronized fun checkpoint(runId:String, cursor:Long, state:String="RUNNING") {
    writableDatabase.execSQL(
      "UPDATE scan_session SET committed_cursor=?,committed_tested=?,state=?,updated_at=? WHERE run_id=? AND committed_cursor<=?",
      arrayOf<Any>(cursor,cursor,state,System.currentTimeMillis(),runId,cursor)
    )
  }

  /** v17.1.0: yalnız tamamı biten batch commit edilir. */
  @Synchronized fun checkpointUnified(runId:String, nextAccount:Int, committedTested:Long, state:String="RUNNING") {
    writableDatabase.execSQL(
      "UPDATE scan_session SET committed_account=?,committed_tested=?,committed_cursor=?,state=?,updated_at=? WHERE run_id=? AND committed_account<=? AND committed_tested<=?",
      arrayOf<Any>(nextAccount, committedTested, committedTested, state, System.currentTimeMillis(), runId, nextAccount, committedTested)
    )
  }

  @Synchronized fun addResult(runId:String, key:String, payload:String): Boolean {
    val v = ContentValues().apply {
      put("run_id", runId)
      put("result_key", key)
      put("payload_enc", enc(payload))
      put("created_at", System.currentTimeMillis())
    }
    return writableDatabase.insertWithOnConflict("scan_result", null, v, SQLiteDatabase.CONFLICT_IGNORE) != -1L
  }

  /** Safely replay legacy checkpoints while retaining verified result/probe rows. */
  @Synchronized fun resetCheckpointForReplay(runId: String, payload: String) {
    writableDatabase.execSQL(
      "UPDATE scan_session SET payload_enc=?,committed_cursor=0,committed_account=0,committed_tested=0,state='RUNNING',updated_at=? WHERE run_id=?",
      arrayOf<Any>(enc(payload), System.currentTimeMillis(), runId),
    )
  }

  @Synchronized fun results(runId:String, limit:Int=1000000): JSONArray {
    val a = JSONArray()
    readableDatabase.rawQuery(
      "SELECT payload_enc FROM scan_result WHERE run_id=? ORDER BY id LIMIT ?",
      arrayOf(runId, limit.toString())
    ).use { c ->
      while(c.moveToNext()) runCatching { a.put(JSONObject(dec(c.getString(0)))) }
    }
    return a
  }

  @Synchronized fun resultCount(runId:String): Int {
    readableDatabase.rawQuery("SELECT COUNT(*) FROM scan_result WHERE run_id=?", arrayOf(runId)).use { c ->
      return if (c.moveToFirst()) c.getInt(0) else 0
    }
  }

  /** Evidence augments an existing credential row; it never creates a new account. */
  @Synchronized fun updateEvidence(runId: String, identity: JSONObject, evidence: JSONObject): Boolean {
    val isMag = identity.has("mac")
    val endpoint = identity.optString(if (isMag) "portal" else "server").trimEnd('/')
    require(endpoint.isNotBlank()) { "Kanıt endpoint'i eksik" }
    readableDatabase.rawQuery("SELECT id,payload_enc FROM scan_result WHERE run_id=?", arrayOf(runId)).use { rows ->
      while (rows.moveToNext()) {
        val payload = JSONObject(dec(rows.getString(1)))
        val same = payload.optString(if (isMag) "portal" else "server").trimEnd('/') == endpoint &&
          if (isMag) payload.optString("mac").equals(identity.optString("mac"), ignoreCase = true)
          else payload.optString("username") == identity.optString("username") && payload.optString("password") == identity.optString("password")
        if (!same) continue
        for (field in arrayOf("endpoints", "categories")) if (evidence.has(field)) payload.put(field, evidence.get(field))
        val values = ContentValues().apply { put("payload_enc", enc(payload.toString())) }
        return writableDatabase.update("scan_result", values, "run_id=? AND id=?", arrayOf(runId, rows.getLong(0).toString())) == 1
      }
    }
    return false
  }

  /** Cursor pagination is independent of the rolling notification/snapshot window. */
  @Synchronized fun resultsPage(runId: String, afterId: Long, requestedLimit: Int): JSONObject {
    require(runId.isNotBlank() && afterId >= 0) { "Geçersiz tarama/cursor" }
    val matches = JSONArray()
    var cursor = afterId
    var bytes = 0
    readableDatabase.rawQuery(
      "SELECT id,payload_enc FROM scan_result WHERE run_id=? AND id>? ORDER BY id LIMIT ?",
      arrayOf(runId, afterId.toString(), requestedLimit.coerceIn(1, 200).toString()),
    ).use { rows ->
      while (rows.moveToNext()) {
        // A damaged encrypted row must produce an actionable error, never disappear.
        val raw = dec(rows.getString(1))
        val size = raw.toByteArray(Charsets.UTF_8).size
        check(size <= 512 * 1024) { "Tarama sonucu aktarım sınırını aşıyor; kayıt journal'da korunuyor" }
        if (matches.length() > 0 && bytes + size > 512 * 1024) break
        matches.put(JSONObject(raw)); bytes += size; cursor = rows.getLong(0)
      }
    }
    val more = readableDatabase.rawQuery("SELECT 1 FROM scan_result WHERE run_id=? AND id>? LIMIT 1", arrayOf(runId, cursor.toString())).use { it.moveToFirst() }
    return JSONObject().put("runId", runId).put("matches", matches).put("nextCursor", cursor)
      .put("total", resultCount(runId)).put("hasMore", more)
  }

  /** Old scan versions accepted missing/unknown auth as a match. Validate decoded rows in bounded pages. */
  @Synchronized fun pruneUnverifiedResults(runId: String): Int {
    val db = writableDatabase
    var afterId = 0L
    var removed = 0
    while (true) {
      val invalid = mutableListOf<Long>()
      var rows = 0
      db.rawQuery(
        "SELECT id,payload_enc FROM scan_result WHERE run_id=? AND id>? ORDER BY id LIMIT 200",
        arrayOf(runId, afterId.toString()),
      ).use { cursor ->
        while (cursor.moveToNext()) {
          val id = cursor.getLong(0); afterId = id; rows++
          // Preserve undecodable rows for recovery; only a decoded, unverified match is removed.
          val decoded = runCatching { JSONObject(dec(cursor.getString(1))) }.getOrNull() ?: continue
          if (scanAuthStatus(decoded.optJSONObject("login")?.optJSONObject("user_info")?.opt("auth")) != true) invalid.add(id)
        }
      }
      for (id in invalid) removed += db.delete("scan_result", "run_id=? AND id=?", arrayOf(runId, id.toString()))
      if (rows < 200) break
    }
    return removed
  }

  @Synchronized fun recoverable(): JSONObject? {
    readableDatabase.rawQuery(
      "SELECT run_id,mode,payload_enc,concurrency,timeout_ms,committed_cursor,total,state,committed_account,committed_tested,batch_size,requested_concurrency,effective_concurrency,source_fingerprint FROM scan_session WHERE state IN ('RUNNING','PAUSED','INTERRUPTED') ORDER BY updated_at DESC LIMIT 1",
      null
    ).use { c ->
      if(!c.moveToFirst()) return null
      return JSONObject()
        .put("runId", c.getString(0))
        .put("mode", c.getString(1))
        .put("payload", dec(c.getString(2)))
        .put("concurrency", c.getInt(3))
        .put("timeoutMs", c.getInt(4))
        .put("cursor", c.getLong(5))
        .put("total", c.getLong(6))
        .put("state", c.getString(7))
        .put("accountCursor", c.getInt(8))
        .put("committedTested", c.getLong(9))
        .put("batchSize", c.getInt(10))
        .put("requestedConcurrency", c.getInt(11))
        .put("effectiveConcurrency", c.getInt(12))
        .put("sourceFingerprint", c.getString(13))
    }
  }

  @Synchronized fun archiveInfo(runId: String, profileId: String): JSONObject? {
    if(ownerOf(runId)!=profileId)return null
    return readableDatabase.rawQuery("SELECT mode,state,created_at FROM scan_session WHERE run_id=?",arrayOf(runId)).use { c ->
      if(!c.moveToFirst())null else JSONObject().put("runId",runId).put("profileId",profileId).put("mode",c.getString(0))
        .put("state",c.getString(1)).put("createdAt",c.getLong(2))
    }
  }
  @Synchronized fun latestResultArchive(profileId: String, mag: Boolean = true): String? {
    val modeClause = if (mag) "s.mode='MAG_RESULTS'" else "s.mode<>'MAG_RESULTS'"
    readableDatabase.rawQuery("SELECT s.run_id FROM scan_session s JOIN scan_session_owner o ON o.run_id=s.run_id WHERE o.profile_id=? AND $modeClause AND (EXISTS (SELECT 1 FROM scan_result r WHERE r.run_id=s.run_id) OR EXISTS (SELECT 1 FROM scan_retry q WHERE q.run_id=s.run_id AND q.state IN ('pending','unresolved'))) ORDER BY s.created_at DESC LIMIT 1", arrayOf(profileId)).use { c -> if(c.moveToFirst()) return c.getString(0) }
    if (!mag) return null // Old unowned credentials require explicit user file selection.
    readableDatabase.rawQuery("SELECT run_id,payload_enc FROM scan_session WHERE mode='MAG_RESULTS' AND EXISTS (SELECT 1 FROM scan_result WHERE scan_result.run_id=scan_session.run_id) ORDER BY created_at DESC", null).use { rows ->
      while (rows.moveToNext()) if (JSONObject(dec(rows.getString(1))).optString("profileId") == profileId) return rows.getString(0)
    }
    return null
  }

  @Synchronized fun markInterrupted() {
    writableDatabase.execSQL(
      "UPDATE scan_session SET state='INTERRUPTED',updated_at=? WHERE state IN ('RUNNING','PAUSED')",
      arrayOf(System.currentTimeMillis())
    )
  }

  fun finish(runId:String,state:String) {
    writableDatabase.execSQL(
      "UPDATE scan_session SET state=?,updated_at=? WHERE run_id=?",
      arrayOf<Any>(state,System.currentTimeMillis(),runId)
    )
    ScanSafetyBackup.flush(applicationContext, this, runId)
  }

  @Synchronized fun delete(runId:String) {
    writableDatabase.beginTransaction()
    try {
      writableDatabase.delete("scan_retry","run_id=?",arrayOf(runId))
      writableDatabase.delete("scan_probe_cache","run_id=?",arrayOf(runId))
      writableDatabase.delete("scan_result","run_id=?",arrayOf(runId))
      writableDatabase.delete("scan_session","run_id=?",arrayOf(runId))
      writableDatabase.delete("scan_session_owner","run_id=?",arrayOf(runId))
      writableDatabase.setTransactionSuccessful()
    } finally {
      writableDatabase.endTransaction()
    }
  }

  companion object {
    private const val KEY_ALIAS = "kizilkan_panel_scan_journal_v1"
    @Volatile private var i:ScanJournalStore? = null
    fun get(c:Context) = i ?: synchronized(this) { i ?: ScanJournalStore(c).also { i=it } }
  }
}
