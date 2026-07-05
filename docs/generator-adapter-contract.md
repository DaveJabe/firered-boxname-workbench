# Generator adapter contract (design note — not implemented)

This document describes where a future *real* generator adapter would plug
into the app. **Nothing described here is implemented.** No generator
invocation, subprocess execution, or Tauri integration exists in this
codebase — see [CONTRIBUTING.md](../CONTRIBUTING.md) and
[docs/scope.md](./scope.md) for the boundaries that keep it that way. The
type-only interface this note refers to lives at
[`src/core/generatorAdapterContract.ts`](../src/core/generatorAdapterContract.ts)
— it declares shapes only, has no implementation, and is not imported or
wired up anywhere in the running app.

## Where this fits in the existing pipeline

The app's current workflow already produces everything a real generator
would need, and already knows how to consume its output — the only missing
piece is the middle step, which stays manual today:

1. **Schemas produce filled script text.** A `CuratedActionSchema` (hand-
   reviewed, or built-in from a reviewed preset) maps user-facing fields to
   script variables. `fillScriptFromSchema` (`src/core/scriptFiller.ts`)
   conservatively substitutes those values into a script's header, and
   returns a `FilledScriptResult` — never touching body lines, never
   evaluating expressions, never inventing values.
2. **A future generator adapter would consume that filled script text.**
   The `RealGeneratorAdapterInput` shape in
   `src/core/generatorAdapterContract.ts` is exactly
   `FilledScriptResult.filledScriptText` plus the selected `GameTarget` and
   the schema's identifying metadata (`schemaId`, `schemaLabel`,
   `actionKey`) — everything a generator invocation would need to know
   *what* it's running and *for what target*, without this app inventing or
   guessing any of it.
3. **The output parser already consumes raw generator output.**
   `parseGeneratorOutput` (`src/core/generatorOutputParser.ts`) already
   turns pasted-back generator text into structured, reviewable rows. A
   future adapter's `RealGeneratorAdapterOutput.rawGeneratorOutput` is
   defined to be *exactly* the same shape of text a user pastes back by
   hand today — so the parser needs no changes to support it.
4. **Generator execution will be explicit and user-triggered.** Exactly
   like every other action-with-consequence in this app (script folder
   import, the GitHub fetch), a real generator adapter would only ever run
   when a user clicks a dedicated button. Nothing would invoke it on load,
   on a timer, or as a side effect of scanning/filling/reviewing.
5. **Manual paste-back remains supported.** Adding a real adapter later
   would not remove the paste-back flow (`src/core/generatorOutputParser.ts`
   plus the Action Builder's "paste back" card) — it's the fallback for
   anyone not using (or not trusting) the in-app adapter, and the reference
   implementation the adapter's output format is defined to match.

## The contract, at a glance

```ts
interface RealGeneratorAdapterInput {
  filledScriptText: string;   // from FilledScriptResult.filledScriptText, unmodified
  target: GameTarget;         // the target selected when the schema was run
  actionKey?: string;         // CuratedActionSchema.actionKey, if set
  schemaId: string;
  schemaLabel: string;
}

interface RealGeneratorAdapterOutput {
  rawGeneratorOutput: string;      // same shape as a manual paste-back
  stderr?: string;
  warnings?: readonly string[];
  provenance: {
    invokedAt: string;
    generatorDescription?: string; // whatever the user's own setup reports — never guessed
    target: GameTarget;
  };
}

interface RealGeneratorAdapter {
  run(input: RealGeneratorAdapterInput): Promise<RealGeneratorAdapterOutput>;
}
```

## What implementing this would actually require (future branch only)

Any real implementation of `RealGeneratorAdapter.run` would need its own
explicitly-scoped branch and its own scope review, because it would cross
boundaries this app has never crossed before — most likely subprocess
execution (or a Tauri command, or some other local-process bridge), since
"running the user's own generator" means executing code outside the
browser sandbox. That review would need to cover, at minimum: how the
generator binary/script is located (never a hidden auto-discovery), how its
exit code and `stderr` are surfaced, how failures leave existing local data
untouched, and how "explicit, user-triggered only" is enforced the same way
`src/data/esharkRemote.ts` enforces "explicit, user-triggered only" for
network access today. None of that is decided or started here — this note
only records the shape the input/output would need to have so that the
schema-filling and output-parsing halves of the pipeline don't need to
change when it eventually happens.
