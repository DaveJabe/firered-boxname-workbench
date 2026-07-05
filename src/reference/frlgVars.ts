// Local, static, checked-in catalog of FireRed/LeafGreen named variables —
// NOT YET IMPLEMENTED. See gen3Species.ts for why this file exists with
// zero entries: registered for type-safety and audit visibility, not a
// working catalog yet.

import type { ReferenceCatalog } from '../core/referenceData.js';

export const FRLG_VARS_CATALOG: ReferenceCatalog = {
  id: 'frlg-vars',
  label: 'FireRed/LeafGreen variables (not yet implemented)',
  description: 'Named variable lookup for curated schema "var"/"variable" fields.',
  partial: true,
  sourceNote: 'Not yet implemented — zero entries. Registered for type-safety and audit visibility only.',
  entries: [],
};
