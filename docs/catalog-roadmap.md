# FRLG catalog source roadmap (planning document — no catalogs filled here)

This document plans out `frlg-flags`, `frlg-vars`, `frlg-maps-warps`,
`frlg-trainers`, `gen3-abilities`, `gen3-natures`, and `gen3-types` — the
seven reference catalogs Catalog Audit currently reports as missing/stub
(zero entries, `partial: true`). **Nothing in this document changes any
catalog.** `src/reference/*.ts` for these seven ids is untouched by this
branch; every stub remains exactly as partial/empty as before. This is a
plan for future, separately-scoped branches to fill them one at a time —
the same way `gen3-items`, `gen3-moves`, and `gen3-species` were each done
as their own focused branch. `gen3-species` is now **completed** (merged,
`v0.18.0-complete-species`) — see
[`src/reference/gen3Species.ts`](../src/reference/gen3Species.ts) — and is
no longer part of this roadmap's planned scope; it's mentioned only where
useful as a precedent for how a catalog like this gets filled. See
[docs/scope.md](./scope.md#reference-data-catalogs) for the ground rules
every catalog must follow (local/static, display convenience only,
reviewed before adding, partial surfaced not hidden).

## How this was researched

Every "example scripts/field names" row below comes from a real,
reproducible source: fetching the actual E-Sh4rk `files_frlg` scripts
through this app's own existing, allowlisted GitHub fetch (`Fetch E-Sh4rk
scripts from GitHub` in Manage Scripts — no new network path was added or
used), running the existing batch scanner over all of them, and reading
`buildCatalogGapAudit`'s own `missingCatalogs`/`unknownFields` output (via
`Export audit JSON`). At the time of writing, that was **111/111 scanned
scripts**. Nothing below is invented: a catalog with zero example fields
below genuinely had zero matches against this app's *existing* annotation
hints and name heuristics (`core/catalogGapAudit.ts`) in that scanned set —
it does not mean the catalog is unneeded, only that current evidence for
it is thin, which is itself useful information for sequencing.

## Catalog-by-catalog audit

### `gen3-abilities`

- **Why needed:** curated schemas that set a Pokémon's ability by numeric
  ID (egg/IV/roamer-manipulation scripts commonly touch this).
- **Example scripts/fields (real, from the audit):** `ability` in
  `ChangeRoamerIVs.txt`, `ChangeRoamerIVsJAP.txt`, `Create6IVEgg.txt`,
  `HiddenPowerEgg.txt` (4 matches, all via the existing `ability` name
  heuristic, medium confidence).
- **Likely source:** `pret/pokefirered`'s `include/constants/abilities.h`
  (`ABILITY_xxx` constants) — the same kind of byte-verified decompilation
  source already used successfully for `gen3-items`/`gen3-moves`/
  `gen3-species`. Generation III has a small, fixed list (78 abilities).
- **Risk level:** **Low.** Small (~78 entries), a flat numeric list, no
  known internal-index-vs-something-else quirk the way species has.
- **Target compatibility:** **Global** — generation-wide, identical across
  Ruby/Sapphire/Emerald/FireRed/LeafGreen and across languages (only the
  numeric ID is stored; display name is this catalog's own business).

### `gen3-natures`

- **Why needed:** nature affects stat growth; scripts that set/force a
  Pokémon's nature (breeding/cloning/stat-manipulation scripts) would use
  this. The existing `nature` name heuristic already exists in
  `core/catalogGapAudit.ts`.
- **Example scripts/fields:** **none found** in the current 111-script
  scanned set. This does not mean no such script exists on E-Sh4rk — it
  means none of the currently-fetched/scanned scripts use a variable name
  the existing heuristic recognizes (e.g. a script might embed nature
  inside a broader PID/stat script under a different name). Treat current
  demand as **unconfirmed, not zero**.
- **Likely source:** `include/constants/pokemon.h`'s `NATURE_xxx` enum — a
  fixed, well-known list of 25 natures, unchanged since their Generation
  III introduction.
- **Risk level:** **Low.** Tiny (25 entries), fixed, generation-wide.
- **Target compatibility:** **Global** — same reasoning as abilities.

### `gen3-types`

- **Why needed:** move/matchup type, referenced far less often as a
  fillable "input" in box-name-style ACE scripts than item/move/species,
  but the `type` name heuristic already exists.
- **Example scripts/fields:** **none found** in the current scanned set
  (same caveat as natures — unconfirmed, not disproven).
- **Likely source:** `include/constants/pokemon.h`'s `TYPE_xxx` enum.
  Generation III has 17 types (no Fairy yet — that's Generation VI).
- **Risk level:** **Low.** Tiny (17 entries), fixed, generation-wide.
- **Target compatibility:** **Global.**

### `frlg-vars`

- **Why needed:** scripts that set a special-use game variable
  (`VAR_xxx`) by numeric ID — e.g. `ChangeVar.txt`'s `var` field (1 match,
  low confidence per the existing heuristic, since "var" alone is a weak
  signal by design).
- **Likely source:** `pret/pokefirered`'s `include/constants/vars.h`.
  FireRed/LeafGreen's own named-variable table is smaller than the
  flags table but still sizeable; many slots are also generic/temp
  variables with no stable cross-script meaning worth cataloging.
- **Risk level:** **Medium.** FRLG-specific (not shared with R/S/E — must
  verify this from source, not assume), and deciding which vars are
  "stable/named enough to catalog" vs. "temp scratch slots not worth
  cataloging" is itself a judgment call the implementing branch will need
  to make explicit and documented, not silently skip.
- **Target compatibility:** Likely **version-specific to FireRed/
  LeafGreen** (not shared with Ruby/Sapphire/Emerald), **language-
  independent** (a variable's numeric ID doesn't change per language,
  only its human label would). Whether it's **revision-consistent**
  (1.0 vs. 1.1) is an open question to confirm from source when this
  catalog is actually implemented — do not assume either way.

### `frlg-flags`

- **Why needed:** scripts that set/clear/check an event flag (badges,
  one-time story beats, hidden items already picked up) by numeric ID —
  e.g. `ChangeFlag.txt`'s `flag` field (1 match, low confidence, same
  "weak signal alone" reasoning as vars).
- **Likely source:** `pret/pokefirered`'s `include/constants/flags.h`.
- **Risk level:** **Medium-high.** FireRed/LeafGreen's flag table is
  large (on the order of ~1000+ slots), and a big fraction of it is an
  auto-generated "trainer seen/beaten" block — hand-curating *all* of it
  is a large, error-prone undertaking with limited payoff (most scripts
  care about a handful of well-known flags: badges, key story flags, a
  handful of hidden-item flags). **Recommend an explicitly partial first
  pass** (badges + major story flags only, `partial: true` kept honest
  until/unless a full pass is separately justified) rather than treating
  "complete" as the goal from day one.
- **Target compatibility:** Likely version-specific to FireRed/LeafGreen,
  language-independent for the numeric IDs. Revision-consistency (1.0 vs.
  1.1) is again an open question to confirm from source, not assume.

### `frlg-maps-warps`

- **Why needed:** scripts that warp the player to a specific map/warp
  point by numeric map group + map number + warp ID — this had the
  **strongest real demand signal of the four FRLG-specific catalogs**:
  `warp` in `Warp.txt`, `Warp_SWITCH.txt`,
  `SeedChangeAndWarpBootstrappedEN.txt`,
  `SeedChangeAndWarpBootstrappedENSwitch.txt`,
  `SeedChangeAndWarpBootstrappedEU.txt`,
  `SeedChangeAndWarpBootstrappedEUSwitch.txt` (6 matches, medium
  confidence).
- **Likely source:** `pret/pokefirered`'s `include/constants/map_groups.h`
  (`MAP_GROUP_xxx`/map-number constants) for map identity, plus each
  map's own `data/maps/<MapName>/map.json` for its warp-event table
  (which warp indices exist on that map and where each one leads).
- **Risk level:** **High — the highest of the seven.** This is not a flat
  numeric-value lookup like every other catalog on this list (see "shape
  decisions" below): a map has a name, but a *warp* is only meaningful
  relative to a specific map, and warps also point *at* another
  map+warp. FireRed/LeafGreen has on the order of ~400 maps, many with
  several warps each — a full pass is a substantially bigger effort than
  any other catalog here. **Recommend scoping the first pass to only the
  specific maps/warps the six scripts above actually reference**, not the
  entire game's map roster.
- **Target compatibility:** Version-specific to FireRed/LeafGreen (Kanto's
  map layout doesn't exist in Ruby/Sapphire/Emerald). Map/warp *IDs* are
  language-independent; a map's *display name* is not (out of scope for
  the ID lookup itself, a display-label concern only). Revision-
  consistency again unconfirmed — verify from source.

### `frlg-trainers`

- **Why needed:** scripts that reference a trainer battle/data by numeric
  trainer ID (rematch setup, battle-manipulation scripts).
- **Example scripts/fields:** **none found** in the current 111-script
  scanned set, and no "trainer"/"trainerId"-shaped variable name turned up
  in `unknownFields` either. Of all seven catalogs, this one currently has
  the **weakest demonstrated real-world need** in this app's own data —
  that doesn't mean trainer-referencing scripts don't exist on E-Sh4rk,
  only that this specific 111-script sample didn't surface one.
- **Likely source:** `pret/pokefirered`'s `include/constants/opponents.h`
  (`TRAINER_xxx` constants) — FireRed/LeafGreen has on the order of
  ~700+ trainer entries.
- **Risk level:** **High.** Large enumeration, and (per trainer) there
  are really two names worth keeping distinct — trainer *class* (e.g.
  "Youngster") and the individual trainer's own display name (e.g.
  "Joey") — see shape decision below.
- **Target compatibility:** Version-specific to FireRed/LeafGreen,
  language-independent for IDs, revision-consistency unconfirmed.

## Recommended implementation order

| Order | Catalog | Why here |
|---|---|---|
| 1 | `gen3-abilities` | Small, fixed, generation-wide, **and** real demonstrated demand (4 scripts). Best effort-to-value ratio on the list. |
| 2 | `gen3-natures` | Small, fixed, generation-wide, trivial to do in the same pass as abilities even though current demand is unconfirmed — the marginal cost is tiny. |
| 3 | `gen3-types` | Same reasoning as natures — small, fixed, cheap, do alongside it. |
| 4 | `frlg-vars` | First FRLG-specific (version-specific) catalog — smaller and better-scoped than flags, with confirmed (if modest) real demand. |
| 5 | `frlg-maps-warps` | Highest real demand signal of the FRLG-specific catalogs, but also the highest complexity (compound shape, not a flat lookup — see below). Scope the first pass to only the maps/warps the 6 known scripts actually reference, not the full map roster. |
| 6 | `frlg-flags` | Real but modest demand; large full table. Recommend a deliberately partial first pass (badges + major story flags) rather than an all-or-nothing attempt. |
| 7 | `frlg-trainers` | Largest enumeration, weakest currently-demonstrated need in this app's own scanned data. Defer until real need surfaces (a script requesting it, or a broader E-Sh4rk sample surfacing trainer-ID usage). |

`gen3-species` is intentionally not listed above — it's already **complete**
(merged separately, `v0.18.0-complete-species`), not part of this roadmap's
remaining scope.

## Catalog shape decisions

Six of the seven catalogs fit the existing `ReferenceEntry`/
`ReferenceCatalog` shape (`core/referenceData.ts`) already used by the
now-complete `gen3-items`/`gen3-moves`/`gen3-species` catalogs — a flat array of
`{ value, hex?, name, category?, aliases?, sourceNote? }`. One does not,
and that's flagged explicitly below rather than forced to fit.

### `gen3-abilities` / `gen3-natures` / `gen3-types`

Reuse `ReferenceEntry` exactly as-is, no new fields needed:

```ts
{ value: number, name: string, sourceNote?: string }
```

No `category`, no target-compatibility concept — these are global,
generation-wide, unversioned lists, same as how `gen3-items`/`gen3-moves`
already work.

### `frlg-vars` / `frlg-flags`

Also fit `ReferenceEntry`, with `category` used for grouping:

```ts
{
  value: number,        // numeric flag/var id
  hex?: string,          // e.g. "0x828" — flags/vars are commonly referenced in hex in community docs
  name: string,          // see open question below
  category?: string,     // e.g. "Badge", "Story", "Hidden Item" for flags; "Story", "Repel steps", "Temp" for vars
  sourceNote?: string,
}
```

**Open design question, not resolved here:** the source data's symbolic
constant name (e.g. `FLAG_BADGE01_GRANITE`) and a human-friendly display
label (e.g. "Boulder Badge obtained") are both useful but not the same
string. `ReferenceEntry.name` is currently used as the single display
name everywhere else (e.g. "Thunderbolt", "Bulbasaur") — the implementing
branch needs to decide whether `name` holds the symbolic constant, the
human label, or both (constant in `name`, human label via `aliases`, or a
new optional field). Flagging this now so it isn't decided as an
afterthought mid-implementation.

**Target-compatibility open question:** neither type currently supports
"this entry is only valid for revision X" — if research turns up a real
1.0-vs-1.1 divergence for any flag/var, `ReferenceEntry`/`ReferenceCatalog`
would need a new optional field for it. Don't add this speculatively;
add it only if/when a real divergence is found and sourced.

### `frlg-trainers`

Fits `ReferenceEntry` cleanly, using the existing `name`/`category` split
for exactly the two names a trainer has:

```ts
{
  value: number,      // trainer id
  name: string,        // the individual trainer's own name, e.g. "Joey"
  category?: string,   // trainer class, e.g. "Youngster"
  sourceNote?: string,
}
```

### `frlg-maps-warps` — does NOT fit `ReferenceEntry`

This is the one catalog on this list that is not a flat "numeric value →
name" lookup. A map has an identity (`mapGroup` + `mapNumber` → name), but
a *warp* only makes sense relative to a specific map, and a warp's value
is itself a pointer at another map+warp — a compound, relational shape a
flat array can't represent honestly. Proposed dedicated shape (illustrative
only — not implemented, no code added by this branch):

```ts
interface FrlgMapEntry {
  mapGroup: number;
  mapNumber: number;
  mapName: string;
  sourceNote?: string;
}

interface FrlgWarpEntry {
  mapGroup: number;
  mapNumber: number;
  warpId: number;
  targetMapGroup?: number;
  targetMapNumber?: number;
  targetWarpId?: number;
  targetMapLabel?: string;   // display convenience only, e.g. "Viridian City Pokémon Center"
  sourceNote?: string;
}

interface FrlgMapsWarpsCatalog {
  maps: readonly FrlgMapEntry[];
  warps: readonly FrlgWarpEntry[];
}
```

This also implies a different UI than a flat reference-select dropdown
(e.g. picking a map first, then a warp within it) — out of scope to design
further here; noted so the implementing branch doesn't discover the shape
mismatch partway through.

## What this branch deliberately did not do

- No catalog file under `src/reference/` was filled in or marked
  complete. All seven stubs remain `partial: true`, zero entries.
- No labels were invented. Every "why needed"/"example" claim above is
  either sourced from this app's own real scanned-script audit output, or
  explicitly marked as unconfirmed/an open question — never asserted as
  fact without evidence.
- No modern/general-Pokémon data was substituted for FRLG-specific data
  anywhere a distinction matters (flags/vars/maps-warps/trainers are
  called out as needing FRLG-specific sourcing, not a generic
  Gen3-wide assumption, unlike abilities/natures/types which genuinely
  are generation-wide).
