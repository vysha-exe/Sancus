# Balance

Balance shows the money a customer can spend right now, in Newsreader at `amount-xl`.

**Markup:** a `.sx-balance` holding a `.sx-label` eyebrow ("Available balance"), the `.sx-balance__amount` with the currency code in a `small`, and one `.sx-balance__meta` line.

On Home it sits under a first-name greeting in `heading-2` ("Good morning, Maya").

**Provide:** the available amount (after holds), the held amount, and the backing line. The meta line always says what is held and why.

**Rules:** tabular figures, two decimals, the code after the number. Drop to 44px on phones. Never animate the number counting up.

**Example:** [Balance.html](Balance.html) (the account balance, the first thing on Home).
