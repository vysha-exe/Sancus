# Sancus brand guidelines

Sancus is a US dollar account that pays anyone, anywhere, in their local currency. Sancus was the Roman god of oaths, and Rome kept its treaties in his temple. The product keeps a customer's money the same way: limits, holds and agent budgets are enforced by code, and every payment carries its receipt.

Use this book for every new page, wireframe and component. When something here conflicts with a one-off design, this book wins. Page layouts live in [patterns.md](patterns.md); tokens in [tokens.json](tokens.json) and [tokens.css](tokens.css); components in [components/](components/).

## The lines

- **Lead line:** *Money that keeps its word.* Use it in the marketing hero, the pitch title slide and the app store listing.
- **Supporting line:** *One account. Every rail. Every border.* Use it directly under the lead line or as a section opener. Never as the hero headline.
- Don't write new taglines per page. A page headline describes what that page does ("Pay a contractor in Brazil").

## Content fundamentals

**Voice: the friend who's great with money.** Warm, clear and exact. Plain words, contractions, the numbers up front, and a little warmth when something goes right. We're never jokey about money and never salesy. A good friend doesn't say "seamless" or "revolutionary"; they tell you what it costs and when it'll arrive.

- Address the customer as **you**, and use first names: theirs ("Good morning, Maya") and their recipient's ("Pay Juliana").
- Sancus speaks as **we** whenever it's doing something for you: "We'll lock this rate for 60 seconds."
- **Contractions are welcome**: you'll, we've, it's, didn't.
- **Celebrate quietly** when money lands: "Done. Juliana has her R$ 537,90." One short line, no exclamation marks in a row, no confetti.
- **Sentence case** for every headline, button and label in copy. The two exceptions are the SANCUS wordmark and `label` style eyebrows, which are uppercase by style, not by typing.
- **No emoji**, anywhere in product or marketing.
- **Disclose before confirming.** Every payment review shows the rate, the fee and what the recipient receives before the confirm button.
- **Name what the customer sees, never the infrastructure.** Say *account*, not wallet. *Pay*, not send transaction. *Rate*, not FX. *Arrives in seconds*, not block finality. Chain names (Circle, Solana, Base) appear only in the security page and the receipt detail.
- **Format money in the currency's own locale**: $1,000.00 · R$ 541,23 · MX$ 172.40 · € 9,20 · ฿350.00 · Rp 160.000. Always show the currency symbol or code.
- **Times are concrete**: "Arrives Wednesday", "within seconds", "Locked for 60 seconds". Never "soon" or "shortly".
- **Errors own the problem and offer the fix**, kindly and without groveling: "We couldn't find that Pix key. Double-check it, or pay Juliana by bank details instead."
- **Simulated rails are labelled**, always, with the Simulated pill. During the hackathon, never hide that a flow is a sandbox.

| Avoid | Write |
| --- | --- |
| Off-ramp USDC to BRL via Pix | Pay Juliana R$ 537,90 by Pix. Rate 5.4123, fee $0.80. |
| Tx confirmed on-chain! 🚀 | Done. Juliana has her R$ 537,90, and your receipt is saved. |
| Agent spend allowance exceeded | Your payments agent hit its $50 limit for the week. Want to approve this one? |
| x402 micropayment received | You earned $0.04 from market data today. |
| Connect wallet to continue | Welcome. Let's start with your email. |
| Insufficient funds | You're $40 short. Add money, or pay a smaller amount. |
| New era of banking, seamless and lightning-fast | Pay anyone abroad in their own currency. It arrives in seconds. |

## Visual foundations

### Color

The palette is bronze and its patina: Roman treaties were cut into bronze tablets, and bronze turns verdigris with age.

