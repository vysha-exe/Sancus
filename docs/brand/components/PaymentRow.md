# PaymentRow

A PaymentRow is one payment in a list: who, how much, which rail, and where it stands.

**Markup:** inside `.sx-rows`, each `.sx-row` holds four children in this order: `.sx-row__who`, `.sx-row__amount`, `.sx-row__meta` (a RailChip plus the local amount, arrival time or reference), and `.sx-row__status` (a StatusPill).

**Provide:** the counterparty name, the USD amount with its sign (− out, + in; incoming adds `.sx-row__amount--in`), the rail, the local amount or arrival time, and the status. Add the Simulated pill for sandbox rails.

**Rules:** names truncate with an ellipsis; amounts never do. Rows are separated by `line` hairlines, not boxed as cards. The whole row opens the receipt and takes `surface-200` on hover.

**Example:** [PaymentRow.html](PaymentRow.html) (one line per payment: who, how, how much, where it stands).
