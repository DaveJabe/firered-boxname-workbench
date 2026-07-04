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
- **No network calls** — no `fetch`/XHR/WebSocket/EventSource/sendBeacon,
  remote assets, telemetry, or analytics.
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

- Store and display imported (and, once a generator adapter exists, script-
  provided) text **verbatim** — no silent transformation of user- or
  script-provided text.
- Keep the validators in `src/core/validators.ts` **pure**: functions of their
  inputs that return `Finding[]`, never mutating inputs and never emitting
  content. The purity/determinism tests in `test/validators.test.ts` guard this.
- Stay **offline**: no `fetch` / `XMLHttpRequest` / `WebSocket` / `EventSource`
  / `sendBeacon`, no remote assets, no telemetry. `npm run audit:network` and
  the CSP in `index.html` enforce this.
- Keep the runtime dependency count at **zero**. New dev dependencies should be
  rare and justified.

## Definition of done for a change

- `npm run typecheck` passes.
- `npm test` passes (including the safety-contract tests).
- `npm run audit:network` passes.
- The change does not cross any boundary listed above.
