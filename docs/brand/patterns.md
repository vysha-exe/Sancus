# Page patterns

How Sancus pages are put together. Use these as the skeletons for wireframes, and check a new page against the checklist at the end.

## Marketing page

Every public page follows the same arc, from Night to Day:

1. **Nav (Night).** The lockup at left, up to four plain links, one primary button ("Open your account") at right. No mega-menus.
2. **Hero (Night, `space-24` padding).** Copy at left in five columns: `label` eyebrow, `display-xl` headline with one italic word, `body-l` lead in `ink-muted`, then one primary and one secondary button. The globe at right in six columns, bleeding off the edge.
3. **Rail ticker (Night).** One line of real-looking payments in local currencies, scrolling slowly, `data` style, amounts in `brand-signal`. Optional.
4. **Dusk fade.** The gradient from `brand-night` to `brand-limestone`, at least 200px.
5. **Proof row (Day).** Four figures in `amount-xl` with a `body-s` caption each. Only figures the team can stand behind; mark demo figures as illustrative.
6. **Explainer (Day).** `heading-1` at left, `body-l` at right, aligned to the bottom.
7. **How money moves (Day).** The five-stop flow: Top up → Hold → Convert → Pay out → Received, with who does each step (You, Circle, Sancus, local rail, recipient).
8. **Callout band (Night, `space-24` padding).** One `display-l` line, centered, over one lit object: the card stack with its pay button, or the globe. No more than one band per page.
9. **Detail sections (Day).** Feature by feature, one per section, alternating text-left and text-right.
10. **Footer (Day).** Lockup, links, the legal line, and the hackathon disclaimer while it applies.

## App shell

- **Day theme by default**, Night theme available in settings.
- **Desktop:** a 240px left rail on `surface-100` with the lockup, then Home, Pay, Card, Agents, Markets, then Settings at the bottom. Content area on `surface-000`, `content-max` wide.
- **Phone:** a bottom tab bar with Home, Pay, Card and More. The Pay tab is the accent-filled center tab.
- Screen titles are `heading-2`. There is one primary button per screen.

## Key screens

**Sign up (consumer).** Night, centered, one question per step, each asked like a person would ask it ("What's your email?", "Where do you live?"): email → verification code → legal name and country → home currency → "You're all set, Maya." The globe sits small behind the form at reduced opacity. Show progress as "Step 2 of 4" in `label`, not a bar.

**Home.** A greeting by first name in `heading-2` ("Good morning, Maya"). Then the balance in `amount-xl` with the `label` eyebrow "AVAILABLE BALANCE" and a `body-s` line for held funds and backing ("$500.00 held for cards · backed 1:1 by USDC"). Below it: Pay, Receive and Card buttons, then the latest payments as PaymentRows.

**Pay flow.** Four steps, each its own screen:
1. *Who:* search or pick a recent recipient.
2. *How much:* enter in USD or the recipient's currency; the other updates live.
3. *Review:* the FxQuote panel with the rate, fee, what they receive, the rail and arrival time, and the lock countdown. The primary button repeats the amount: "Pay R$ 541,23".
4. *Done:* the confirmation ring, one warm line ("Done. Juliana has her R$ 537,90."), then the receipt.

**Card.** The virtual card at top, then limit, spent this month, and recent card payments. Freeze and Change limit as secondary buttons.

**Receipt.** Amount and recipient at top in `heading-2`. Then every hop as a timeline: funded from balance, converted at rate, paid out by rail, received. Each hop shows its status pill and, where real, the transaction reference in `data`.

**Agents and Markets.** Placeholder names until the PRD settles them. Agents show their budget as a limit bar and every payment they make as a PaymentRow with an "Agent" rail chip. Market data revenue appears as incoming PaymentRows.

## Checklist for a new page

- Does it use only tokens from this system for color, type, spacing and radius?
- One `display` or `heading-1` headline, at most one italic word in it?
- One primary button per screen, using `accent`?
- Signal and glow only on Night grounds?
- Every amount formatted in its currency's locale, with tabular figures?
- Every status a pill with its word? Every simulated rail labelled Simulated?
- One moving thing at most, and a reduced-motion resting state?
- Works at 375px wide with no sideways scroll?
- Copy passes the voice table: warm and plain, first names, no infrastructure words, no emoji, rate and fee shown before confirm?
