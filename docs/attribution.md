# Attribution and disclaimer

This project is an **independent helper UI** for working with public
E-Sh4rk/EmeraldACE scripts. It is **not affiliated with, endorsed by, or
maintained by E-Sh4rk**. E-Sh4rk's scripts and CodeGenerator remain the
**source of truth** for anything they produce — this app never
reimplements, judges the correctness of, or silently alters their output;
see [docs/scope.md](./scope.md).

## What this project is not

- **Not the official E-Sh4rk UI.** This app is a separate, independently
  written tool. Nothing in its name, wording, or interface should be read
  as representing E-Sh4rk, the CodeGenerator project, or its maintainer.
- **Not a redistribution of the E-Sh4rk generator.** This app does not
  bundle, vendor, commit, or ship E-Sh4rk's compiled generator artifact
  (`ace_js.bc.js`) — see [docs/local-generator-poc.md](./local-generator-poc.md)
  for the one dev-only, local-only, artifact-guarded exception, which
  requires a developer to supply their own untracked copy. That exception
  would only be reconsidered if upstream licensing or explicit permission
  from E-Sh4rk were clarified — nothing here assumes or asserts that has
  happened.
- **No upstream logos or branding.** This project uses plain text links and
  repository names only.

## What this project does

- Reads E-Sh4rk's public, published `.txt` scripts (fetched read-only from
  the `E-Sh4rk/EmeraldACE_web` GitHub repository, or imported locally by
  hand) as plain text, never executed.
- Helps a user fill in a script's own declared fields, review the result,
  and prepare it to run in their **own** copy of E-Sh4rk's generator.
- Supports **manual paste-back** as the one public, supported way to bring
  a generator's real output back into this app — this remains true
  regardless of anything else in this document, and regardless of whether
  the local generator POC (below) is enabled.
- Optionally, for a single developer's own private local testing, can call
  a **user-provided, untracked** copy of E-Sh4rk's compiled generator
  artifact — gated behind an explicit `localStorage` flag, never enabled by
  default, never shipped or deployed with that artifact included. See
  [docs/local-generator-poc.md](./local-generator-poc.md) for the full
  detail and its safety guards.

## Upstream sources

- [E-Sh4rk/EmeraldACE_web](https://github.com/E-Sh4rk/EmeraldACE_web) — the
  public script-data repository this app's one allowlisted network fetch
  reads from (`src/data/esharkRemote.ts`).
- [E-Sh4rk/CodeGenerator](https://github.com/E-Sh4rk/CodeGenerator) — the
  actual ACE code generator source. This app does not fetch, execute, or
  redistribute anything from this repository at runtime; see
  [docs/generator-adapter-spike.md](./generator-adapter-spike.md) for the
  research behind that boundary.
- [E-Sh4rk/CodeGeneratorOffline](https://github.com/E-Sh4rk/CodeGeneratorOffline) —
  upstream's own local-installer scripts for running the generator offline,
  referenced here for context only.

If you are E-Sh4rk, or represent E-Sh4rk, and have a concern about this
project's use of your public scripts, name, or generator, please open an
issue on this repository.
