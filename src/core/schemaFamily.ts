// Pure "schema family" helpers — group scripts by candidate shape so a
// reviewer can prioritize similar-looking scripts instead of re-reviewing
// hundreds of scripts line by line.
//
// SAFETY CONTRACT: a shared shape signature is NEVER a claim of semantic
// correctness — two scripts with the same variable names/shapes could still
// do entirely different things. This is a review-prioritization tool only;
// nothing here scans, fills, or marks anything reviewed automatically.

import type { CuratedActionSchema, EsharkCategory, ScriptFile } from './types.js';

export interface SchemaShapeSignature {
  /** Deterministic, comparable-by-equality key derived from the fields below. */
  key: string;
  userFacingNames: readonly string[];
  internalNames: readonly string[];
  inputHints: readonly string[];
  fieldCount: number;
  category?: EsharkCategory;
}

/**
 * A script's candidate shape — user-facing candidate names, @input hints,
 * field count, internal/helper names, and category — for grouping "scripts
 * that look alike," not for inferring what a script does. Undefined for a
 * script that hasn't been scanned yet (nothing to compute a shape from).
 */
export function computeSchemaShapeSignature(script: ScriptFile): SchemaShapeSignature | undefined {
  const candidates = script.lastScan?.candidates;
  if (!candidates) return undefined;
  const userFacingNames = candidates.filter((c) => !c.internal).map((c) => c.name).sort();
  const internalNames = candidates.filter((c) => c.internal).map((c) => c.name).sort();
  const inputHints = Array.from(
    new Set(candidates.filter((c) => !c.internal && c.inputHint).map((c) => c.inputHint!)),
  ).sort();
  const key = [userFacingNames.join(','), inputHints.join(','), String(userFacingNames.length), script.category ?? ''].join('|');
  const signature: SchemaShapeSignature = { key, userFacingNames, internalNames, inputHints, fieldCount: userFacingNames.length };
  if (script.category) signature.category = script.category;
  return signature;
}

export interface SchemaShapeFamily {
  key: string;
  signature: SchemaShapeSignature;
  scripts: readonly ScriptFile[];
}

/**
 * Group every scanned script by candidate shape — e.g. an "item/count"
 * family, a "move/moveSlot/NPC" family, a "flag/value" family, a "warp/map"
 * family, or a "no-input script" family (zero user-facing candidates).
 * Unscanned scripts are skipped (no signature to group by). Sorted by
 * family size, largest first, since that's the highest-value place for a
 * reviewer to start.
 */
export function groupScriptsByShapeSignature(scripts: readonly ScriptFile[]): SchemaShapeFamily[] {
  const groups = new Map<string, { signature: SchemaShapeSignature; scripts: ScriptFile[] }>();
  for (const script of scripts) {
    const signature = computeSchemaShapeSignature(script);
    if (!signature) continue;
    const existing = groups.get(signature.key);
    if (existing) existing.scripts.push(script);
    else groups.set(signature.key, { signature, scripts: [script] });
  }
  return Array.from(groups.entries())
    .map(([key, { signature, scripts: familyScripts }]) => ({ key, signature, scripts: familyScripts }))
    .sort((a, b) => b.scripts.length - a.scripts.length || a.key.localeCompare(b.key));
}

/** Other scanned scripts sharing the same candidate shape as `script` — a review-prioritization hint only, never a semantic match. */
export function findSimilarScripts(script: ScriptFile, allScripts: readonly ScriptFile[]): ScriptFile[] {
  const signature = computeSchemaShapeSignature(script);
  if (!signature) return [];
  return allScripts.filter((s) => s.id !== script.id && computeSchemaShapeSignature(s)?.key === signature.key);
}

/**
 * Copy a reviewed schema's field mapping onto another script in the same
 * shape family, as a fresh DRAFT — never inherits "reviewed" status, never
 * carries over actionKey (the copy isn't assumed to be the same action just
 * because the candidate shape matches), and always gets a new id. A human
 * must review and explicitly mark it reviewed before it can ever become
 * runnable — see isSchemaRunnable in core/curatedSchemas.ts.
 */
export function createDraftSchemaFromFamilyMember(
  reviewedSchema: CuratedActionSchema,
  targetScript: ScriptFile,
): CuratedActionSchema {
  const draft: CuratedActionSchema = {
    ...reviewedSchema,
    id: `${reviewedSchema.id}-family-${targetScript.id}`,
    scriptId: targetScript.id,
    scriptFilename: targetScript.filename,
    status: 'draft',
  };
  delete draft.actionKey;
  return draft;
}
