# UI structure — `src/ui/app.ts` (technical debt note)

`src/ui/app.ts` is currently ~3,100 lines and is the single file behind the
whole UI: module-level `state`, one `render()` dispatcher keyed on
`state.screen`, one render function per screen (`renderActions`,
`renderScripts`, `renderOutputs`, `renderChecklist`, `renderNotes`,
`renderValidation`, `renderReport`, `renderSettings`, `renderAdvanced`,
`renderLanding`, `renderStartHere`), and two large event-delegation
functions (`handleClick`, `handleChange`) that switch over `data-action`
across every screen.

## Why it hasn't been split yet

A clean split (e.g. `render/actions.ts`, `render/scripts.ts`,
`render/outputs.ts`, `events.ts`, `state.ts`) is plausible in principle, but
isn't a small change today:

- Every render function and event handler closes over the same
  module-level `state` object and shared helpers (`commit()`, `render()`,
  `jumpTo()`, binding helpers) — splitting cleanly means either passing
  `state` around explicitly everywhere (a real refactor, not a mechanical
  move) or introducing a shared state module that every new file imports
  from, which is itself a design decision worth its own review.
- `handleClick` (~550 lines) and `handleChange` dispatch across every
  screen's actions in one switch each. Splitting them per-screen risks
  silently dropping or misrouting a `data-action` case during the move.
- This branch (`experiment/streamline-run-script-ux`) already makes many
  behavior changes to this same file (compact catalog view, status strip,
  duplicate-fetch handling, newline preservation). Combining that with a
  structural file split in the same branch would make any regression much
  harder to bisect.

Given the instruction not to combine a risky refactor with behavior changes
unless the split is straightforward, and given the above, this branch
leaves `app.ts` as one file and records the split as future work instead.

## A reasonable future split

If/when this is tackled on its own branch (no behavior changes in the same
diff):

1. Extract a `state.ts` holding the `AppState` shape, its initial value, and
   the small pure helpers that only read/write it directly (`commit`,
   `resetViewState`, binding setters) — everything else imports `state`
   from there instead of the module scope of `app.ts`.
2. Extract one render module per screen group, mirroring the sidebar tabs
   already defined in `src/ui/navigation.ts` (`actions`, `scripts`,
   `outputs`, `advanced`) — each imports `state` and shared render helpers
   (`escapeHtml`, `attr`, `targetLabel`, etc., which can move to a small
   `render/shared.ts`).
3. Split `handleClick`/`handleChange` last, once the render modules exist,
   by grouping cases per screen and re-exporting a single dispatcher from
   `events.ts` that `app.ts` (now just wiring + `render()`) calls into.
4. After each step, run `npm run typecheck && npm test` and do a manual
   pass over every screen before moving to the next step — this is the
   part worth doing incrementally rather than in one large diff.
