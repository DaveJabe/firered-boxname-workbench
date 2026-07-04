// Pure helpers for the (inert, demo-only) curated-schema preset system.
//
// SAFETY CONTRACT: a preset only ever produces a CuratedActionSchema-shaped
// object for a human to review before it's used — applying a preset always
// forces status: 'draft', so applying one can never itself mark a schema
// reviewed. This module never scans a script, fills one, or generates
// anything; matching is plain string/regex comparison over already-known
// filenames and titles.

import type { CuratedActionSchema } from './types.js';

export interface CuratedSchemaPreset {
  id: string;
  label: string;
  /** Regex source (case-insensitive), matched against the script's filename. */
  matchFilenamePattern?: string;
  /** Regex source (case-insensitive), matched against the script's detected title, if any. */
  matchTitlePattern?: string;
  /** Schema content to attach when applied — scriptId/scriptFilename/status are set at apply time. */
  schema: Omit<CuratedActionSchema, 'scriptId' | 'scriptFilename' | 'status'>;
}

function testPattern(pattern: string | undefined, value: string | undefined): boolean {
  if (!pattern || !value) return false;
  try {
    return new RegExp(pattern, 'i').test(value);
  } catch {
    return false; // a malformed preset pattern should never crash the UI
  }
}

/** The first preset whose filename or title pattern matches this script, if any. */
export function findMatchingPreset(
  presets: readonly CuratedSchemaPreset[],
  script: { filename: string; title?: string },
): CuratedSchemaPreset | undefined {
  return presets.find(
    (p) => testPattern(p.matchFilenamePattern, script.filename) || testPattern(p.matchTitlePattern, script.title),
  );
}

/**
 * Build the CuratedActionSchema to attach for this script from a preset.
 * Always status: 'draft' — applying a preset still requires the user to
 * review and save it like any other curated schema; it is never
 * auto-marked reviewed just because it came from a preset.
 */
export function applyPreset(preset: CuratedSchemaPreset, script: { id: string; filename: string }): CuratedActionSchema {
  return {
    ...preset.schema,
    id: `${preset.id}-for-${script.id}`,
    scriptId: script.id,
    scriptFilename: script.filename,
    status: 'draft',
  };
}
