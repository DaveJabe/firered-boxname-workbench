# Local generator adapter POC (private, local-only experiment)

**This is private local experimentation, not a shipped feature.** Nothing
here is wired into the main Run Script flow, nothing here is enabled by
default, and the upstream generator's license is unresolved — see
[docs/generator-adapter-spike.md](./generator-adapter-spike.md) for the
research this builds on. Read that document first if you haven't; this one
assumes its conclusions.

**Disclaimer:** this app is an independent helper UI, not affiliated with,
endorsed by, or maintained by E-Sh4rk. E-Sh4rk's own CodeGenerator remains
the source of truth for anything it produces. See
[docs/attribution.md](./attribution.md) for the full statement. Manual
paste-back stays the supported public path regardless of anything below —
what follows is a private, local-only, artifact-guarded exception requiring
a developer to supply their own untracked copy of the generator artifact,
never something this app ships or enables by default.

## What this is, in one paragraph

`src/experimental/localEsharkGeneratorPoc.ts` calls a **local, untracked**
copy of E-Sh4rk's compiled generator artifact (`ace_js.bc.js`) that a
developer places on their own machine, outside of what this repo commits.
It's reachable only through a dev-only panel in Advanced, gated by a
localStorage flag nobody sets by accident. It proves the adapter shape from
the spike doc is real and callable — it does not make this app depend on,
ship, or redistribute anything from E-Sh4rk.

## Do not commit or publish the artifact

`ace_js.bc.js` has no license anywhere upstream (checked via GitHub's own
license-detection API on both `E-Sh4rk/CodeGenerator` and
`E-Sh4rk/CodeGeneratorOffline` — both empty). The paths below are gitignored
specifically so this stays true by construction, not by discipline alone:

```gitignore
public/local-eshark-generator/
.external/
.local-generator/
```

Never `git add -f` anything under these paths. Never paste the artifact's
contents into a commit, an issue, a PR description, or anywhere else that
gets published.

## Setting it up locally

You need a copy of `ace_js.bc.js` that exposes a global `aceGen.build`/
`aceGen.buildNext`. Two ways to get one — pick based on what you already
have installed:

### Option A — build it yourself from source

This is what upstream's own README documents (`E-Sh4rk/CodeGenerator`).
Clone it **outside this repo**, or into a path this repo already ignores
(e.g. `.external/CodeGenerator`) so an accidental `git add .` can't catch it:

```sh
git clone https://github.com/E-Sh4rk/CodeGenerator.git .external/CodeGenerator
cd .external/CodeGenerator
opam init
opam switch create 5.3.0
opam install dune ppx_deriving num js_of_ocaml-compiler js_of_ocaml-ppx
make js
```

`make js` produces `html/ace_js.bc.js`. Copy that one file into this repo's
ignored path:

```sh
mkdir -p public/local-eshark-generator
cp .external/CodeGenerator/html/ace_js.bc.js public/local-eshark-generator/ace_js.bc.js
```

Note: this path requires a real OCaml toolchain (opam + a compiled switch),
which can take a while to set up and needs `opam.ocaml.org` to be reachable
— it won't work in a network-sandboxed environment that only allow-lists a
handful of hosts.

### Option B — use an already-built copy

If you already have a working copy of `ace_js.bc.js` (e.g. from running the
live tool once, or from someone who built it via Option A), just place it
at the same path:

```sh
mkdir -p public/local-eshark-generator
cp /wherever/you/have/it/ace_js.bc.js public/local-eshark-generator/ace_js.bc.js
```

Either way, the file must end up at exactly:

```
public/local-eshark-generator/ace_js.bc.js
```

Vite serves everything under `public/` at the site root, so in dev this
resolves to `http://127.0.0.1:<port>/local-eshark-generator/ace_js.bc.js` —
the exact path `LOCAL_GENERATOR_ARTIFACT_URL` in
`src/experimental/localEsharkGeneratorPoc.ts` expects.

## What the artifact exposes

Loading it (however it gets loaded — see "Adapter strategy" below) attaches
a global:

```js
aceGen.build(lang, game, code, exitCodes) // -> [result: string[] | null, logText: string]
aceGen.buildNext(lang, game, code, exitCodes) // same shape, "compute another"
```

