import { describe, it, expect } from 'vitest';
import type { ReferenceCatalog } from '../src/core/referenceData.js';
import { lookupReferenceEntry, searchReferenceEntries, referenceEntryLabel } from '../src/core/referenceData.js';
import { GEN3_ITEMS_CATALOG, GEN3_MOVES_CATALOG, REFERENCE_CATALOGS, REFERENCE_CATALOG_IDS, getReferenceCatalog } from '../src/reference/index.js';

const TOY_CATALOG: ReferenceCatalog = {
  id: 'gen3-items',
  label: 'Toy catalog',
  description: 'A toy catalog for tests only.',
  partial: true,
  sourceNote: 'toy fixture, not a real source',
  entries: [
    { value: 1, hex: '0x001', name: 'Alpha Ball', category: 'Poké Balls', aliases: ['alpha'] },
    { value: 2, hex: '0x002', name: 'Beta Potion', category: 'Medicine' },
    { value: 85, name: 'Gamma Strike', category: 'Attack' },
  ],
};

describe('lookupReferenceEntry', () => {
  it('finds the entry whose value matches exactly', () => {
    expect(lookupReferenceEntry(TOY_CATALOG, 85)?.name).toBe('Gamma Strike');
  });

  it('returns undefined for a value not in the catalog', () => {
    expect(lookupReferenceEntry(TOY_CATALOG, 9999)).toBeUndefined();
  });
});

describe('searchReferenceEntries', () => {
  it('matches by name, case-insensitively', () => {
    const results = searchReferenceEntries(TOY_CATALOG, 'beta');
    expect(results.map((e) => e.name)).toEqual(['Beta Potion']);
  });

  it('matches by alias', () => {
    const results = searchReferenceEntries(TOY_CATALOG, 'alpha');
    expect(results.map((e) => e.name)).toEqual(['Alpha Ball']);
  });

  it('matches by category', () => {
    const results = searchReferenceEntries(TOY_CATALOG, 'medicine');
    expect(results.map((e) => e.name)).toEqual(['Beta Potion']);
  });

  it('matches by the numeric value or hex string', () => {
    expect(searchReferenceEntries(TOY_CATALOG, '85').map((e) => e.name)).toEqual(['Gamma Strike']);
    expect(searchReferenceEntries(TOY_CATALOG, '0x001').map((e) => e.name)).toEqual(['Alpha Ball']);
  });

  it('returns every entry for an empty/blank query', () => {
    expect(searchReferenceEntries(TOY_CATALOG, '')).toHaveLength(3);
    expect(searchReferenceEntries(TOY_CATALOG, '   ')).toHaveLength(3);
  });

  it('returns no entries when nothing matches', () => {
    expect(searchReferenceEntries(TOY_CATALOG, 'nonexistent-term')).toEqual([]);
  });
});

describe('referenceEntryLabel', () => {
  it('formats as "Name — value"', () => {
    expect(referenceEntryLabel({ value: 85, name: 'Thunderbolt' })).toBe('Thunderbolt — 85');
  });
});

