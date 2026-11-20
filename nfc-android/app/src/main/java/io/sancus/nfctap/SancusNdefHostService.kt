package io.sancus.nfctap

import android.nfc.cardemulation.HostApduService
import android.os.Bundle
import java.nio.ByteBuffer
import java.nio.charset.Charset

/**
 * Minimal Type 4 NDEF HCE host so Chrome Web NFC on another phone can read our tap token.
 * Not a production SoftPOS stack — enough for a two-phone demo.
 */
class SancusNdefHostService : HostApduService() {
  companion object {
    @Volatile
    var payload: String? = null

    private val OK = hex("9000")
    private val FILE_CC = 0xE103
    private val FILE_NDEF = 0xE104
  }

  private enum class Selected { NONE, CC, NDEF }

  private var selected = Selected.NONE
  private var cachedToken: String? = null
  private var ndefFile: ByteArray = ByteArray(0)

  override fun processCommandApdu(commandApdu: ByteArray?, extras: Bundle?): ByteArray {
    val cmd = commandApdu ?: return hex("6A82")
    val token = payload
    if (token.isNullOrBlank()) return hex("6A82")

    if (cachedToken != token) {
      cachedToken = token
      ndefFile = buildNdefFile(token)
      selected = Selected.NONE
    }

    return when {
      isSelectAid(cmd) -> {
        selected = Selected.NONE
        OK
      }
      isSelectFile(cmd, FILE_CC) -> {
        selected = Selected.CC
        OK
      }
      isSelectFile(cmd, FILE_NDEF) -> {
        selected = Selected.NDEF
        OK
      }
      isReadBinary(cmd) -> {
        val file = when (selected) {
          Selected.CC -> capabilityContainer(ndefFile.size)
          Selected.NDEF -> ndefFile
          Selected.NONE -> return hex("6A82")
        }
        readBinary(cmd, file)
      }
      else -> hex("6A82")
    }
  }

  override fun onDeactivated(reason: Int) {
    selected = Selected.NONE
  }

  private fun isSelectAid(cmd: ByteArray): Boolean {
    // SELECT by name: 00 A4 04 00 Lc AID [Le]
    if (cmd.size < 5 || cmd[0] != 0x00.toByte() || cmd[1] != 0xA4.toByte() || cmd[2] != 0x04.toByte()) return false
    val lc = cmd[4].toInt() and 0xff
    if (cmd.size < 5 + lc) return false
    val aid = cmd.copyOfRange(5, 5 + lc)
    val ndefAid = hex("D2760000850101")
    if (aid.size < ndefAid.size) return false
    for (i in ndefAid.indices) if (aid[i] != ndefAid[i]) return false
    return true
  }

  private fun isSelectFile(cmd: ByteArray, fileId: Int): Boolean {
    // SELECT by file id: 00 A4 00 0C 02 Fi Fi   or  00 A4 00 00 02 Fi Fi …
    if (cmd.size < 7 || cmd[0] != 0x00.toByte() || cmd[1] != 0xA4.toByte() || cmd[2] != 0x00.toByte()) return false
    val lc = cmd[4].toInt() and 0xff
    if (lc != 2 || cmd.size < 7) return false
    val id = ((cmd[5].toInt() and 0xff) shl 8) or (cmd[6].toInt() and 0xff)
    return id == fileId
  }

  private fun isReadBinary(cmd: ByteArray): Boolean {
    return cmd.size >= 5 && cmd[0] == 0x00.toByte() && cmd[1] == 0xB0.toByte()
  }

  private fun readBinary(cmd: ByteArray, file: ByteArray): ByteArray {
    val offset = ((cmd[2].toInt() and 0xff) shl 8) or (cmd[3].toInt() and 0xff)
    val le = if (cmd.size > 4) (cmd[4].toInt() and 0xff) else 0
    val len = if (le == 0) minOf(256, file.size - offset) else le
    if (offset < 0 || offset > file.size) return hex("6A82")
    val end = minOf(file.size, offset + maxOf(0, len))
    return file.copyOfRange(offset, end) + OK
  }

  private fun capabilityContainer(ndefLen: Int): ByteArray {
    val maxNdef = maxOf(ndefLen, 0x0400)
    return byteArrayOf(
      0x00, 0x0F, // CCLEN
      0x20, // mapping version 2.0
      0x00, 0xFF.toByte(), // MLe
      0x00, 0xFF.toByte(), // MLc
      0x04, 0x06, // NDEF File Control TLV
      0xE1.toByte(), 0x04, // file id
      ((maxNdef shr 8) and 0xff).toByte(), (maxNdef and 0xff).toByte(),
      0x00, // read access
      0xFF.toByte(), // write access denied
    )
  }

  private fun buildNdefFile(token: String): ByteArray {
    val utf8 = Charset.forName("UTF-8")
    val mimeType = "application/vnd.sancus.nfc.cardpay".toByteArray(utf8)
    val mimePayload = token.toByteArray(utf8)

    // MIME record first (exact token bytes for Web NFC), then a Text fallback.
    val mimeRecord = ndefRecord(
      tnf = 0x02, // MIME media type
      type = mimeType,
      payload = mimePayload,
      mb = true,
      me = false,
    )
    val textPayload = byteArrayOf(0x02) + "en".toByteArray(Charset.forName("US-ASCII")) + mimePayload
    val textRecord = ndefRecord(
      tnf = 0x01, // Well-known
      type = "T".toByteArray(Charset.forName("US-ASCII")),
      payload = textPayload,
      mb = false,
      me = true,
    )
    val message = mimeRecord + textRecord
    val len = message.size
    return byteArrayOf(((len shr 8) and 0xff).toByte(), (len and 0xff).toByte()) + message
  }

  private fun ndefRecord(
    tnf: Int,
    type: ByteArray,
    payload: ByteArray,
    mb: Boolean,
    me: Boolean,
  ): ByteArray {
    val shortRecord = payload.size < 256
    var flags = tnf and 0x07
    if (mb) flags = flags or 0x80
    if (me) flags = flags or 0x40
    if (shortRecord) flags = flags or 0x10

    val header = ByteBuffer.allocate(if (shortRecord) 3 else 6)
    header.put(flags.toByte())
    header.put(type.size.toByte())
    if (shortRecord) {
      header.put(payload.size.toByte())
    } else {
      header.putInt(payload.size)
    }
    return header.array() + type + payload
  }
}

private fun hex(s: String): ByteArray {
  val clean = s.replace(" ", "")
  return ByteArray(clean.length / 2) { i ->
    clean.substring(i * 2, i * 2 + 2).toInt(16).toByte()
  }
}
