# Scope

FireRed BoxName Workbench is a **personal, local-first workbench** for known
FireRed box-name techniques. It is not a tool for finding new techniques, and
it never invokes any generator itself — you always run your own, by hand,
outside this app.

## What this app is

A place to:

- choose from known FireRed action templates or curated schemas,
- fill in the user-facing fields those templates need,
- prepare and review script input, including a conservative, header-only
  script filler that only substitutes values you provide into variables a
  curated schema explicitly maps,
- present and review box-name output — mock placeholder output, a filled
  script preview to copy elsewhere, or output you paste back in after
  running your own generator by hand,
- keep provenance for everything recorded, imported, filled, or pasted back,
- copy, print, or export the result.

Saved workspaces (local, IndexedDB) hold this work between visits, but using
the workbench never requires setting one up first — start with an action or
import a script, and a workspace is created for you in the background.

## What this app is not

- **Not a route-discovery tool.** It does not search for, propose, or rank new
  routes, setups, or techniques. Techniques come from you, already known.
- **Not exploit research.** It works only with techniques you already have —
  from a template, a curated schema, or text you import — and never derives
  new ones.
- **No hidden network calls.** No request leaves the machine except the one
  explicit, user-triggered "Fetch E-Sh4rk scripts from GitHub" action — it
  never runs automatically (not on launch, not on a timer), only contacts
  the public GitHub API/raw-content hosts for the `files_frlg` script
  folder, and imports what it fetches as plain text; no generator is run by
  fetching scripts. See the README's "Local by construction" section for
  how that boundary is enforced.
- **Not a background process.** Every action is the direct result of
  something you clicked or typed. Nothing runs on a timer or invisibly.
- **Not a ROM/save-file/emulator tool**, unless that is explicitly added in a
  future branch with its own scope review.
- **Not a generator, and never invokes one.** Any existing local script or
  generator you use alongside this app is the source of truth for what it
  produces. This app does not run it, reimplement it, judge its correctness,
  or silently alter its output — the script filler only prepares text for you
  to copy into your own generator by hand, and the paste-back flow only
  stores what you bring back from running it yourself.

## Provenance and review

Every piece of text this app shows you — typed, imported, filled by the
script filler, or pasted back after running your own generator — is stored
with a record of where it came from, and displayed verbatim. Nothing is
exported or printed without being reviewable first.

## What's explicitly deferred

- **Real generator invocation** — actually running or wrapping a local
  script/generator from within this app (subprocess execution, Tauri, or any
  other direct integration) — is out of scope. This document describes the
  boundary that would apply if it were ever proposed; it does not describe
  an existing or planned feature.
- **ROM/save-file/emulator handling**, if ever added, needs its own branch and
  its own update to this document.

Changes that would cross any of these boundaries belong in a separate,
explicitly scoped branch — not folded into an unrelated change. See
[CONTRIBUTING.md](../CONTRIBUTING.md) for how this is enforced day to day.
