# Sancus brand

**Read this before building anything user-facing**: pages, screens, components, emails, copy, decks or demo UI. Follow these files over any default style, component library look or copy habit. If something you need isn't covered, pick the option closest to these rules and say what you assumed.

Sancus is a US dollar account that pays anyone, anywhere, in their local currency. The brand is a Roman god turned CFO who's on your side: calm, exact and warm.

## Files

| File | What it's for |
| --- | --- |
| [guidelines.md](guidelines.md) | The brand book: voice and copy rules, color, type, spacing, shape, imagery, motion, states, logo, icons, accessibility. |
| [patterns.md](patterns.md) | Page skeletons: marketing page, app shell, key screens (sign up, Home, Pay flow, Card, Receipt) and the checklist for a new page. |
| [tokens.json](tokens.json) | Every design token with a usage note: colors for Day and Night, type styles, spacing, radius, shadow, layout. The source of truth. |
| [tokens.css](tokens.css) | The same tokens as CSS variables and type classes, ready to import. Generated from `tokens.json`. |
| [components.css](components.css) | Styles for the components below (`sx-` classes). Import after `tokens.css`. |
| [components/](components/) | One `.md` per component (when to use it, markup, rules) and one `.html` working example. |
| [logos/](logos/) | The logo as SVG files, with a README saying which file goes on which background. |

## Using it in code

```html
<link rel="stylesheet" href="docs/brand/tokens.css">
<link rel="stylesheet" href="docs/brand/components.css">
```

- Use the variables (`var(--accent)`, `var(--space-6)`, `var(--radius-md)`) and type classes (`.heading-2`, `.body`, `.label`). Never hard-code a hex value, font size or radius that has a token.
- In Tailwind or another framework, map its theme to these variables instead of its default palette.
- **Themes:** Day is the default. Set `data-theme="night"` on `<html>` for Night; without it, Night follows the OS dark mode. Marketing heroes and callout bands use the fixed `brand-night` ground in both themes.
- **Fonts:** `tokens.css` loads Newsreader, IBM Plex Sans and IBM Plex Mono from Google Fonts.
- **Logo:** inline the symbols from [components/Logo.md](components/Logo.md), or use the files in [logos/](logos/).

## The rules that matter most

1. **Voice:** the friend who's great with money. Warm, plain, exact. Use first names, say "you" and "we", and use contractions. No emoji, no hype words, no exclamation-mark pileups.
2. **Name what people see, not the infrastructure:** say *account*, *pay* and *rate*, never *wallet*, *transaction*, *off-ramp* or *FX*. Chain names appear only on the security page and in receipt detail.
3. **Money:** always show the currency, format it in that currency's locale (R$ 537,90 · $1,000.00 · € 9,20), and use tabular figures.
4. **Disclose before confirming:** every payment review shows the rate, the fee and what the recipient gets before the button. The button repeats the amount ("Pay R$ 537,90").
5. **Type:** headlines in Newsreader at weight 400, with at most one italic word. Everything a person acts on (body, buttons, fields, amounts in lists) in IBM Plex Sans or Mono. The SANCUS wordmark is Newsreader capitals.
6. **Color:** `accent` is the only action color (verdigris by day, soft patina by night). `brand-signal` (soft patina) appears only on dark backgrounds. Bronze appears at most once per screen.
7. **Status:** always a pill with a word (Settled, Pending, Held, Failed). Sandbox rails always carry the **Simulated** pill.
8. **One primary button per screen.** Buttons and pills are fully rounded; panels and inputs have soft corners; rail chips are nearly square.
9. **Borders, not shadows,** except on the virtual card and the one lit object on a dark screen.
10. **One thing moves per page** (the globe on marketing pages, the confirmation ring in the app). Respect reduced motion.
11. **Accessibility:** text meets 4.5:1 contrast in both themes, there's a visible focus ring everywhere, and controls are at least 44px tall.
12. **Logo:** the Rising column. Use the line version next to the wordmark, and the carved disc version for icons. Never redraw, recolor outside the listed inks, rotate or mirror it.

Before you finish, run the checklist at the end of [patterns.md](patterns.md).
