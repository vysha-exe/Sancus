# Sancus wireframes

Mid-fidelity wireframes for the hackathon app, built on the brand system in [`docs/brand`](../brand/README.md).

**Live canvas:** https://claude.ai/artifact/1k5yu7FxcaHHmAw8Y6ZzNT (private until shared from its Share menu). Press Play on any desktop screen to click through; the sidebar and the Pay flow link between screens.

This folder is the canvas source: one `.dc.html` file per screen, the canvas layout in `canvas.json`, and the shared layout layer in `sancus/app.css`. The screens also load `sancus/tokens.css` and `sancus/components.css`, which are copies of `docs/brand` and are not committed (see `.gitignore`).

## Screens

| # | File | Screen |
|---|---|---|
| 01 | `Onboarding.dc.html` | Open a business account (Night, one question per step) |
| 02 | `Main.dc.html` | Home: balance, approvals, latest payments, spending, bills, agents |
| 03 | `HomeEmpty.dc.html` | Home on day one: every tile's empty state |
| 04 | `Receive.dc.html` | Add money: move money in (ACH, Pix, USDC) or share your details |
| 05–08 | `PayWho`, `PayAmount`, `PayReview`, `PayDone` | Pay flow: recipient → amount and route → review (rate, fee, what they get) → done and receipt |
| 09 | `Activity.dc.html` | Ledger, with filters in the table header |
| 10 | `Approvals.dc.html` | Approval queue with a detail panel |
| 11 | `Invoices.dc.html` | Upload an invoice, pay bills (nice to have) |
| 12 | `Card.dc.html` | Spending: team cards and local QR (Pix, QRIS, PromptPay) |
| 13 | `Team.dc.html` | People, roles, limits, with filters in the table header |
| 14 | `Employee.dc.html` | One person: limits, cards and QR, activity, access |
| 15 | `AssignMethod.dc.html` | Give someone a card or local QR |
| 16 | `Agents.dc.html` | Assistant chat, payments agent budget, x402 paid endpoints |
| 17 | `Settings.dc.html` | Approval rules, workspace, rails, how money is kept |
| 18–19 | `PhoneHome`, `PhonePay` | Phone: Home and Pay review |

Demo data follows the README demo script for Café Paulista Ltda (Brazil). The numbers add up across screens: $10,000 in, $1,000 to Lumen Labs, $2,000 to Northwind (pending), $100.80 to Juliana, Ana's $100 card purchase and R$ 54,12 Pix QR payment, $398.86 held for Ana's card, $6,390.34 available, 3 approvals waiting ($2,620.05).

## Layout rules (`sancus/app.css`)

- **Shell:** header and sidebar share one ground; the logo sits above the sidebar. The sidebar shows icons and labels and collapses to icons from the control at its bottom (a CSS-only toggle; it doesn't persist between screens in the wireframes).
- **Grid:** one 12-column grid on every screen. Tiles in a row share a height, so edges line up whatever the data does. 12 columns above 1100px, 6 to 720px, 1 below.
- **Lists in tiles are capped** (5 on Home, 3 in side tiles) and end in "See all" with a count. Names truncate; amounts never do.
- **Every tile has an empty state** the same size (screen 03).
- **Pay flow:** title row, steps underneath, form on the left and the same summary panel on the right on every step.
- **Table filters live in the header cells** (Activity, Team).

## Product decisions made while wireframing

- **Card and QR limits and monthly budgets are in each person's own currency** (R$, Rp, ฿), so they match what people see at the till.
- **Per-payment approval limits stay in USD**, set by the account-wide approval rule in Settings.
- **Cards hold the rest of their limit in the balance; QR doesn't by default** (there's a toggle). Because the balance is in dollars and limits are local, **holds are re-priced every morning** and "available" can shift slightly overnight.
- **Approvals:** the rate locks when someone approves; if it moved more than 1% since the request, both amounts are shown first. Nobody approves their own request. Requests expire after 7 days.
- **Quotes:** rate is live until review, then locked for 60 seconds. When the lock runs out the button becomes "Refresh rate"; we never charge on an expired quote.
- **Chain names** (Arc, Circle) appear only in Settings › How your money is kept and in receipt detail.
- **Every non-USDC rail carries the Simulated pill.**

## From the GlobalPay admin mockups

The teammate mockups' functionality is folded in with Sancus UX: Overview chart and Add funds → Home and screen 04; Activity tabs and Approvals → 09, 10; Recipients → Pay step 1; Payment methods → Settings › Where you can pay; employee profile, local QR and Issue card → 12–15; x402 and Assistant → 16; approval threshold and workspace → 17.

Left out on purpose: **Convert** (unclear what it converts) and the **network picker on Home** (chain names stay off everyday screens).

## Open questions

- What does "Convert" need to do, if anything?
- Should the collapsed sidebar be remembered per user?
- Status for a frozen card or paused QR: the brand's status list (Settled, Pending, Held, Failed) doesn't cover it, so it's plain text for now.

## Editing and republishing

Edit the `.dc.html` files or `sancus/app.css`, then copy `docs/brand/tokens.css` and `docs/brand/components.css` into `sancus/` and publish the folder to the canvas URL above.
