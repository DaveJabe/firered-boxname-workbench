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

describe('gen3-items catalog (real, checked-in, complete)', () => {
  it('is registered under id "gen3-items" and marked complete (not partial)', () => {
    expect(GEN3_ITEMS_CATALOG.id).toBe('gen3-items');
    expect(GEN3_ITEMS_CATALOG.partial).toBe(false);
    expect(GEN3_ITEMS_CATALOG.entries.length).toBeGreaterThan(0);
  });

  it('looks up a few known stable entries by numeric value', () => {
    expect(lookupReferenceEntry(GEN3_ITEMS_CATALOG, 1)?.name).toBe('Master Ball');
    expect(lookupReferenceEntry(GEN3_ITEMS_CATALOG, 4)?.name).toBe('Poké Ball');
    expect(lookupReferenceEntry(GEN3_ITEMS_CATALOG, 13)?.name).toBe('Potion');
  });

  it('looks up known entries from the newly completed range (TMs, key items, berries)', () => {
    expect(lookupReferenceEntry(GEN3_ITEMS_CATALOG, 289)?.name).toBe('TM01');
    expect(lookupReferenceEntry(GEN3_ITEMS_CATALOG, 338)?.name).toBe('TM50');
    expect(lookupReferenceEntry(GEN3_ITEMS_CATALOG, 133)?.name).toBe('Cheri Berry');
    expect(lookupReferenceEntry(GEN3_ITEMS_CATALOG, 360)?.name).toBe('Bicycle');
  });

  it('searches by name', () => {
    const results = searchReferenceEntries(GEN3_ITEMS_CATALOG, 'potion');
    expect(results.some((e) => e.name === 'Potion')).toBe(true);
    expect(results.some((e) => e.name === 'Super Potion')).toBe(true);
  });

  it('searches by hex value', () => {
    const results = searchReferenceEntries(GEN3_ITEMS_CATALOG, '0x121');
    expect(results.map((e) => e.name)).toEqual(['TM01']);
  });

  it('every entry has a decimal value, a name, and a hex string', () => {
    for (const entry of GEN3_ITEMS_CATALOG.entries) {
      expect(typeof entry.value).toBe('number');
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.hex).toMatch(/^0x[0-9A-F]+$/);
    }
  });

  it('has no duplicate numeric values', () => {
    const values = GEN3_ITEMS_CATALOG.entries.map((e) => e.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('is sorted ascending by numeric value', () => {
    const values = GEN3_ITEMS_CATALOG.entries.map((e) => e.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});

describe('gen3-moves catalog (real, checked-in, complete)', () => {
  it('is registered under id "gen3-moves" and marked complete (not partial)', () => {
    expect(GEN3_MOVES_CATALOG.id).toBe('gen3-moves');
    expect(GEN3_MOVES_CATALOG.partial).toBe(false);
  });

  it('looks up a few known stable entries by numeric value', () => {
    expect(lookupReferenceEntry(GEN3_MOVES_CATALOG, 1)?.name).toBe('Pound');
    expect(lookupReferenceEntry(GEN3_MOVES_CATALOG, 57)?.name).toBe('Surf');
    expect(lookupReferenceEntry(GEN3_MOVES_CATALOG, 85)?.name).toBe('Thunderbolt');
  });

  it('looks up known entries from the newly completed range (Gen II/III originals)', () => {
    expect(lookupReferenceEntry(GEN3_MOVES_CATALOG, 101)?.name).toBe('Night Shade');
    expect(lookupReferenceEntry(GEN3_MOVES_CATALOG, 252)?.name).toBe('Fake Out');
    expect(lookupReferenceEntry(GEN3_MOVES_CATALOG, 354)?.name).toBe('Psycho Boost');
  });

  it('searches by name', () => {
    const results = searchReferenceEntries(GEN3_MOVES_CATALOG, 'thunder');
    expect(results.map((e) => e.name)).toEqual(expect.arrayContaining(['Thunder Punch', 'Thunderbolt', 'Thunder Wave', 'Thunder Shock', 'Thunder']));
  });

  it('has no duplicate numeric values', () => {
    const values = GEN3_MOVES_CATALOG.entries.map((e) => e.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('is sorted ascending by numeric value, covering the full 1-354 range with no gaps', () => {
    const values = GEN3_MOVES_CATALOG.entries.map((e) => e.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values).toEqual(Array.from({ length: 354 }, (_, i) => i + 1));
  });
});

describe('reference catalog registry', () => {
  it('registers gen3-items and gen3-moves as real, non-empty catalogs', () => {
    expect(REFERENCE_CATALOGS['gen3-items'].entries.length).toBeGreaterThan(0);
    expect(REFERENCE_CATALOGS['gen3-moves'].entries.length).toBeGreaterThan(0);
  });

  it('registers the newer species/abilities/natures/types/flags/vars/maps-warps/trainers ids as stub (zero-entry) catalogs, clearly marked not yet implemented', () => {
    const stubIds = [
      'gen3-species', 'gen3-abilities', 'gen3-natures', 'gen3-types',
      'frlg-flags', 'frlg-vars', 'frlg-maps-warps', 'frlg-trainers',
    ] as const;
    for (const id of stubIds) {
      const catalog = REFERENCE_CATALOGS[id];
      expect(catalog.entries).toEqual([]);
      expect(catalog.partial).toBe(true);
      expect(catalog.label).toMatch(/not yet implemented/);
    }
  });

  it('REFERENCE_CATALOG_IDS lists exactly the 10 registered catalogs', () => {
    expect(REFERENCE_CATALOG_IDS.sort()).toEqual(
      [
        'frlg-flags', 'frlg-maps-warps', 'frlg-trainers', 'frlg-vars',
        'gen3-abilities', 'gen3-items', 'gen3-moves', 'gen3-natures', 'gen3-species', 'gen3-types',
      ].sort(),
    );
  });

  it('getReferenceCatalog resolves each registered id to its catalog', () => {
    expect(getReferenceCatalog('gen3-items')).toBe(REFERENCE_CATALOGS['gen3-items']);
    expect(getReferenceCatalog('gen3-moves')).toBe(REFERENCE_CATALOGS['gen3-moves']);
    expect(getReferenceCatalog('gen3-species')).toBe(REFERENCE_CATALOGS['gen3-species']);
  });
});
