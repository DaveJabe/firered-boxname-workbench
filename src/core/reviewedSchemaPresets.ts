// Pure helpers for the built-in, repo-shipped "reviewed schema preset"
// catalog — distinct from the older, deliberately inert demo presets in
// core/schemaPresets.ts. A reviewed preset is only ever added to the
// catalog after a human has manually reviewed a real script's scan output
// (see sourceNotes below), so — unlike the old presets, which always force
// status: 'draft' when applied — applying a reviewed preset preserves its
// 'reviewed' status. The trust boundary is the human review that produced
// the preset in the first place, not anything this module does at runtime.
//
// SAFETY CONTRACT: matching is plain string/regex comparison over
// already-known filenames/titles/categories. Applying a preset only ever
// builds a CuratedActionSchema-shaped object for Project.curatedSchemas —
// it never scans, fills, or generates anything, and never reads script
// rawText. Nothing here is applied without an explicit user action.

import type { CuratedActionSchema, CuratedSchemaField, CuratedSchemaStatus, EsharkCategory, GameTarget } from './types.js';
import { checkTargetCompatibility } from './gameTarget.js';

/** A preset's own review state — distinct from an individual applied schema's status. */
export type ReviewedPresetStatus = CuratedSchemaStatus;

export interface ReviewedPresetMatchRules {
  /** Exact filename this preset was reviewed against (e.g. "TeachAnyMove.txt"), matched case-insensitively, exactly or normalized. */
  filenamePattern?: string;
  /** Regex source (case-insensitive), matched against the script's detected title directive. */
  titlePattern?: string;
  /** Optional files_frlg subfolder hint — only ever used to narrow/support a match, not the sole trigger in ambiguous cases. */
  category?: EsharkCategory;
}

export interface ReviewedPresetSourceNotes {
  /** ISO timestamp of when this preset was manually reviewed. */
  reviewedAt: string;
  reviewedFromScriptFilename: string;
  reviewedFromScriptTitle?: string;
  reviewerNote?: string;
}

export interface ReviewedSchemaPreset {
  id: string;
  /** Stable action concept shared across target-specific variants (e.g. "teach-any-move"). */
  actionKey: string;
  label: string;
  description: string;
  status: ReviewedPresetStatus;
  target: GameTarget;
  match: ReviewedPresetMatchRules;
  fields: readonly CuratedSchemaField[];
  sourceNotes: ReviewedPresetSourceNotes;
}

/** Lowercase, drop the extension, strip non-alphanumeric characters — for comparing filenames despite spacing/punctuation/case differences. */
export function normalizeFilenameForMatch(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\.[^./]+$/, '')
    .replace(/[^a-z0-9]/g, '');
}

function testPatternSafe(pattern: string | undefined, value: string | undefined): boolean {
  if (!pattern || !value) return false;
  try {
    return new RegExp(pattern, 'i').test(value);
  } catch {
    return false; // a malformed preset pattern should never crash the UI
  }
}

export type PresetMatchKind = 'filename' | 'normalized-filename' | 'title' | 'category';

export interface ReviewedPresetMatch {
  preset: ReviewedSchemaPreset;
  matchedBy: PresetMatchKind;
}

/**
 * Every reviewed (status: 'reviewed') preset that matches this script, by
 * exact filename, normalized filename, title pattern, or category — in that
 * priority order per preset. Draft and disabled presets in the catalog are
 * never suggested. Returns every match, not just the first: the caller
 * decides how to present zero, one, or several candidates, and must never
 * auto-apply one just because exactly one style of match fired.
 */
export function matchReviewedPresets(
  presets: readonly ReviewedSchemaPreset[],
  script: { filename: string; title?: string; category?: EsharkCategory },
): ReviewedPresetMatch[] {
  const matches: ReviewedPresetMatch[] = [];
  for (const preset of presets) {
    if (preset.status !== 'reviewed') continue;
    const kind = matchKindFor(preset, script);
    if (kind) matches.push({ preset, matchedBy: kind });
  }
  return matches;
}

function matchKindFor(
  preset: ReviewedSchemaPreset,
  script: { filename: string; title?: string; category?: EsharkCategory },
): PresetMatchKind | undefined {
  const { match } = preset;
  if (match.filenamePattern) {
    if (match.filenamePattern.toLowerCase() === script.filename.toLowerCase()) return 'filename';
    if (normalizeFilenameForMatch(match.filenamePattern) === normalizeFilenameForMatch(script.filename)) {
      return 'normalized-filename';
    }
  }
  if (match.titlePattern && testPatternSafe(match.titlePattern, script.title)) return 'title';
  if (match.category && script.category && match.category === script.category) return 'category';
  return undefined;
}

/**
 * Build the CuratedActionSchema to attach when the user explicitly applies
 * a reviewed preset to a script. Unlike core/schemaPresets.ts's
 * applyPreset(), this preserves the preset's own status (normally
 * 'reviewed') rather than forcing 'draft' — the review already happened
 * when the preset was authored and vetted into the built-in catalog.
 */
