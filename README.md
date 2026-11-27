# rapidbill-fe

React 19 + TypeScript + Vite + Tailwind. Two modes, chosen at build time by `VITE_API_URL`:
- **Not set (default):** frontend-only. All data lives in browser localStorage behind async services, no login. Tests and the live demo use this.
- **Set to the API origin** (e.g. `http://localhost:4000`): sign in / create account, and every service calls `rapidbill-be` (`src/services/http/`). The access token stays in memory, the refresh token in localStorage (single-flight refresh). On first sign-in the app offers to upload the data saved in this browser (`src/auth/migrate.ts`).

Try it locally with a throwaway database: in `rapidbill-be` run `npm run dev:memory`, then here `VITE_API_URL=http://localhost:4000 npm run dev`. Lists are read in full (all pages) and filtered in the browser; server-side search is a later optimisation.

```bash
npm install
npm run dev              # http://localhost:5173, seeds demo data on first load
npm test                 # unit tests: money, GST maths, billing service, importer, shortcut docs
npm run typecheck
npm run build
npm run docs:shortcuts   # regenerate SHORTCUTS.md after editing src/lib/shortcuts.ts
```

Keyboard reference: [SHORTCUTS.md](SHORTCUTS.md) (also press `?` in the app).

UI reference: [DESIGN_STANDARDS.md](DESIGN_STANDARDS.md) defines the shared Soft Blue palette, typography, components, spacing, accessibility, and review expectations for all frontend work.

## Structure

```
src/
  lib/          pure logic: money (paise), calc (GST), importer, invoice, words, format, hotkeys, shortcuts registry
  services/     async service layer, localStorage adapter, seed data. UI only imports `services`
  store/        zustand: UI prefs, toasts
  components/   ui/ (primitives), layout/, billing/, inventory/, parties/, print/
  pages/        one file per route
```

## Rules

- No `localStorage` outside `services/storage/`.
- All money is integer paise; format only at the edge.
- Anything that touches stock goes through a service that writes the ledger in the same step. Invariant: item stock equals the sum of its ledger entries.
- Shortcuts are declared once in `lib/shortcuts.ts`; the overlay and `SHORTCUTS.md` read from it (a test fails if the file is stale).

## Settings page data tools

*Reset demo data* restores the sample company, items, parties and vouchers. *Clear all data* empties items, parties, vouchers and stock history but keeps your settings. Both ask you to type a word first.

## Languages (English / Hindi)
Switch from the **EN | हिं** control in the top bar or in Settings. The invoice print language is a separate Settings option. Translations live in `src/i18n/locales/<lang>/<namespace>.json`; `npm test` fails if Hindi and English keys drift apart. Use `useTranslation('<namespace>')` in components and pass `t` into plain `lib/` code. Services throw `AppError(key, params)`, never English sentences.
