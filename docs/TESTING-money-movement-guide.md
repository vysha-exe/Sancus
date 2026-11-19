# Money movement: step-by-step test guide

Follow this top to bottom. It's written for the local app (`http://localhost:3000`) on the shared testnet Supabase, as of Nov 19, 2026. Every amount is tiny on purpose.

**What runs today:** 8a → 5 → 5b → 6 → 7 → 8b → 9 (in that order; 8a tops up Bangkok first).
**What's blocked:** 1–4 (no SGD at HQ, and no employee request flow). See "Blocked workflows" at the end.

---

## 0. Before you start (10 minutes)

### 0.1 Money you need, and where it comes from

| Money | Used by | Where it comes from | Ask anyone? |
|---|---|---|---|
| Baht in Bangkok's Kasikornbank account | 5, 5b, 7 | Dev page → "Mock paid payment" (simulated, free, step 8a) | No |
| fUSDC (mock dollar the transfers settle in) | 5, 5b, 6, 7 | Rail bot mints it as needed (`MOCK_RAIL_MINTER_KEY`) | No |
| Buyer agent's USDC | 8b | Already ~$0.48 wallet + ~$0.44 Gateway (≈44 calls). Top up at faucet.circle.com → Arc Testnet → USDC → `0x2a6cb6e8281023221909F375375D7Cd6A17b1bd2` | No |
| SGD in HQ's DBS operating account | 1, 4 | **Nothing in the app can add it.** Currently S$0. | **Vysha** (treasury, SG payouts, ledger) |
| Real USDC in HQ's wallet | none of these | Not spent by any workflow here (company payouts don't send USDC) | No |

Fixed demo rates: **$1 = ฿35**, PayNow fee **S$0.50** per payout.

### 0.2 Windows (one login per browser, not per tab)

Tabs in the same browser share one login, so each person needs their own browser or profile. Open:

| Window | Browser | Who | Used in |
|---|---|---|---|
| **A** | Chrome, normal window | Business admin (global admin) | 5–9 |
| **B** | Chrome, Incognito window | Branch admin (Ploy, Bangkok) | 5, 5b, 7, 8a |
| **C** | Safari (or a second Chrome profile) | Finance (Mei) | 7 |
| **D** | Firefox (or a third Chrome profile) | Employee (Niran) | only 2–4, when unblocked |

Plus **one terminal**, in `app/`, for the ledger checks.

### 0.3 Log in each window

In each window: go to `http://localhost:3000/demo`, then click the card:
- A → **Business admin**
- B → **Branch admin**
- C → **Finance**

Check the name in the top-right corner (A: "Business admin", B: "Branch admin · Lion City Bangkok", C: Mei).
If a window ever shows the wrong person, you logged in twice in the same browser: use a different browser for that role.

### 0.4 Write down the starting numbers

**Window A** → left menu **Branches**. In "Company structure", write down:
- **HQ · Lion City Trading** (USDC): expected about **$17.96**
- **TH · Lion City Bangkok** (THB): expected about **THB 30.00**
- **US · Lion City New York** (USD): expected about **$1.00**

**Terminal** (in `app/`):
```bash
node scripts/check-books.cjs 1
```
It works from any folder. This prints the last hour of both books (times are UTC):
1. **Bank book**: Bangkok's baht account. Transfers and collections land here. **Not** in the Settings CSV.
2. **USDC ledger**: what Settings → Download CSV exports. Each line says `OK` if debits = credits.

Use this table as you go:

| After step | HQ (USDC) | Bangkok (THB) | New York (USD) | Notes |
|---|---|---|---|---|
| Start | | | | |
| 8a | | | | |
| 5 | | | | |
| 5b | | | | |
| 6 | | | | |
| 7 | | | | |
| 8b | | | | |

---

## 8a. Money in: QR collection into Bangkok (do this first)

**Why first:** Bangkok has about ฿30, and steps 5, 5b and 7 need ฿140 (6 gives ฿35 back).

**Window B (Ploy)**
1. Left menu → **Dev**.
2. Scroll to **Test incoming QR payments**.
3. **Rail**: PromptPay (Thailand).
4. **QR belongs to**: Lion City Bangkok.
5. **Fake payer enters · THB**: leave **100.00**.
6. Click **Mock paid payment**.