export function buildCuratedSchemaFromPreset(
  preset: ReviewedSchemaPreset,
  script: { id: string; filename: string },
): CuratedActionSchema {
  return {
    id: `${preset.id}-for-${script.id}`,
    label: preset.label,
    description: preset.description,
    actionKey: preset.actionKey,
    target: preset.target,
    scriptId: script.id,
    scriptFilename: script.filename,
    supportedRevisionLabels: [],
    fields: preset.fields,
    status: preset.status,
  };
}

/** True when this preset's target is an exact match for runTarget — used to gate "ready to run" status, mirroring defaultRunnableSchemas. */
export function isPresetReadyForTarget(preset: ReviewedSchemaPreset, runTarget: GameTarget): boolean {
  return preset.status === 'reviewed' && checkTargetCompatibility(preset.target, runTarget) === 'exact';
}

export interface ReviewedPresetExportInput {
  schema: CuratedActionSchema;
  scriptFilename: string;
  scriptTitle?: string;
  category?: EsharkCategory;
  reviewerNote?: string;
  reviewedAt: string;
}

/**
 * Build a ReviewedSchemaPreset export object from an already-saved curated
 * schema, for a developer to copy into the repo's built-in preset catalog.
 * Deliberately excludes script rawText — it only ever carries the schema's
 * own fields/target/description plus match rules and review provenance.
 */
export function buildReviewedPresetExport(input: ReviewedPresetExportInput): ReviewedSchemaPreset {
  const match: ReviewedPresetMatchRules = { filenamePattern: input.scriptFilename };
  if (input.scriptTitle) match.titlePattern = escapeRegExpLiteral(input.scriptTitle);
  if (input.category) match.category = input.category;

  const sourceNotes: ReviewedPresetSourceNotes = {
    reviewedAt: input.reviewedAt,
    reviewedFromScriptFilename: input.scriptFilename,
  };
  if (input.scriptTitle) sourceNotes.reviewedFromScriptTitle = input.scriptTitle;
  if (input.reviewerNote) sourceNotes.reviewerNote = input.reviewerNote;

  return {
    id: input.schema.actionKey ? `${input.schema.actionKey}-preset` : `${input.schema.id}-preset`,
    actionKey: input.schema.actionKey ?? input.schema.id,
    label: input.schema.label,
    description: input.schema.description,
    status: input.schema.status,
    target: input.schema.target,
    match,
    fields: input.schema.fields,
    sourceNotes,
  };
}

function escapeRegExpLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Serialize a reviewed preset for copy/export only — no rawText, no execution, no network. */
export function serializeReviewedPresetForExport(preset: ReviewedSchemaPreset): string {
  return JSON.stringify(preset, null, 2);
}

/**
 * Validate a reviewed preset before it's treated as part of the built-in
 * catalog. Returns every problem found, not just the first.
 */
export function validateReviewedPreset(preset: ReviewedSchemaPreset): string[] {
  const errors: string[] = [];
  if (!preset.id.trim()) errors.push('Preset id is required.');
  if (!preset.actionKey.trim()) errors.push('Preset actionKey is required.');
  if (!preset.label.trim()) errors.push('Preset label is required.');
  if (preset.fields.length === 0) errors.push('Preset must include at least one field.');
  if (!preset.match.filenamePattern && !preset.match.titlePattern && !preset.match.category) {
    errors.push('Preset needs at least one match rule (filename, title, or category).');
  }
  if (preset.status === 'reviewed' && (preset.target.game === 'Unknown' || preset.target.language === 'Unknown' || preset.target.revision === 'Unknown')) {
    errors.push('Reviewed presets need an explicit game/language/revision target.');
  }
  if (!preset.sourceNotes.reviewedAt.trim()) errors.push('sourceNotes.reviewedAt is required.');
  if (!preset.sourceNotes.reviewedFromScriptFilename.trim()) errors.push('sourceNotes.reviewedFromScriptFilename is required.');

  const keyCounts = new Map<string, number>();
  const variableCounts = new Map<string, number>();
  preset.fields.forEach((f, i) => {
    const label = `Field ${i + 1}${f.label ? ` ("${f.label}")` : ''}`;
    if (!f.key.trim()) errors.push(`${label}: key is required.`);
    if (!f.label.trim()) errors.push(`${label}: label is required.`);
    if (!f.variableName.trim()) errors.push(`${label}: variable name is required.`);
    if (f.key) keyCounts.set(f.key, (keyCounts.get(f.key) ?? 0) + 1);
    if (f.variableName) variableCounts.set(f.variableName, (variableCounts.get(f.variableName) ?? 0) + 1);
  });
  for (const [key, count] of keyCounts) {
    if (count > 1) errors.push(`Field key "${key}" is used more than once.`);
  }
  for (const [variableName, count] of variableCounts) {
    if (count > 1) errors.push(`Variable "${variableName}" is mapped by more than one field.`);
  }

  return errors;
}
