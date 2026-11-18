# Notifications

Every event that can notify someone, who gets it and how. This is the spec behind the bell in the wireframes (`docs/wireframes/Notifications*.dc.html`, `SettingsNotifications.dc.html`).

## Model

One row per recipient per event.

| Field | Notes |
|---|---|
| `id` | |
| `user_id` | Recipient. Fan-out happens on write: one event, many rows. |
| `company_id`, `node_id` | Null for personal. `node_id` is the branch the event happened on; it drives the branch filter and scoping. |
| `type` | Dotted key from the catalog below, e.g. `approval.requested`. |
| `category` | `approvals`, `money_in`, `payments`, `spending`, `bills`, `agents`, `team`, `rules`, `security`, `account`. Drives filters and settings. |
| `priority` | `action` (someone must do something), `alert` (something went wrong or security), `info`. |
| `title`, `body` | Rendered at write time in the recipient's language. Amounts in USD plus local where the event has one. |
| `link` | Where clicking goes (the approval, the payment, the person). |
| `actor_id` | Who caused it, if anyone. Never notify the actor about their own action. |
| `subject_id` | The payout, card, invite, rule… the row points at. Used to resolve and to group. |
| `group_key` | Rows with the same key collapse into one ("4 card purchases at Pinheiros store"). |
| `created_at`, `read_at` | |
| `resolved_at` | For `action` rows: set when the thing is done by anyone (approved, declined, expired). Resolved rows leave "Needs you" for every approver at once. |
| `expires_at` | Optional; e.g. approval requests after 7 days. |

Delivery is per channel: **in app** (always), **email**, **phone push**, **daily digest**. A `notification_prefs` row per user per category per channel overrides the defaults below. A delivery log per channel keeps retries idempotent.

## Rules

- **Scope follows access.** Someone gets a company event only if their role covers the node it happened on (their node or above it, per inheritance). An Admin on São Paulo never sees Rio's events.
- **Role decides the type, not just the scope.** See the audience column. Finance gets approvals, not invites; Employees get only what is about them.
- **Never notify the actor.** Maya approving doesn't notify Maya.
- **Action rows resolve for everyone.** When Rafael approves, Maya's copy of the request resolves too, with "Approved by Rafael".
- **Locked on:** security alerts and failed payments can't be turned off in app or by email.
- **Group noise.** Card purchases, QR payments and money in under $50 group per method per hour. Digests summarise `info` rows only.
- **Personal accounts** get the same catalog minus approvals, team, rules and branches.
- **Quiet hours** delay phone push for `info`, never for `alert` or security.
- **Simulated rails** say so in the body ("Simulated"), same as the UI.

## Catalog

Audience: **Me** = the person it's about (requester, cardholder, invitee). **Appr** = anyone who can approve on that node (Owner, Admin, Finance). **Adm** = Owner and Admins on that node. **Own** = Owners. **All** = everyone with access to the node, Viewers included. **B2C** = also sent on personal accounts.

Defaults: ● on, ○ off, ■ locked on. Columns: in app / email / phone.

### Approvals (`approvals`)

| Type | When | Audience | Priority | Defaults |
|---|---|---|---|---|
| `approval.requested` | A payment, bill or agent spend needs sign-off | Appr | action | ● ● ● |
| `approval.reminder` | Still waiting after 24 h | Appr | action | ● ● ○ |
| `approval.expiring` | Expires in 24 h (requests last 7 days) | Appr, Me | action | ● ● ● |
| `approval.approved` | Someone approved it | Me | info | ● ○ ● |
| `approval.declined` | Someone declined it, with their note | Me | alert | ● ● ● |
| `approval.expired` | Nobody decided in 7 days | Me, Appr | alert | ● ● ○ |
| `approval.rate_moved` | Rate moved over 1% since the request; approver must re-confirm both amounts | Appr | action | ● ○ ● |
| `approval.resolved_by_other` | Silent: resolves other approvers' copies | Appr | — | — |

### Money in (`money_in`) · B2C

| Type | When | Audience | Priority | Defaults |
|---|---|---|---|---|
| `money_in.received` | Pix, QRIS, PromptPay, ACH, wire or USDC arrived | Appr, Me (personal) | info | ● ○ ● |
| `money_in.pending` | Seen but not final (ACH in flight, USDC confirming) | Appr | info | ● ○ ○ |
| `money_in.large` | Over a set amount (default $5,000) | Own | info | ● ● ● |
| `money_in.returned` | A deposit bounced or was reversed | Appr | alert | ■ ● ● |
| `money_in.qr_paid` | Someone paid your QR or charge link | Me, Appr | info | ● ○ ● |
| `money_in.charge_expired` | A QR charge expired unpaid | Me | info | ● ○ ○ |

