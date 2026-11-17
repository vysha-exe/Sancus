# Logo

The Logo is the Rising column: a column capital whose flutes step up like a growth chart, with the middle flute bent into an S route; it comes as a line mark for the lockup and a carved mark for icons.

**Markup:** line lockup `<span class="sx-lockup sx-wordmark"><svg><use href="#column"/></svg>SANCUS</span>`; carved mark alone `<svg><use href="#column-carved"/></svg>`. Set the ink with `color` on the `svg`. Size the lockup with `font-size`: 22px in the nav, 30px in the footer, 13px on the card.

**Which version where:**
- **Line** (`#column`): the lockup, the nav, the footer, the card, the pitch title slide and any large brand moment.
- **Carved** (`#column-carved`): the app icon, favicon, social avatar and anywhere the mark stands alone in a small square. The column sits off-center (x +7, y +3, size 0.94) so its capital breaks the disc's right edge. Never re-center it.

**Inks by ground:**
- `brand-limestone`, `surface-000`, `surface-100`: mark in `brand-deep`, wordmark in `ink`.
- `brand-night`: mark in `brand-signal` (soft patina), wordmark in near-white (#E4EAE6).
- `brand-deep` or `brand-verdigris`: everything in `brand-limestone`.

**Do:** keep clear space equal to the capital's height on every side; type SANCUS in capitals in the `wordmark` style (Newsreader 500, tracked 0.14em); use the carved mark at 16–64px.

**Don't:** round the corners further, reorder the flutes (they always rise left to right), mirror or rotate the mark, put the carved disc inside another shape, put the line mark in a box, or place either over the globe.

**Symbol definitions:** paste this once per page (it draws nothing), then reference the marks with `<use href="#column"/>` and `<use href="#column-carved"/>`.

```html
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="column" viewBox="0 0 64 64"><rect x="7" y="9" width="50" height="8.5" rx="1.5" fill="currentColor"/><rect x="12" y="20" width="40" height="3.6" rx=".6" fill="currentColor"/><rect x="13.2" y="27.5" width="4.6" height="12.5" rx="1" fill="currentColor"/><rect x="21.45" y="27.5" width="4.6" height="18.5" rx="1" fill="currentColor"/><path d="M32 27.5 C 26.5 31.5 37.5 35.5 32 39.5 L32 50" stroke="currentColor" stroke-width="4.6" stroke-linecap="butt" stroke-linejoin="miter" fill="none"/><rect x="37.95" y="27.5" width="4.6" height="26.5" rx="1" fill="currentColor"/><rect x="46.2" y="27.5" width="4.6" height="31.5" rx="1" fill="currentColor"/></symbol><symbol id="column-carved" viewBox="0 0 64 64"><defs><mask id="sx-carve" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#000"/><circle cx="32" cy="32" r="31" fill="#fff"/><g transform="translate(39 35) scale(0.94) translate(-32 -32)"><rect x="7" y="9" width="50" height="8.5" rx="1.5" fill="#000"/><rect x="12" y="20" width="40" height="3.6" rx=".6" fill="#000"/><rect x="13.2" y="27.5" width="4.6" height="12.5" rx="1" fill="#000"/><rect x="21.45" y="27.5" width="4.6" height="18.5" rx="1" fill="#000"/><path d="M32 27.5 C 26.5 31.5 37.5 35.5 32 39.5 L32 50" stroke="#000" stroke-width="4.6" stroke-linecap="butt" stroke-linejoin="miter" fill="none"/><rect x="37.95" y="27.5" width="4.6" height="26.5" rx="1" fill="#000"/><rect x="46.2" y="27.5" width="4.6" height="31.5" rx="1" fill="#000"/></g></mask></defs><rect width="64" height="64" fill="currentColor" mask="url(#sx-carve)"/></symbol></svg>
```

**Example:** [Logo.html](Logo.html) (the Rising column: line lockup on each ground, and the carved mark for icons).
