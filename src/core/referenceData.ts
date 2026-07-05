// Pure helpers for local, static reference-data catalogs (items, moves, and
// — later — flags/variables/maps/species/abilities) used only to make
// curated-schema dropdown fields friendlier.
//
// SAFETY CONTRACT: catalogs are checked-in, hand-reviewed, static data —
// never fetched, scraped, or generated at runtime. A reference entry's
// `value` is the only thing ever stored or filled into a script; `name` is
// informational display text only. Looking a value up here is not a claim
// that it's correct for every game revision — existing local
// scripts/generators remain the source of truth.

import type { ReferenceCatalogId } from './types.js';

export type { ReferenceCatalogId };

export interface ReferenceEntry {
  /** The numeric value a script actually uses (item/move index, species internal index, etc.) — this is what gets stored/filled, never the display name. */
  value: number;
  /** Hex form of value, e.g. "0x145", for display/cross-reference only. */
  hex?: string;
  /** National Pokédex number, for species entries where it's known and (for Generation III) may differ from the internal index — display/cross-reference only, never stored/filled. */
  nationalDexNumber?: number;
  name: string;
  /** Category/bag pocket, if known (e.g. "Poké Balls", "TMs & HMs" for items; "Physical"/"Special"/"Status" for moves) — informational only. */
  category?: string;
  /** Additional search terms/aliases (alternate spellings, common nicknames). */
  aliases?: readonly string[];
  /** Where this entry's data came from — a written citation only, never fetched at runtime. */
  sourceNote?: string;
}

export interface ReferenceCatalog {
  id: ReferenceCatalogId;
  label: string;
  description: string;
  /** True when this is a deliberately partial subset, not the full real-world range — must be surfaced in the UI, not hidden. */
  partial: boolean;
  /** Written citation for the catalog as a whole (e.g. a Bulbapedia page name) — never fetched at runtime. */
  sourceNote: string;
  entries: readonly ReferenceEntry[];
}

/** The entry whose value exactly matches, if any. */
export function lookupReferenceEntry(catalog: ReferenceCatalog, value: number): ReferenceEntry | undefined {
  return catalog.entries.find((e) => e.value === value);
}

function normalizeSearchTerm(s: string): string {
  return s.trim().toLowerCase();
}

/** Case-insensitive substring match against name, aliases, category, or the value/hex itself. Empty query returns every entry. */
export function searchReferenceEntries(catalog: ReferenceCatalog, query: string): ReferenceEntry[] {
  const q = normalizeSearchTerm(query);
  if (!q) return catalog.entries.slice();
  return catalog.entries.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      String(e.value).includes(q) ||
      (e.hex ?? '').toLowerCase().includes(q) ||
      (e.category ?? '').toLowerCase().includes(q) ||
      (e.aliases ?? []).some((a) => a.toLowerCase().includes(q)),
  );
}

/** The canonical "Name — value" display label for a reference entry, e.g. "Thunderbolt — 85". */
export function referenceEntryLabel(entry: ReferenceEntry): string {
  return `${entry.name} — ${entry.value}`;
}
