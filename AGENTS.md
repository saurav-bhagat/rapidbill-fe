# Frontend conventions

For frontend UI work, follow [DESIGN_STANDARDS.md](./DESIGN_STANDARDS.md).
Use the shared semantic tokens in `src/index.css`, their Tailwind mappings, and existing UI primitives.
Keep visual work separate from calculations, service calls, permissions, offline sync, and persistence.
Preserve keyboard workflows and invoice print styles. Check relevant pages and responsive layouts after visual changes.

Run `npm run build` and `npm test` for changes spanning the frontend. See README.md for architecture and development commands.
