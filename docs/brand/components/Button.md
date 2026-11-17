# Button

Buttons start actions; there is one primary button per screen, and its label says exactly what will happen.

**Markup:** `<button class="sx-btn sx-btn--primary" type="button">Label</button>`. Variants: `--primary` (filled `accent`, text `on-accent`), `--secondary` (1px `line-strong` border), `--quiet` (text only, in `accent`). Add `--sm` for 36px buttons inside dense rows. Inside a `.sx-night` section, primary turns `brand-signal` with `brand-night` text.

**Labels:** a verb plus its object, in sentence case. Repeat the amount on payment buttons ("Pay R$ 541,23", not "Confirm"), and the name where it fits ("Pay Juliana"). On marketing pages use "Open your account", never "Get started" or "Sign up now".

**States:** hover lifts 1px; focus shows the 2px `focus` ring; disabled is 45% opacity with the reason shown nearby; loading keeps the width and changes the label ("Paying…").

**Don't:** put two primary buttons side by side; use icon-only buttons without an accessible label; use red for anything but a destructive confirm.

**Example:** [Button.html](Button.html) (primary, secondary and quiet, by day and by night).
