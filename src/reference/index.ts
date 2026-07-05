// Registry mapping each ReferenceCatalogId to its checked-in static
// catalog. To add a new catalog later (flags, variables, maps, species,
// abilities): add the id to ReferenceCatalogId in core/types.ts, add a new
// src/reference/<name>.ts file shaped like the ones here, and register it
// below.

import type { ReferenceCatalog, ReferenceCatalogId } from '../core/referenceData.js';
import { GEN3_ITEMS_CATALOG } from './gen3Items.js';
import { GEN3_MOVES_CATALOG } from './gen3Moves.js';
import { GEN3_SPECIES_CATALOG } from './gen3Species.js';
import { GEN3_ABILITIES_CATALOG } from './gen3Abilities.js';
import { GEN3_NATURES_CATALOG } from './gen3Natures.js';
import { GEN3_TYPES_CATALOG } from './gen3Types.js';
import { FRLG_FLAGS_CATALOG } from './frlgFlags.js';
import { FRLG_VARS_CATALOG } from './frlgVars.js';
import { FRLG_MAPS_WARPS_CATALOG } from './frlgMapsWarps.js';
import { FRLG_TRAINERS_CATALOG } from './frlgTrainers.js';

export const REFERENCE_CATALOGS: Record<ReferenceCatalogId, ReferenceCatalog> = {
  'gen3-items': GEN3_ITEMS_CATALOG,
  'gen3-moves': GEN3_MOVES_CATALOG,
  // Registered for type-safety/audit visibility — stub (zero-entry) catalogs, not yet implemented.
  'gen3-species': GEN3_SPECIES_CATALOG,
  'gen3-abilities': GEN3_ABILITIES_CATALOG,
  'gen3-natures': GEN3_NATURES_CATALOG,
  'gen3-types': GEN3_TYPES_CATALOG,
  'frlg-flags': FRLG_FLAGS_CATALOG,
  'frlg-vars': FRLG_VARS_CATALOG,
  'frlg-maps-warps': FRLG_MAPS_WARPS_CATALOG,
  'frlg-trainers': FRLG_TRAINERS_CATALOG,
};

/** Every registered catalog id — the single source of truth storage.ts validates against. */
export const REFERENCE_CATALOG_IDS = Object.keys(REFERENCE_CATALOGS) as ReferenceCatalogId[];

export function getReferenceCatalog(id: ReferenceCatalogId): ReferenceCatalog | undefined {
  return REFERENCE_CATALOGS[id];
}

export {
  GEN3_ITEMS_CATALOG,
  GEN3_MOVES_CATALOG,
  GEN3_SPECIES_CATALOG,
  GEN3_ABILITIES_CATALOG,
  GEN3_NATURES_CATALOG,
  GEN3_TYPES_CATALOG,
  FRLG_FLAGS_CATALOG,
  FRLG_VARS_CATALOG,
  FRLG_MAPS_WARPS_CATALOG,
  FRLG_TRAINERS_CATALOG,
};
