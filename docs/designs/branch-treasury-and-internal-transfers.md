# Branch treasury and internal transfers

Status: approved product design for future implementation
Scope: hackathon admin experience
Reference: `docs/PAYMENT-RAILS-ARCHITECTURE.md`

## Product decision

Each country branch is a monitoring-first operating account. Clicking a branch opens a dedicated branch route showing its treasury, local equivalent, connected bank, recent branch activity, employees, and spending methods. Moving money is a secondary action from this page.

The parent is a country-neutral global treasury. There is exactly one parent; every other company node is a direct branch. Grandchildren are outside the hackathon scope.

Supported internal directions:

- Parent treasury to branch
- Branch to parent treasury
- Branch to branch

Internal transfers land in the destination Sancus treasury. A connected bank is shown as the familiar account associated with a country branch, but depositing into that bank is a separate payout action.

## Route and screen

Use `/branches/[branchId]` for a branch detail page. Parent treasury can use `/branches/[rootId]` with the same shell and parent-specific content.

The page is ordered for monitoring:

1. Header: branch name, country, local currency, status, and connected bank.
2. Treasury summary: available USDC, local-token balance, fixed-rate local equivalent, reserved amount, and money in flight.
3. Primary information: recent payments and internal transfers scoped to this branch.
4. Secondary actions: `Move money`, `Pay`, and `Manage spending`.
5. Team and spending summary: employees, cards, Pix/QR access, limits, and status.

The transfer action opens a themed modal or drawer rather than turning the branch page into a transfer form.

### Connected-bank presentation

For a country branch, show a familiar bank label such as:

> Bank Central Asia · Operating account •••• 4821

The normal payment review displays this as `Paying from`, followed by the branch name. The Arc wallet and transaction hashes appear only in transfer details.

The bank record is explicitly demo/simulated unless it comes from a provider. It must never be presented as a real custody account.

The country-neutral parent treasury has no connected country or bank. It is labeled `Global treasury · USDC`.

## Internal settlement model

USDC on Arc is the settlement asset. The deployed mock local tokens represent each branch's locally usable balance:

- Indonesia: mIDR
- Thailand: mTHB
- Brazil: mBRL

### Branch to branch

Indonesia to Thailand follows this visible path:

```text
Indonesia local balance
  -> reserve source amount
  -> burn mIDR
  -> transfer USDC from Indonesia Circle wallet to Thailand Circle wallet
  -> mint mTHB at the fixed demo rate
  -> credit Thailand branch treasury
```

The UI describes the customer outcome as `Indonesia branch -> Thailand branch`. Transaction details can expand the four settlement stages and link to Arc explorer transactions.

### Parent treasury to branch

```text
Parent USDC treasury
  -> transfer USDC to destination branch Circle wallet
  -> mint the destination mock local token at the fixed demo rate
  -> credit destination branch treasury
```

There is no source local-token burn because the parent holds USDC directly.

### Branch to parent treasury

```text
Branch local balance
  -> reserve source amount
  -> burn the source mock local token
  -> transfer USDC to the parent Circle wallet
  -> credit parent USDC treasury
```

There is no destination local-token mint because the parent is country-neutral.

### Accounting invariant

Mock local tokens must not create additional value. Each local balance is a representation of the USDC backing allocated to that branch. A transfer must have one shared identifier linking its reservation, local-token burn, USDC transaction, local-token mint, and activity entries.

For the hackathon, use fixed rates already defined by the application. Store the rate snapshot and both source and destination amounts on the transfer so the display never changes later.

## Approval behavior

Reuse the existing company approval policy:

- Below the source branch's approval threshold: execute immediately.
- At or above the threshold: create `PENDING_APPROVAL` and show it under Activity -> Approvals.
- Nothing burns or moves while approval is pending.
- A declined or expired request releases the reservation.

Activity has only `All activity` and `Approvals`. Remove the `Recipients` tab; recipient management remains part of the Pay flow.

## Status lifecycle

```text
DRAFT
  -> PENDING_APPROVAL (when required)
  -> QUEUED
  -> SOURCE_RESERVED
  -> LOCAL_DEBITED
  -> USDC_PENDING
  -> USDC_SETTLED
  -> LOCAL_CREDITED
  -> COMPLETED
```

Terminal alternatives are `DECLINED`, `EXPIRED`, `FAILED`, and `REVERSED`.

The UI should collapse technical intermediate states into three understandable labels:

- Waiting for approval
- Moving money
- Completed

If a later settlement step fails, keep the transfer in `Moving money`, show the failed stage in its details, and make the operation safely retryable. Do not silently change either displayed branch balance twice.

## Data required

### Internal transfer

Create one persisted internal-transfer record with at least:

