package expo.modules.kizilkannativecore

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.provider.MediaStore
import java.io.File
import java.security.MessageDigest

/**
 * KIZILKAN PLAYER v18.6.0 — Kullanıcının dosya yöneticisinde GÖREBİLDİĞİ yere yazma.
 * ===========================================================================
 * Varsayılan kök: Download/KIZILKAN PLAYER ELITE/<alt klasör>/
 *  • Android 10+ : MediaStore.Downloads (izin GEREKMEZ). Yazım sürerken IS_PENDING=1
 *                  (yarım dosya galeride/dosya yöneticisinde görünmez), bitince 0.
 *  • Android 7–9 : ortak İndirilenler klasörü (WRITE_EXTERNAL_STORAGE zaten bildirili).
 *  • Kullanıcı klasörü (SAF ağaç izni) verilirse oraya yazılır.
 * Cihaz kanıtı (v18.5.0): SAF ile "İndirilenler" sağlayıcısına dosya OLUŞTURULAMIYOR
 * (TXT kaydı hatası); MediaStore yolu bu kısıtlamaya takılmaz.
 * Parçalı indirme aynı dosyaya farklı konumlardan yazar → "rw" dosya tanımlayıcısı.
 */
object PublicStorage {
  const val ROOT = "KIZILKAN PLAYER ELITE"

  data class Target(val uri: Uri, val displayPath: String, val pending: Boolean)

  private fun safeName(name: String): String =
    name.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_").trim().trimEnd('.').ifBlank { "dosya" }.take(150)

  private fun safeSub(sub: String): String =
    sub.split('/').map { safeName(it) }.filter { it.isNotBlank() }.joinToString("/")

  /** Yeni hedef dosya oluştur. treeUri boşsa varsayılan görünür klasör. */
  fun create(context: Context, subdir: String, displayName: String, mime: String, treeUri: String?): Target {
    val name = safeName(displayName)
    if (!treeUri.isNullOrBlank()) {
      val tree = Uri.parse(treeUri)
      val parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
      val created = DocumentsContract.createDocument(context.contentResolver, parent, mime, name)
        ?: throw IllegalStateException("Seçilen klasörde dosya oluşturulamadı")
      return Target(created, "Seçilen klasör/$name", false)
    }
    val sub = safeSub(subdir)
    val rel = listOf(Environment.DIRECTORY_DOWNLOADS, ROOT, sub).filter { it.isNotBlank() }.joinToString("/")
    if (Build.VERSION.SDK_INT >= 29) {
      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, name)
        put(MediaStore.MediaColumns.MIME_TYPE, mime)
        put(MediaStore.MediaColumns.RELATIVE_PATH, "$rel/")
        put(MediaStore.MediaColumns.IS_PENDING, 1)
      }
      val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        ?: throw IllegalStateException("İndirilenler klasörüne dosya eklenemedi")
      return Target(uri, "$rel/$name", true)
    }
    @Suppress("DEPRECATION")
    val dir = File(Environment.getExternalStorageDirectory(), rel).apply { mkdirs() }
    var file = File(dir, name)
    var i = 1
    while (file.exists()) { file = File(dir, name.replaceFirst(Regex("(\\.[^.]*)?$"), " ($i)$1")); i++ }
    file.createNewFile()
    return Target(Uri.fromFile(file), "$rel/${file.name}", false)
  }

  fun openRw(context: Context, uri: Uri): ParcelFileDescriptor =
    context.contentResolver.openFileDescriptor(uri, "rw") ?: throw IllegalStateException("Dosya açılamadı: $uri")

  /** Yazım bitti: dosyayı görünür yap. */
  fun finish(context: Context, uri: Uri) {
    if (Build.VERSION.SDK_INT >= 29 && uri.authority == MediaStore.AUTHORITY) {
      val changed = context.contentResolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
      if (changed != 1) throw IllegalStateException("Dosya görünür yapılamadı: MediaStore güncellemesi $changed")
    }
  }

  fun delete(context: Context, uri: Uri) {
    runCatching {
      if (uri.scheme == "file") File(uri.path ?: "").delete()
      else if (DocumentsContract.isDocumentUri(context, uri)) DocumentsContract.deleteDocument(context.contentResolver, uri)
      else context.contentResolver.delete(uri, null, null)
    }
  }

  /** Küçük metin dosyası (TXT arşivi vb.) — tek adımda yaz + görünür yap. */
  fun writeText(context: Context, subdir: String, displayName: String, mime: String, text: String, treeUri: String?): Target {
    val t = create(context, subdir, displayName, mime, treeUri)
    try {
      context.contentResolver.openOutputStream(t.uri, "wt")?.use { it.write(text.toByteArray(Charsets.UTF_8)) }
        ?: throw IllegalStateException("Yazma akışı açılamadı")
      // Doğrula: geri oku, bayt eşit mi.
      val expected = text.toByteArray(Charsets.UTF_8)
      val back = context.contentResolver.openInputStream(t.uri)?.use { it.readBytes() }
        ?: throw IllegalStateException("Yazılan dosya doğrulama için açılamadı")
      if (!back.contentEquals(expected)) throw IllegalStateException("Yazım doğrulanamadı (${back.size}/${expected.size} bayt)")
      finish(context, t.uri)
      return t
    } catch (e: Throwable) {
      delete(context, t.uri)
      throw e
    }
  }

  /** Kayıt staging dosyasını SAF/MediaStore'a sabit bellekle aktar; kaynak doğrulanana kadar korunur. */
  fun copyFile(context: Context, sourcePath: String, subdir: String, displayName: String, mime: String, treeUri: String?): Target {
    val sourceUri = Uri.parse(sourcePath)
    val source = File(if (sourceUri.scheme == "file") sourceUri.path ?: "" else sourcePath)
    require(source.isFile && source.length() > 0) { "Kayıt dosyası bulunamadı veya boş" }
    val t = create(context, subdir, displayName, mime, treeUri)
    try {
      val expected = MessageDigest.getInstance("SHA-256")
      var written = 0L
      source.inputStream().use { input ->
        context.contentResolver.openOutputStream(t.uri, "wt")?.use { output ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            output.write(buffer, 0, n)
            expected.update(buffer, 0, n)
            written += n
          }
          output.flush()
        } ?: throw IllegalStateException("Kayıt hedefi açılamadı")
      }
      val actual = MessageDigest.getInstance("SHA-256")
      var verified = 0L
      context.contentResolver.openInputStream(t.uri)?.use { input ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val n = input.read(buffer)
          if (n < 0) break
          actual.update(buffer, 0, n)
          verified += n
        }
      } ?: throw IllegalStateException("Kayıt doğrulama için açılamadı")
      check(written == verified && written > 0 && expected.digest().contentEquals(actual.digest())) { "Kayıt aktarımı doğrulanamadı" }
      finish(context, t.uri)
      return t
    } catch (e: Throwable) {
      delete(context, t.uri)
      throw e
    }
  }
}
