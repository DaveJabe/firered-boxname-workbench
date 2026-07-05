// Local, static, checked-in catalog of Generation III species indices — used
// only to make curated-schema "species"/"pokemon" fields show a friendly
// name/index dropdown instead of a raw number box.
//
// SOURCE: cross-referenced against the pret/pokefirered decompilation
// (include/constants/species.h for every SPECIES_xxx -> internal index;
// include/constants/pokedex.h for every NATIONAL_DEX_xxx -> National Dex
// position; src/pokemon.c's sSpeciesToNationalPokedexNum table, a
// designated-initializer array literally written as
// `[SPECIES_x - 1] = NATIONAL_DEX_x` for every real species — the
// ground-truth index-to-Dex-number mapping; and
// src/data/text/species_names.h's gSpeciesNames table, which gives each
// index's real in-game name or the literal placeholder "?" for a genuinely
// blank/unused slot) cross-checked against Bulbapedia's "List of Pokémon by
// National Pokédex number" for spelling. This file is NOT fetched, scraped,
// or generated at runtime — it is static source code, reviewed and edited
// like any other file in this repo.
//
// THE RUBY/SAPPHIRE NUMBERING QUIRK, VERIFIED (not assumed): internal index
// equals National Dex number for indices 1-251 (Kanto+Johto) with zero
// exceptions, but the two DIVERGE across the Hoenn range: internal indices
// 277-411 correspond to National Dex 252-386, because FireRed/LeafGreen's
// own species table still stores Hoenn species in Ruby/Sapphire's original
// internal creation order, not National Dex order (134 of these 135 entries
// have index != nationalDexNumber; Wynaut, internal 360 / Dex 360, is the
// sole coincidental match). nationalDexNumber is included on every real
// species entry regardless, even where it equals value, so the data is
// self-documenting rather than silently assuming the two always match.
//
// Internal indices 252-276 (SPECIES_OLD_UNOWN_B..Z, 25 slots) are leftover,
// unused padding: in Ruby/Sapphire's pre-National-Dex numbering, Unown's
// letters were briefly assigned their own species/Dex slots before the
// National Dex was finalized; FireRed/LeafGreen's own gSpeciesNames table
// gives every one of them the literal placeholder name "?" (the same
// blank-slot convention seen in this repo's item catalog), so they are
// correctly omitted here as not real, named species. The true maximum valid
// "species" index in FireRed/LeafGreen's own data is 412 (SPECIES_EGG, i.e.
// NUM_SPECIES) — confirmed by GetSpeciesName()'s own bounds check
// (species > NUM_SPECIES falls back to a blank name) and by GetMonData's
// MON_DATA_SPECIES_OR_EGG semantics. Indices 413-439
// (SPECIES_UNOWN_B..Z/EMARK/QMARK) exist in species.h only as pic-table
// lookup offsets for Unown's letter sprites and are never a valid stored
// species value, so they are excluded rather than misrepresented as extra
// species — see Unown's own entry below for the full reasoning.
//
// This catalog covers the complete, verified FireRed/LeafGreen species index
// range: it is NOT partial.

import type { ReferenceCatalog } from '../core/referenceData.js';

