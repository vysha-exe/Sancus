# Sancus NFC Tap (Android companion)

Hosts a short-lived **NDEF Type 4** payload over **NFC HCE** so another Android phone running Chrome (**Accept tap** on `/card`) can read it with Web NFC.

This is a hackathon PoC: real NFC radios, Sancus virtual-card settlement — **not** Visa/Mastercard SoftPOS.

## Flow

1. Payer opens https://sancus-peach.vercel.app/card in Chrome → **NFC tap → Pay → Ready to tap**
2. Tap **Open Android NFC companion** (deep link `sancusnfc://host?d=…`)
3. Merchant opens `/card` → **Accept tap → Listen for NFC tap** (Chrome + NFC on)
4. Hold phones back-to-back → merchant charges the signed intent

## Build

Open `nfc-android/` in Android Studio → Run on a physical NFC phone (API 26+). Emulators do not do NFC.

The APK registers for `sancusnfc://host?d=…` and hosts a Type 4 NDEF tag over HCE while that screen stays open.

## Notes

- Without this APK, `/card` still supports **Write NFC tag** and **Simulate tap (same device)**.
- Web NFC alone cannot make one phone appear as a tag to another; HCE is required for phone↔phone.