describe('gen3-items catalog (real, checked-in, still partial)', () => {
  it('is registered under id "gen3-items" and honestly marked partial', () => {
    expect(GEN3_ITEMS_CATALOG.id).toBe('gen3-items');
    expect(GEN3_ITEMS_CATALOG.partial).toBe(true);
    expect(GEN3_ITEMS_CATALOG.entries.length).toBeGreaterThan(0);
  });

  it('looks up known stable entries by numeric value, including the newly added vitamins and TMs/HMs', () => {
    expect(lookupReferenceEntry(GEN3_ITEMS_CATALOG, 1)?.name).toBe('Master Ball');
    expect(lookupReferenceEntry(GEN3_ITEMS_CATALOG, 4)?.name).toBe('Poké Ball');
    expect(lookupReferenceEntry(GEN3_ITEMS_CATALOG, 13)?.name).toBe('Potion');
    expect(lookupReferenceEntry(GEN3_ITEMS_CATALOG, 68)?.name).toBe('Rare Candy');
    expect(lookupReferenceEntry(GEN3_ITEMS_CATALOG, 289)?.name).toBe('TM01');
    expect(lookupReferenceEntry(GEN3_ITEMS_CATALOG, 338)?.name).toBe('TM50');
    expect(lookupReferenceEntry(GEN3_ITEMS_CATALOG, 339)?.name).toBe('HM01');
    expect(lookupReferenceEntry(GEN3_ITEMS_CATALOG, 346)?.name).toBe('HM08');
  });

  it('searches by name', () => {
    const results = searchReferenceEntries(GEN3_ITEMS_CATALOG, 'potion');
    expect(results.some((e) => e.name === 'Potion')).toBe(true);
    expect(results.some((e) => e.name === 'Super Potion')).toBe(true);
  });

  it('searches by hex value', () => {
    const results = searchReferenceEntries(GEN3_ITEMS_CATALOG, '0x044'); // Rare Candy
    expect(results.map((e) => e.name)).toEqual(['Rare Candy']);
  });

  it('searches TMs/HMs by numeric value', () => {
    expect(searchReferenceEntries(GEN3_ITEMS_CATALOG, '338').map((e) => e.name)).toEqual(['TM50']);
  });

  it('every entry has a decimal value, a name, and a hex string', () => {
    for (const entry of GEN3_ITEMS_CATALOG.entries) {
      expect(typeof entry.value).toBe('number');
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.hex).toMatch(/^0x[0-9A-F]+$/);
    }
  });

  it('has unique numeric values', () => {
    const values = GEN3_ITEMS_CATALOG.entries.map((e) => e.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('is sorted by numeric value', () => {
    const values = GEN3_ITEMS_CATALOG.entries.map((e) => e.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it('has no duplicate display names except intentionally-aliased ones (e.g. the drink items)', () => {
    const names = GEN3_ITEMS_CATALOG.entries.map((e) => e.name);
    const counts = new Map();
    for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
    const dupes = [...counts.entries()].filter(([, c]) => c > 1);
    expect(dupes).toEqual([]);
  });
});

describe('gen3-moves catalog (real, checked-in, now complete)', () => {
  it('is registered under id "gen3-moves" and covers all 354 Generation III move indices', () => {
    expect(GEN3_MOVES_CATALOG.id).toBe('gen3-moves');
    expect(GEN3_MOVES_CATALOG.partial).toBe(false);
    expect(GEN3_MOVES_CATALOG.entries).toHaveLength(354);
  });

  it('looks up known stable entries by numeric value', () => {
    expect(lookupReferenceEntry(GEN3_MOVES_CATALOG, 1)?.name).toBe('Pound');
    expect(lookupReferenceEntry(GEN3_MOVES_CATALOG, 57)?.name).toBe('Surf');
    expect(lookupReferenceEntry(GEN3_MOVES_CATALOG, 85)?.name).toBe('Thunderbolt');
    expect(lookupReferenceEntry(GEN3_MOVES_CATALOG, 354)?.name).toBe('Psycho Boost');
  });

  it('searches by name', () => {
    const results = searchReferenceEntries(GEN3_MOVES_CATALOG, 'thunder');
    expect(results.map((e) => e.name)).toEqual(expect.arrayContaining(['Thunder Punch', 'Thunderbolt', 'Thunder Wave', 'Thunder Shock', 'Thunder']));
  });

  it('searches by numeric value string', () => {
    expect(searchReferenceEntries(GEN3_MOVES_CATALOG, '354').map((e) => e.name)).toEqual(['Psycho Boost']);
  });

  it('has unique numeric values covering 1-354 with no gaps', () => {
    const values = GEN3_MOVES_CATALOG.entries.map((e) => e.value);
    expect(new Set(values).size).toBe(354);
    expect(Math.min(...values)).toBe(1);
    expect(Math.max(...values)).toBe(354);
  });

  it('is sorted by numeric value', () => {
    const values = GEN3_MOVES_CATALOG.entries.map((e) => e.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it('has no duplicate display names except intentionally-aliased ones', () => {
    const names = GEN3_MOVES_CATALOG.entries.map((e) => e.name);
    const counts = new Map();
    for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
    const dupes = [...counts.entries()].filter(([, c]) => c > 1);
    expect(dupes).toEqual([]);
  });
});

describe('reference catalog registry', () => {
  it('registers exactly gen3-items and gen3-moves for now', () => {
    expect(REFERENCE_CATALOG_IDS.sort()).toEqual(['gen3-items', 'gen3-moves']);
  });

  it('getReferenceCatalog resolves each registered id to its catalog', () => {
    expect(getReferenceCatalog('gen3-items')).toBe(REFERENCE_CATALOGS['gen3-items']);
    expect(getReferenceCatalog('gen3-moves')).toBe(REFERENCE_CATALOGS['gen3-moves']);
  });
});
