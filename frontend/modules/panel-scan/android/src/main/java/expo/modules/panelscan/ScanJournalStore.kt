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
class ScanJournalStore private constructor(context: Context) : SQLiteOpenHelper(context.applicationContext, "kizilkan-panel-scan-journal.db", null, 2) {
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE scan_session(run_id TEXT PRIMARY KEY, mode TEXT NOT NULL, payload_enc TEXT NOT NULL, concurrency INTEGER NOT NULL, timeout_ms INTEGER NOT NULL, committed_cursor INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, committed_account INTEGER NOT NULL DEFAULT 0, committed_tested INTEGER NOT NULL DEFAULT 0, batch_size INTEGER NOT NULL DEFAULT 0, requested_concurrency INTEGER NOT NULL DEFAULT 0, effective_concurrency INTEGER NOT NULL DEFAULT 0, source_fingerprint TEXT NOT NULL DEFAULT '')")
    db.execSQL("CREATE TABLE scan_result(id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, result_key TEXT NOT NULL, payload_enc TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(run_id,result_key) ON CONFLICT IGNORE)")
    db.execSQL("CREATE INDEX idx_scan_result_run ON scan_result(run_id,id)")
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    if (oldVersion < 2) {
      db.execSQL("ALTER TABLE scan_session ADD COLUMN committed_account INTEGER NOT NULL DEFAULT 0")
      db.execSQL("ALTER TABLE scan_session ADD COLUMN committed_tested INTEGER NOT NULL DEFAULT 0")
      db.execSQL("ALTER TABLE scan_session ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 0")
      db.execSQL("ALTER TABLE scan_session ADD COLUMN requested_concurrency INTEGER NOT NULL DEFAULT 0")
      db.execSQL("ALTER TABLE scan_session ADD COLUMN effective_concurrency INTEGER NOT NULL DEFAULT 0")
      db.execSQL("ALTER TABLE scan_session ADD COLUMN source_fingerprint TEXT NOT NULL DEFAULT ''")
    }
  }

  private fun key(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    val kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    kg.init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .build())
    return kg.generateKey()
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
      "UPDATE scan_session SET committed_cursor=?,committed_tested=?,state=?,updated_at=? WHERE run_id=?",
      arrayOf(cursor,cursor,state,System.currentTimeMillis(),runId)
    )
  }

  /** v17.1.0: yalnız tamamı biten batch commit edilir. */
  @Synchronized fun checkpointUnified(runId:String, nextAccount:Int, committedTested:Long, state:String="RUNNING") {
    writableDatabase.execSQL(
      "UPDATE scan_session SET committed_account=?,committed_tested=?,committed_cursor=?,state=?,updated_at=? WHERE run_id=?",
      arrayOf(nextAccount, committedTested, committedTested, state, System.currentTimeMillis(), runId)
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

  @Synchronized fun markInterrupted() {
    writableDatabase.execSQL(
      "UPDATE scan_session SET state='INTERRUPTED',updated_at=? WHERE state IN ('RUNNING','PAUSED')",
      arrayOf(System.currentTimeMillis())
    )
  }

  @Synchronized fun finish(runId:String,state:String) {
    writableDatabase.execSQL(
      "UPDATE scan_session SET state=?,updated_at=? WHERE run_id=?",
      arrayOf(state,System.currentTimeMillis(),runId)
    )
  }

  @Synchronized fun delete(runId:String) {
    writableDatabase.beginTransaction()
    try {
      writableDatabase.delete("scan_result","run_id=?",arrayOf(runId))
      writableDatabase.delete("scan_session","run_id=?",arrayOf(runId))
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
