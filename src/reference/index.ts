// Registry mapping each ReferenceCatalogId to its checked-in static
// catalog. To add a new catalog later (flags, variables, maps, species,
// abilities): add the id to ReferenceCatalogId in core/types.ts, add a new
// src/reference/<name>.ts file shaped like the ones here, and register it
// below.

import type { ReferenceCatalog, ReferenceCatalogId } from '../core/referenceData.js';
import { GEN3_ITEMS_CATALOG } from './gen3Items.js';
import { GEN3_MOVES_CATALOG } from './gen3Moves.js';

export const REFERENCE_CATALOGS: Record<ReferenceCatalogId, ReferenceCatalog> = {
  'gen3-items': GEN3_ITEMS_CATALOG,
  'gen3-moves': GEN3_MOVES_CATALOG,
};

/** Every registered catalog id — the single source of truth storage.ts validates against. */
export const REFERENCE_CATALOG_IDS = Object.keys(REFERENCE_CATALOGS) as ReferenceCatalogId[];

export function getReferenceCatalog(id: ReferenceCatalogId): ReferenceCatalog | undefined {
  return REFERENCE_CATALOGS[id];
}

export { GEN3_ITEMS_CATALOG, GEN3_MOVES_CATALOG };
