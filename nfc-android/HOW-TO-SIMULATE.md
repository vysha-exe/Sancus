# How to simulate NFC card tap (Android)

Two ways to demo: **same phone** (no radios) or **two Android phones** (real NFC).

---

## Option A — Same phone / desktop (fastest)

No companion app or second phone needed.

1. Open Chrome and sign in to Sancus → **Card** (`/card`).
2. Confirm you have an **ACTIVE** virtual card.
3. In **NFC tap**, leave mode on **Pay (this card)**.
4. Set **Merchant** and **Amount (USD)** (e.g. `12.50`).
5. Tap **Simulate tap (same device)**.
6. You should see an approval message and a new row under **Recent card payments**.

This hits the same `/api/sancus/nfc/intent` → `/api/sancus/nfc/charge` path as a real tap; it just skips the NFC radio.

---

## Option B — Two Android phones (real NFC)

### What you need

- Two NFC Android phones (API 26+)
- Chrome on both (Web NFC only works in Chrome on Android)
- NFC turned **on** on both phones
- Sancus NFC Tap companion APK built from `nfc-android/` (payer phone only)
- Both phones signed into Sancus accounts that can open `/card` (merchant can be any logged-in user; payer must own the card)

### 1. Install the companion (payer phone)

1. Open the `nfc-android/` folder in **Android Studio**.
2. Connect the **payer** phone with USB debugging on.
3. Run the app (**Sancus NFC Tap**) on that phone.
4. Leave it installed. You only open it via the deep link from the website.

### 2. Arm the payer phone

1. On the **payer** phone, open Chrome → Sancus → **Card**.
2. Under **NFC tap**, choose **Pay (this card)**.
3. Set merchant + amount.
4. Tap **Ready to tap ···####**.
5. When it says ready, tap **Open Android NFC companion**.
6. The companion should open with **NFC tap armed**. Keep that screen open (screen stays on).
7. If NFC is off, turn it on when prompted / in Settings.

### 3. Listen on the merchant phone

1. On the **merchant** phone, open Chrome → Sancus → **Card**.
2. Under **NFC tap**, choose **Accept tap (merchant)**.
3. Tap **Listen for NFC tap**.
4. Allow NFC / site permission if Chrome asks.
5. Keep that Chrome tab in the foreground.

### 4. Tap

1. Hold the phones **back-to-back** (NFC antennas are usually near the top/back).
2. Hold still for 1–2 seconds.
3. Merchant Chrome should show an **Approved** message with amount + last four.
4. Check **Recent card payments** on both sides (payer’s purchase list updates after refresh).

### If the tap doesn’t read

- Both phones: NFC **on**, Chrome (not Samsung Internet / Firefox).
- Companion screen still showing **NFC tap armed** (token expires in ~2 minutes — arm again if needed).
- Merchant still on **Listen for NFC tap**.
- Try a slight shift of position; remove thick cases.
- Fallback: on the payer phone use **Write NFC tag** with a blank NTAG, then have the merchant scan that tag instead.
- Or use **Option A — Simulate tap** on one device.

---

## Option C — Physical NFC tag (one phone + tag)

1. Payer: **Pay** → **Ready to tap** → **Write NFC tag**.
2. Hold a writable NFC tag to the payer phone until write succeeds.
3. Merchant: **Accept tap** → **Listen for NFC tap**.
4. Hold the tag to the merchant phone.

---

## Quick checklist

| Step | Payer | Merchant |
|------|--------|----------|
| Browser | Chrome | Chrome |
| NFC | On | On |
| Mode | Pay → Ready to tap | Accept → Listen |
| Host | Companion open / tag written | — |
| Action | Hold phone (or tag) to merchant | Wait for Approved |

Settlement is Sancus virtual-card + Arc — **not** Visa/Mastercard SoftPOS.
