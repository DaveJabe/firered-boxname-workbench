# Contributing — scope boundaries (read first)

This project is intentionally a **documentation and formatting-review** tool.
The following must remain true of every change. A PR that weakens any of these
should be rejected regardless of how convenient the feature seems.

## Forbidden scope

These capabilities are out of scope and must never be added:

- **No generation engine** — no producing, deriving, or optimizing content.
- **No assembler/disassembler** — and no byte/hex codec that transforms content.
- **No route automation** — no route planning, solving, or optimization.
- **No ROM/save/emulator handling** — no ROM patching, save-file editing,
  emulator control, or packet crafting.
- **No network calls** — no `fetch`/XHR/WebSocket/EventSource/sendBeacon,
  remote assets, telemetry, or analytics.
- **No transformation of imported text into new game-related output** — imported
  text is stored and displayed verbatim; validators only report formatting
  findings about it.

## This tool must never

- Generate, derive, assemble, or transform game content of any kind.
- Include an assembler, disassembler, byte/hex codec used for transformation, a
  code generator, a route planner/optimizer/solver, or an emulator/save/ROM
  interface.
- Map any character, label, or field to a numeric value, address, or identifier.
- Turn one text field into a *computed* text field. Text is only ever
  user-typed, user-imported, or selected from a fixed list.

## This tool must always

- Store and display imported text **verbatim**.
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
- The change does not add any capability listed under "must never" above.
