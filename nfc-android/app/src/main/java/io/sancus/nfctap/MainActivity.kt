package io.sancus.nfctap

import android.content.Intent
import android.nfc.NfcAdapter
import android.os.Bundle
import android.view.WindowManager
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
  private lateinit var label: TextView

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    label = TextView(this).apply {
      setPadding(48, 96, 48, 48)
      textSize = 18f
    }
    setContentView(label)
    applyIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    applyIntent(intent)
  }

  private fun applyIntent(intent: Intent?) {
    val nfc = NfcAdapter.getDefaultAdapter(this)
    val token = intent?.data?.getQueryParameter("d")?.trim().orEmpty()
    if (token.isEmpty()) {
      SancusNdefHostService.payload = null
      label.text = buildString {
        append("Sancus NFC Tap\n\n")
        append("Open this app from Sancus → Card → Ready to tap → Open Android NFC companion.\n\n")
        when {
          nfc == null -> append("This device has no NFC.")
          !nfc.isEnabled -> append("NFC is off — turn it on in Settings.")
          else -> append("NFC is on. Waiting for a tap token…")
        }
      }
      return
    }
    SancusNdefHostService.payload = token
    label.text = buildString {
      append("NFC tap armed.\n\n")
      append("Keep this screen open and hold this phone to the merchant phone\n")
      append("(Chrome → Card → Accept tap → Listen for NFC tap).\n\n")
      when {
        nfc == null -> append("Warning: no NFC hardware.")
        !nfc.isEnabled -> append("Warning: NFC is off.")
        else -> append("HCE hosting NDEF · token length ${token.length}")
      }
    }
  }
}
