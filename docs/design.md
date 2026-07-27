# Design: pulse-analytics dashboard UI

Implementable directly with Tailwind and the tokens below. Every component supports light and dark themes and meets the accessibility rules at the end. The dashboard is a data product: numbers first, chrome recessive, nothing decorated.

## Design principles

- The numbers are the interface. Tiles and chart carry the page; everything else stays quiet.
- One accent hue for actions; chart series colors are reserved for data and never reused for UI.
- Every interactive element has visible hover, focus, disabled, and (where relevant) loading states; every data panel has loading, empty, and error states.
- Nothing shifts layout when data loads: skeletons occupy final dimensions.

## Color and theme

Tailwind `class` dark-mode strategy (`<html class="dark">`), tokens as CSS variables in `globals.css`, mapped to semantic names in `tailwind.config.ts`. Theme follows system preference on first load; the toggle persists to `localStorage` key `pulse-theme` and is applied by a blocking inline script to avoid flash.

### UI tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg` | `#f9f9f7` | `#0d0d0d` | Page background |
| `surface` | `#fcfcfb` | `#1a1a19` | Cards, panels, header, chart surface |
| `surface-2` | `#f0efec` | `#242422` | Skeleton base, subtle fills, hover wash |
| `border` | `#e1e0d9` | `#2c2c2a` | Card and input borders, hairlines |
| `fg` | `#0b0b0b` | `#ffffff` | Primary text |
| `fg-muted` | `#52514e` | `#c3c2b7` | Secondary text, labels |
| `fg-faint` | `#898781` | `#898781` | Axis ticks, captions, meta |
| `accent` | `#2a78d6` | `#3987e5` | Primary action, links, focus ring |
| `accent-fg` | `#ffffff` | `#0d0d0d` | Text on accent |
| `accent-hover` | `#1c5cab` | `#5598e7` | Accent hover |
| `success` | `#006300` | `#0ca30c` | Verified badge, positive delta |
| `danger` | `#d03b3b` | `#d03b3b` | Destructive actions, error text |

Body text and UI pairs target WCAG AA (>= 4.5:1 body, >= 3:1 large text and UI graphics); verify accent-on-surface and muted-on-surface in both themes during implementation.

### Chart tokens

These come from a palette validated for color-vision deficiency and contrast as an ordered set; do not substitute or reorder hues without re-validating.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `series-1` | `#2a78d6` | `#3987e5` | Pageviews line/area, breakdown bars |
| `series-2` | `#008300` | `#008300` | Unique visitors line |
| `grid` | `#e1e0d9` | `#2c2c2a` | Hairline gridlines |
| `axis` | `#c3c2b7` | `#383835` | Baseline/axis stroke |
| `axis-ink` | `#898781` | `#898781` | Tick labels |

Chart rules (binding):

- One y-axis, always zero-based for counts. Never a dual-axis chart.
- Lines 2 px; area fill for a single series only, at low opacity of its own hue. Points appear only on hover (crosshair), >= 8 px hit markers.
- Legend present when both series are shown (small color chip + label above the chart); a single-series chart needs no legend - the panel title names it.
- Text in charts wears text tokens, never series colors. Values, tick labels, and legend text use `fg`/`fg-muted`/`fg-faint`; the colored chip carries identity.
- Breakdown bars encode magnitude, not identity: every bar in a panel is `series-1` at one step. No rainbow lists.
- Crosshair + tooltip on the time series (bucket label, both values, matching chip colors); per-row hover on breakdowns. Tooltip: `surface` background, `border` hairline, shadow `md`.
- Numbers in table-like columns (breakdown values, tooltip values, axis ticks) use `font-variant-numeric: tabular-nums`; big standalone tile values use default proportional figures.

## Typography

System sans everywhere, including the big numbers: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. No display face, no serif, no webfont dependency.

| Role | Size | Weight | Notes |
| --- | --- | --- | --- |
| Stat tile value | 2.25rem (36px) | 700 | Proportional figures |
| Page title | 1.5rem (24px) | 650 | One per page |
| Panel title | 1rem (16px) | 600 | Card headers |
| Body | 1rem (16px) | 400 | Line height 1.55 |
| Label / meta | 0.875rem (14px) | 500 | Form labels, tile labels |
| Caption / ticks | 0.75rem (12px) | 400 | `fg-faint` |

## Spacing, radius, shadow

- Spacing on the 4/8 px system: Tailwind steps 1(4), 2(8), 3(12), 4(16), 6(24), 8(32). Card padding 16-24 px; grid gap 16 px; section gaps 24-32 px.
- Radius: `sm` 6 px (inputs, badges, code block), `md` 10 px (cards, buttons, tiles), `lg` 14 px (dialogs).
- Shadow: cards at rest none (border only, data apps stay flat); dialogs and tooltips `md` `0 6px 16px rgba(0,0,0,0.10)` (reduced opacity in dark, lean on borders).

## Layout