- id and idempotency key
- root company id
- source company id and destination company id
- source and destination Circle wallet ids/addresses
- source and destination currency
- source local amount, destination local amount, and USDC amount
- fixed-rate snapshots
- approval decision and reason
- current status and failed stage
- burn, USDC-transfer, and mint transaction hashes
- simulated/testnet flags
- actor, approver, memo, and timestamps

### Branch bank display

Store a branch-scoped connected-bank display record containing bank name, account label, masked last four, currency, country, provider, and simulated flag. Never store a raw account number solely for this demo.

### Branch-scoped activity

Every payment source must carry or derive a company/branch id. Internal transfers create two projections with the same transfer id:

- Source branch: money out to destination branch
- Destination branch: money in from source branch

The parent activity feed can show both as one organization-level transfer. Branch feeds show only the projection relevant to that branch.

## Source eligibility

When `Move money` is opened on a destination branch, show only accessible accounts with a usable balance:

- Parent treasury
- Sibling country branches
- The current branch only when choosing a different destination

Each source option shows its name, available USDC, local equivalent when applicable, and connected bank label. Disabled sources explain whether the cause is insufficient funds, missing wallet, paused branch, or insufficient permission.

## Hackathon boundary

Must be clean:

- Dedicated branch route and navigation from Home/Branches
- Correct branch-scoped treasury and activity
- Parent-to-branch, branch-to-parent, and branch-to-branch demo paths
- Reused approval flow
- Fixed-rate snapshots
- Clear testnet/simulated labeling
- One linked settlement timeline with explorer links

May be simulated or seeded:

- Connected local bank accounts
- Final local-bank payout
- Recovery after an intentionally injected provider failure

Not required:

- Live FX pricing
- Production reconciliation
- Atomic cross-contract settlement
- Grandchild company nodes
- Multiple bank accounts per branch
- A separate recipients area

## Demo script

1. Open the parent Home page and show the global treasury plus Indonesia and Thailand branch balances.
2. Open Thailand and show its treasury, THB representation, connected bank, recent activity, employees, and spending methods.
3. Choose `Move money`, select Indonesia as the source, and preview the fixed IDR/USDC/THB path.
4. Submit an amount below the approval limit. Show mIDR burn, Arc USDC transfer, mTHB mint, and both branch activity entries.
5. Return to Thailand and show its increased available balance.
6. Repeat with a larger parent-to-Thailand transfer. Show it entering Approvals, approve it, and then show settlement.
7. Optionally return surplus from Thailand to the parent treasury to demonstrate the reverse direction.

## Sequenced future implementation prompts

### Prompt 1: branch detail foundation

Implement a monitoring-first `/branches/[branchId]` admin route using the existing Sancus design system. Link every branch card on Home and Branches to it. Show the selected branch's USDC treasury, mock local-token balance, fixed-rate local equivalent, connected-bank display, recent branch-scoped activity, employees, and spending methods. The parent is country-neutral and shows no bank or local currency. Keep this hackathon-focused and do not add grandchildren.

### Prompt 2: branch-scoped data

Add the minimum database/API changes needed to scope payments, collections, card purchases, QR/Pix spending, payouts, and activity to a company branch. Preserve current personal-account behavior. Build one unified branch activity response and show the funding account/bank on payment review and transaction details. Remove the Activity Recipients tab.

### Prompt 3: internal transfer persistence and approvals

Add an idempotent internal-transfer model and authenticated API for parent-to-branch, branch-to-parent, and branch-to-branch transfers. Validate both nodes belong to the same root company, enforce access, prevent self-transfer, snapshot fixed rates, reserve funds, and reuse the existing approval threshold. Pending approval must not burn, mint, or move funds.

### Prompt 4: settlement orchestration

Implement the internal settlement orchestration using the existing Circle wallets, `/api/wallet/transfer` behavior, and deployed mock-token helpers. Branch-to-branch burns the source mock token, moves USDC on Arc, and mints the destination mock token. Parent-to-branch skips the burn; branch-to-parent skips the mint. Persist every stage and transaction hash, make retries idempotent, and project exactly one debit and one credit into activity.

### Prompt 5: transfer experience

Add a themed `Move money` modal to branch detail. Show eligible parent/sibling sources with balances and connected-bank labels, fixed source/destination amounts, the settlement path, approval requirement, and final review. Keep the branch page monitoring-first. Use human labels in the main flow and expose Arc/token details only in an expandable settlement timeline.

### Prompt 6: hackathon verification

Verify the complete parent-to-branch, branch-to-parent, and Indonesia-to-Thailand paths with configured testnet wallets and mock tokens. Confirm balances and both activity projections update once, approval prevents early movement, retrying an idempotency key does not duplicate value, and failed steps remain visibly recoverable. Do not add a broad test suite; perform focused checks and document the exact demo reset steps.
