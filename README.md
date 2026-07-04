# FireRed BoxName Workbench

A **local-first personal workbench** for known FireRed box-name techniques. It
helps you choose a known action template, fill in the fields it needs, prepare
and review script input, present box-name output, keep provenance for
everything, and copy/print/export the result.

## Project status

**Phase 1 scaffold — hardening pass complete.** The app runs end-to-end locally:
Projects list, New Project wizard, Metadata, Checklist, Notes, Imported Text
Blocks, Validation, and Report preview/export, with local (IndexedDB)
persistence. Typecheck, unit tests, the no-network audit, and the production
build all pass, and CI runs them on every push and pull request. This pass was
a **scope and identity refactor**: the project name and boundaries were
brought in line with its actual purpose. The action-template builder and any
generator adapter are **explicitly deferred** to a future branch — see
[docs/scope.md](./docs/scope.md).

## Scope

This app is a local-first personal tool for:

- choosing known FireRed action templates,
- filling in the user-facing fields those templates need,
- preparing and reviewing script input,
- presenting box-name output,
- preserving provenance,
- copying, printing, and exporting output.

See [docs/scope.md](./docs/scope.md) for the full scope statement.

## Boundaries

- **No route discovery** — this tool does not search for or propose new
  routes, setups, or techniques.
- **No new exploit research** — it only works with known, already-documented
  techniques you bring to it via templates or imported text.
- **No network calls** — everything runs locally; see "Offline by
  construction" below.
- **No hidden or background execution** — every action is something you
  directly triggered, and nothing runs invisibly.
- **No ROM, save-file, or emulator handling**, unless explicitly added in a
  future branch with its own scope review.
- **Existing local scripts/generators are the source of truth** — this app
  does not reimplement or silently alter what an external script produces; it
  prepares input for it and helps you review its output.
- **All output must be reviewable and stored with provenance** — nothing is
  presented, copied, printed, or exported without a record of where it came
  from.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the boundaries every change must
respect, and [docs/scope.md](./docs/scope.md) for the rationale behind them.

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
docs             project scope and boundaries
.github/workflows CI: npm ci, typecheck, test, audit:network, build
```

## Workflow (matches the product design)

1. **New project** — game locked to FireRed; pick revision/language labels, a
   title, a mode, and a read-only checklist template.
2. **Metadata / Checklist / Notes / Imports** — record and organize your work.
3. **Validation** — configure limits, run the formatting linter, review and
   acknowledge findings.
4. **Report** — open a printable report (Save as PDF via the browser) or export
   the project as JSON.