- Header: app name (links to `/dashboard`), nav (Dashboard, Sites), theme toggle, logout. Sticky, `surface`, hairline bottom border.
- Dashboard grid, max width 1100 px centered, 16 px gutters (24 px desktop): filter row (site picker + range picker) on one line above all panels; then a 2-tile KPI row; then the full-width chart panel; then the four breakdown panels in a 2-column grid (1 column below 768 px).
- Sites and login pages use a single centered column, max width 420 px (login) / 720 px (sites).

## Component states

### Stat tile
Card with label (`fg-muted`, 14 px) over value (36 px, `fg`). Multi-day ranges add the caption "unique visitors per day, summed" under the visitors tile in `fg-faint`. Loading: skeleton block matching value height. Empty (no data in range): value renders an em dash, not 0, with caption "no data in this range". Error: inline error text + retry link.

### Time-series chart panel
Panel title + legend row, then the uPlot canvas at a fixed 280 px height (no layout shift). Hover: crosshair + tooltip as specified above. Loading: skeleton of the full plot area. Empty: centered "No pageviews in this range yet" with a muted axis frame still drawn. Error: friendly message + retry button. A visually hidden (toggleable) data table mirrors the plotted points for screen readers.

### Breakdown list
Panel title, then up to 10 rows: key (truncated with ellipsis + `title` attr), proportional background bar (`series-1` at 12% opacity, width = value/max), pageview count right-aligned in tabular-nums. Row hover: `surface-2` wash. Loading: 5 skeleton rows. Empty: "Nothing recorded in this range". Error: message + retry. Country rows prepend the ISO code; direct traffic shows "(direct)".

### Range picker
Preset list (Today, Last 7 days, Last 30 days, Last 90 days) as a segmented control or menu. Selected: 600 weight + check, `surface-2` fill - selection is never color-alone. Hover: ghost wash. Focus-visible: 2 px accent ring, 2 px offset. Keyboard: arrow keys move, Enter selects.

### Site picker
Standard select/combobox listing site names with domain in `fg-muted`. Same hover/focus/selected treatment as the range picker. With one site it renders as a static label.

### Buttons
Variants: `primary` (accent), `secondary` (surface + border), `ghost`, `danger` (danger fill, only for confirmed destructive actions). Height 40 px (44 px touch on mobile).

| State | Treatment |
| --- | --- |
| Hover | `accent-hover` (or `surface-2` for secondary/ghost) |
| Focus-visible | 2 px `accent` outline, 2 px offset, never removed |
| Active | slight scale 0.98 |
| Disabled | 50% opacity, no hover, `aria-disabled` |
| Loading | inline spinner, width stable, `aria-busy`, label becomes e.g. "Saving..." |

### Inputs (login, site form)
Label above input, always visible. Border `border`; focus: accent border + ring; error: `danger` border + inline message below tied via `aria-describedby`; disabled: `surface-2` fill. Never placeholder-as-label.

### Snippet block
`<pre><code>` in `surface-2`, radius `sm`, 13 px monospace (`ui-monospace` stack), horizontal scroll on overflow, with a Copy button (secondary) that flips to "Copied" with a `success` check for 2 s and announces via `aria-live`.

### Verify status
Badge: "Waiting for first pageview" (`fg-muted`, subtle pulse while polling; pulse removed under reduced motion) flips to "Verified" (`success` + check icon). Icon plus text always - never color alone.

### Confirm dialog (delete site)
Modal on `surface`, radius `lg`, shadow `md`, focus-trapped, `Esc` cancels, focus returns to the trigger. Body names the site and states the data will be deleted. Actions: secondary "Cancel" (initial focus), danger "Delete site" with loading state.

### Empty, loading, error (shared)
`EmptyState`: small inline SVG glyph, one-line heading, one line of guidance, optional primary action ("Add your first site"). `Skeleton`: `surface-2` with subtle pulse, radius matching the real element, final footprint. `ErrorState`: calm copy ("Couldn't load this panel. Try again."), retry button, never technical detail.

## Accessibility baseline (required)

- Semantic HTML: `header`/`nav`/`main`, one `h1` per page, panels as `section` with headings, lists as lists.
- Every form input has a visible `<label>`; icon-only buttons have `aria-label`; the theme toggle announces its state.
- Full keyboard operability: pickers, dialog (trapped, `Esc`, focus return), copy button, chart's table alternative reachable by keyboard. Logical tab order, skip-to-content link.
- Focus visible everywhere: 2 px accent ring, 2 px offset; never `outline: none` without a replacement.
- Contrast: AA in both themes for text and meaningful UI graphics; chart series verified against both surfaces (tokens above are pre-validated as a set).
- Meaning never rests on color alone: legend chips pair with labels, statuses pair with icons/text, selection pairs with weight/check.
- `prefers-reduced-motion`: disables skeleton pulse, verify-badge pulse, and button scale; charts render without animation.
- Live updates (copy confirmation, verify flip) announce via `aria-live="polite"`.