### Payments out (`payments`) · B2C

| Type | When | Audience | Priority | Defaults |
|---|---|---|---|---|
| `payment.sent` | Submitted to the rail | Me | info | ● ○ ○ |
| `payment.settled` | Recipient got it | Me | info | ● ○ ● |
| `payment.delayed` | Past its expected arrival | Me, Appr | alert | ● ● ● |
| `payment.failed` | Rail rejected it; money is back in the balance | Me, Appr | alert | ■ ■ ● |
| `payment.returned` | Bounced after settling (wrong account) | Me, Appr | alert | ■ ■ ● |
| `payment.quote_expired` | 60 s lock ran out before submit | Me | info | ● ○ ○ |
| `payment.scheduled_upcoming` | Scheduled or recurring payment runs tomorrow | Me, Appr | info | ● ● ○ |
| `payment.scheduled_short` | Not enough balance for tomorrow's payments | Appr | alert | ● ● ● |
| `payment.refund_received` | A recipient sent money back | Me | info | ● ○ ○ |
| `payment.first_to_recipient` | First payment to someone new was sent | Adm | info | ● ○ ○ |

### Cards and QR spending (`spending`) · B2C for personal QR

| Type | When | Audience | Priority | Defaults |
|---|---|---|---|---|
| `card.issued` | A card or QR was given to you | Me | info | ● ● ○ |
| `card.purchase_held` | Authorised; amount held | Me | info | ● ○ ● |
| `card.purchase_settled` | Merchant settled; hold released | Me | info | ● ○ ○ |
| `card.hold_released` | Hold dropped without a charge | Me | info | ● ○ ○ |
| `card.declined` | Declined: over limit, over budget, frozen, blocked merchant type, country | Me | alert | ● ○ ● |
| `card.declined_repeat` | 3+ declines in an hour on one card | Adm | alert | ● ● ● |
| `qr.paid` | Paid by Pix QR, QRIS or PromptPay | Me | info | ● ○ ● |
| `spend.budget_80` | Monthly budget 80% used | Me, Adm | info | ● ○ ● |
| `spend.budget_reached` | Budget used up; method stops until it resets | Me, Adm | alert | ● ● ● |
| `card.frozen` / `card.unfrozen` | By someone else, or by the cardholder | Me, Adm | alert / info | ● ● ● |
| `card.limit_changed` | Limit or budget changed by someone else | Me | info | ● ● ○ |
| `holds.repriced` | Overnight FX re-price moved available balance more than 1% | Own | info | ● ○ ○ |
| `card.receipt_missing` | Purchase over $75 with no receipt after 3 days | Me | action | ● ● ○ |

### Bills and invoices (`bills`)

| Type | When | Audience | Priority | Defaults |
|---|---|---|---|---|
| `invoice.read` | Upload read; fields ready to confirm | Me | action | ● ○ ○ |
| `invoice.needs_review` | Low-confidence fields (IBAN, due date) | Me | action | ● ○ ○ |
| `invoice.unreadable` | Couldn't read the file | Me | alert | ● ○ ○ |
| `bill.due_soon` | Due in 3 days, not scheduled | Appr | action | ● ● ○ |
| `bill.overdue` | Past due, unpaid | Appr | alert | ● ● ● |
| `bill.paid` | Paid and settled | Me | info | ● ○ ○ |

### Agents (`agents`) · B2C

| Type | When | Audience | Priority | Defaults |
|---|---|---|---|---|
| `agent.needs_approval` | Agent wants to spend over its budget | Appr (personal: Me) | action | ● ● ● |
| `agent.budget_80` | Weekly budget 80% used | Adm | info | ● ○ ○ |
| `agent.paused` | Hit budget or paused by someone | Adm | alert | ● ● ○ |
| `agent.paid` | Agent paid an x402 endpoint (grouped daily) | Adm | info | ● ○ ○ |
| `agent.earned` | Other agents paid your endpoint (grouped daily) | Own | info | ● ○ ○ |
| `agent.task_done` | Agent finished something you asked (voice or chat) | Me | info | ● ○ ● |

### Team and access (`team`)

