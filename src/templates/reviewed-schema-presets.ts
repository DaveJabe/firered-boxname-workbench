// Built-in, repo-shipped reviewed schema presets. Each one here has been
// manually reviewed against a real E-Sh4rk script's scanner output — see
// core/reviewedSchemaPresets.ts for the trust model this implies (applying
// one of these preserves 'reviewed' status, unlike the plain demo presets
// in schema-presets.ts, which always force 'draft').
//
// Deliberately small: seed only scripts that have actually been reviewed by
// hand, not an attempt to cover the whole E-Sh4rk catalog. Field values
// here are placeholders/help text only — no real move IDs, item IDs,
// addresses, opcodes, or payload bytes; a user fills in their own values,
// and this app never looks anything up in a move/item database.

import type { ReviewedSchemaPreset } from '../core/reviewedSchemaPresets.js';
import { MOVE_SLOT_FIELD_OPTIONS, NPC_FIELD_OPTIONS } from '../core/curatedSchemas.js';
import { getBoundedFieldPreset } from '../core/boundedFieldPresets.js';

const BOOLEAN_SET_CLEAR_OPTIONS = getBoundedFieldPreset('boolean-set-clear')!.options;

export const REVIEWED_SCHEMA_PRESETS: readonly ReviewedSchemaPreset[] = [
  {
    id: 'teach-any-move-firered-english-1-1',
    actionKey: 'teach-any-move',
    label: 'Teach Pokémon Any Move',
    description:
      'Teach a Pokémon any move, by NPC and move slot. Reviewed from TeachAnyMove.txt — only the user-facing fields are included; internal/helper variables are left out.',
    status: 'reviewed',
    target: { game: 'FireRed', language: 'English', revision: '1.1' },
    match: {
      filenamePattern: 'TeachAnyMove.txt',
      category: 'pkmn',
    },
    fields: [
      {
        key: 'Move',
        label: 'Move',
        type: 'reference-select',
        required: true,
        variableName: 'Move',
        referenceCatalogId: 'gen3-moves',
        helpText: 'Move to teach — picked from the local Gen III move catalog. Only the numeric value is ever filled into the script.',
      },
      {
        key: 'MoveSlot',
        label: 'Move slot',
        type: 'select',
        required: true,
        variableName: 'MoveSlot',
        options: MOVE_SLOT_FIELD_OPTIONS,
        helpText: "Which of the target Pokémon's move slots to overwrite.",
      },
      {
        key: 'NPC',
        label: 'NPC',
        type: 'select',
        required: true,
        variableName: 'NPC',
        options: NPC_FIELD_OPTIONS,
        helpText: 'Which NPC/Pokémon this applies to.',
      },
    ],
    sourceNotes: {
      reviewedAt: '2026-07-05T00:00:00.000Z',
      reviewedFromScriptFilename: 'TeachAnyMove.txt',
      reviewerNote:
        'Move, MoveSlot, and NPC are the user-facing fields. ScriptStart, ScriptEnd, and NPCOffset are internal/helper variables and are deliberately excluded.',
    },
  },
  {
    id: 'start-wild-battle-any-pokemon-firered-english-1-1',
    actionKey: 'start-wild-battle-any-pokemon',
    label: 'Start Wild Battle With Any Pokémon',
    description:
      'Start a wild battle against any species and level, by NPC. Reviewed from StartWildBattleWithAnyPokemon.txt — only the user-facing fields are included; internal/helper variables are left out.',
    status: 'reviewed',
    target: { game: 'FireRed', language: 'English', revision: '1.1' },
    match: {
      filenamePattern: 'StartWildBattleWithAnyPokemon.txt',
      category: 'pkmn',
    },
    fields: [
      {
        key: 'PokemonHex',
        label: 'Species',
        type: 'reference-select',
        required: true,
        variableName: 'PokemonHex',
        referenceCatalogId: 'gen3-species',
        helpText: 'Species to battle — picked from the local Gen III species catalog. Only the numeric internal index is ever filled into the script.',
      },
      {
        key: 'PokemonLV',
        label: 'Level',
        type: 'number',
        required: true,
        variableName: 'PokemonLV',
        min: 1,
        max: 100,
        helpText: 'Level of the wild Pokémon (1-100).',
      },
      {
        key: 'NPC',
        label: 'NPC',
        type: 'select',
        required: true,
        variableName: 'NPC',
        options: NPC_FIELD_OPTIONS,
        helpText: 'Which NPC/Pokémon this applies to.',
      },
    ],
    sourceNotes: {
      reviewedAt: '2026-07-05T00:00:00.000Z',
      reviewedFromScriptFilename: 'StartWildBattleWithAnyPokemon.txt',
      reviewerNote:
        'PokemonHex, PokemonLV, and NPC are the user-facing fields. ScriptStart, ScriptEnd, and NPCOffset are internal/helper variables and are deliberately excluded. ' +
        'Target follows the same "talk to the Old Gentleman NPC" Grab ACE technique, same author family, and identical NPCOffset formula as the already-reviewed ' +
        'teach-any-move preset (FireRed/English/1.1) — double-check against your own setup before relying on it for a different revision.',
    },
  },
  {
    id: 'create-gift-pokemon-bootstrapped-firered-english-1-1',
    actionKey: 'create-gift-pokemon-bootstrapped',
    label: 'Create Any Gift Pokémon (Bootstrapped)',
    description:
      'Create a gift Pokémon of any species and level, by NPC. Reviewed from CreateAnyGiftPokemonBootstrapped.txt — only the user-facing fields are included; internal/helper variables are left out.',
    status: 'reviewed',
    target: { game: 'FireRed', language: 'English', revision: '1.1' },
    match: {
      filenamePattern: 'CreateAnyGiftPokemonBootstrapped.txt',
      category: 'pkmn',
    },
    fields: [
      {
        key: 'PokemonHex',
        label: 'Species',
        type: 'reference-select',
        required: true,
        variableName: 'PokemonHex',
        referenceCatalogId: 'gen3-species',
        helpText: 'Species to create — picked from the local Gen III species catalog. Only the numeric internal index is ever filled into the script.',
      },
      {
        key: 'PokemonLV',
        label: 'Level',
        type: 'number',
        required: true,
        variableName: 'PokemonLV',
        min: 1,
        max: 100,
        helpText: 'Level of the created Pokémon (1-100).',
      },
      {
        key: 'NPC',
        label: 'NPC',
        type: 'select',
        required: true,
        variableName: 'NPC',
        options: NPC_FIELD_OPTIONS,
        helpText: 'Which NPC/Pokémon this applies to.',
      },
    ],
    sourceNotes: {
      reviewedAt: '2026-07-05T00:00:00.000Z',
      reviewedFromScriptFilename: 'CreateAnyGiftPokemonBootstrapped.txt',
      reviewerNote:
        'PokemonHex, PokemonLV, and NPC are the user-facing fields. ScriptStart, ScriptEnd, and NPCOffset are internal/helper variables and are deliberately excluded. ' +
        'Same "talk to the Old Gentleman NPC" Grab ACE technique and NPCOffset formula as the already-reviewed teach-any-move preset (FireRed/English/1.1) — ' +
        'double-check against your own setup before relying on it for a different revision. Note this preset shares the same field shape as ' +
        'start-wild-battle-any-pokemon — they are genuinely different scripts/injection targets (different ScriptStart formula), kept as separate actions.',
    },
  },
  {
    id: 'change-level-party-slot-6-firered-english-1-1',
    actionKey: 'change-level-party-slot-6',
    label: 'Change Level of Party Slot 6',
    description:
      'Set an arbitrary level for the Pokémon in party slot 6 (use Rare Candy to make it permanent). Reviewed from ChangeLevel.txt — the single user-facing field is included; the script has no internal/helper variables.',
    status: 'reviewed',
    target: { game: 'FireRed', language: 'English', revision: '1.1' },
    match: {
      filenamePattern: 'ChangeLevel.txt',
      category: 'pkmn',
    },
    fields: [
      {
        key: 'level',
        label: 'Level',
        type: 'number',
        required: true,
        variableName: 'level',
        min: 1,
        max: 100,
        helpText: 'Level to store in party slot 6 (1-100). Use Rare Candy afterward to make the change permanent.',
      },
    ],
    sourceNotes: {
      reviewedAt: '2026-07-05T00:00:00.000Z',
      reviewedFromScriptFilename: 'ChangeLevel.txt',
      reviewerNote:
        'level is the only variable in this script\'s header — no internal/helper variables to exclude. The body writes directly to a hardcoded party-slot-6 ' +
        'RAM offset; target (FireRed/English/1.1) follows this repo\'s existing convention for this address family — double-check against your own setup ' +
        'before relying on it for a different revision.',
    },
  },
  {
    id: 'create-pokemon-from-nothing-firered-english-1-1',
    actionKey: 'create-pokemon-from-nothing',
    label: 'Create Pokémon From Nothing',
    description:
      'Create a shiny Pokémon of any species directly in Box 10, Slot 19, with no other data set. Reviewed from PokemonFromNothing.txt — only the user-facing fields are included.',
    status: 'reviewed',
    target: { game: 'FireRed', language: 'English', revision: '1.1' },
    match: {
      filenamePattern: 'PokemonFromNothing.txt',
      category: 'pkmn',
    },
    fields: [
      {
        key: 'species',
        label: 'Species',
        type: 'reference-select',
        required: true,
        variableName: 'species',
        referenceCatalogId: 'gen3-species',
        helpText: 'Species to create — picked from the local Gen III species catalog. Only the numeric internal index is ever filled into the script. Must not be species value 0.',
      },
      {
        key: 'inaccurate_emu',
        label: 'Inaccurate emulator',
        type: 'select',
        required: true,
        variableName: 'inaccurate_emu',
        options: BOOLEAN_SET_CLEAR_OPTIONS,
        helpText: 'Set to 1 (Set) if you are using an emulator older than mGBA 0.9, otherwise leave at 0 (Clear).',
      },
    ],
    sourceNotes: {
      reviewedAt: '2026-07-05T00:00:00.000Z',
      reviewedFromScriptFilename: 'PokemonFromNothing.txt',
      reviewerNote:
        'species and inaccurate_emu are this script\'s only two header variables — both are genuinely user-facing (an environment toggle, not a computed ' +
        'helper), so nothing is excluded. The Pokémon this creates has no data besides species (per the script\'s own comments) — this app never claims ' +
        'otherwise.',
    },
  },
  {
    id: 'get-any-item-firered-english-1-1',
    actionKey: 'get-any-item',
    label: 'Get Any Item',
    description:
      'Inject a chosen item, at a chosen quantity, into the bottom slot of your PC. Reviewed from GetAnyItem.txt — only the user-facing fields are included.',
    status: 'reviewed',
    target: { game: 'FireRed', language: 'English', revision: '1.1' },
    match: {
      filenamePattern: 'GetAnyItem.txt',
      category: 'misc',
    },
    fields: [
      {
        key: 'item_index',
        label: 'Item',
        type: 'reference-select',
        required: true,
        variableName: 'item_index',
        referenceCatalogId: 'gen3-items',
        helpText: 'Item to inject — picked from the local Gen III item catalog. Only the numeric value is ever filled into the script.',
      },
      {
        key: 'amount',
        label: 'Amount',
        type: 'number',
        required: true,
        variableName: 'amount',
        min: 1,
        max: 65535,
        helpText: 'Quantity to inject (1-65535, per the script\'s own comment).',
      },
      {
        key: 'inaccurate_emu',
        label: 'Inaccurate emulator',
        type: 'select',
        required: true,
        variableName: 'inaccurate_emu',
        options: BOOLEAN_SET_CLEAR_OPTIONS,
        helpText: 'Set to 1 (Set) if you are using an emulator older than mGBA 0.9, otherwise leave at 0 (Clear).',
      },
    ],
    sourceNotes: {
      reviewedAt: '2026-07-06T00:00:00.000Z',
      reviewedFromScriptFilename: 'GetAnyItem.txt',
      reviewerNote:
        'item_index, amount, and inaccurate_emu are this script\'s only three header variables — all genuinely user-facing, so nothing is excluded. ' +
        'item_index is written as "item_index ? = 1" in the real script (an unusual marker between the name and "=") — recognized by the scanner\'s ' +
        'ASSIGNMENT regex and filled conservatively (the marker and surrounding spacing are preserved verbatim; only the value token after "=" changes), ' +
        'see core/scriptScanner.ts and core/scriptFiller.ts. This script uses a different injection technique (address relative to pc, no NPC involved) ' +
        'than the NPC-based presets above, and is a different category ("misc") and author — target (FireRed/English/1.1) is a judgment call following ' +
        'this repo\'s existing convention for single-variant scripts, not independently confirmed; double-check against your own setup.',
    },
  },
];
