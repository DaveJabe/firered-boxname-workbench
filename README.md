# FireRed BoxName Workbench

A **local-first personal workbench** for known FireRed box-name techniques.
Open it, start with an action or import your own script, fill in a few
fields, and prepare reviewable box-name output — with provenance kept the
whole way through. It can save your work as a local workspace, but you're
never required to think about that before using it.

## Status

The workbench runs end-to-end locally, workbench-first: a landing screen for
starting an action, importing a script, loading the demo workspace, or
opening a recent one; an Action Builder (built-in mock templates or curated
schemas, a conservative script filler, and a manual paste-back flow for your
own external generator's output); a Script Library (import, scan, and curate
schemas for local `.txt` scripts); and secondary Saved Outputs, Validation,
Report, Settings, Checklist, and Notes screens. Typecheck, unit tests, the
network audit, and the production build all pass, and CI runs them on
every push and pull request. No generator invocation or subprocess execution
exists anywhere in the app. Network access is limited to one explicit,
user-triggered action — fetching E-Sh4rk scripts from GitHub — everything
else stays local; see [docs/scope.md](./docs/scope.md) for the full boundary.

## Scope

This app is a local-first personal tool for:

- choosing known FireRed action templates or curated schemas,
- filling in the user-facing fields those templates need,
- preparing and reviewing script input, including a conservative,
  header-only script filler,
- presenting box-name output — mock, filled-script, or pasted back from your
  own external generator,
- preserving provenance for everything,
- copying, printing, and exporting output.

Saved workspaces (local, IndexedDB) exist to hold this work between visits,
not as something to configure up front.

See [docs/scope.md](./docs/scope.md) for the full scope statement.

## Boundaries

- **No route discovery** — this tool does not search for or propose new
  routes, setups, or techniques.
- **No new exploit research** — it only works with known, already-documented
  techniques you bring to it via templates or imported text.
- **No hidden network calls** — network access only occurs when you
  explicitly fetch E-Sh4rk scripts from GitHub; no generator is run by
  fetching scripts. Everything else runs locally; see "Local by
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

## Local by construction

- No hidden network calls, no auto-fetch on launch, no telemetry, no
  arbitrary URL fetching. The only network operation is the explicit
  "Fetch E-Sh4rk scripts from GitHub" button in Manage Scripts
  (`src/data/esharkRemote.ts`), which only runs when you click it, only
  ever contacts `api.github.com` and `raw.githubusercontent.com`, and only
  ever reads the public `files_frlg` folder from the E-Sh4rk repository as
  plain text — it does not run a generator.
- The Content-Security-Policy in `index.html` reflects exactly that:
  `connect-src` allows only those two hosts; `XMLHttpRequest` / `WebSocket`
  / `EventSource` stay blocked outright everywhere.
- Zero runtime dependencies. The only dependencies are dev tools (Vite,
  TypeScript, Vitest).
- `npm run audit:network` greps `src/` for network primitives. It allows
  `fetch` only inside `src/data/esharkRemote.ts` and asserts that module
  only targets the approved GitHub hosts/constants — every other network
  primitive, and `fetch` everywhere else, still fails the build.

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

## Run the network audit

```bash
npm run audit:network   # fails on any unapproved network primitive/host in src/
```

## Layout

```
src/core         pure logic: types, normalizers, validators, review summary   (no I/O, no DOM)
src/templates    read-only checklist templates
src/reference    local, static reference-data catalogs (Gen III items/moves)
                 for friendlier dropdowns — never fetched or scraped
src/data         IndexedDB persistence, local JSON import/export, and the
                 one allowlisted E-Sh4rk GitHub fetch module
src/report       self-contained printable HTML report renderer
src/ui           screens and event handling
test             validator unit tests, including purity/determinism checks
scripts          network audit (allowlisted)
docs             workspace scope and boundaries
.github/workflows CI: npm ci, typecheck, test, audit:network, build
```

## Workflow (matches the product design)

1. **Landing** — start with an action, import a script, load the demo
   workspace, or open a recent one. A workspace is created silently in the
   background; you're never asked to fill in a title or revision first.
2. **Action Builder** — choose a built-in template or a curated schema, fill
   in its fields, and either generate a mock box-name sheet, preview a
   filled script to copy into your own generator, or paste that generator's
   output back in and save it with provenance.
3. **Script Library** — import a local `.txt` script, run the scanner to
   find candidate fields, and attach a curated schema so the Action Builder
   can use it.
4. **Saved Outputs / Validation / Report** — review everything you've saved,
   run the formatting linter, and open a printable report or export the
   workspace as JSON.
5. **Settings / Checklist / Notes** — workspace metadata and documentation,
   available whenever you want them but never required up front.