| Type | When | Audience | Priority | Defaults |
|---|---|---|---|---|
| `invite.received` | Email only: you were invited (to a non-member) | Me | — | email |
| `invite.accepted` | They joined | Adm (who invited) | info | ● ○ ○ |
| `invite.expiring` / `invite.expired` | 7-day link running out / ran out | Adm | info | ● ○ ○ |
| `member.role_changed` | Your role changed, and by whom | Me, Adm | alert | ● ● ● |
| `member.access_changed` | Your branch access widened or narrowed | Me | alert | ● ● ○ |
| `member.disabled` / `member.removed` | Access stopped | Me (email), Adm | alert | ● ● ○ |
| `member.joined_branch` | Someone got access to your branch | Adm | info | ● ○ ○ |
| `branch.created` / `branch.renamed` / `branch.moved` | Tree changed | Adm on parent | info | ● ○ ○ |
| `branch.archived` | Branch closed; its balance moved up | Adm, All on that branch | alert | ● ● ○ |
| `owner.transfer_requested` / `owner.transferred` | Ownership handover | Own, new Owner | action / alert | ■ ■ ● |

### Rules and settings (`rules`)

| Type | When | Audience | Priority | Defaults |
|---|---|---|---|---|
| `rule.changed` | Approval threshold or a rule toggle changed, old → new, by whom | Adm, Appr | alert | ● ● ○ |
| `rule.save_failed` | Didn't save (in-app only, to the person saving) | Me | alert | ● ○ ○ |
| `rail.enabled` / `rail.disabled` | Where you can pay changed | Adm | info | ● ○ ○ |
| `rail.outage` / `rail.restored` | A rail is down or back (incl. simulated) | Appr, Me with pending payments | alert | ● ○ ● |
| `workspace.changed` | Company name, home currency | Own | info | ● ● ○ |

### Security (`security`) · B2C

| Type | When | Audience | Priority | Defaults |
|---|---|---|---|---|
| `security.new_sign_in` | New device or location | Me | alert | ■ ■ ● |
| `security.failed_sign_ins` | 5+ failed codes | Me | alert | ■ ■ ● |
| `security.email_changed` | Sent to old and new address | Me | alert | ■ ■ ● |
| `security.api_key_created` / `revoked` | Keys for agents and integrations | Me, Own | alert | ■ ■ ○ |
| `security.sessions_ended` | Signed out everywhere | Me | alert | ■ ■ ○ |
| `security.admin_added` | Someone became Owner or Admin | Own | alert | ■ ■ ● |

### Account (`account`) · B2C

| Type | When | Audience | Priority | Defaults |
|---|---|---|---|---|
| `account.low_balance` | Under a set amount (default $500), or less than held + scheduled | Own, Appr | alert | ● ● ● |
| `account.verification_needed` | Go-live checks (CNPJ, CPF, documents) | Own (personal: Me) | action | ■ ■ ○ |
| `account.verification_done` / `failed` | Result of those checks | Own | alert | ■ ■ ● |
| `account.statement_ready` | Monthly statement | Own, Viewer, Finance | info | ● ● ○ |
| `account.export_ready` | A CSV or report you asked for | Me | info | ● ○ ○ |
| `account.limits_changed` | Sancus changed account limits | Own | alert | ■ ■ ○ |
| `account.terms_updated` | New terms to accept | Own (personal: Me) | action | ■ ■ ○ |
| `system.maintenance` | Planned downtime | All | info | ● ○ ○ |

## Who sees what, by role (company accounts)

| | Owner | Admin | Finance | Employee | Viewer |
|---|---|---|---|---|---|
| Approvals to decide | ● | ● | ● | — | — |
| Own requests' outcome | ● | ● | ● | ● | — |
| Money in | ● | ● | ● | — | — |
| Payments (others') failed or delayed | ● | ● | ● | — | — |
| Own cards and QR | ● | ● | ● | ● | — |
| Team spending alerts (budgets, repeat declines) | ● | ● | — | — | — |
| Bills | ● | ● | ● | own uploads | — |
| Agents | ● | ● | needs approval | — | — |
| Team and branches | ● | ● | — | about me | about me |
| Rules changed | ● | ● | ● | — | — |
| Security (own) | ● | ● | ● | ● | ● |
| Security (company: admins added, keys) | ● | — | — | — | — |
| Low balance, statements | ● | statements | ● | — | statements |
| Verification, terms | ● | — | — | — | — |

## Open questions

- Should Viewers get money in? Accountants might want it; default off.
- Do approval requests go to every approver at once, or first to the closest one on the node, then up after 24 h?
- WhatsApp as a channel for Brazil and Indonesia?
- Per-branch mute for people who see several branches.
