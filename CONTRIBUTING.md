# Contributing — scope boundaries (read first)

FireRed BoxName Workbench is a **local-first personal workbench** for known
FireRed box-name techniques: choosing action templates, filling in fields,
preparing and reviewing script input, presenting box-name output, and keeping
everything reviewable with provenance. See [docs/scope.md](./docs/scope.md)
for the full scope statement and rationale.

## Boundaries

These must remain true of every change. A PR that weakens any of these should
be rejected regardless of how convenient the feature seems.

- **No route discovery** — no searching for, proposing, or optimizing new
  routes, setups, or techniques.
- **No new exploit research** — only known, already-documented techniques the
  user brings to the app (via a template or imported text) are in scope.
- **No hidden network calls** — no XHR/WebSocket/EventSource/sendBeacon, no
  telemetry or analytics, no auto-fetch on launch, and no arbitrary URL
  fetching. `fetch` itself is allowed in exactly one place —
  `src/data/esharkRemote.ts` — for the explicit, user-triggered "Fetch
  E-Sh4rk scripts from GitHub" action, which only ever contacts
  `api.github.com`/`raw.githubusercontent.com` for the public `files_frlg`
  folder and never runs a generator. Do not add `fetch` (or any other
  network primitive) anywhere else, and do not widen what that one module
  fetches without updating this document and `scripts/check-no-network.mjs`.
- **No hidden or background execution** — every action is user-triggered and
  visible; nothing runs silently, on a timer, or without the user seeing it.
- **No ROM, save-file, or emulator handling**, unless explicitly added in a
  future branch with its own scope review.
- **Existing local scripts/generators are the source of truth** — this app
  does not reimplement, second-guess, or silently alter what an external
  script produces. Generator integration itself is a future branch; do not add
  it opportunistically inside an unrelated change.
- **All output must be reviewable and stored with provenance** — nothing is
  presented, copied, printed, or exported without a record of where it came
  from.

## This tool must always

- Store and display imported, filled-script, and pasted-back generator
  output text **verbatim** — no silent transformation of user- or
  script-provided text.
- Keep the validators in `src/core/validators.ts` **pure**: functions of their
  inputs that return `Finding[]`, never mutating inputs and never emitting
  content. The purity/determinism tests in `test/validators.test.ts` guard this.
- Stay **local-first with no hidden network calls**: no `XMLHttpRequest` /
  `WebSocket` / `EventSource` / `sendBeacon` anywhere, no telemetry, no
  auto-fetch, no arbitrary URL fetching. `fetch` exists only in
  `src/data/esharkRemote.ts`, gated behind an explicit user click.
  `npm run audit:network` and the CSP in `index.html` enforce this.
- Keep the runtime dependency count at **zero**. New dev dependencies should be
  rare and justified.
- Keep `src/reference/` catalogs **local and static**: checked in, never
  fetched or scraped at runtime, and manually reviewed before adding a new
  catalog or entries to an existing one. A catalog entry's `value` is the
  only thing ever stored/filled into a script — its display name is
  informational only, not an authority. Mark a catalog `partial: true`
  (and say so in the UI) rather than implying coverage it doesn't have.

## Definition of done for a change

- `npm run typecheck` passes.
- `npm test` passes (including the safety-contract tests).
- `npm run audit:network` passes.
- The change does not cross any boundary listed above.
