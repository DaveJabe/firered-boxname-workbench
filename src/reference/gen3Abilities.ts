// Local, static, checked-in catalog of Generation III ability indices —
// NOT YET IMPLEMENTED. See gen3Species.ts for why this file exists with
// zero entries: registered for type-safety and audit visibility, not a
// working catalog yet.

import type { ReferenceCatalog } from '../core/referenceData.js';

export const GEN3_ABILITIES_CATALOG: ReferenceCatalog = {
  id: 'gen3-abilities',
  label: 'Generation III abilities (not yet implemented)',
  description: 'Ability name/index lookup for curated schema "ability" fields.',
  partial: true,
  sourceNote: 'Not yet implemented — zero entries. Registered for type-safety and audit visibility only.',
  entries: [],
};
