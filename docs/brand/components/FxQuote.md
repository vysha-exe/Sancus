# FxQuote

FxQuote is the review panel that discloses the rate, fee, rail and the recipient's amount before any cross-currency payment.

**Markup:** a `.sx-panel.sx-quote` holding a `.sx-label` title, a `dl` of You pay / Rate / Fee / Rail, the `.sx-quote__receive` line with the received amount in Newsreader, the `.sx-quote__lock` countdown in `held`, and the primary Button.

**Provide:** the USD amount, the rate to four decimals, the fee, the rail and arrival time, the received amount in the recipient's locale, and the seconds left on the lock.

**Rules:** the button repeats the received amount. When the lock runs out, replace the button with "Refresh rate" and show the new rate; never charge on an expired quote. This panel is the brand promise made concrete: nothing is hidden before confirm.

**Example:** [FxQuote.html](FxQuote.html) (the review panel shown before every cross-currency payment).
