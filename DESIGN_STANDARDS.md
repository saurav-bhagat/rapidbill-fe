# RapidBill — Soft Blue

The shared design for the web frontend: quiet powder-blue surfaces, a slightly deeper sidebar, matte blue actions, white working areas, and regular-weight slate text. These rules apply to existing and future screens, including account, business, license, reporting, and public entry pages.

## Source of truth

Colors live as RGB triplets in `src/index.css`; `tailwind.config.js` exposes semantic classes. Change tokens there instead of introducing page-specific colors. Shared controls live in `src/components/ui/`; shared navigation lives in `src/components/layout/`.

| Role | Token / class | Value |
| --- | --- | --- |
| Canvas | `paper` | `#F7F9FC` |
| Cards and table rows | `surface` | `#FFFFFF` |
| Sidebar | `nav` | `#D8E6F5` |
| Sidebar hover | `nav-hover` | `#CCDEF1` |
| Sidebar selected | `nav-active` | `#C2D7EE` |
| Primary action | `primary` | `#4F73A4` |
| Primary hover | `primary-hover` | `#40608D` |
| Soft emphasis | `primary-soft` | `#E6F0FC` |
| Panel header | `section` | `#F0F5FC` |
| Table header / inset area | `sunken` | `#EAF2FC` |
| Dividers | `line` | `#DAE4F0` |
| Headings | `heading` | `#405A79` |
| Body | `ink-900` | `#4A596C` |
| Supporting text | `ink-600` | `#52657B` |
| Muted text | `ink-400` | `#5E6F84` |
| Chart bars / current | `chart` / `chart-current` | `#ADC6E5` / `#6D95C8` |

Use `ok` / `ok-soft`, `warn` / `warn-soft`, and `danger` / `danger-soft` for their actual meanings. Keep `offer` for offers. Pair status colors with words or icons. Custom business avatars and print artwork can retain their own colors.

## Typography and hierarchy

- Inter is the main face; retain the existing Devanagari fallback for Hindi and Plex Mono for identifiers.
- Body 14px/20px, supporting labels 13px/18px, small metadata 12px/16px, panel titles 16px/24px, page introductions 22px/28px, summary values 28px/34px.
- Use weight 400 for body and large metrics, 500 for headings, labels, active navigation, and key values. Avoid repeated bold/black text in working screens.
- Use spacing and size to establish hierarchy. Keep numeric values right-aligned with tabular numerals; keep metric summaries left-aligned.
- Retain the text-size control and check English and Hindi. Never force fixed heights around wrapping headings or translated toolbar labels.

## Surfaces and spacing

- Main canvas uses `app-canvas`, a restrained pale-blue gradient. Gradients belong in summary areas, not table bodies or form fields.
- `page-toolbar` provides the shared white filter/action container. `summary-strip` provides the pale summary band. `metric-band` and `metric-tile` provide the responsive dashboard metrics.
- Use white cards with 1px `line` borders; 8–14px corner radii; `shadow-card` only for subtle elevation. Use `shadow-float` for floating panels.
- Use 16–24px page padding, 20px card padding, 12px toolbar padding, 8–12px between related controls, and 20–24px between sections.
- Keep table headers pale blue and rows white. Preserve existing selected-row, hover, warning, and focus cues.
- The virtual table uses 40px rows and a 36px header. Do not change their rendered heights independently of its virtualization geometry.

## Controls and navigation

- Reuse `Button`, `Field`, `Input`, `Select`, `Textarea`, `SearchInput`, `Segmented`, `Badge`, and the shared table components.
- A local primary action gets the matte blue fill. Supporting actions use white/ghost styling; the global New Stock Issue shortcut is secondary when another page owns the primary action.
- Sidebar text is slate, with a deeper blue selected fill and a left marker. Preserve the collapsed navigation, business switcher, account controls, and keyboard hints.
- Keep 36px standard controls, existing keyboard navigation, visible focus outlines, error labels, disabled states, and existing accessibility names.
- Drawer/modal headers use `section`; bodies stay white. Panels must fit the viewport and keep their existing scrolling and close behavior.
- Toolbars wrap rather than overlap. Settings sections stack at narrower widths. Data tables may scroll horizontally; surrounding page chrome must not force horizontal overflow.

## Boundaries and verification

Visual changes must not alter billing math, GST, discounts, stock, permissions, subscriptions, service calls, data formats, offline storage/sync, routes, or event handlers. Printed invoices, receipts, credit notes, and statements keep their black-on-white typography and sizing.

Before completing a frontend change:

1. Review the affected pages and shared overlays in the browser, including hover/selection/focus and empty/error states relevant to the change.
2. Check desktop (1440px), compact desktop (1024px), and tablet (768px); test collapsed navigation and readable translated labels. Check smaller public/auth pages when affected.
3. Check text contrast on its actual background. Target 4.5:1 for normal text and 3:1 for large text. Soft backgrounds must not mean low-contrast labels; keep status meaning visible without color alone.
4. Run the existing build and relevant tests; frontend-wide updates run `npm run build` and `npm test`.
5. Review the diff for accidental logic changes and preserve print styles. Save representative screenshots and state any account/backend verification limits.

Account pages also need a signed-in browser check against the configured API; demo mode does not cover the business switcher, account controls, reports, or license states. Check the account's actual data and status without changing records or purchasing a plan. In particular, report tabs and tables should scroll inside their cards, summary tiles should reflow, and license plans should stack until the content area can comfortably fit three cards. Preserve business avatar colors and visible trial, tax, and payment notices.
