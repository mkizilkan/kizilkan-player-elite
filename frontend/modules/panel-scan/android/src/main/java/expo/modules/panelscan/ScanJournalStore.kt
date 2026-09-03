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

/** v17.0.7: process/telefon kaybına dayanıklı tarama journal'ı.
 * Sonuç her bulunduğunda transaction ile yazılır. Credential/payload AES-GCM Android Keystore ile şifrelenir.
 */
class ScanJournalStore private constructor(context: Context) : SQLiteOpenHelper(context.applicationContext, "kizilkan-panel-scan-journal.db", null, 1) {
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE scan_session(run_id TEXT PRIMARY KEY, mode TEXT NOT NULL, payload_enc TEXT NOT NULL, concurrency INTEGER NOT NULL, timeout_ms INTEGER NOT NULL, committed_cursor INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)")
    db.execSQL("CREATE TABLE scan_result(id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, result_key TEXT NOT NULL, payload_enc TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(run_id,result_key) ON CONFLICT IGNORE)")
    db.execSQL("CREATE INDEX idx_scan_result_run ON scan_result(run_id,id)")
  }
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

  private fun key(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    val kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    kg.init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    return kg.generateKey()
  }
  private fun enc(raw: String): String {
    val c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, key())
    return Base64.encodeToString(c.iv + c.doFinal(raw.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
  }
  private fun dec(raw: String): String {
    val bytes = Base64.decode(raw, Base64.NO_WRAP); val iv = bytes.copyOfRange(0, 12); val body = bytes.copyOfRange(12, bytes.size)
    val c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
    return String(c.doFinal(body), Charsets.UTF_8)
  }
  @Synchronized fun createSession(runId:String, mode:String, payload:String, concurrency:Int, timeoutMs:Int, total:Long) {
    val now=System.currentTimeMillis(); val v=ContentValues().apply { put("run_id",runId); put("mode",mode); put("payload_enc",enc(payload)); put("concurrency",concurrency); put("timeout_ms",timeoutMs); put("committed_cursor",0L); put("total",total); put("state","RUNNING"); put("created_at",now); put("updated_at",now) }
    writableDatabase.insertWithOnConflict("scan_session",null,v,SQLiteDatabase.CONFLICT_REPLACE)
  }
  @Synchronized fun checkpoint(runId:String, cursor:Long, state:String="RUNNING") { writableDatabase.execSQL("UPDATE scan_session SET committed_cursor=?,state=?,updated_at=? WHERE run_id=?", arrayOf(cursor,state,System.currentTimeMillis(),runId)) }
  @Synchronized fun addResult(runId:String, key:String, payload:String): Boolean { val v=ContentValues().apply { put("run_id",runId); put("result_key",key); put("payload_enc",enc(payload)); put("created_at",System.currentTimeMillis()) }; return writableDatabase.insertWithOnConflict("scan_result",null,v,SQLiteDatabase.CONFLICT_IGNORE) != -1L }
  @Synchronized fun results(runId:String, limit:Int=1000000): JSONArray { val a=JSONArray(); readableDatabase.rawQuery("SELECT payload_enc FROM scan_result WHERE run_id=? ORDER BY id LIMIT ?", arrayOf(runId,limit.toString())).use { c -> while(c.moveToNext()) runCatching { a.put(JSONObject(dec(c.getString(0)))) } }; return a }
  @Synchronized fun recoverable(): JSONObject? { readableDatabase.rawQuery("SELECT run_id,mode,payload_enc,concurrency,timeout_ms,committed_cursor,total,state FROM scan_session WHERE state IN ('RUNNING','PAUSED','INTERRUPTED') ORDER BY updated_at DESC LIMIT 1",null).use { c -> if(!c.moveToFirst()) return null; return JSONObject().put("runId",c.getString(0)).put("mode",c.getString(1)).put("payload",dec(c.getString(2))).put("concurrency",c.getInt(3)).put("timeoutMs",c.getInt(4)).put("cursor",c.getLong(5)).put("total",c.getLong(6)).put("state",c.getString(7)) } }
  @Synchronized fun markInterrupted() { writableDatabase.execSQL("UPDATE scan_session SET state='INTERRUPTED',updated_at=? WHERE state IN ('RUNNING','PAUSED')", arrayOf(System.currentTimeMillis())) }
  @Synchronized fun finish(runId:String,state:String) = checkpoint(runId, Long.MAX_VALUE, state)
  @Synchronized fun delete(runId:String) { writableDatabase.beginTransaction(); try { writableDatabase.delete("scan_result","run_id=?",arrayOf(runId)); writableDatabase.delete("scan_session","run_id=?",arrayOf(runId)); writableDatabase.setTransactionSuccessful() } finally { writableDatabase.endTransaction() } }
  companion object { private const val KEY_ALIAS="kizilkan_panel_scan_journal_v1"; @Volatile private var i:ScanJournalStore?=null; fun get(c:Context)=i?:synchronized(this){i?:ScanJournalStore(c).also{i=it}} }
}
