// Local, static, checked-in catalog of FireRed/LeafGreen trainer indices —
// NOT YET IMPLEMENTED. See gen3Species.ts for why this file exists with
// zero entries: registered for type-safety and audit visibility, not a
// working catalog yet.

import type { ReferenceCatalog } from '../core/referenceData.js';

export const FRLG_TRAINERS_CATALOG: ReferenceCatalog = {
  id: 'frlg-trainers',
  label: 'FireRed/LeafGreen trainers (not yet implemented)',
  description: 'Trainer name/index lookup for curated schema "trainer" fields.',
  partial: true,
  sourceNote: 'Not yet implemented — zero entries. Registered for type-safety and audit visibility only.',
  entries: [],
};
