// Local, static, checked-in catalog of Generation III item indices — used
// only to make curated-schema "item" fields show a friendly name/value
// dropdown instead of a raw number box.
//
// SOURCE: cross-referenced against the pret/pokefirered decompilation
// (include/constants/items.h and src/data/items.json — a byte-verified
// reconstruction of FireRed/LeafGreen's actual compiled item table) and
// Bulbapedia's "List of items by index number in Generation III". This file
// is NOT fetched, scraped, or generated at runtime — it is static source
// code, reviewed and edited like any other file in this repo.
//
// FireRed/LeafGreen's own item table runs from index 1 (Master Ball) to
// index 374 (Sapphire); index 0 is ITEM_NONE. Emerald extends its own item
// table two slots further (375 Magma Emblem, 376 Old Sea Map) — those two
// indices simply do not exist in FireRed/LeafGreen's data at all, so they
// are correctly absent here rather than misleadingly included as "FRLG
// items". Within FRLG's own 1–374 range, 67 indices are themselves blank,
// unused placeholder slots (their in-game name is literally "????????",
// e.g. 52–62, 87–92, 226–253) and are likewise omitted rather than invented.
// This catalog includes every one of the remaining 307 indices that has a
// real name in FireRed/LeafGreen's own data, so it is NOT partial — it is a
// complete list of every valid FireRed/LeafGreen item index. See the
// catalog-level sourceNote below for how that boundary was determined, and
// individual entries' sourceNote for the ~28 indices that are named/present
// in FRLG's data but are non-functional Ruby/Sapphire-only leftovers
// (Contest items, Devon Corp/Team Aqua-Magma sidequest items, the Mach/Acro
// Bike pair, Hoenn-only fossils, etc.) never obtainable in FireRed/LeafGreen
// by any means, including trade. This app's scripts and generator remain
// the source of truth for any given ROM, not this catalog.

import type { ReferenceCatalog } from '../core/referenceData.js';

