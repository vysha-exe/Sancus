# Claude handoff: Business accounts, Team, B2C & backend-not-frontend UX

Paste into Claude to produce mid-fidelity HTML wireframes matching Sancus brand (`docs/brand/`) and existing canvas style (`docs/wireframes/*.dc.html`).

## Product facts

- **B2C (Personal):** one account. Hide Team, Branches, company chrome.
- **B2B:** company **tree** (root → branches → sub-branches, max 6). Each node has **one** independent wallet.
- Permissions **inherit down**; node-local membership overrides; children never manage parents.
- Roles: **Owner · Admin · Finance · Employee · Viewer**
- Employee **can pay within limits** (card/QR is extra, not the only path).
- Voice: warm, plain, sentence case, no emoji. Say *account* not wallet on everyday screens.
- Day theme for app. One primary button per screen. SIMULATED pills on fake rails.

## Capability matrix

| Role | Pay | Approve | Policies | Invite / roles | Create branch |
|---|---|---|---|---|---|
| Owner | yes | yes | yes | yes | yes |
| Admin | in limits | yes | yes | yes (not Owner) | yes |
| Finance | in limits | yes | no | no | no |
| Employee | in limits | no | no | no | no |
| Viewer | no | no | no | no | read-only |

## Already live (polish, don’t redesign)

- Branches tree create/view
- SG Pay flow, Approvals, Treasury setup, x402 earnings tile
- Collections / Pix / Xendit exist as bolted demo panels — wireframes should show them as **primary** UI

## Screens to produce / update

### A. Account type gate (new, after email code)
Personal vs Business. Progress labels differ by path length.

### B. B2C sign-up
Name/country → currency → done. No company/team.

### C. B2B sign-up (update existing)
Company → currency → invites (incl. Viewer) → done.

### D. Shell: workspace / branch switcher
Personal + company tree. Selecting a node scopes balances. Personal mode hides Team + Branches.

### E. Team (update Team.dc.html + Employee.dc.html)
- Branch context chip; **Inherited** badge on roles
- Invite sheet: email, role, this-node vs from-here-down
- Per-person limits (local currency) + USD approval note
- Change role / disable; Viewer read-only
- Assign card / Pix-QR / QRIS / PromptPay (`AssignMethod`)

### F. Settings policies (live)
Threshold amount + toggles that map to real policy fields; save/error states. Workspace shows live company name when business.

### G. Receive — local rails primary
“Get paid locally” for QRIS / PromptPay / Pix as first-class tiles (not a side demo). USDC address stays.

### H. Spending
Live spending-methods list + freeze; cards can stay Simulated until Marqeta. Xendit payout entry as secondary action.

### I. Invoices (BUILD)
Upload → extracted fields confirm → pay.

### J. Agents stretch
Chat + budget bar; voice session (mic → talk → agent replies). Earnings tile already exists.

### K. Cards hold/settle (BUILD DoD)
Issue card, hold on purchase, settle/release; Simulated until partner.

## Empty / errors
- No companies: Branches empty create
- Invite already member / Admin can’t grant Owner
- Depth 6 limit copy
- Policy save failure: own the problem, offer retry

## Deliverable
One `.dc.html` per new/changed screen; list replaced vs added files; keep Café Paulista / Lion City demo names.
