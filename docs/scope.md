# Scope

FireRed BoxName Workbench is a **personal, local-first workbench** for known
FireRed box-name techniques. It is not a tool for finding new techniques, and
it is not (yet) integrated with any generator.

## What this app is

A place to:

- choose from known FireRed action templates,
- fill in the user-facing fields those templates need,
- prepare and review the text you will feed into your own local script,
- present and review box-name output produced by that script,
- keep provenance for everything recorded or imported,
- copy, print, or export the result.

## What this app is not

- **Not a route-discovery tool.** It does not search for, propose, or rank new
  routes, setups, or techniques. Techniques come from you, already known.
- **Not exploit research.** It works only with techniques you already have —
  from a template or from text you import — and never derives new ones.
- **Not networked.** No request ever leaves the machine; see the README's
  "Offline by construction" section for how that is enforced.
- **Not a background process.** Every action is the direct result of
  something you clicked or typed. Nothing runs on a timer or invisibly.
- **Not a ROM/save-file/emulator tool**, unless that is explicitly added in a
  future branch with its own scope review.
- **Not a generator.** Any existing local script or generator you use
  alongside this app is the source of truth for what it produces. This app
  does not reimplement it, judge its correctness, or silently alter its
  output — it only helps you prepare input for it and review, store, or
  export what it returns.

## Provenance and review

Every piece of text this app shows you — typed, imported, or (once a
generator adapter exists) returned from a script — is stored with a record of
where it came from, and displayed verbatim. Nothing is exported or printed
without being reviewable first.

## What's explicitly deferred

- **Generator integration** — running or wrapping a local script/generator,
  and the action-template builder that would feed it — is out of scope for
  now. This document describes the boundary that work must respect when it
  lands; it does not describe an existing feature.
- **ROM/save-file/emulator handling**, if ever added, needs its own branch and
  its own update to this document.

Changes that would cross any of these boundaries belong in a separate,
explicitly scoped branch — not folded into an unrelated change. See
[CONTRIBUTING.md](../CONTRIBUTING.md) for how this is enforced day to day.