export const GEN3_ITEMS_CATALOG: ReferenceCatalog = {
  id: 'gen3-items',
  label: 'Generation III items',
  description: 'Item name/index lookup for curated schema "item" fields.',
  partial: false,
  sourceNote:
    'Complete list of every valid FireRed/LeafGreen item index (1–374; 0 is ITEM_NONE), ' +
    'cross-referenced from the pret/pokefirered decompilation (include/constants/items.h, ' +
    'which defines ITEMS_COUNT as 375, i.e. valid indices 0–374; and src/data/items.json, ' +
    'which gives each index\'s real in-game name or the literal placeholder "????????" for a ' +
    'genuinely blank/unused slot) against Bulbapedia\'s "List of items by index number in ' +
    'Generation III". Emerald\'s own header defines two further indices (375 Magma Emblem, 376 ' +
    'Old Sea Map) that are absent from FireRed/LeafGreen\'s table entirely, confirming FRLG\'s ' +
    'own max valid index is 374. The ~28 entries whose sourceNote flags them as Ruby/Sapphire-' +
    'only leftovers ARE present with a real name/description in FRLG\'s own data (so they belong ' +
    'in this catalog), but were cross-checked against Bulbapedia\'s per-item "Acquisition" ' +
    'sections, which list no FireRed/LeafGreen source (not even trade) for any of them.',
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
    { value: 18, hex: '0x012', name: 'Parlyz Heal', category: 'Medicine' },
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
    { value: 46, hex: '0x02E', name: 'Shoal Salt', category: 'Treasures' },
    { value: 47, hex: '0x02F', name: 'Shoal Shell', category: 'Treasures' },
    { value: 48, hex: '0x030', name: 'Red Shard', category: 'Treasures' },
    { value: 49, hex: '0x031', name: 'Blue Shard', category: 'Treasures' },
    { value: 50, hex: '0x032', name: 'Yellow Shard', category: 'Treasures' },
    { value: 51, hex: '0x033', name: 'Green Shard', category: 'Treasures' },
    { value: 63, hex: '0x03F', name: 'HP Up', category: 'Vitamins' },
    { value: 64, hex: '0x040', name: 'Protein', category: 'Vitamins' },
    { value: 65, hex: '0x041', name: 'Iron', category: 'Vitamins' },
    { value: 66, hex: '0x042', name: 'Carbos', category: 'Vitamins' },
    { value: 67, hex: '0x043', name: 'Calcium', category: 'Vitamins' },
    { value: 68, hex: '0x044', name: 'Rare Candy', category: 'Vitamins' },
    { value: 69, hex: '0x045', name: 'PP Up', category: 'Vitamins' },
    { value: 70, hex: '0x046', name: 'Zinc', category: 'Vitamins' },
    { value: 71, hex: '0x047', name: 'PP Max', category: 'Vitamins' },
    { value: 73, hex: '0x049', name: 'Guard Spec.', category: 'Battle items' },
    { value: 74, hex: '0x04A', name: 'Dire Hit', category: 'Battle items' },
    { value: 75, hex: '0x04B', name: 'X Attack', category: 'Battle items' },
    { value: 76, hex: '0x04C', name: 'X Defend', category: 'Battle items' },
    { value: 77, hex: '0x04D', name: 'X Speed', category: 'Battle items' },
    { value: 78, hex: '0x04E', name: 'X Accuracy', category: 'Battle items' },
    { value: 79, hex: '0x04F', name: 'X Special', category: 'Battle items' },
    { value: 80, hex: '0x050', name: 'Poké Doll', category: 'Battle items' },
    { value: 81, hex: '0x051', name: 'Fluffy Tail', category: 'Battle items' },
    { value: 83, hex: '0x053', name: 'Super Repel', category: 'Field items' },
    { value: 84, hex: '0x054', name: 'Max Repel', category: 'Field items' },
    { value: 85, hex: '0x055', name: 'Escape Rope', category: 'Field items' },
    { value: 86, hex: '0x056', name: 'Repel', category: 'Field items' },
    { value: 93, hex: '0x05D', name: 'Sun Stone', category: 'Evolution stones' },
    { value: 94, hex: '0x05E', name: 'Moon Stone', category: 'Evolution stones' },
    { value: 95, hex: '0x05F', name: 'Fire Stone', category: 'Evolution stones' },
    { value: 96, hex: '0x060', name: 'Thunderstone', category: 'Evolution stones' },
    { value: 97, hex: '0x061', name: 'Water Stone', category: 'Evolution stones' },
    { value: 98, hex: '0x062', name: 'Leaf Stone', category: 'Evolution stones' },
    { value: 103, hex: '0x067', name: 'TinyMushroom', category: 'Treasures' },
    { value: 104, hex: '0x068', name: 'Big Mushroom', category: 'Treasures' },
    { value: 106, hex: '0x06A', name: 'Pearl', category: 'Treasures' },
    { value: 107, hex: '0x06B', name: 'Big Pearl', category: 'Treasures' },
    { value: 108, hex: '0x06C', name: 'Stardust', category: 'Treasures' },
    { value: 109, hex: '0x06D', name: 'Star Piece', category: 'Treasures' },
    { value: 110, hex: '0x06E', name: 'Nugget', category: 'Treasures' },
    { value: 111, hex: '0x06F', name: 'Heart Scale', category: 'Treasures' },
    { value: 121, hex: '0x079', name: 'Orange Mail', category: 'Mail' },
    { value: 122, hex: '0x07A', name: 'Harbor Mail', category: 'Mail' },
    { value: 123, hex: '0x07B', name: 'Glitter Mail', category: 'Mail' },
    { value: 124, hex: '0x07C', name: 'Mech Mail', category: 'Mail' },
    { value: 125, hex: '0x07D', name: 'Wood Mail', category: 'Mail' },
    { value: 126, hex: '0x07E', name: 'Wave Mail', category: 'Mail' },
    { value: 127, hex: '0x07F', name: 'Bead Mail', category: 'Mail' },
    { value: 128, hex: '0x080', name: 'Shadow Mail', category: 'Mail' },
    { value: 129, hex: '0x081', name: 'Tropic Mail', category: 'Mail' },
    { value: 130, hex: '0x082', name: 'Dream Mail', category: 'Mail' },
    { value: 131, hex: '0x083', name: 'Fab Mail', category: 'Mail' },
    { value: 132, hex: '0x084', name: 'Retro Mail', category: 'Mail' },
    { value: 133, hex: '0x085', name: 'Cheri Berry', category: 'Berries' },
    { value: 134, hex: '0x086', name: 'Chesto Berry', category: 'Berries' },
    { value: 135, hex: '0x087', name: 'Pecha Berry', category: 'Berries' },
    { value: 136, hex: '0x088', name: 'Rawst Berry', category: 'Berries' },
    { value: 137, hex: '0x089', name: 'Aspear Berry', category: 'Berries' },
    { value: 138, hex: '0x08A', name: 'Leppa Berry', category: 'Berries' },
    { value: 139, hex: '0x08B', name: 'Oran Berry', category: 'Berries' },
    { value: 140, hex: '0x08C', name: 'Persim Berry', category: 'Berries' },
    { value: 141, hex: '0x08D', name: 'Lum Berry', category: 'Berries' },
    { value: 142, hex: '0x08E', name: 'Sitrus Berry', category: 'Berries' },
    { value: 143, hex: '0x08F', name: 'Figy Berry', category: 'Berries' },
    { value: 144, hex: '0x090', name: 'Wiki Berry', category: 'Berries' },
    { value: 145, hex: '0x091', name: 'Mago Berry', category: 'Berries' },
    { value: 146, hex: '0x092', name: 'Aguav Berry', category: 'Berries' },
    { value: 147, hex: '0x093', name: 'Iapapa Berry', category: 'Berries' },
    { value: 148, hex: '0x094', name: 'Razz Berry', category: 'Berries' },
    { value: 149, hex: '0x095', name: 'Bluk Berry', category: 'Berries' },
    { value: 150, hex: '0x096', name: 'Nanab Berry', category: 'Berries' },
    { value: 151, hex: '0x097', name: 'Wepear Berry', category: 'Berries' },
    { value: 152, hex: '0x098', name: 'Pinap Berry', category: 'Berries' },
    { value: 153, hex: '0x099', name: 'Pomeg Berry', category: 'Berries' },
    { value: 154, hex: '0x09A', name: 'Kelpsy Berry', category: 'Berries' },
    { value: 155, hex: '0x09B', name: 'Qualot Berry', category: 'Berries' },
    { value: 156, hex: '0x09C', name: 'Hondew Berry', category: 'Berries' },
    { value: 157, hex: '0x09D', name: 'Grepa Berry', category: 'Berries' },
    { value: 158, hex: '0x09E', name: 'Tamato Berry', category: 'Berries' },
    { value: 159, hex: '0x09F', name: 'Cornn Berry', category: 'Berries' },
    { value: 160, hex: '0x0A0', name: 'Magost Berry', category: 'Berries' },
    { value: 161, hex: '0x0A1', name: 'Rabuta Berry', category: 'Berries' },
    { value: 162, hex: '0x0A2', name: 'Nomel Berry', category: 'Berries' },
    { value: 163, hex: '0x0A3', name: 'Spelon Berry', category: 'Berries' },
    { value: 164, hex: '0x0A4', name: 'Pamtre Berry', category: 'Berries' },
    { value: 165, hex: '0x0A5', name: 'Watmel Berry', category: 'Berries' },
    { value: 166, hex: '0x0A6', name: 'Durin Berry', category: 'Berries' },
    { value: 167, hex: '0x0A7', name: 'Belue Berry', category: 'Berries' },
    { value: 168, hex: '0x0A8', name: 'Liechi Berry', category: 'Berries' },
    { value: 169, hex: '0x0A9', name: 'Ganlon Berry', category: 'Berries' },
    { value: 170, hex: '0x0AA', name: 'Salac Berry', category: 'Berries' },
    { value: 171, hex: '0x0AB', name: 'Petaya Berry', category: 'Berries' },
    { value: 172, hex: '0x0AC', name: 'Apicot Berry', category: 'Berries' },
    { value: 173, hex: '0x0AD', name: 'Lansat Berry', category: 'Berries' },
    { value: 174, hex: '0x0AE', name: 'Starf Berry', category: 'Berries' },
    { value: 175, hex: '0x0AF', name: 'Enigma Berry', category: 'Berries' },
    { value: 179, hex: '0x0B3', name: 'BrightPowder', category: 'Held items' },
    { value: 180, hex: '0x0B4', name: 'White Herb', category: 'Held items' },
    { value: 181, hex: '0x0B5', name: 'Macho Brace', category: 'Held items' },
    { value: 182, hex: '0x0B6', name: 'Exp. Share', category: 'Held items' },
    { value: 183, hex: '0x0B7', name: 'Quick Claw', category: 'Held items' },
    { value: 184, hex: '0x0B8', name: 'Soothe Bell', category: 'Held items' },
    { value: 185, hex: '0x0B9', name: 'Mental Herb', category: 'Held items' },
    { value: 186, hex: '0x0BA', name: 'Choice Band', category: 'Held items' },
    { value: 187, hex: '0x0BB', name: 'King\'s Rock', category: 'Held items' },
    { value: 188, hex: '0x0BC', name: 'SilverPowder', category: 'Held items' },
    { value: 189, hex: '0x0BD', name: 'Amulet Coin', category: 'Held items' },
    { value: 190, hex: '0x0BE', name: 'Cleanse Tag', category: 'Held items' },
    { value: 191, hex: '0x0BF', name: 'Soul Dew', category: 'Held items' },
    { value: 192, hex: '0x0C0', name: 'DeepSeaTooth', category: 'Held items' },
    { value: 193, hex: '0x0C1', name: 'DeepSeaScale', category: 'Held items' },
    { value: 194, hex: '0x0C2', name: 'Smoke Ball', category: 'Held items' },
    { value: 195, hex: '0x0C3', name: 'Everstone', category: 'Held items' },
    { value: 196, hex: '0x0C4', name: 'Focus Band', category: 'Held items' },
    { value: 197, hex: '0x0C5', name: 'Lucky Egg', category: 'Held items' },
    { value: 198, hex: '0x0C6', name: 'Scope Lens', category: 'Held items' },
    { value: 199, hex: '0x0C7', name: 'Metal Coat', category: 'Held items' },
    { value: 200, hex: '0x0C8', name: 'Leftovers', category: 'Held items' },
    { value: 201, hex: '0x0C9', name: 'Dragon Scale', category: 'Held items' },
    { value: 202, hex: '0x0CA', name: 'Light Ball', category: 'Held items' },
    { value: 203, hex: '0x0CB', name: 'Soft Sand', category: 'Held items' },
    { value: 204, hex: '0x0CC', name: 'Hard Stone', category: 'Held items' },
    { value: 205, hex: '0x0CD', name: 'Miracle Seed', category: 'Held items' },
    { value: 206, hex: '0x0CE', name: 'BlackGlasses', category: 'Held items' },
    { value: 207, hex: '0x0CF', name: 'Black Belt', category: 'Held items' },
    { value: 208, hex: '0x0D0', name: 'Magnet', category: 'Held items' },
    { value: 209, hex: '0x0D1', name: 'Mystic Water', category: 'Held items' },
    { value: 210, hex: '0x0D2', name: 'Sharp Beak', category: 'Held items' },
    { value: 211, hex: '0x0D3', name: 'Poison Barb', category: 'Held items' },
    { value: 212, hex: '0x0D4', name: 'NeverMeltIce', category: 'Held items' },
    { value: 213, hex: '0x0D5', name: 'Spell Tag', category: 'Held items' },
    { value: 214, hex: '0x0D6', name: 'TwistedSpoon', category: 'Held items' },
    { value: 215, hex: '0x0D7', name: 'Charcoal', category: 'Held items' },
    { value: 216, hex: '0x0D8', name: 'Dragon Fang', category: 'Held items' },
    { value: 217, hex: '0x0D9', name: 'Silk Scarf', category: 'Held items' },
    { value: 218, hex: '0x0DA', name: 'Up-Grade', category: 'Held items' },
    { value: 219, hex: '0x0DB', name: 'Shell Bell', category: 'Held items' },
    { value: 220, hex: '0x0DC', name: 'Sea Incense', category: 'Held items' },
    { value: 221, hex: '0x0DD', name: 'Lax Incense', category: 'Held items' },
    { value: 222, hex: '0x0DE', name: 'Lucky Punch', category: 'Held items' },
    { value: 223, hex: '0x0DF', name: 'Metal Powder', category: 'Held items' },
    { value: 224, hex: '0x0E0', name: 'Thick Club', category: 'Held items' },
    { value: 225, hex: '0x0E1', name: 'Stick', category: 'Held items' },
    { value: 254, hex: '0x0FE', name: 'Red Scarf', category: 'Held items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 255, hex: '0x0FF', name: 'Blue Scarf', category: 'Held items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 256, hex: '0x100', name: 'Pink Scarf', category: 'Held items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 257, hex: '0x101', name: 'Green Scarf', category: 'Held items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 258, hex: '0x102', name: 'Yellow Scarf', category: 'Held items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 259, hex: '0x103', name: 'Mach Bike', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 260, hex: '0x104', name: 'Coin Case', category: 'Key Items' },
    { value: 261, hex: '0x105', name: 'Itemfinder', category: 'Key Items' },
    { value: 262, hex: '0x106', name: 'Old Rod', category: 'Key Items' },
    { value: 263, hex: '0x107', name: 'Good Rod', category: 'Key Items' },
    { value: 264, hex: '0x108', name: 'Super Rod', category: 'Key Items' },
    { value: 265, hex: '0x109', name: 'S.S. Ticket', category: 'Key Items' },
    { value: 266, hex: '0x10A', name: 'Contest Pass', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 268, hex: '0x10C', name: 'Wailmer Pail', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 269, hex: '0x10D', name: 'Devon Goods', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 270, hex: '0x10E', name: 'Soot Sack', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 271, hex: '0x10F', name: 'Basement Key', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 272, hex: '0x110', name: 'Acro Bike', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 273, hex: '0x111', name: 'Pokéblock Case', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 274, hex: '0x112', name: 'Letter', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 275, hex: '0x113', name: 'Eon Ticket', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 276, hex: '0x114', name: 'Red Orb', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 277, hex: '0x115', name: 'Blue Orb', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 278, hex: '0x116', name: 'Scanner', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 279, hex: '0x117', name: 'Go-Goggles', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 280, hex: '0x118', name: 'Meteorite', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 281, hex: '0x119', name: 'Room 1 Key', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 282, hex: '0x11A', name: 'Room 2 Key', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 283, hex: '0x11B', name: 'Room 4 Key', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 284, hex: '0x11C', name: 'Room 6 Key', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 285, hex: '0x11D', name: 'Storage Key', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 286, hex: '0x11E', name: 'Root Fossil', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 287, hex: '0x11F', name: 'Claw Fossil', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 288, hex: '0x120', name: 'Devon Scope', category: 'Key Items',
      sourceNote:
        'Named/described in FireRed/LeafGreen\'s own item data but not obtainable by any means ' +
        '(not even trade) in FireRed/LeafGreen — vestigial Ruby/Sapphire-only content ' +
        '(Contests, Hoenn locations, Team Aqua/Magma, the two-bike system, etc.) left in the ' +
        'shared Gen III item table. See this catalog\'s sourceNote for corroborating sources.' },
    { value: 289, hex: '0x121', name: 'TM01', category: 'TMs & HMs' },
    { value: 290, hex: '0x122', name: 'TM02', category: 'TMs & HMs' },
    { value: 291, hex: '0x123', name: 'TM03', category: 'TMs & HMs' },
    { value: 292, hex: '0x124', name: 'TM04', category: 'TMs & HMs' },
    { value: 293, hex: '0x125', name: 'TM05', category: 'TMs & HMs' },
    { value: 294, hex: '0x126', name: 'TM06', category: 'TMs & HMs' },
    { value: 295, hex: '0x127', name: 'TM07', category: 'TMs & HMs' },
    { value: 296, hex: '0x128', name: 'TM08', category: 'TMs & HMs' },
    { value: 297, hex: '0x129', name: 'TM09', category: 'TMs & HMs' },
    { value: 298, hex: '0x12A', name: 'TM10', category: 'TMs & HMs' },
    { value: 299, hex: '0x12B', name: 'TM11', category: 'TMs & HMs' },
    { value: 300, hex: '0x12C', name: 'TM12', category: 'TMs & HMs' },
    { value: 301, hex: '0x12D', name: 'TM13', category: 'TMs & HMs' },
    { value: 302, hex: '0x12E', name: 'TM14', category: 'TMs & HMs' },
    { value: 303, hex: '0x12F', name: 'TM15', category: 'TMs & HMs' },
    { value: 304, hex: '0x130', name: 'TM16', category: 'TMs & HMs' },
    { value: 305, hex: '0x131', name: 'TM17', category: 'TMs & HMs' },
    { value: 306, hex: '0x132', name: 'TM18', category: 'TMs & HMs' },
    { value: 307, hex: '0x133', name: 'TM19', category: 'TMs & HMs' },
    { value: 308, hex: '0x134', name: 'TM20', category: 'TMs & HMs' },
    { value: 309, hex: '0x135', name: 'TM21', category: 'TMs & HMs' },
    { value: 310, hex: '0x136', name: 'TM22', category: 'TMs & HMs' },
    { value: 311, hex: '0x137', name: 'TM23', category: 'TMs & HMs' },
    { value: 312, hex: '0x138', name: 'TM24', category: 'TMs & HMs' },
    { value: 313, hex: '0x139', name: 'TM25', category: 'TMs & HMs' },
    { value: 314, hex: '0x13A', name: 'TM26', category: 'TMs & HMs' },
    { value: 315, hex: '0x13B', name: 'TM27', category: 'TMs & HMs' },
    { value: 316, hex: '0x13C', name: 'TM28', category: 'TMs & HMs' },
    { value: 317, hex: '0x13D', name: 'TM29', category: 'TMs & HMs' },
    { value: 318, hex: '0x13E', name: 'TM30', category: 'TMs & HMs' },
    { value: 319, hex: '0x13F', name: 'TM31', category: 'TMs & HMs' },
    { value: 320, hex: '0x140', name: 'TM32', category: 'TMs & HMs' },
    { value: 321, hex: '0x141', name: 'TM33', category: 'TMs & HMs' },
    { value: 322, hex: '0x142', name: 'TM34', category: 'TMs & HMs' },
    { value: 323, hex: '0x143', name: 'TM35', category: 'TMs & HMs' },
    { value: 324, hex: '0x144', name: 'TM36', category: 'TMs & HMs' },
    { value: 325, hex: '0x145', name: 'TM37', category: 'TMs & HMs' },
    { value: 326, hex: '0x146', name: 'TM38', category: 'TMs & HMs' },
    { value: 327, hex: '0x147', name: 'TM39', category: 'TMs & HMs' },
    { value: 328, hex: '0x148', name: 'TM40', category: 'TMs & HMs' },
    { value: 329, hex: '0x149', name: 'TM41', category: 'TMs & HMs' },
    { value: 330, hex: '0x14A', name: 'TM42', category: 'TMs & HMs' },
    { value: 331, hex: '0x14B', name: 'TM43', category: 'TMs & HMs' },
    { value: 332, hex: '0x14C', name: 'TM44', category: 'TMs & HMs' },
    { value: 333, hex: '0x14D', name: 'TM45', category: 'TMs & HMs' },
    { value: 334, hex: '0x14E', name: 'TM46', category: 'TMs & HMs' },
    { value: 335, hex: '0x14F', name: 'TM47', category: 'TMs & HMs' },
    { value: 336, hex: '0x150', name: 'TM48', category: 'TMs & HMs' },
    { value: 337, hex: '0x151', name: 'TM49', category: 'TMs & HMs' },
    { value: 338, hex: '0x152', name: 'TM50', category: 'TMs & HMs' },
    { value: 339, hex: '0x153', name: 'HM01', category: 'TMs & HMs' },
    { value: 340, hex: '0x154', name: 'HM02', category: 'TMs & HMs' },
    { value: 341, hex: '0x155', name: 'HM03', category: 'TMs & HMs' },
    { value: 342, hex: '0x156', name: 'HM04', category: 'TMs & HMs' },
    { value: 343, hex: '0x157', name: 'HM05', category: 'TMs & HMs' },
    { value: 344, hex: '0x158', name: 'HM06', category: 'TMs & HMs' },
    { value: 345, hex: '0x159', name: 'HM07', category: 'TMs & HMs' },
    { value: 346, hex: '0x15A', name: 'HM08', category: 'TMs & HMs' },
    { value: 349, hex: '0x15D', name: 'Oak\'s Parcel', category: 'Key Items' },
    { value: 350, hex: '0x15E', name: 'Poké Flute', category: 'Key Items' },
    { value: 351, hex: '0x15F', name: 'Secret Key', category: 'Key Items' },
    { value: 352, hex: '0x160', name: 'Bike Voucher', category: 'Key Items' },
    { value: 353, hex: '0x161', name: 'Gold Teeth', category: 'Key Items' },
    { value: 354, hex: '0x162', name: 'Old Amber', category: 'Key Items' },
    { value: 355, hex: '0x163', name: 'Card Key', category: 'Key Items' },
    { value: 356, hex: '0x164', name: 'Lift Key', category: 'Key Items' },
    { value: 357, hex: '0x165', name: 'Helix Fossil', category: 'Key Items' },
    { value: 358, hex: '0x166', name: 'Dome Fossil', category: 'Key Items' },
    { value: 359, hex: '0x167', name: 'Silph Scope', category: 'Key Items' },
    { value: 360, hex: '0x168', name: 'Bicycle', category: 'Key Items' },
    { value: 361, hex: '0x169', name: 'Town Map', category: 'Key Items' },
    { value: 362, hex: '0x16A', name: 'VS Seeker', category: 'Key Items' },
    { value: 363, hex: '0x16B', name: 'Fame Checker', category: 'Key Items' },
    { value: 364, hex: '0x16C', name: 'TM Case', category: 'Key Items' },
    { value: 365, hex: '0x16D', name: 'Berry Pouch', category: 'Key Items' },
    { value: 366, hex: '0x16E', name: 'Teachy TV', category: 'Key Items' },
    { value: 367, hex: '0x16F', name: 'Tri-Pass', category: 'Key Items' },
    { value: 368, hex: '0x170', name: 'Rainbow Pass', category: 'Key Items' },
    { value: 369, hex: '0x171', name: 'Tea', category: 'Key Items' },
    { value: 370, hex: '0x172', name: 'MysticTicket', category: 'Key Items' },
    { value: 371, hex: '0x173', name: 'AuroraTicket', category: 'Key Items' },
    { value: 372, hex: '0x174', name: 'Powder Jar', category: 'Key Items' },
    { value: 373, hex: '0x175', name: 'Ruby', category: 'Key Items' },
    { value: 374, hex: '0x176', name: 'Sapphire', category: 'Key Items' },
  ],
};
