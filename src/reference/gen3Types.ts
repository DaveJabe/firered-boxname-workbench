// Local, static, checked-in catalog of Generation III type indices —
// NOT YET IMPLEMENTED. See gen3Species.ts for why this file exists with
// zero entries: registered for type-safety and audit visibility, not a
// working catalog yet.

import type { ReferenceCatalog } from '../core/referenceData.js';

export const GEN3_TYPES_CATALOG: ReferenceCatalog = {
  id: 'gen3-types',
  label: 'Generation III types (not yet implemented)',
  description: 'Type name/index lookup for curated schema "type" fields.',
  partial: true,
  sourceNote: 'Not yet implemented — zero entries. Registered for type-safety and audit visibility only.',
  entries: [],
};