**Expect**
- The result shows 3 green steps: identity resolved, mock payment, "Kasikornbank credited Lion City Bangkok's THB operating account".
- **Window A** → Branches (reload): Bangkok **+THB 100** (≈ THB 130).
- **Window B** → **Activity**: a new row "PromptPay customer · +100 THB · SETTLED".
- **Terminal** `node scripts/check-books.cjs 1`: `Lion City Bangkok CREDIT 10000 THB … RAIL_COLLECTION`.
- Settings CSV: **nothing** (collections aren't in it).

Don't use **Receive → One-time collection** for this: it marks the QR "Settled" but never credits the branch (known bug).

---

## 5. Branch → HQ: Ploy moves $1

**Window B (Ploy)**
1. Left menu → **Branches** → click **Lion City Bangkok**.
2. Click **Move money**.
3. Click the **Move out** chip.
4. **Destination**: Lion City Trading.
5. Check the box below says From Lion City Bangkok → To Lion City Trading, paying from Kasikornbank.
6. **Amount · USDC**: `1`. **Memo**: `WF5`.
7. Click **Review and move**.

**Expect**
- Banner: "Money moved" (takes a few seconds: it waits for two Arc transactions).
- **Window B** → Branches → Bangkok (reload): **−THB 35**.
- **Window A** → Branches (reload): Bangkok **−THB 35**, HQ **+$1.00**.
- **Window B** → **Activity**: "Lion City Bangkok → Lion City Trading · −$1.00 · SETTLED".
- **Terminal**: `Lion City Bangkok DEBIT 3500 THB … HOLD_CAPTURE INTERNAL_TRANSFER`, and a hold marked `CAPTURED`.
- **Explorer**: the transfer stores only the burn hash. Open `https://explorer.testnet.arc.io/address/0xefe978db8fe3f1b9c0ec5546285ccef73d76f853` (Bangkok's wallet) → token transfers → newest is **1 fUSDC Bangkok → 0x000…0** (burn). One block later, HQ's wallet `0x532448d45d5c7f53526a41961096357b517bd68c` gets **1 fUSDC from 0x000…0** (mint).
- Settings CSV: **nothing** (transfers aren't in it).

---

## 5b. Thailand → US branch: Ploy moves $1 to New York (the lead's scenario)

**Window B (Ploy)**
1. Branches → **Lion City Bangkok** → **Move money** → **Move out**.
2. **Destination**: Lion City New York.
3. **Amount · USDC**: `1`. **Memo**: `WF5b`. Click **Review and move**.

**Expect**
- Banner "Money moved".
- **Window A** → Branches (reload): Bangkok **−THB 35**, New York **+$1.00**. If New York jumps by **$10,000**, the cents fix in `localMinorForUsdc` isn't running. Stop and tell Shrish.
- **Terminal**: `Lion City Bangkok DEBIT 3500 THB` and `Lion City New York CREDIT 100 USD`.
- **Explorer**: 1 fUSDC burned from Bangkok's wallet, then 1 minted to New York's wallet `0x94f7358108e1a5d8f0903cf64714a4acd5d19aa9` a few blocks later.
- **Window B** → Activity: "Lion City Bangkok → Lion City New York · SETTLED".

---

## 6. HQ → Branch: admin funds Bangkok $1 (no approval)

**Window A (Admin)**
1. Left menu → **Branches** → click **Lion City Bangkok**.
2. Click **Move money**.
3. Click the **Fund this branch** chip.
4. **Paying from**: Lion City Trading.
5. **Amount · USDC**: `1`. **Memo**: `WF6`.
6. Click **Review and move**.

**Expect**
- Banner "Money moved" straight away. No "Sent for approval": the global admin has no limits.
- **Window A** → Branches (reload): HQ **−$1.00**, Bangkok **+THB 35**.
- **Window B** → Branches → Bangkok (reload): **+THB 35**, and it's in Activity.
- **Terminal**: `Lion City Bangkok CREDIT 3500 THB … INTERNAL_TRANSFER`.
- Explorer: 1 fUSDC burned from HQ's wallet, 1 minted to Bangkok's.

---

## 7. Transfer over the limit → Finance approves

### 7.1 Lower Bangkok's approval rule to $1
**Window A (Admin)**
1. Top bar workspace switcher → pick **Lion City Bangkok** (the rule is per branch).
2. Left menu → **Settings**.
3. Under approval rules, "Payments of this much or more need an approver": type `1`.
4. Click **Save rules**. Expect "Saved. Rules apply to requests made from now on."

### 7.2 Ploy moves $2
**Window B (Ploy)**
1. Branches → Lion City Bangkok → **Move money** → **Move out** → Destination **Lion City Trading**.
2. **Amount**: `2`. **Memo**: `WF7`. Click **Review and move**.
3. Expect banner **"Sent for approval"**. Bangkok's balance doesn't change yet.

### 7.3 Mei approves
**Window C (Mei)**
1. She lands on **Activity → Approvals** (or click it). Reload.
2. Click the waiting item "Lion City Bangkok → Lion City Trading · $2.00".
3. Optional note: `WF7 ok`. Click **Approve $2.00**.

**Expect**
- The item moves to Approved, then the transfer completes (a few seconds).
- **Window A** → Branches (reload): Bangkok **−THB 70**, HQ **+$2.00**.
- **Window B** → Activity: the $2 row is **SETTLED**.
- **Terminal**: `DEBIT 7000 THB … HOLD_CAPTURE`.

### 7.4 Put the rule back (don't skip)
**Window A**: workspace = Lion City Bangkok → **Settings** → type `1000` → **Save rules**.

---

## 8b. Money in: an agent pays the x402 endpoint ($0.01)

**Window A**: left menu **Agents**, and note the earnings total (about **$0.05**).

**Terminal** (in `app/`):
```bash
npm run x402:buyer -- --calls 1
```

**Expect**
- `#1 paid 0.01 USDC … best: PayNow …`.
- If it says `Payment settlement failed`, run it once more. The first try failed once today and the retry worked.
- **Window A** → Agents (reload): earnings **+$0.01**.
- **Settings → Download CSV** (Window A): a new pair of rows: `treasury:gateway_usdc` debit **0.010000** and `revenue:x402` credit **0.010000**. This is the only workflow here that writes to the CSV.

---

## 9. Everything agrees at the end

1. **Balances vs. your table:** Branches page (Window A) should show HQ start + $1 − $1 + $2 = **start + $2**, Bangkok start + 100 − 35 − 35 + 35 − 70 = **start − THB 5**, and New York **start + $1**.
2. **Bank book:** the last `bal` for Lion City Bangkok (and Lion City New York) in the terminal output should equal that branch's balance on the Branches page.
3. **Holds:** no hold left `ACTIVE` in the terminal output (all `CAPTURED` or `RELEASED`). Branch page "held" = 0.
4. **USDC ledger:** every journal line ends in `OK`.
5. **Real USDC vs. chain:** HQ's real USDC on the explorer (`0x5324…d68c`, "USDC" balance) should be **unchanged** all day. Transfers move fUSDC, not USDC. HQ's app balance = real USDC + what transfers moved in or out.
6. **Both windows agree:** Window B's Activity lists every transfer from 5–7, including the HQ → Bangkok one from 6.

Known display quirk: in Ploy's Activity, money coming **into** Bangkok from HQ shows as "−$1.00".

---

## Blocked workflows (1–4)

| # | Blocker | Fix | Who |
|---|---|---|---|
| 1. Admin pays Tan Logistics S$2 | HQ's SGD (DBS) account is S$0. A company PayNow payout reserves S$2.50 (S$2 + S$0.50 fee) from it first. Also, the Pay screen has no PayNow payee; only **Dev → PayNow send** can send one. | Put ~**S$10** into HQ's SGD operating account | **Vysha** |
| 2. Niran requests, Mei approves | Bangkok's operating account is THB, and PayNow needs SGD. Separately, Me → **Request a payment** opens the normal Pay flow, which refuses employees ("Your account can't send money"). | Needs code: an employee request path (approvals, §4) | Shrish |
| 3. Request declined | Same as 2 | Same as 2 | Shrish |
| 4. Mei's own request | Same SGD shortfall as 1 (her requests come from HQ) | Same as 1 | Vysha |

**What to ask Vysha** (copy-paste):
> Can you credit Lion City Trading's SGD operating account (DBS, `sancus_receive_accounts` for company `2f867338-9179-46cf-b411-d84dec216e65`) with about S$10 of simulated balance? The Dev "Mock paid payment" tool refuses the parent account, so there's no way to fund HQ's SGD from the app. Needed to test PayNow payouts and approvals.

Once HQ has SGD, workflows 1 and 4 can run like this:
- **1 (Window A):** workspace **Lion City Trading** → **Dev** → **Test amount** `2.00` → **PayNow send** → **Run test**. Expect status 201, then the payout moving to completed. HQ SGD −S$2.50 (hold, then captured). In **Settings → Download CSV**: a "created" pair (`payouts:in_transit` debit / `treasury:available` credit), then "completed" (`external:paynow` + `fees:partner` debit / `payouts:in_transit` credit).
- **4 (Window C, Mei):** **Dev** → **Test amount** `1.00` → **PayNow send** → **Run test** → "needs approval". Then **Activity → Approvals**: the Approve button is disabled with "Waiting for another admin…". Click **Withdraw**: the S$1.50 hold is released. Repeat the request, then in **Window A** → Activity → Approvals → **Approve**. The entries go in **Mei's** CSV, not the admin's.
