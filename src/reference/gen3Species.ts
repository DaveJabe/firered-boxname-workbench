// Local, static, checked-in catalog of Generation III species indices —
// NOT YET IMPLEMENTED. This id is registered (so a schema field or the
// catalog-gap audit can reference it) but carries zero entries — do not
// treat it as a working catalog. A field pointed at this id renders an
// empty dropdown until real entries are hand-entered here, the same way
// gen3-items/gen3-moves were.
//
// SOURCE: none yet. When filled in, this must be hand-entered from
// publicly documented Generation III species index numbering — never
// fetched, scraped, or generated at runtime.

import type { ReferenceCatalog } from '../core/referenceData.js';

export const GEN3_SPECIES_CATALOG: ReferenceCatalog = {
  id: 'gen3-species',
  label: 'Generation III species (not yet implemented)',
  description: 'Species name/index lookup for curated schema "species"/"pokemon" fields.',
  partial: true,
  sourceNote: 'Not yet implemented — zero entries. Registered for type-safety and audit visibility only.',
  entries: [],
};
