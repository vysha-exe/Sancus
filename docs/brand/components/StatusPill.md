# StatusPill

A StatusPill states where a payment is, always as a word plus a color.

**Markup:** `<span class="sx-pill sx-pill--settled">Settled</span>`. Modifiers and what they mean:
- `--settled` (`settled` on `settled-bg`): the money arrived.
- `--pending` (`pending` on `pending-bg`): on its way. Pair it with an arrival time.
- `--held` (`held` on `held-bg`, the UI's bronze): reserved but not spent, such as a card authorization or an agent's approved budget.
- `--failed` (`failed` on `failed-bg`): it didn't go through. Show the reason and next step nearby.
- `--simulated` (dashed `line-strong` outline, no dot): the rail is a sandbox. Show it beside any simulated payment, in addition to its real status.

**Don't:** invent new statuses or colors; use a pill as a button; drop the word and show only the dot.

**Example:** [StatusPill.html](StatusPill.html) (settled, pending, held, failed, simulated).
