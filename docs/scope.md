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

## Reference-data catalogs

Curated schema fields for things like Gen III items and moves (`src/reference/`)
can be backed by a small, local, **static** reference catalog instead of a raw
number box — e.g. a "Move" field shows "Thunderbolt — 85" instead of just
`85`. A few things are true of every catalog:

- **Local and static.** Catalogs are checked-in source files, hand-entered
  from publicly documented Generation III index numbering. They are never
  fetched, scraped, or generated at runtime — see
  [CONTRIBUTING.md](../CONTRIBUTING.md) for the network boundary this falls
  under.
- **A display convenience, not an authority.** A catalog entry's `value` is
  the only thing ever stored or filled into a script; the name is
  informational only. Existing local scripts/generators remain the source
  of truth — a catalog lookup is never a claim that a value is correct for
  your specific game revision.
- **Often deliberately partial.** The current `gen3-items`/`gen3-moves`
  catalogs cover only entries whose index is stable and well-documented,
  not the full item/move list — this is surfaced in the UI (a "(partial)"
  label) and in `ReferenceCatalog.partial`, never hidden.
- **Reviewed before adding.** New catalogs or entries should be manually
  checked against a real reference before being checked in, the same way a
  curated schema itself is manually reviewed before being marked `reviewed`.

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
  an existing or planned feature. See
  [docs/generator-adapter-contract.md](./generator-adapter-contract.md) for
  the (unimplemented) type-only shape a future adapter would need to fit
  the existing schema-filling/output-parsing pipeline.
- **ROM/save-file/emulator handling**, if ever added, needs its own branch and
  its own update to this document.

Changes that would cross any of these boundaries belong in a separate,
explicitly scoped branch — not folded into an unrelated change. See
[CONTRIBUTING.md](../CONTRIBUTING.md) for how this is enforced day to day.
