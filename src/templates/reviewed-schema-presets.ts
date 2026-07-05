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
        type: 'text',
        required: true,
        variableName: 'Move',
        helpText: 'Move to teach — enter your own move ID/name. This app does not look moves up in any database.',
      },
      {
        key: 'MoveSlot',
        label: 'Move slot',
        type: 'text',
        required: true,
        variableName: 'MoveSlot',
        helpText: "Which of the target Pokémon's move slots to overwrite.",
      },
      {
        key: 'NPC',
        label: 'NPC',
        type: 'text',
        required: true,
        variableName: 'NPC',
        helpText: 'Which NPC/Pokémon this applies to — enter your own reference value.',
      },
    ],
    sourceNotes: {
      reviewedAt: '2026-07-05T00:00:00.000Z',
      reviewedFromScriptFilename: 'TeachAnyMove.txt',
      reviewerNote:
        'Move, MoveSlot, and NPC are the user-facing fields. ScriptStart, ScriptEnd, and NPCOffset are internal/helper variables and are deliberately excluded.',
    },
  },
];
