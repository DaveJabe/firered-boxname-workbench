# FireRed Research Notebook

A **local-first documentation and formatting-review companion** for source-level
FireRed research. It helps you record metadata, work a checklist of setup
assumptions, keep notes, import pre-existing text you already have, run a
**formatting-only** linter over it, and print a report.

## Project status

**Phase 1 scaffold — hardening pass complete.** The app runs end-to-end locally:
Projects list, New Project wizard, Metadata, Checklist, Notes, Imported Text
Blocks, Validation, and Report preview/export, with local (IndexedDB)
persistence. Typecheck, unit tests, the no-network audit, and the production
build all pass, and CI runs them on every push and pull request. No Phase 2
feature work has started; the current focus is keeping the scaffold correct,
offline, and documentation-only.

## Scope: local-only and documentation-only

- **Local-only.** Everything runs on your machine. Data is stored in IndexedDB;
  import/export is via local files. There are no accounts, servers, or uploads.
- **Documentation-only.** The app records, organizes, formatting-checks, and
  prints *your own* text. It never generates, derives, or transforms game
  content. Text is only ever **user-typed, user-imported, or chosen from a fixed
  list**, and it is stored and displayed verbatim.

## Offline by construction

- A strict Content-Security-Policy in `index.html` sets `connect-src 'none'`,
  which blocks `fetch` / `XMLHttpRequest` / `WebSocket` / `EventSource`.
- Zero runtime dependencies. The only dependencies are dev tools (Vite,
  TypeScript, Vitest).
- `npm run audit:network` greps `src/` for network primitives and fails if any
  are present.

## Run locally

```bash
npm install    # one-time; installs the dev toolchain only
npm run dev    # start the local app at http://127.0.0.1:5175
```

Note: because the CSP blocks WebSockets, Vite's hot-reload does not fire in dev —
the app loads and works fully; just refresh the page after edits. To produce a
fully static, offline build:

```bash
npm run build   # outputs static files to dist/
npm run preview # serve the built dist/ locally to check it
```

## Run tests

```bash
npm test           # run the validator unit tests (Vitest)
npm run typecheck  # type-check without emitting
```

The tests include a safety-contract group asserting that the validators never
mutate their input and are deterministic.

## Run the no-network audit

```bash
npm run audit:network   # fails if any network primitive appears in src/
```

## Layout

```
src/core         pure logic: types, normalizers, validators, review summary   (no I/O, no DOM)
src/templates    read-only checklist templates
src/data         IndexedDB persistence + local JSON import/export
src/report       self-contained printable HTML report renderer
src/ui           screens and event handling
test             validator unit tests, including purity/determinism checks
scripts          no-network audit
.github/workflows CI: npm ci, typecheck, test, audit:network, build
```

## What this app explicitly does NOT do

- No generation engine — it does not produce, derive, or optimize any content.
- No assembler or disassembler; no byte/hex codec that transforms content.
- No route automation, planning, or optimization.
- No ROM, save-file, emulator, or packet handling.
- No network calls, telemetry, or analytics.
- No transformation of imported text into new game-related output — imported
  text is stored and shown verbatim, and the validators only report findings
  about its formatting.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the boundaries every change must respect.

## Workflow (matches the product design)

1. **New project** — game locked to FireRed; pick revision/language labels, a
   title, a mode, and a read-only checklist template.
2. **Metadata / Checklist / Notes / Imports** — record and organize your work.
3. **Validation** — configure limits, run the formatting linter, review and
   acknowledge findings.
4. **Report** — open a printable report (Save as PDF via the browser) or export
   the project as JSON.
