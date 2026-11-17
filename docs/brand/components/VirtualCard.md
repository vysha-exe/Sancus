# VirtualCard

VirtualCard draws a Sancus card: deep patina with one softly lit corner, a faded Rising column watermark and the lockup.

**Markup:** a `.sx-card` holding `.sx-card__mark` (the large faded Rising column, line version), `.sx-card__top` (brand and limit), an empty spacer, and `.sx-card__foot` (holder name, last four digits, VIRTUAL). Add `--frozen` for a frozen card.

**Provide:** the holder name in capitals, the last four digits only, the limit, and the card type.

**Rules:** proportion 1.586:1, `radius-lg`, `shadow-card`. Never show a full card number, even in a mock. On Night marketing bands the card may be fanned with two siblings behind it (one frosted, one soft-patina `brand-signal`) and a pulsing pay button; in the app show one card, flat.

**Example:** [VirtualCard.html](VirtualCard.html) (the Sancus card: active and frozen).