- `lang` — one of `eng1`/`eng0`/`spa`/`fra`/`ita`/`ger`/`jap1`/`jap0` (plus
  `*10` Switch variants this app doesn't target).
- `game` — `fr` or `lg`.
- `code` — the filled main script text (`FilledScriptResult.filledScriptText`,
  unmodified).
- `exitCodes` — the **entire** shared exit-codes companion text (upstream
  `files_frlg/exit.txt`), not just the one named section a script's
  `@@ exit = "..."` header refers to — the generator looks that name up
  internally. See "Exit companion" below.
- Return: a 2-tuple. This app only reads the second element (`logText`) —
  the same human-readable report text a manual paste-back already contains,
  fed straight into the existing `parseGeneratorOutput`. The first element
  (a structured string array) is unused by the reference UI too and this
  adapter ignores it.

## Adapter strategy: what actually worked

Task 4 asked to try, in order: (A) Web Worker, (B) sandboxed iframe, (C)
direct script tag only if the others aren't viable. **A Web Worker works**,
with one real wrinkle worth recording because it cost real debugging time:

- A **module** worker (`new Worker(url, { type: 'module' })`) loading a
  `.ts` file through Vite's dev server broke in a different way: Vite's
  dev-time import-analysis rewrites `import()` calls — even dynamic ones on
  a runtime string with `/* @vite-ignore */` — which corrupted the request
  for the artifact's own URL.
- A **classic** worker (no `type: 'module'`) loading that same `.ts` file
  through Vite's dev server failed to parse at all: Vite/esbuild append an
  `export {}` marker to *any* `.ts` file requested this way (even one with
  zero exports of its own, and even with only `import type` — which should
  fully erase), and `export` is a syntax error in a classic script.
- **What actually works**: the worker itself is a **plain static
  JavaScript file under `public/`**
  (`public/local-generator-poc-worker.js`), never passed through Vite's
  transform pipeline in dev *or* in a production build, using plain
  `importScripts(artifactUrl)` — exactly the same mechanism the reference
  E-Sh4rk page itself uses. This is genuinely the simplest of the three
  options once the Vite-specific wrinkle is known, and it matches Task 4's
  predicted order (Worker first) — options B and C were never needed.

The worker holds no third-party code — it's ~50 lines of original glue that
loads whatever's at a given URL and forwards `aceGen.build`'s result back
via `postMessage`. The request/response message shapes are typed on the
main-thread side in `src/experimental/localEsharkGeneratorProtocol.ts` (the
plain-JS worker file matches that shape by hand, since it can't `import`
from a `.ts` file either).

## Exit companion: the gap, and what this POC does about it

Every one of the six named review-case scripts (`TeachAnyMove`,
`StartWildBattleWithAnyPokemon`, `CreateAnyGiftPokemonBootstrapped`,
`ChangeLevel`, `PokemonFromNothing`, `GetAnyItem`) declares an
`@@ exit = "Bootstrapped"` or `@@ exit = "GrabACEExit"` header directive.
The generator resolves that name against the **entire** exit-codes
companion text it's given — not a lookup this app does itself.

This app's existing pipeline (`esharkRemote.ts`, `fillScriptFromSchema`)
has never fetched or stored that companion text; it only handles each
script's own main file. That's a real, pre-existing gap this POC does not
try to close permanently. For this experiment, the minimum viable thing was
implemented instead: **the dev-only panel has a plain textarea where you
paste the full upstream `files_frlg/exit.txt` contents by hand** before
clicking "Run local generator POC". `runLocalGeneratorPoc` warns (doesn't
error) if that field is empty, since an empty companion is a valid — if
unlikely to succeed — input as far as the adapter itself knows.

A permanent fix (fetching and caching the shared exit-codes file the same
way `esharkRemote.ts` fetches script files) is a reasonable follow-up but is
explicitly **not** built here — it would be new, permanent product surface,
which this task scoped out ("do not overbuild... unless simple and clean").

## What was actually verified

Using a real, personally-obtained `ace_js.bc.js` (Option B above) and the
real upstream `files_frlg/exit.txt`, all three requested actions were run
through the full app UI — fetch real E-Sh4rk scripts from GitHub, apply the
existing reviewed presets, fill the script via Run Script, then run the
local generator POC panel in Advanced:

| Action | Artifact detected | Result |
|---|---|---|
| `ChangeLevel` | Detected | 11 `Box N:` rows, 0 errors, 0 warnings |
| `GetAnyItem` | Detected | 11 `Box N:` rows, 0 errors, 0 warnings |
| `StartWildBattleWithAnyPokemon` | Detected | 11 `Box N:` rows, 0 errors, 0 warnings |

No saved *real* manual review-case output exists to diff against — every
existing review-case fixture in this codebase intentionally uses synthetic
placeholder text (e.g. `Box 1: TOYNAME1 [abcdef]`), by design, per this
project's "toy fixtures only in tests" convention. Output stability was
checked instead by re-running the same inputs and confirming byte-identical
`logText`, which held across repeated runs with the same script/target/exit
text — consistent with the generator resetting its own module-level state
(`Settings.configure`/`Optimizer.init()`) at the top of every `build` call,
as found in the spike doc.

## How the panel fails gracefully

- **Artifact missing**: "Check for local artifact" reports "Not found" and
  the setup steps above; nothing else breaks, and manual paste-back is
  completely unaffected.
- **`aceGen` missing after load**: reported as a specific error string
  distinct from "not found" (`missing-acegen` stage) — helps tell "wrong
  file at that path" apart from "no file at that path".
- **`aceGen.build` throws**: caught inside the worker, reported as a
  `build-threw` stage with the thrown message, never an unhandled
  rejection or a broken panel.
- All three are exercised by mocked, artifact-free tests in
  `test/localEsharkGeneratorPoc.test.ts`.

## Safety guards

This experiment is only as safe as its guards, not as safe as good
intentions — so there are three independent, mechanical ones, each covering
a different way the unlicensed artifact could otherwise leak out.

### 1. The production build refuses to run if the artifact is present

Vite copies everything under `public/` into `dist/` **verbatim** as part of
any build — gitignore only governs `git`, not that copy step. Left
unchecked, that means the exact same disk state that makes the dev-only
panel work locally would also get baked straight into `dist/`, ready to be
deployed or published by anyone who doesn't know to check first.

`npm run build` now runs
[`scripts/check-no-local-generator-artifact.mjs`](../scripts/check-no-local-generator-artifact.mjs)
before anything else (`tsc`, `vite build`). It checks these paths for any
content and **fails the build** (exit 1, clear message, nothing built) if
any of them exist:

- `public/local-eshark-generator/ace_js.bc.js`
- `public/local-eshark-generator/` (the directory generally, in case the
  artifact ever gets renamed or a sibling file appears there)
- `.external/`
- `.local-generator/`

The default is fail-closed on purpose: **a normal `npm run build` on a
machine with the local artifact present will not produce a `dist/`.** The
only way past it is an explicit, deliberately unwieldy environment
variable, meant only for your own private local experiments — never for a
build whose output might be shared, deployed, or published:

```sh
FBW_ALLOW_LOCAL_GENERATOR_ARTIFACT=1 npm run build
```

If you use that override, the resulting `dist/` **does** contain the
artifact (see the copy-verbatim behavior above) — treat that `dist/` as
private too, same as the artifact itself. Run
`npm run guard:no-local-artifact` any time to check current disk state
without doing a full build.

### 2. Committing the artifact is blocked even with `git add -f`

`.gitignore` stops a plain `git add .`/`git add public/` from picking up
the artifact, but doesn't stop a deliberate or accidental `git add -f`.
[`scripts/check-artifact-not-tracked.mjs`](../scripts/check-artifact-not-tracked.mjs)
checks `git ls-files` and `git diff --cached --name-only` for `ace_js.bc.js`
at any path and fails if found. Run it manually with
`npm run guard:artifact-not-tracked`.

This project has no existing pre-commit/pre-push hook framework (no husky,
no simple-git-hooks) — this doesn't add one either, since that's a bigger
decision than this experiment's own scope. Instead, there's an **opt-in**
tracked hook at [`.githooks/pre-commit`](../.githooks/pre-commit) that
calls the same script. Enable it once, yourself, if you want it:

```sh
git config core.hooksPath .githooks
```

Nobody's git config is changed automatically by anything in this repo.

### 3. CI never depends on the artifact

Nothing in this repo's checks (`typecheck`, `test`, `audit:network`,
`build`, `npm audit`) requires the artifact to exist — the build guard
above means CI (which never has it) always takes the "no artifact found"
path and proceeds normally. The dev-only panel's own tests
(`test/localEsharkGeneratorPoc.test.ts`) mock the worker boundary entirely,
so they never touch the real artifact either.

## Removing this experiment cleanly

Since nothing here is wired into the main flow, removing it is:

```sh
rm -rf public/local-eshark-generator/          # the local artifact, if you have one
rm public/local-generator-poc-worker.js
rm -rf src/experimental/
rm test/localEsharkGeneratorPoc.test.ts
rm scripts/check-no-local-generator-artifact.mjs scripts/check-artifact-not-tracked.mjs
rm -rf .githooks/
# then remove the "Local generator POC" panel block and its handleClick
# cases from src/ui/app.ts, the guard/hook references from package.json's
# "build" script and "guard:*" entries, and this file plus the .gitignore
# entries.
```

Nothing outside those files references any of this.
