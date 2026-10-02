package expo.modules.kizilkannativecore

import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.CancellationException
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/** Bounded authenticated records; no catalogue or whole GCM plaintext is retained in RAM. */
object BackupCrypto {
  private val magic = "KZBE1\n".toByteArray(Charsets.US_ASCII)
  private const val CHUNK = 65536
  private const val ITERATIONS = 600000
  private val random = SecureRandom()

  private fun checkCancelled(shouldCancel: () -> Boolean) {
    if (shouldCancel()) throw CancellationException("Yedek şifreleme işlemi iptal edildi")
  }

  private fun key(password: String, salt: ByteArray, iterations: Int): ByteArray {
    val chars = password.toCharArray()
    val spec = PBEKeySpec(chars, salt, iterations, 256)
    return try { SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded }
    finally { spec.clearPassword(); chars.fill('\u0000') }
  }
  private fun crypt(mode: Int, key: ByteArray, prefix: ByteArray, index: Int, header: ByteArray, final: Boolean, input: ByteArray): ByteArray {
    val nonce = ByteBuffer.allocate(12).put(prefix).putInt(index).array()
    return Cipher.getInstance("AES/GCM/NoPadding").run {
      init(mode, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
      updateAAD(header)
      updateAAD(ByteBuffer.allocate(5).putInt(index).put(if (final) 1.toByte() else 0.toByte()).array())
      doFinal(input)
    }
  }
  fun encrypt(input: InputStream, output: OutputStream, size: Long, password: String, shouldCancel: () -> Boolean = { false }) {
    checkCancelled(shouldCancel)
    require(password.length in 8..1024) { "Yedek parolası en az 8 karakter olmalı" }
    require(size >= 0 && size / CHUNK < Int.MAX_VALUE - 1L) { "Yedek boyutu desteklenmiyor" }
    val salt = ByteArray(16).also(random::nextBytes)
    val prefix = ByteArray(8).also(random::nextBytes)
    // Fixed, versioned header: chunk size, PBKDF work, plaintext size, salt, nonce prefix.
    val header = ByteBuffer.allocate(40).putInt(CHUNK).putInt(ITERATIONS).putLong(size).put(salt).put(prefix).array()
    checkCancelled(shouldCancel)
    val derived = key(password, salt, ITERATIONS)
    try {
      checkCancelled(shouldCancel)
      val stream = DataOutputStream(output)
      stream.write(magic); stream.write(header)
      var remaining = size
      var index = 0
      while (remaining > 0) {
        checkCancelled(shouldCancel)
        val n = minOf(CHUNK.toLong(), remaining).toInt()
        val block = ByteArray(n)
        DataInputStream(input).readFully(block)
        checkCancelled(shouldCancel)
        val encrypted = crypt(Cipher.ENCRYPT_MODE, derived, prefix, index++, header, false, block)
        checkCancelled(shouldCancel)
        stream.write(encrypted)
        remaining -= n
      }
      checkCancelled(shouldCancel)
      check(input.read() == -1) { "Yedek boyutu işlem sırasında değişti" }
      checkCancelled(shouldCancel)
      stream.write(crypt(Cipher.ENCRYPT_MODE, derived, prefix, index, header, true, ByteArray(0)))
      checkCancelled(shouldCancel)
      stream.flush()
      checkCancelled(shouldCancel)
    } finally { derived.fill(0) }
  }
  fun decrypt(input: InputStream, output: OutputStream, password: String, shouldCancel: () -> Boolean = { false }) {
    checkCancelled(shouldCancel)
    require(password.length in 8..1024) { "Yedek parolası en az 8 karakter olmalı" }
    val stream = DataInputStream(input)
    val foundMagic = ByteArray(magic.size).also(stream::readFully)
    require(foundMagic.contentEquals(magic)) { "Şifreli yedek biçimi desteklenmiyor" }
    val header = ByteArray(40).also(stream::readFully)
    val fields = ByteBuffer.wrap(header)
    require(fields.int == CHUNK) { "Şifreli yedek parça boyutu geçersiz" }
    val iterations = fields.int
    require(iterations == ITERATIONS) { "Şifreli yedek anahtar biçimi desteklenmiyor" }
    val size = fields.long
    require(size >= 0 && size / CHUNK < Int.MAX_VALUE - 1L) { "Şifreli yedek boyutu geçersiz" }
    val salt = ByteArray(16).also(fields::get)
    val prefix = ByteArray(8).also(fields::get)
    checkCancelled(shouldCancel)
    val derived = key(password, salt, iterations)
    try {
      checkCancelled(shouldCancel)
      var remaining = size
      var index = 0
      while (remaining > 0) {
        checkCancelled(shouldCancel)
        val n = minOf(CHUNK.toLong(), remaining).toInt()
        val encrypted = ByteArray(n + 16).also(stream::readFully)
        checkCancelled(shouldCancel)
        val block = crypt(Cipher.DECRYPT_MODE, derived, prefix, index++, header, false, encrypted)
        checkCancelled(shouldCancel)
        output.write(block)
        remaining -= n
      }
      checkCancelled(shouldCancel)
      val terminator = ByteArray(16).also(stream::readFully)
      checkCancelled(shouldCancel)
      check(crypt(Cipher.DECRYPT_MODE, derived, prefix, index, header, true, terminator).isEmpty())
      require(stream.read() == -1) { "Şifreli yedek sonunda beklenmeyen veri var" }
      checkCancelled(shouldCancel)
      output.flush()
      checkCancelled(shouldCancel)
    } finally { derived.fill(0) }
  }

  private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it.toInt() and 255) }
  private fun unhex(raw: String): ByteArray = raw.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
  fun hashPin(pin: String): String {
    require(pin.matches(Regex("[0-9]{4,10}"))) { "PIN 4–10 rakam olmalı" }
    val salt = ByteArray(16).also(random::nextBytes)
    val hash = key(pin, salt, ITERATIONS)
    return try { "kzpin:1:$ITERATIONS:${hex(salt)}:${hex(hash)}" } finally { hash.fill(0) }
  }
  fun verifyPin(pin: String, encoded: String): Boolean {
    if(!pin.matches(Regex("[0-9]{4,10}")))return false
    val parts = encoded.split(':')
    if (parts.size != 5 || parts[0] != "kzpin" || parts[1] != "1" || parts[2] != ITERATIONS.toString() || !parts[3].matches(Regex("[a-f0-9]{32}")) || !parts[4].matches(Regex("[a-f0-9]{64}"))) return false
    val actual = key(pin, unhex(parts[3]), ITERATIONS)
    return try { MessageDigest.isEqual(actual, unhex(parts[4])) } finally { actual.fill(0) }
  }
}
