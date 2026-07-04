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
];

/**
 * Source types an active code path AUTO-assigns when text is added.
 * `external-local-tool` is excluded here because the app never auto-assigns it —
 * a user may only choose it manually as a provenance label.
 */
export const ACTIVE_SOURCE_TYPES: readonly TextSourceType[] = ['manual-paste', 'file-import', 'demo-fixture'];

/** Source types a user may pick in the block source-type selector. */
export const SELECTABLE_SOURCE_TYPES: readonly TextSourceType[] = [
  'manual-paste',
  'file-import',
  'demo-fixture',
  'external-local-tool',
];

export const SOURCE_TYPE_LABELS: Record<TextSourceType, string> = {
  'manual-paste': 'Manual paste',
  'file-import': 'File import',
  'demo-fixture': 'Demo fixture',
  'external-local-tool': 'External local tool',
};

/** Reasonable max lengths for user-typed provenance fields (validation only). */
export const SOURCE_FIELD_MAX = {
  label: 200,
  notes: 4000,
  toolName: 200,
  toolVersion: 100,
  toolUrl: 2000,
  invocationNotes: 4000,
} as const;

export function isActiveSourceType(t: TextSourceType): boolean {
  return ACTIVE_SOURCE_TYPES.includes(t);
}
