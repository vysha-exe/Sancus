# RailChip

A RailChip names the rail a payment used, in mono capitals inside a small square-cornered stamp.

**Markup:** `<span class="sx-rail">Pix</span>`. The style uppercases the text; type it in normal case. Use the rail's common name: Pix, SPEI, SEPA, ACH, Wire, PromptPay, QRIS, USDC, Card. Use **Agent** when an AI agent made the payment.

**Where:** in PaymentRow meta lines, on the review screen beside the arrival time, and on receipts.

**Don't:** use provider or network logos (Visa, Circle, Bridge); color-code rails; use a chip as a filter button without adding a selected state.

**Example:** [RailChip.html](RailChip.html) (how a payment travels, as a stamp-like text chip).