export const GEN3_SPECIES_CATALOG: ReferenceCatalog = {
  id: 'gen3-species',
  label: 'Generation III species',
  description: 'Species name/index lookup for curated schema "species"/"pokemon" fields.',
  partial: false,
  sourceNote:
    'Hand-verified against the pret/pokefirered decompilation: include/constants/species.h ' +
    '(every SPECIES_xxx -> internal index), include/constants/pokedex.h (every NATIONAL_DEX_xxx ' +
    '-> National Dex position), src/pokemon.c\'s sSpeciesToNationalPokedexNum table (a ' +
    'designated-initializer array literally written as `[SPECIES_x - 1] = NATIONAL_DEX_x` for ' +
    'every real species — the ground-truth index-to-Dex-number mapping, not a guess), and ' +
    'src/data/text/species_names.h\'s gSpeciesNames table (each index\'s real in-game name, or ' +
    'the literal placeholder "?" for a genuinely blank/unused slot) — cross-checked against ' +
    'Bulbapedia\'s "List of Pokémon by National Pokédex number" for spelling. ' +
    'Internal index equals National Dex number for indices 1-251 (the Kanto+Johto range) with ' +
    'no exceptions, but the two DIVERGE for the Hoenn range: internal indices 277-411 ' +
    'correspond to National Dex 252-386, because FireRed/LeafGreen\'s own species table still ' +
    'stores Hoenn species in Ruby/Sapphire\'s original internal creation order, not National Dex ' +
    'order (134 of these 135 entries have index != nationalDexNumber; Wynaut, internal 360 / ' +
    'Dex 360, is the sole coincidental match). nationalDexNumber is included on every real ' +
    'species entry regardless, even where it equals value, so the data is self-documenting ' +
    'rather than silently assuming the two always match. ' +
    'Internal indices 252-276 (SPECIES_OLD_UNOWN_B..Z, 25 slots) are leftover, unused padding ' +
    'from Ruby/Sapphire\'s pre-National-Dex numbering (Unown\'s letters briefly had their own ' +
    'species/Dex slots before the National Dex was finalized); gSpeciesNames gives every one of ' +
    'them the literal placeholder name "?" (the same blank-slot convention as this repo\'s item ' +
    'catalog), so they are correctly omitted as not real, named species. The true maximum valid ' +
    '"species" index in FireRed/LeafGreen\'s own data is 412 (SPECIES_EGG, i.e. NUM_SPECIES) — ' +
    'confirmed by GetSpeciesName()\'s own bounds check (species > NUM_SPECIES falls back to a ' +
    'blank name) and by GetMonData\'s MON_DATA_SPECIES_OR_EGG semantics; indices 413-439 ' +
    '(SPECIES_UNOWN_B..Z/EMARK/QMARK) exist only as pic-table lookup offsets for Unown\'s letter ' +
    'sprites and are never a valid stored species value, so they are excluded rather than ' +
    'misrepresented as 27 extra species. ' +
    'AVAILABILITY: this catalog does NOT hand-audit each species\' in-game availability — the ' +
    'one broad, reliably-documented rule applied here is that FireRed/LeafGreen has zero Hoenn ' +
    'overworld content by design, so every Hoenn-native entry (National Dex 252-386, internal ' +
    '277-411) has no wild/gift encounter in FireRed/LeafGreen itself and is otherwise obtainable ' +
    'only by trade from Ruby/Sapphire/Emerald; this is flagged individually only on Deoxys (see ' +
    'its entry), the sole documented exception, obtainable directly via the Birth Island event. ' +
    'Kanto/Johto availability (1-251) is deliberately left unlabeled: unlike the clean Hoenn ' +
    'split, it is not a clean broad-strokes rule (some Johto species ARE catchable directly in ' +
    'FireRed/LeafGreen\'s Sevii Islands), so labeling it would require exactly the kind of ' +
    'per-species research this catalog avoids.',
  entries: [
    { value: 1, nationalDexNumber: 1, name: 'Bulbasaur' },
    { value: 2, nationalDexNumber: 2, name: 'Ivysaur' },
    { value: 3, nationalDexNumber: 3, name: 'Venusaur' },
    { value: 4, nationalDexNumber: 4, name: 'Charmander' },
    { value: 5, nationalDexNumber: 5, name: 'Charmeleon' },
    { value: 6, nationalDexNumber: 6, name: 'Charizard' },
    { value: 7, nationalDexNumber: 7, name: 'Squirtle' },
    { value: 8, nationalDexNumber: 8, name: 'Wartortle' },
    { value: 9, nationalDexNumber: 9, name: 'Blastoise' },
    { value: 10, nationalDexNumber: 10, name: 'Caterpie' },
    { value: 11, nationalDexNumber: 11, name: 'Metapod' },
    { value: 12, nationalDexNumber: 12, name: 'Butterfree' },
    { value: 13, nationalDexNumber: 13, name: 'Weedle' },
    { value: 14, nationalDexNumber: 14, name: 'Kakuna' },
    { value: 15, nationalDexNumber: 15, name: 'Beedrill' },
    { value: 16, nationalDexNumber: 16, name: 'Pidgey' },
    { value: 17, nationalDexNumber: 17, name: 'Pidgeotto' },
    { value: 18, nationalDexNumber: 18, name: 'Pidgeot' },
    { value: 19, nationalDexNumber: 19, name: 'Rattata' },
    { value: 20, nationalDexNumber: 20, name: 'Raticate' },
    { value: 21, nationalDexNumber: 21, name: 'Spearow' },
    { value: 22, nationalDexNumber: 22, name: 'Fearow' },
    { value: 23, nationalDexNumber: 23, name: 'Ekans' },
    { value: 24, nationalDexNumber: 24, name: 'Arbok' },
    { value: 25, nationalDexNumber: 25, name: 'Pikachu' },
    { value: 26, nationalDexNumber: 26, name: 'Raichu' },
    { value: 27, nationalDexNumber: 27, name: 'Sandshrew' },
    { value: 28, nationalDexNumber: 28, name: 'Sandslash' },
    { value: 29, nationalDexNumber: 29, name: 'Nidoran♀', aliases: ['Nidoran-F', 'Nidoran F'] },
    { value: 30, nationalDexNumber: 30, name: 'Nidorina' },
    { value: 31, nationalDexNumber: 31, name: 'Nidoqueen' },
    { value: 32, nationalDexNumber: 32, name: 'Nidoran♂', aliases: ['Nidoran-M', 'Nidoran M'] },
    { value: 33, nationalDexNumber: 33, name: 'Nidorino' },
    { value: 34, nationalDexNumber: 34, name: 'Nidoking' },
    { value: 35, nationalDexNumber: 35, name: 'Clefairy' },
    { value: 36, nationalDexNumber: 36, name: 'Clefable' },
    { value: 37, nationalDexNumber: 37, name: 'Vulpix' },
    { value: 38, nationalDexNumber: 38, name: 'Ninetales' },
    { value: 39, nationalDexNumber: 39, name: 'Jigglypuff' },
    { value: 40, nationalDexNumber: 40, name: 'Wigglytuff' },
    { value: 41, nationalDexNumber: 41, name: 'Zubat' },
    { value: 42, nationalDexNumber: 42, name: 'Golbat' },
    { value: 43, nationalDexNumber: 43, name: 'Oddish' },
    { value: 44, nationalDexNumber: 44, name: 'Gloom' },
    { value: 45, nationalDexNumber: 45, name: 'Vileplume' },
    { value: 46, nationalDexNumber: 46, name: 'Paras' },
    { value: 47, nationalDexNumber: 47, name: 'Parasect' },
    { value: 48, nationalDexNumber: 48, name: 'Venonat' },
    { value: 49, nationalDexNumber: 49, name: 'Venomoth' },
    { value: 50, nationalDexNumber: 50, name: 'Diglett' },
    { value: 51, nationalDexNumber: 51, name: 'Dugtrio' },
    { value: 52, nationalDexNumber: 52, name: 'Meowth' },
    { value: 53, nationalDexNumber: 53, name: 'Persian' },
    { value: 54, nationalDexNumber: 54, name: 'Psyduck' },
    { value: 55, nationalDexNumber: 55, name: 'Golduck' },
    { value: 56, nationalDexNumber: 56, name: 'Mankey' },
    { value: 57, nationalDexNumber: 57, name: 'Primeape' },
    { value: 58, nationalDexNumber: 58, name: 'Growlithe' },
    { value: 59, nationalDexNumber: 59, name: 'Arcanine' },
    { value: 60, nationalDexNumber: 60, name: 'Poliwag' },
    { value: 61, nationalDexNumber: 61, name: 'Poliwhirl' },
    { value: 62, nationalDexNumber: 62, name: 'Poliwrath' },
    { value: 63, nationalDexNumber: 63, name: 'Abra' },
    { value: 64, nationalDexNumber: 64, name: 'Kadabra' },
    { value: 65, nationalDexNumber: 65, name: 'Alakazam' },
    { value: 66, nationalDexNumber: 66, name: 'Machop' },
    { value: 67, nationalDexNumber: 67, name: 'Machoke' },
    { value: 68, nationalDexNumber: 68, name: 'Machamp' },
    { value: 69, nationalDexNumber: 69, name: 'Bellsprout' },
    { value: 70, nationalDexNumber: 70, name: 'Weepinbell' },
    { value: 71, nationalDexNumber: 71, name: 'Victreebel' },
    { value: 72, nationalDexNumber: 72, name: 'Tentacool' },
    { value: 73, nationalDexNumber: 73, name: 'Tentacruel' },
    { value: 74, nationalDexNumber: 74, name: 'Geodude' },
    { value: 75, nationalDexNumber: 75, name: 'Graveler' },
    { value: 76, nationalDexNumber: 76, name: 'Golem' },
    { value: 77, nationalDexNumber: 77, name: 'Ponyta' },
    { value: 78, nationalDexNumber: 78, name: 'Rapidash' },
    { value: 79, nationalDexNumber: 79, name: 'Slowpoke' },
    { value: 80, nationalDexNumber: 80, name: 'Slowbro' },
    { value: 81, nationalDexNumber: 81, name: 'Magnemite' },
    { value: 82, nationalDexNumber: 82, name: 'Magneton' },
    { value: 83, nationalDexNumber: 83, name: "Farfetch'd", aliases: ['Farfetchd'] },
    { value: 84, nationalDexNumber: 84, name: 'Doduo' },
    { value: 85, nationalDexNumber: 85, name: 'Dodrio' },
    { value: 86, nationalDexNumber: 86, name: 'Seel' },
    { value: 87, nationalDexNumber: 87, name: 'Dewgong' },
    { value: 88, nationalDexNumber: 88, name: 'Grimer' },
    { value: 89, nationalDexNumber: 89, name: 'Muk' },
    { value: 90, nationalDexNumber: 90, name: 'Shellder' },
    { value: 91, nationalDexNumber: 91, name: 'Cloyster' },
    { value: 92, nationalDexNumber: 92, name: 'Gastly' },
    { value: 93, nationalDexNumber: 93, name: 'Haunter' },
    { value: 94, nationalDexNumber: 94, name: 'Gengar' },
    { value: 95, nationalDexNumber: 95, name: 'Onix' },
    { value: 96, nationalDexNumber: 96, name: 'Drowzee' },
    { value: 97, nationalDexNumber: 97, name: 'Hypno' },
    { value: 98, nationalDexNumber: 98, name: 'Krabby' },
    { value: 99, nationalDexNumber: 99, name: 'Kingler' },
    { value: 100, nationalDexNumber: 100, name: 'Voltorb' },
    { value: 101, nationalDexNumber: 101, name: 'Electrode' },
    { value: 102, nationalDexNumber: 102, name: 'Exeggcute' },
    { value: 103, nationalDexNumber: 103, name: 'Exeggutor' },
    { value: 104, nationalDexNumber: 104, name: 'Cubone' },
    { value: 105, nationalDexNumber: 105, name: 'Marowak' },
    { value: 106, nationalDexNumber: 106, name: 'Hitmonlee' },
    { value: 107, nationalDexNumber: 107, name: 'Hitmonchan' },
    { value: 108, nationalDexNumber: 108, name: 'Lickitung' },
    { value: 109, nationalDexNumber: 109, name: 'Koffing' },
    { value: 110, nationalDexNumber: 110, name: 'Weezing' },
    { value: 111, nationalDexNumber: 111, name: 'Rhyhorn' },
    { value: 112, nationalDexNumber: 112, name: 'Rhydon' },
    { value: 113, nationalDexNumber: 113, name: 'Chansey' },
    { value: 114, nationalDexNumber: 114, name: 'Tangela' },
    { value: 115, nationalDexNumber: 115, name: 'Kangaskhan' },
    { value: 116, nationalDexNumber: 116, name: 'Horsea' },
    { value: 117, nationalDexNumber: 117, name: 'Seadra' },
    { value: 118, nationalDexNumber: 118, name: 'Goldeen' },
    { value: 119, nationalDexNumber: 119, name: 'Seaking' },
    { value: 120, nationalDexNumber: 120, name: 'Staryu' },
    { value: 121, nationalDexNumber: 121, name: 'Starmie' },
    { value: 122, nationalDexNumber: 122, name: 'Mr. Mime', aliases: ['Mr Mime', 'MrMime'] },
    { value: 123, nationalDexNumber: 123, name: 'Scyther' },
    { value: 124, nationalDexNumber: 124, name: 'Jynx' },
    { value: 125, nationalDexNumber: 125, name: 'Electabuzz' },
    { value: 126, nationalDexNumber: 126, name: 'Magmar' },
    { value: 127, nationalDexNumber: 127, name: 'Pinsir' },
    { value: 128, nationalDexNumber: 128, name: 'Tauros' },
    { value: 129, nationalDexNumber: 129, name: 'Magikarp' },
    { value: 130, nationalDexNumber: 130, name: 'Gyarados' },
    { value: 131, nationalDexNumber: 131, name: 'Lapras' },
    { value: 132, nationalDexNumber: 132, name: 'Ditto' },
    { value: 133, nationalDexNumber: 133, name: 'Eevee' },
    { value: 134, nationalDexNumber: 134, name: 'Vaporeon' },
    { value: 135, nationalDexNumber: 135, name: 'Jolteon' },
    { value: 136, nationalDexNumber: 136, name: 'Flareon' },
    { value: 137, nationalDexNumber: 137, name: 'Porygon' },
    { value: 138, nationalDexNumber: 138, name: 'Omanyte' },
    { value: 139, nationalDexNumber: 139, name: 'Omastar' },
    { value: 140, nationalDexNumber: 140, name: 'Kabuto' },
    { value: 141, nationalDexNumber: 141, name: 'Kabutops' },
    { value: 142, nationalDexNumber: 142, name: 'Aerodactyl' },
    { value: 143, nationalDexNumber: 143, name: 'Snorlax' },
    { value: 144, nationalDexNumber: 144, name: 'Articuno' },
    { value: 145, nationalDexNumber: 145, name: 'Zapdos' },
    { value: 146, nationalDexNumber: 146, name: 'Moltres' },
    { value: 147, nationalDexNumber: 147, name: 'Dratini' },
    { value: 148, nationalDexNumber: 148, name: 'Dragonair' },
    { value: 149, nationalDexNumber: 149, name: 'Dragonite' },
    { value: 150, nationalDexNumber: 150, name: 'Mewtwo' },
    { value: 151, nationalDexNumber: 151, name: 'Mew' },
    { value: 152, nationalDexNumber: 152, name: 'Chikorita' },
    { value: 153, nationalDexNumber: 153, name: 'Bayleef' },
    { value: 154, nationalDexNumber: 154, name: 'Meganium' },
    { value: 155, nationalDexNumber: 155, name: 'Cyndaquil' },
    { value: 156, nationalDexNumber: 156, name: 'Quilava' },
    { value: 157, nationalDexNumber: 157, name: 'Typhlosion' },
    { value: 158, nationalDexNumber: 158, name: 'Totodile' },
    { value: 159, nationalDexNumber: 159, name: 'Croconaw' },
    { value: 160, nationalDexNumber: 160, name: 'Feraligatr' },
    { value: 161, nationalDexNumber: 161, name: 'Sentret' },
    { value: 162, nationalDexNumber: 162, name: 'Furret' },
    { value: 163, nationalDexNumber: 163, name: 'Hoothoot' },
    { value: 164, nationalDexNumber: 164, name: 'Noctowl' },
    { value: 165, nationalDexNumber: 165, name: 'Ledyba' },
    { value: 166, nationalDexNumber: 166, name: 'Ledian' },
    { value: 167, nationalDexNumber: 167, name: 'Spinarak' },
    { value: 168, nationalDexNumber: 168, name: 'Ariados' },
    { value: 169, nationalDexNumber: 169, name: 'Crobat' },
    { value: 170, nationalDexNumber: 170, name: 'Chinchou' },
    { value: 171, nationalDexNumber: 171, name: 'Lanturn' },
    { value: 172, nationalDexNumber: 172, name: 'Pichu' },
    { value: 173, nationalDexNumber: 173, name: 'Cleffa' },
    { value: 174, nationalDexNumber: 174, name: 'Igglybuff' },
    { value: 175, nationalDexNumber: 175, name: 'Togepi' },
    { value: 176, nationalDexNumber: 176, name: 'Togetic' },
    { value: 177, nationalDexNumber: 177, name: 'Natu' },
    { value: 178, nationalDexNumber: 178, name: 'Xatu' },
    { value: 179, nationalDexNumber: 179, name: 'Mareep' },
    { value: 180, nationalDexNumber: 180, name: 'Flaaffy' },
    { value: 181, nationalDexNumber: 181, name: 'Ampharos' },
    { value: 182, nationalDexNumber: 182, name: 'Bellossom' },
    { value: 183, nationalDexNumber: 183, name: 'Marill' },
    { value: 184, nationalDexNumber: 184, name: 'Azumarill' },
    { value: 185, nationalDexNumber: 185, name: 'Sudowoodo' },
    { value: 186, nationalDexNumber: 186, name: 'Politoed' },
    { value: 187, nationalDexNumber: 187, name: 'Hoppip' },
    { value: 188, nationalDexNumber: 188, name: 'Skiploom' },
    { value: 189, nationalDexNumber: 189, name: 'Jumpluff' },
    { value: 190, nationalDexNumber: 190, name: 'Aipom' },
    { value: 191, nationalDexNumber: 191, name: 'Sunkern' },
    { value: 192, nationalDexNumber: 192, name: 'Sunflora' },
    { value: 193, nationalDexNumber: 193, name: 'Yanma' },
    { value: 194, nationalDexNumber: 194, name: 'Wooper' },
    { value: 195, nationalDexNumber: 195, name: 'Quagsire' },
    { value: 196, nationalDexNumber: 196, name: 'Espeon' },
    { value: 197, nationalDexNumber: 197, name: 'Umbreon' },
    { value: 198, nationalDexNumber: 198, name: 'Murkrow' },
    { value: 199, nationalDexNumber: 199, name: 'Slowking' },
    { value: 200, nationalDexNumber: 200, name: 'Misdreavus' },
    {
      value: 201,
      nationalDexNumber: 201,
      name: 'Unown',
      sourceNote:
        'Unown is a single species index (201) in Generation III; its 28 letter forms (A-Z, !, ' +
        '?) are determined per-individual from personality value, not by separate species ' +
        'indices. SPECIES_UNOWN_B..Z/EMARK/QMARK (internal indices 413-439 in pokefirered\'s ' +
        'species.h) exist only as pic-table lookup offsets beyond NUM_SPECIES (412) and are ' +
        'never a stored species value, so this is correctly one catalog entry, not 28.',
    },
    { value: 202, nationalDexNumber: 202, name: 'Wobbuffet' },
    { value: 203, nationalDexNumber: 203, name: 'Girafarig' },
    { value: 204, nationalDexNumber: 204, name: 'Pineco' },
    { value: 205, nationalDexNumber: 205, name: 'Forretress' },
    { value: 206, nationalDexNumber: 206, name: 'Dunsparce' },
    { value: 207, nationalDexNumber: 207, name: 'Gligar' },
    { value: 208, nationalDexNumber: 208, name: 'Steelix' },
    { value: 209, nationalDexNumber: 209, name: 'Snubbull' },
    { value: 210, nationalDexNumber: 210, name: 'Granbull' },
    { value: 211, nationalDexNumber: 211, name: 'Qwilfish' },
    { value: 212, nationalDexNumber: 212, name: 'Scizor' },
    { value: 213, nationalDexNumber: 213, name: 'Shuckle' },
    { value: 214, nationalDexNumber: 214, name: 'Heracross' },
    { value: 215, nationalDexNumber: 215, name: 'Sneasel' },
    { value: 216, nationalDexNumber: 216, name: 'Teddiursa' },
    { value: 217, nationalDexNumber: 217, name: 'Ursaring' },
    { value: 218, nationalDexNumber: 218, name: 'Slugma' },
    { value: 219, nationalDexNumber: 219, name: 'Magcargo' },
    { value: 220, nationalDexNumber: 220, name: 'Swinub' },
    { value: 221, nationalDexNumber: 221, name: 'Piloswine' },
    { value: 222, nationalDexNumber: 222, name: 'Corsola' },
    { value: 223, nationalDexNumber: 223, name: 'Remoraid' },
    { value: 224, nationalDexNumber: 224, name: 'Octillery' },
    { value: 225, nationalDexNumber: 225, name: 'Delibird' },
    { value: 226, nationalDexNumber: 226, name: 'Mantine' },
    { value: 227, nationalDexNumber: 227, name: 'Skarmory' },
    { value: 228, nationalDexNumber: 228, name: 'Houndour' },
    { value: 229, nationalDexNumber: 229, name: 'Houndoom' },
    { value: 230, nationalDexNumber: 230, name: 'Kingdra' },
    { value: 231, nationalDexNumber: 231, name: 'Phanpy' },
    { value: 232, nationalDexNumber: 232, name: 'Donphan' },
    { value: 233, nationalDexNumber: 233, name: 'Porygon2' },
    { value: 234, nationalDexNumber: 234, name: 'Stantler' },
    { value: 235, nationalDexNumber: 235, name: 'Smeargle' },
    { value: 236, nationalDexNumber: 236, name: 'Tyrogue' },
    { value: 237, nationalDexNumber: 237, name: 'Hitmontop' },
    { value: 238, nationalDexNumber: 238, name: 'Smoochum' },
    { value: 239, nationalDexNumber: 239, name: 'Elekid' },
    { value: 240, nationalDexNumber: 240, name: 'Magby' },
    { value: 241, nationalDexNumber: 241, name: 'Miltank' },
    { value: 242, nationalDexNumber: 242, name: 'Blissey' },
    { value: 243, nationalDexNumber: 243, name: 'Raikou' },
    { value: 244, nationalDexNumber: 244, name: 'Entei' },
    { value: 245, nationalDexNumber: 245, name: 'Suicune' },
    { value: 246, nationalDexNumber: 246, name: 'Larvitar' },
    { value: 247, nationalDexNumber: 247, name: 'Pupitar' },
    { value: 248, nationalDexNumber: 248, name: 'Tyranitar' },
    { value: 249, nationalDexNumber: 249, name: 'Lugia' },
    { value: 250, nationalDexNumber: 250, name: 'Ho-Oh', aliases: ['Ho Oh', 'HoOh'] },
    { value: 251, nationalDexNumber: 251, name: 'Celebi' },
    { value: 277, nationalDexNumber: 252, name: 'Treecko' },
    { value: 278, nationalDexNumber: 253, name: 'Grovyle' },
    { value: 279, nationalDexNumber: 254, name: 'Sceptile' },
    { value: 280, nationalDexNumber: 255, name: 'Torchic' },
    { value: 281, nationalDexNumber: 256, name: 'Combusken' },
    { value: 282, nationalDexNumber: 257, name: 'Blaziken' },
    { value: 283, nationalDexNumber: 258, name: 'Mudkip' },
    { value: 284, nationalDexNumber: 259, name: 'Marshtomp' },
    { value: 285, nationalDexNumber: 260, name: 'Swampert' },
    { value: 286, nationalDexNumber: 261, name: 'Poochyena' },
    { value: 287, nationalDexNumber: 262, name: 'Mightyena' },
    { value: 288, nationalDexNumber: 263, name: 'Zigzagoon' },
    { value: 289, nationalDexNumber: 264, name: 'Linoone' },
    { value: 290, nationalDexNumber: 265, name: 'Wurmple' },
    { value: 291, nationalDexNumber: 266, name: 'Silcoon' },
    { value: 292, nationalDexNumber: 267, name: 'Beautifly' },
    { value: 293, nationalDexNumber: 268, name: 'Cascoon' },
    { value: 294, nationalDexNumber: 269, name: 'Dustox' },
    { value: 295, nationalDexNumber: 270, name: 'Lotad' },
    { value: 296, nationalDexNumber: 271, name: 'Lombre' },
    { value: 297, nationalDexNumber: 272, name: 'Ludicolo' },
    { value: 298, nationalDexNumber: 273, name: 'Seedot' },
    { value: 299, nationalDexNumber: 274, name: 'Nuzleaf' },
    { value: 300, nationalDexNumber: 275, name: 'Shiftry' },
    { value: 301, nationalDexNumber: 290, name: 'Nincada' },
    { value: 302, nationalDexNumber: 291, name: 'Ninjask' },
    { value: 303, nationalDexNumber: 292, name: 'Shedinja' },
    { value: 304, nationalDexNumber: 276, name: 'Taillow' },
    { value: 305, nationalDexNumber: 277, name: 'Swellow' },
    { value: 306, nationalDexNumber: 285, name: 'Shroomish' },
    { value: 307, nationalDexNumber: 286, name: 'Breloom' },
    { value: 308, nationalDexNumber: 327, name: 'Spinda' },
    { value: 309, nationalDexNumber: 278, name: 'Wingull' },
    { value: 310, nationalDexNumber: 279, name: 'Pelipper' },
    { value: 311, nationalDexNumber: 283, name: 'Surskit' },
    { value: 312, nationalDexNumber: 284, name: 'Masquerain' },
    { value: 313, nationalDexNumber: 320, name: 'Wailmer' },
    { value: 314, nationalDexNumber: 321, name: 'Wailord' },
    { value: 315, nationalDexNumber: 300, name: 'Skitty' },
    { value: 316, nationalDexNumber: 301, name: 'Delcatty' },
    { value: 317, nationalDexNumber: 352, name: 'Kecleon' },
    { value: 318, nationalDexNumber: 343, name: 'Baltoy' },
    { value: 319, nationalDexNumber: 344, name: 'Claydol' },
    { value: 320, nationalDexNumber: 299, name: 'Nosepass' },
    { value: 321, nationalDexNumber: 324, name: 'Torkoal' },
    { value: 322, nationalDexNumber: 302, name: 'Sableye' },
    { value: 323, nationalDexNumber: 339, name: 'Barboach' },
    { value: 324, nationalDexNumber: 340, name: 'Whiscash' },
    { value: 325, nationalDexNumber: 370, name: 'Luvdisc' },
    { value: 326, nationalDexNumber: 341, name: 'Corphish' },
    { value: 327, nationalDexNumber: 342, name: 'Crawdaunt' },
    { value: 328, nationalDexNumber: 349, name: 'Feebas' },
    { value: 329, nationalDexNumber: 350, name: 'Milotic' },
    { value: 330, nationalDexNumber: 318, name: 'Carvanha' },
    { value: 331, nationalDexNumber: 319, name: 'Sharpedo' },
    { value: 332, nationalDexNumber: 328, name: 'Trapinch' },
    { value: 333, nationalDexNumber: 329, name: 'Vibrava' },
    { value: 334, nationalDexNumber: 330, name: 'Flygon' },
    { value: 335, nationalDexNumber: 296, name: 'Makuhita' },
    { value: 336, nationalDexNumber: 297, name: 'Hariyama' },
    { value: 337, nationalDexNumber: 309, name: 'Electrike' },
    { value: 338, nationalDexNumber: 310, name: 'Manectric' },
    { value: 339, nationalDexNumber: 322, name: 'Numel' },
    { value: 340, nationalDexNumber: 323, name: 'Camerupt' },
    { value: 341, nationalDexNumber: 363, name: 'Spheal' },
    { value: 342, nationalDexNumber: 364, name: 'Sealeo' },
    { value: 343, nationalDexNumber: 365, name: 'Walrein' },
    { value: 344, nationalDexNumber: 331, name: 'Cacnea' },
    { value: 345, nationalDexNumber: 332, name: 'Cacturne' },
    { value: 346, nationalDexNumber: 361, name: 'Snorunt' },
    { value: 347, nationalDexNumber: 362, name: 'Glalie' },
    { value: 348, nationalDexNumber: 337, name: 'Lunatone' },
    { value: 349, nationalDexNumber: 338, name: 'Solrock' },
    { value: 350, nationalDexNumber: 298, name: 'Azurill' },
    { value: 351, nationalDexNumber: 325, name: 'Spoink' },
    { value: 352, nationalDexNumber: 326, name: 'Grumpig' },
    { value: 353, nationalDexNumber: 311, name: 'Plusle' },
    { value: 354, nationalDexNumber: 312, name: 'Minun' },
    { value: 355, nationalDexNumber: 303, name: 'Mawile' },
    { value: 356, nationalDexNumber: 307, name: 'Meditite' },
    { value: 357, nationalDexNumber: 308, name: 'Medicham' },
    { value: 358, nationalDexNumber: 333, name: 'Swablu' },
    { value: 359, nationalDexNumber: 334, name: 'Altaria' },
    { value: 360, nationalDexNumber: 360, name: 'Wynaut' },
    { value: 361, nationalDexNumber: 355, name: 'Duskull' },
    { value: 362, nationalDexNumber: 356, name: 'Dusclops' },
    { value: 363, nationalDexNumber: 315, name: 'Roselia' },
    { value: 364, nationalDexNumber: 287, name: 'Slakoth' },
    { value: 365, nationalDexNumber: 288, name: 'Vigoroth' },
    { value: 366, nationalDexNumber: 289, name: 'Slaking' },
    { value: 367, nationalDexNumber: 316, name: 'Gulpin' },
    { value: 368, nationalDexNumber: 317, name: 'Swalot' },
    { value: 369, nationalDexNumber: 357, name: 'Tropius' },
    { value: 370, nationalDexNumber: 293, name: 'Whismur' },
    { value: 371, nationalDexNumber: 294, name: 'Loudred' },
    { value: 372, nationalDexNumber: 295, name: 'Exploud' },
    { value: 373, nationalDexNumber: 366, name: 'Clamperl' },
    { value: 374, nationalDexNumber: 367, name: 'Huntail' },
    { value: 375, nationalDexNumber: 368, name: 'Gorebyss' },
    { value: 376, nationalDexNumber: 359, name: 'Absol' },
    { value: 377, nationalDexNumber: 353, name: 'Shuppet' },
    { value: 378, nationalDexNumber: 354, name: 'Banette' },
    { value: 379, nationalDexNumber: 336, name: 'Seviper' },
    { value: 380, nationalDexNumber: 335, name: 'Zangoose' },
    { value: 381, nationalDexNumber: 369, name: 'Relicanth' },
    { value: 382, nationalDexNumber: 304, name: 'Aron' },
    { value: 383, nationalDexNumber: 305, name: 'Lairon' },
    { value: 384, nationalDexNumber: 306, name: 'Aggron' },
    { value: 385, nationalDexNumber: 351, name: 'Castform' },
    { value: 386, nationalDexNumber: 313, name: 'Volbeat' },
    { value: 387, nationalDexNumber: 314, name: 'Illumise' },
    { value: 388, nationalDexNumber: 345, name: 'Lileep' },
    { value: 389, nationalDexNumber: 346, name: 'Cradily' },
    { value: 390, nationalDexNumber: 347, name: 'Anorith' },
    { value: 391, nationalDexNumber: 348, name: 'Armaldo' },
    { value: 392, nationalDexNumber: 280, name: 'Ralts' },
    { value: 393, nationalDexNumber: 281, name: 'Kirlia' },
    { value: 394, nationalDexNumber: 282, name: 'Gardevoir' },
    { value: 395, nationalDexNumber: 371, name: 'Bagon' },
    { value: 396, nationalDexNumber: 372, name: 'Shelgon' },
    { value: 397, nationalDexNumber: 373, name: 'Salamence' },
    { value: 398, nationalDexNumber: 374, name: 'Beldum' },
    { value: 399, nationalDexNumber: 375, name: 'Metang' },
    { value: 400, nationalDexNumber: 376, name: 'Metagross' },
    { value: 401, nationalDexNumber: 377, name: 'Regirock' },
    { value: 402, nationalDexNumber: 378, name: 'Regice' },
    { value: 403, nationalDexNumber: 379, name: 'Registeel' },
    { value: 404, nationalDexNumber: 382, name: 'Kyogre' },
    { value: 405, nationalDexNumber: 383, name: 'Groudon' },
    { value: 406, nationalDexNumber: 384, name: 'Rayquaza' },
    { value: 407, nationalDexNumber: 380, name: 'Latias' },
    { value: 408, nationalDexNumber: 381, name: 'Latios' },
    { value: 409, nationalDexNumber: 385, name: 'Jirachi' },
    {
      value: 410,
      nationalDexNumber: 386,
      name: 'Deoxys',
      sourceNote:
        'Hoenn-native (National Dex 386), but unlike the rest of this range it is directly ' +
        'obtainable in FireRed/LeafGreen itself via the Birth Island "Aurora Ticket" event ' +
        "encounter — the one documented exception to the trade-only rule described in this " +
        "catalog's sourceNote.",
    },
    { value: 411, nationalDexNumber: 358, name: 'Chimecho' },
    {
      value: 412,
      name: 'Egg',
      sourceNote:
        "SPECIES_EGG (412, == NUM_SPECIES) is not a Pokémon — it is the real, named sentinel " +
        "value pokefirered's own code compares a box/party slot's species against directly " +
        '(e.g. GetMonData(..., MON_DATA_SPECIES_OR_EGG, ...) returns it for an unhatched egg; ' +
        'see src/pokemon.c). Included as its own entry since a script could legitimately need ' +
        'to reference it; nationalDexNumber is omitted since it has none.',
    },
  ],
};
