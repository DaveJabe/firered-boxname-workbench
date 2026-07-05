// Reusable "bounded control" presets — a small, fixed set of allowed values
// for a field, distinct from a reference catalog (which maps values to
// real-world names). Used only to SUGGEST a field control during schema
// review (see core/catalogGapAudit.ts) — nothing here rewrites a saved
// schema on its own; a human always reviews and confirms first.

import type { ActionFieldOption } from './types.js';

export type BoundedFieldPresetScope = 'global' | 'script-specific';

export interface BoundedFieldPreset {
  id: string;
  label: string;
  description: string;
  scope: BoundedFieldPresetScope;
  /** Empty for a script-specific preset — its actual range varies per script and must be set by hand. */
  options: readonly ActionFieldOption[];
}

function numericOptions(from: number, to: number): ActionFieldOption[] {
  const options: ActionFieldOption[] = [];
  for (let v = from; v <= to; v++) options.push({ value: String(v), label: String(v) });
  return options;
}

export const BOUNDED_FIELD_PRESETS: readonly BoundedFieldPreset[] = [
  {
    id: 'party-slot-1-based',
    label: 'Party slot (1–6)',
    description: 'A 1-based party slot index.',
    scope: 'global',
    options: numericOptions(1, 6),
  },
  {
    id: 'party-slot-0-based',
    label: 'Party slot (0–5)',
    description: 'A 0-based party slot index.',
    scope: 'global',
    options: numericOptions(0, 5),
  },
  {
    id: 'move-slot-0-based',
    label: 'Move slot (0–3)',
    description: 'A 0-based move slot index (a Pokémon has at most 4 moves).',
    scope: 'global',
    options: numericOptions(0, 3),
  },
  {
    id: 'box-number-frlg',
    label: 'Box number (1–14)',
    description: 'A FireRed/LeafGreen PC box number.',
    scope: 'global',
    options: numericOptions(1, 14),
  },
  {
    id: 'box-slot-1-based',
    label: 'Box slot (1–30)',
    description: 'A 1-based slot within a PC box (30 slots per box).',
    scope: 'global',
    options: numericOptions(1, 30),
  },
  {
    id: 'box-slot-0-based',
    label: 'Box slot (0–29)',
    description: 'A 0-based slot within a PC box (30 slots per box).',
    scope: 'global',
    options: numericOptions(0, 29),
  },
  {
    id: 'boolean-set-clear',
    label: 'Set/Clear (0/1)',
    description: 'A two-value flag-style field.',
    scope: 'global',
    options: [
      { value: '0', label: 'Clear (0)' },
      { value: '1', label: 'Set (1)' },
    ],
  },
  {
    id: 'npc-index-small',
    label: 'NPC index (script-specific)',
    description: 'A small NPC/person-event index — the actual range depends on the specific script and must be set by hand; there is no safe global default.',
    scope: 'script-specific',
    options: [],
  },
];

export function getBoundedFieldPreset(id: string): BoundedFieldPreset | undefined {
  return BOUNDED_FIELD_PRESETS.find((p) => p.id === id);
}
