// Local, static, checked-in catalog of FireRed/LeafGreen named flags —
// NOT YET IMPLEMENTED. See gen3Species.ts for why this file exists with
// zero entries: registered for type-safety and audit visibility, not a
// working catalog yet. Flags are highly ROM/revision-specific — filling
// this in later should cite a specific, checked source per entry, not a
// general "Gen III" table the way items/moves do.

import type { ReferenceCatalog } from '../core/referenceData.js';

export const FRLG_FLAGS_CATALOG: ReferenceCatalog = {
  id: 'frlg-flags',
  label: 'FireRed/LeafGreen flags (not yet implemented)',
  description: 'Named flag lookup for curated schema "flag" fields.',
  partial: true,
  sourceNote: 'Not yet implemented — zero entries. Registered for type-safety and audit visibility only.',
  entries: [],
};
