// Local, static, checked-in catalog of FireRed/LeafGreen map/warp indices —
// NOT YET IMPLEMENTED. See gen3Species.ts for why this file exists with
// zero entries: registered for type-safety and audit visibility, not a
// working catalog yet.

import type { ReferenceCatalog } from '../core/referenceData.js';

export const FRLG_MAPS_WARPS_CATALOG: ReferenceCatalog = {
  id: 'frlg-maps-warps',
  label: 'FireRed/LeafGreen maps & warps (not yet implemented)',
  description: 'Map/warp name/index lookup for curated schema "map"/"warp" fields.',
  partial: true,
  sourceNote: 'Not yet implemented — zero entries. Registered for type-safety and audit visibility only.',
  entries: [],
};
