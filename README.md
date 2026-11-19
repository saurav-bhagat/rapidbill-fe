# rapidbill-fe

React 19 + TypeScript + Vite + Tailwind. Frontend-only prototype: all data lives in browser localStorage behind async services (swap the adapter for an HTTP client when `rapidbill-be` exists, see `../docs/API-CONTRACT.md`).

```bash
npm install
npm run dev              # http://localhost:5173, seeds demo data on first load
npm test                 # unit tests: money, GST maths, billing service, importer, shortcut docs
npm run typecheck
npm run build
npm run docs:shortcuts   # regenerate SHORTCUTS.md after editing src/lib/shortcuts.ts
```

Keyboard reference: [SHORTCUTS.md](SHORTCUTS.md) (also press `?` in the app).

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
