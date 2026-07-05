// Local, static, checked-in catalog of Generation III item indices — used
// only to make curated-schema "item" fields show a friendly name/value
// dropdown instead of a raw number box.
//
// SOURCE: hand-entered from publicly documented Generation III item index
// numbering (the kind of table Bulbapedia's "List of items by index number
// in Generation III" publishes: decimal index, hex value, and item name).
// This file is NOT fetched, scraped, or generated at runtime — it is
// static source code, reviewed and edited like any other file in this
// repo. It is DELIBERATELY PARTIAL: only items whose index is stable and
// well-documented across Generation III games are included here. Treat any
// value not listed as unconfirmed, and double-check anything you rely on
// against your own reference before trusting it — this app's scripts and
// generator remain the source of truth, not this catalog.

import type { ReferenceCatalog } from '../core/referenceData.js';

export const GEN3_ITEMS_CATALOG: ReferenceCatalog = {
  id: 'gen3-items',
  label: 'Generation III items',
  description: 'Item name/index lookup for curated schema "item" fields.',
  partial: true,
  sourceNote:
    'Hand-entered from publicly documented Generation III item index numbering ' +
    '(e.g. Bulbapedia\'s "List of items by index number in Generation III"). ' +
    'Covers only the Poké Balls and core medicine/status items whose index is ' +
    'stable and well-documented across Gen III games — not a complete item list.',
  entries: [
    { value: 1, hex: '0x001', name: 'Master Ball', category: 'Poké Balls' },
    { value: 2, hex: '0x002', name: 'Ultra Ball', category: 'Poké Balls' },
    { value: 3, hex: '0x003', name: 'Great Ball', category: 'Poké Balls' },
    { value: 4, hex: '0x004', name: 'Poké Ball', category: 'Poké Balls' },
    { value: 5, hex: '0x005', name: 'Safari Ball', category: 'Poké Balls' },
    { value: 6, hex: '0x006', name: 'Net Ball', category: 'Poké Balls' },
    { value: 7, hex: '0x007', name: 'Dive Ball', category: 'Poké Balls' },
    { value: 8, hex: '0x008', name: 'Nest Ball', category: 'Poké Balls' },
    { value: 9, hex: '0x009', name: 'Repeat Ball', category: 'Poké Balls' },
    { value: 10, hex: '0x00A', name: 'Timer Ball', category: 'Poké Balls' },
    { value: 11, hex: '0x00B', name: 'Luxury Ball', category: 'Poké Balls' },
    { value: 12, hex: '0x00C', name: 'Premier Ball', category: 'Poké Balls' },
    { value: 13, hex: '0x00D', name: 'Potion', category: 'Medicine' },
    { value: 14, hex: '0x00E', name: 'Antidote', category: 'Medicine' },
    { value: 15, hex: '0x00F', name: 'Burn Heal', category: 'Medicine' },
    { value: 16, hex: '0x010', name: 'Ice Heal', category: 'Medicine' },
    { value: 17, hex: '0x011', name: 'Awakening', category: 'Medicine' },
    { value: 18, hex: '0x012', name: 'Paralyze Heal', category: 'Medicine' },
    { value: 19, hex: '0x013', name: 'Full Restore', category: 'Medicine' },
    { value: 20, hex: '0x014', name: 'Max Potion', category: 'Medicine' },
    { value: 21, hex: '0x015', name: 'Hyper Potion', category: 'Medicine' },
    { value: 22, hex: '0x016', name: 'Super Potion', category: 'Medicine' },
    { value: 23, hex: '0x017', name: 'Full Heal', category: 'Medicine' },
    { value: 24, hex: '0x018', name: 'Revive', category: 'Medicine' },
    { value: 25, hex: '0x019', name: 'Max Revive', category: 'Medicine' },
    { value: 26, hex: '0x01A', name: 'Fresh Water', category: 'Medicine', aliases: ['drink'] },
    { value: 27, hex: '0x01B', name: 'Soda Pop', category: 'Medicine', aliases: ['drink'] },
    { value: 28, hex: '0x01C', name: 'Lemonade', category: 'Medicine', aliases: ['drink'] },
    { value: 29, hex: '0x01D', name: 'Moomoo Milk', category: 'Medicine' },
    { value: 30, hex: '0x01E', name: 'EnergyPowder', category: 'Medicine' },
    { value: 31, hex: '0x01F', name: 'Energy Root', category: 'Medicine' },
    { value: 32, hex: '0x020', name: 'Heal Powder', category: 'Medicine' },
    { value: 33, hex: '0x021', name: 'Revival Herb', category: 'Medicine' },
    { value: 34, hex: '0x022', name: 'Ether', category: 'Medicine' },
    { value: 35, hex: '0x023', name: 'Max Ether', category: 'Medicine' },
    { value: 36, hex: '0x024', name: 'Elixir', category: 'Medicine' },
    { value: 37, hex: '0x025', name: 'Max Elixir', category: 'Medicine' },
    { value: 38, hex: '0x026', name: 'Lava Cookie', category: 'Medicine' },
    { value: 39, hex: '0x027', name: 'Blue Flute', category: 'Medicine' },
    { value: 40, hex: '0x028', name: 'Yellow Flute', category: 'Medicine' },
    { value: 41, hex: '0x029', name: 'Red Flute', category: 'Medicine' },
    { value: 42, hex: '0x02A', name: 'Black Flute', category: 'Medicine' },
    { value: 43, hex: '0x02B', name: 'White Flute', category: 'Medicine' },
    { value: 44, hex: '0x02C', name: 'Berry Juice', category: 'Medicine' },
    { value: 45, hex: '0x02D', name: 'Sacred Ash', category: 'Medicine' },
  ],
};
