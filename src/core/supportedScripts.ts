// Pure helpers for classifying which scripts are actually usable right now,
// so Manage Scripts can show a compact "Supported scripts" summary instead
// of only the full scanner table.
//
// SAFETY CONTRACT: this only reads already-known ScriptFile/CuratedActionSchema
// data — no scanning, filling, or generation happens here.

import type { CuratedActionSchema, ScriptFile } from './types.js';
import { isUnknownTarget } from './gameTarget.js';

export type ScriptSupportBucket = 'ready' | 'needs-review' | 'no-candidates' | 'disabled-or-incompatible';

export interface ScriptSupportInfo {
  bucket: ScriptSupportBucket;
  /** Present only when bucket === 'ready': the schema that makes it so. */
  readySchema?: CuratedActionSchema;
}

/**
 * Classify one script, independent of whatever target happens to be
 * selected in Run Script right now — "ready" means genuinely usable, not
 * "usable if you also pick the right target over there." Priority order:
 *   1. ready — an attached schema is reviewed with an explicit (non-Unknown)
 *      target. A well-formed reviewed schema always has one; this also
 *      naturally excludes reviewed schemas that predate the target model.
 *   2. disabled-or-incompatible — an attached schema is disabled, or is
 *      reviewed but its target is still Unknown/Mixed (never exactly
 *      matchable, e.g. migrated from before the target model existed).
 *   3. needs-review — an attached schema exists but is still draft.
 *   4. no-candidates — scanned, but zero non-internal candidates and no schema.
 *   5. (falls back to needs-review) — not yet scanned, or scanned with
 *      candidates but no schema created yet.
 */
export function computeScriptSupportInfo(
  script: ScriptFile,
  curatedSchemas: readonly CuratedActionSchema[],
): ScriptSupportInfo {
  const attached = curatedSchemas.filter((s) => s.scriptId === script.id);

  const ready = attached.find((s) => s.status === 'reviewed' && !isUnknownTarget(s.target));
  if (ready) return { bucket: 'ready', readySchema: ready };

  const disabledOrUnknownTarget = attached.find((s) => s.status === 'disabled' || s.status === 'reviewed');
  if (disabledOrUnknownTarget) return { bucket: 'disabled-or-incompatible' };

  if (attached.some((s) => s.status === 'draft')) return { bucket: 'needs-review' };

  const userFacingCandidates = script.lastScan?.candidates.filter((c) => !c.internal) ?? [];
  if (script.lastScan && userFacingCandidates.length === 0) return { bucket: 'no-candidates' };

  return { bucket: 'needs-review' };
}

export interface SupportedScriptsSummary {
  ready: Array<{ script: ScriptFile; schema: CuratedActionSchema }>;
  needsReview: ScriptFile[];
  noCandidates: ScriptFile[];
  disabledOrIncompatible: ScriptFile[];
}

/** Bucket every script in one pass, for the Manage Scripts "Supported scripts" view. */
export function summarizeSupportedScripts(
  scripts: readonly ScriptFile[],
  curatedSchemas: readonly CuratedActionSchema[],
): SupportedScriptsSummary {
  const summary: SupportedScriptsSummary = { ready: [], needsReview: [], noCandidates: [], disabledOrIncompatible: [] };
  for (const script of scripts) {
    const info = computeScriptSupportInfo(script, curatedSchemas);
    switch (info.bucket) {
      case 'ready':
        summary.ready.push({ script, schema: info.readySchema! });
        break;
      case 'needs-review':
        summary.needsReview.push(script);
        break;
      case 'no-candidates':
        summary.noCandidates.push(script);
        break;
      case 'disabled-or-incompatible':
        summary.disabledOrIncompatible.push(script);
        break;
    }
  }
  return summary;
}
