// Local, static, checked-in catalog of Generation III nature indices —
// NOT YET IMPLEMENTED. See gen3Species.ts for why this file exists with
// zero entries: registered for type-safety and audit visibility, not a
// working catalog yet.

import type { ReferenceCatalog } from '../core/referenceData.js';

export const GEN3_NATURES_CATALOG: ReferenceCatalog = {
  id: 'gen3-natures',
  label: 'Generation III natures (not yet implemented)',
  description: 'Nature name/index lookup for curated schema "nature" fields.',
  partial: true,
  sourceNote: 'Not yet implemented — zero entries. Registered for type-safety and audit visibility only.',
  entries: [],
};
