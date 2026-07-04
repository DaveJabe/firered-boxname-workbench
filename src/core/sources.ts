// Provenance source-type constants and helpers (metadata only).
// No source type here triggers any generation, decoding, or external integration.

import type { TextSourceType } from './types.js';

/** Current version of the TextSource provenance shape. */
export const SOURCE_SCHEMA_VERSION = 1;

export const SOURCE_TYPES: readonly TextSourceType[] = [
  'manual-paste',
  'file-import',
  'demo-fixture',
  'external-local-tool',
  'mock-output',
  'filled-script',
];

/**
 * Source types an active code path AUTO-assigns when text is added.
 * `mock-output` is auto-assigned by the Action Builder's "Save to project"
 * action. `filled-script` is auto-assigned by "Save filled script as block".
 * `external-local-tool` is now auto-assigned too, by "Save output to
 * project" in the manual paste-back flow — it remains ALSO user-selectable
 * as a manual provenance label for existing imported blocks.
 */
export const ACTIVE_SOURCE_TYPES: readonly TextSourceType[] = [
  'manual-paste',
  'file-import',
  'demo-fixture',
  'mock-output',
  'filled-script',
  'external-local-tool',
];

/** Source types a user may pick in the block source-type selector. */
export const SELECTABLE_SOURCE_TYPES: readonly TextSourceType[] = [
  'manual-paste',
  'file-import',
  'demo-fixture',
  'external-local-tool',
  'mock-output',
  'filled-script',
];

export const SOURCE_TYPE_LABELS: Record<TextSourceType, string> = {
  'manual-paste': 'Manual paste',
  'file-import': 'File import',
  'demo-fixture': 'Demo fixture',
  'external-local-tool': 'External local tool',
  'mock-output': 'Mock generator output',
  'filled-script': 'Filled script (this app)',
};

/** Reasonable max lengths for user-typed provenance fields (validation only). */
export const SOURCE_FIELD_MAX = {
  label: 200,
  notes: 4000,
  toolName: 200,
  toolVersion: 100,
  toolUrl: 2000,
  invocationNotes: 4000,
  actionId: 200,
  actionLabel: 200,
  generatedBy: 200,
  scriptId: 200,
} as const;

export function isActiveSourceType(t: TextSourceType): boolean {
  return ACTIVE_SOURCE_TYPES.includes(t);
}