- **Two worlds.** *Night* (`brand-night` ground, `brand-signal` soft patina light) is for moments of arrival: the marketing hero, one callout band, the card reveal. *Day* (`surface-000` ground, `ink` text, `accent` actions) is for reading and doing. The app defaults to the **Day** theme with a full **Night** theme.
- **Dusk.** Marketing pages open at Night and fade into Day through a dusk gradient: `brand-night` → `brand-deep` → `brand-limestone`, at least 200px tall, with a faint `brand-signal` haze at the top. This fade is the signature move; use it once per page, at the first Night-to-Day change.
- **Accent** is the only action color. `accent` is verdigris by day and soft patina by night; put `on-accent` text on it.
- **Soft patina.** At night the light is a muted sage-teal (`brand-signal`, #8CC7B5). Never use a saturated mint, neon or lime in its place. It never touches a Day ground, where it fails contrast.
- **Glow is a halo, not a light show.** `shadow-glow` is soft and only on the one lit object per Night screen.
- **Bronze is rare.** Use `held` for reserved money and `brand-bronze` for at most one decorative highlight per screen.
- **Rough proportion on a screen:** 60% ground, 25% ink, 10% accent, 5% bronze.
- **Status colors** (`settled`, `pending`, `held`, `failed`) always come with their word in a pill. Never signal state by color alone.

### Type

Three voices, each with one job:

- **The wordmark: Newsreader in capitals** (`wordmark`). SANCUS only, weight 500, tracked 0.14em. It ties the logo to every headline; the Roman feel comes from the column and the copy, not the letters.
- **The CFO: Newsreader** (`display-xl` … `heading-3`, `amount-xl`). Every headline and the balance. Weight 400; let the optical size do the work.
- **The ledger: IBM Plex Sans and Mono** (`body-l` … `body-s`, `label`, `data`). Everything a customer reads to act: body, buttons, fields, amounts in lists, rates, references.

Rules:

- **One italic word per headline**, at most, on the word that carries the promise: "Money that keeps its *word*." "One card. *Settled* in local currency." On Night grounds the italic word may take `brand-signal`; on Day it stays `ink`.
- Never bold Newsreader. Never italicize Plex.
- Amounts use tabular figures (`font-variant-numeric: tabular-nums`) everywhere.
- Running text stops at `measure` (62ch).
- Headlines use `text-wrap: balance`.
- All three families are on Google Fonts. Load them with `family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500`.

### Spacing and layout

- Build on the 4px steps `space-1` … `space-24`. Use `gap` on flex and grid, not margins between siblings.
- Content sits in a `content-max` (1120px) column with at least `space-4` side gutters. Night bands and the hero bleed full width behind it.
- Day marketing sections get `space-18` vertical padding; Night bands and the hero get `space-24`.
- Every tappable control is at least `touch-min` (44px) tall.
- Layouts collapse to one column under 720px. The globe moves above the headline on phones.

### Shape, borders and depth

- **Borders, not shadows.** Panels are `surface-100` with a 1px `line` border and `radius-md`. Only the virtual card takes `shadow-card`, and only the one lit object on a Night screen takes `shadow-glow`.
- Buttons and pills are `radius-full`. Panels and inputs take soft corners (`radius-md`, `radius-sm`) so the app feels approachable. Rail chips stay `radius-xs`, square-ish like a stamp. The card is `radius-lg`.
- No gradients except the dusk fade, the card's patina, and the globe's sphere shading.

### Imagery

- The three brand images are **the globe** (a wireframe sphere with payment arcs), **the card** (deep patina, the Rising column, one softly lit edge) and **the Rising column** itself. Use these before reaching for anything else.
- No stock photos of people holding phones or cards. No coins, rockets, bitcoin glyphs or chain logos.
- Maps and flows are drawn as thin lines and dots, in `brand-signal` on Night or `accent` on Day.

### Motion

- **One moment moves per page.** On marketing pages it's the globe: slow rotation (about 7° a second), arcs that draw out from the customer's home city, and a pulse running along each arc. In the app it's the payment confirmation: one ring expands from the pay button, then the amount changes from USD to the local currency.
- Durations: 150ms for hover and press, 300ms for panels and sheets, 600ms for the confirmation ring. Ease out.
- No bounce, confetti, parallax or count-up numbers.
- Respect `prefers-reduced-motion`: show the globe's resting frame and skip the ring.

### States

- **Focus:** a 2px solid `focus` ring with 3px offset on every interactive element. Never remove it.
- **Hover:** buttons darken or lighten by one step and lift 1px; rows take `surface-200`.
- **Disabled:** 45% opacity and a not-allowed cursor. Say why nearby ("Add a recipient to continue").
- **Loading:** keep the button's width and replace its label with "Paying Juliana…" or similar. No spinners in the middle of the screen for anything under two seconds.
- **Empty:** name what will appear and invite the one action that fills it ("Nothing here yet. Your first payment will show up here.").

## The logo

- **The Rising column** is a single column capital. Its five flutes step up from left to right like a growth chart, and the middle flute bends into an S: the payment route. It says institution, growth and Sancus at once. Corners are nearly square (1.5 on the capital, 1 on the flutes) for structure.
- **Two versions.** The **line** mark draws the column on the ground; use it in the lockup and every large brand moment. The **carved** mark cuts the column out of a solid disc, pulled off-center (x +7, y +3, size 0.94) so the capital breaks through the right edge; use it for the app icon, favicon and avatars.
- **The lockup** is the line mark followed by SANCUS in `wordmark` (Newsreader capitals), with a gap of about 0.4 of the mark's width. The mark's height is about 1.45× the cap height.
- Inks: `brand-deep` on light grounds, `brand-signal` (soft patina) on Night, `brand-limestone` on `brand-deep` or `brand-verdigris`. The files are in [logos/](logos/).
- Clear space is the capital's height on every side. Minimum size is 16px for either mark alone, 96px wide for the lockup.
- Don't round the corners further, reorder or mirror the flutes, rotate the mark, re-center the carved column, or put either version in a box.

## Iconography

- No icon set has been chosen yet. Use **Lucide** at 1.5px stroke and 20px size as the working default, colored `ink` or `ink-muted`. This is a recommendation, not a brand asset.
- Rails are shown as **text chips** (PIX, ACH, SEPA, SPEI, USDC, CARD) using the RailChip component, never as provider or network logos.
- No emoji, no 3D icons, no filled duotone icons.

## Accessibility

- Text meets 4.5:1 on the grounds its token note names, in both themes. Control borders, focus rings and meaningful icons meet 3:1.
- Status always pairs a word with a color.
- Every amount has an accessible label with its currency spelled out ("541 reais and 23 centavos").
