// Pure schema verification — re-checks a saved SchemaReviewCase against its
// script/schema without a human re-reviewing everything from scratch.
//
// SAFETY CONTRACT: this only ever calls fillScriptFromSchema (manual,
// no generator invocation) and the existing pasted-output parser. It never
// executes, assembles, or runs a generator itself — verifying a review case
// is exactly as safe as filling a script and parsing pasted text by hand.

import type { CuratedActionSchema, GameTarget, GeneratorOutputProvenance, Project, SchemaReviewCase } from './types.js';
import { fillScriptFromSchema } from './scriptFiller.js';
import { parseGeneratorOutput, GENERATOR_OUTPUT_PARSER_VERSION } from './generatorOutputParser.js';
import { checkTargetCompatibility, targetLabel } from './gameTarget.js';
import { buildSupportedActionRegistry } from './supportedActionRegistry.js';

export interface SchemaReviewVerificationResult {
  status: 'passing' | 'failing';
  errors: string[];
  warnings: string[];
  changedVariables: string[];
  parsedOutputSummary?: { rowCount: number; boxNumbers: number[] };
}

/**
 * A small, deterministic, non-cryptographic content hash (32-bit FNV-1a,
 * hex-encoded) — good enough to detect "this pasted output changed since
 * the review case was saved," not a security or dedup primitive.
 */
export function hashGeneratorOutput(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Provenance for a review case's pasted-output snapshot, captured at the
 * moment Run Script's "Save as schema review case" flow saves it — the only
 * source that currently exists. Purely informational, so future
 * generator-adapter work can compare manual-paste cases against automated
 * ones; verifySchemaReviewCase never reads this.
 */
export function buildManualPasteProvenance(capturedAt: string): GeneratorOutputProvenance {
  return {
    source: 'manual-paste',
    sourceLabel: 'Manual E-Sh4rk paste-back',
    capturedAt,
    parserVersion: GENERATOR_OUTPUT_PARSER_VERSION,
  };
}

/**
 * Why this schema/variant cannot be verified right now — undefined when it
 * can. Mirrors core/curatedSchemas.ts's isSchemaStructurallyRunnable
 * criteria (minus the fields.length check, which isn't a verification
 * blocker on its own): detached (no scriptId), missing script (scriptId
 * points at a script no longer in this project), disabled, and draft-only
 * are all setup problems a reviewer must fix in Setup/Manage Scripts before
 * verification can run at all — never a silent skip.
 */
export function describeSchemaVerificationSetupError(schema: CuratedActionSchema, project: Project): string | undefined {
  if (schema.status === 'disabled') return 'Schema is disabled — cannot verify. Re-enable it in Setup first.';
  if (schema.status === 'draft') return 'Schema is still a draft — mark it reviewed in Setup before verifying.';
  if (!schema.scriptId) return 'Schema is detached from its script — cannot verify. Re-attach it to a script in Setup first.';
  if (!project.scripts.some((s) => s.id === schema.scriptId)) {
    return 'The script this schema was linked to no longer exists in this project — cannot verify.';
  }
  return undefined;
}

/**
 * Re-check a saved review case against the CURRENT state of its linked
 * schema/script — never the state at save time. Fills the script with the
 * case's saved input values, confirms the expected/forbidden variables
 * behave as recorded, and (if a generator-output snapshot was saved)
 * re-parses it and confirms it still matches. Never invokes a generator —
 * rawGeneratorOutput is always text the case's author pasted in by hand,
 * re-parsed here the same way Run Script's own paste-back does.
 *
 * Fails immediately, before ever attempting to fill anything, when the
 * schema is detached, missing its script, disabled, draft-only, or its
 * target no longer matches the review case's saved target (a schema
 * edited after the case was saved, or a genuinely incompatible/Unknown
 * target) — each with a clear, setup-facing error message rather than a
 * crash or a silently-wrong fill.
 */
export function verifySchemaReviewCase(
  project: Project,
  schema: CuratedActionSchema,
  reviewCase: SchemaReviewCase,
): SchemaReviewVerificationResult {
  const setupError = describeSchemaVerificationSetupError(schema, project);
  if (setupError) {
    return { status: 'failing', errors: [setupError], warnings: [], changedVariables: [] };
  }
  if (checkTargetCompatibility(schema.target, reviewCase.target) !== 'exact') {
    return {
      status: 'failing',
      errors: [
        `Review case target (${targetLabel(reviewCase.target)}) does not match this schema's current target ` +
          `(${targetLabel(schema.target)}) — cannot verify.`,
      ],
      warnings: [],
      changedVariables: [],
    };
  }
  const script = project.scripts.find((s) => s.id === schema.scriptId)!;

  const filled = fillScriptFromSchema(script.rawText, schema, reviewCase.inputValues);
  if (filled.errors.length > 0) {
    return { status: 'failing', errors: [...filled.errors], warnings: [], changedVariables: [] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const changedVariables = filled.changedLines.map((c) => c.variableName);
  const changedSet = new Set(changedVariables);

  for (const expected of reviewCase.expectedChangedVariables) {
    if (!changedSet.has(expected)) errors.push(`Expected "${expected}" to change, but it did not.`);
  }
  for (const forbidden of reviewCase.forbiddenChangedVariables) {
    if (changedSet.has(forbidden)) errors.push(`"${forbidden}" changed, but it is forbidden from changing.`);
  }

  // Independent of the review case's own forbidden list: the script's most
  // recent scan is the current source of truth for which variables are
  // internal/helper (candidate.internal) — catches a case authored before a
  // variable was reclassified, or a forbidden list that's gone stale. This
  // is advisory (a warning), not a hard failure, since forbiddenChangedVariables
  // is the explicit, authoritative block.
  const internalNames = new Set((script.lastScan?.candidates ?? []).filter((c) => c.internal).map((c) => c.name));
  for (const name of changedVariables) {
    if (internalNames.has(name) && !reviewCase.expectedChangedVariables.includes(name)) {
      warnings.push(`Internal/helper variable "${name}" changed unexpectedly.`);
    }
  }

  if (reviewCase.expectedFilledAssignments) {
    for (const [variableName, expectedAfter] of Object.entries(reviewCase.expectedFilledAssignments)) {
      const change = filled.changedLines.find((c) => c.variableName === variableName);
      const actualAfter = change?.after;
      if (actualAfter !== expectedAfter) {
        const gotText = actualAfter === undefined ? 'no change' : JSON.stringify(actualAfter);
        errors.push(`Expected "${variableName}" to become ${JSON.stringify(expectedAfter)}, but got ${gotText}.`);
      }
    }
  }

  let parsedOutputSummary: SchemaReviewVerificationResult['parsedOutputSummary'];
  if (reviewCase.rawGeneratorOutput !== undefined) {
    const parsed = parseGeneratorOutput(reviewCase.rawGeneratorOutput);
    if (parsed.rows.length === 0) {
      errors.push('Pasted generator output has no parseable "Box N:" rows.');
    } else {
      parsedOutputSummary = { rowCount: parsed.rows.length, boxNumbers: parsed.rows.map((r) => r.boxNumber) };
      if (reviewCase.parsedBoxRows && JSON.stringify(parsed.rows) !== JSON.stringify(reviewCase.parsedBoxRows)) {
        errors.push('Parsed box rows no longer match the review case\'s saved snapshot — the pasted output may have changed.');
      }
      if (reviewCase.generatorOutputHash && hashGeneratorOutput(reviewCase.rawGeneratorOutput) !== reviewCase.generatorOutputHash) {
        errors.push('Generator output hash no longer matches the review case\'s saved snapshot.');
      }
    }
  }

  const result: SchemaReviewVerificationResult = {
    status: errors.length === 0 ? 'passing' : 'failing',
    errors,
    warnings,
    changedVariables,
  };
  if (parsedOutputSummary) result.parsedOutputSummary = parsedOutputSummary;
  return result;
}

// --- Setup's "Schema verification" panel summary, by supported action variant

/**
 * The six states Setup's verification panel and Catalog Audit's
 * per-variant "Verification" column both surface. "Not available" is
 * distinct from "No cases": it means this variant can't be verified at
 * all right now (see describeSchemaVerificationSetupError), regardless of
 * whether any review case exists for it.
 */
export type ActionVariantVerificationStatus = 'no-cases' | 'draft-cases' | 'passing' | 'failing' | 'accepted' | 'not-available';

export interface ActionVariantVerificationSummary {
  variantId: string;
  schemaId: string;
  caseCount: number;
  status: ActionVariantVerificationStatus;
}

/**
 * One supported-action variant's verification standing (variantId is the
 * schema's own id in the current one-variant-per-schema model — see
 * core/supportedActionRegistry.ts). "Accepted" is a human's explicit
 * override (set via a "Mark as accepted" action, never computed), so it
 * always wins, even over a variant that's since become unverifiable.
 * "Not available" wins next: no point re-verifying live when the schema is
 * detached/missing its script/disabled/draft-only. "Draft cases" means
 * every saved case is still unrun (stored status 'draft'); once any case
 * has actually been run, every case is freshly re-verified live — never a
 * cached/stale result — and "failing" wins over "passing" if any one fails.
 */
export function summarizeVariantVerification(
  schema: CuratedActionSchema,
  project: Project,
  reviewCases: readonly SchemaReviewCase[],
): ActionVariantVerificationSummary {
  const cases = reviewCases.filter((c) => c.schemaId === schema.id);
  const base = { variantId: schema.id, schemaId: schema.id, caseCount: cases.length };

  if (cases.some((c) => c.status === 'accepted')) return { ...base, status: 'accepted' };
  if (describeSchemaVerificationSetupError(schema, project)) return { ...base, status: 'not-available' };
  if (cases.length === 0) return { ...base, status: 'no-cases' };
  if (cases.every((c) => c.status === 'draft')) return { ...base, status: 'draft-cases' };

  const failing = cases.some((c) => verifySchemaReviewCase(project, schema, c).status === 'failing');
  return { ...base, status: failing ? 'failing' : 'passing' };
}

/** One summary per supported-action variant in the project (every schema, not just reviewed ones — a variant that isn't ready yet still needs to show "Not available", not be silently omitted). */
export function summarizeAllVariantVerifications(project: Project): ActionVariantVerificationSummary[] {
  return project.curatedSchemas.map((schema) => summarizeVariantVerification(schema, project, project.schemaReviewCases));
}

// --- Built-in reviewed preset verification status ---------------------------

export type PresetVerificationSummaryStatus = 'no-cases' | 'draft-cases' | 'passing' | 'accepted';

/**
 * A built-in preset's verification standing, before or after it's been
 * applied to a project schema — review cases are matched by presetId, not
 * schemaId, so a preset can accumulate cases across many applications.
 * Unlike summarizeVariantVerification, this never re-verifies live (a bare
 * preset has no script of its own to fill) — it only reflects each case's
 * own last-known stored status.
 */
export function summarizePresetVerification(
  presetId: string,
  reviewCases: readonly SchemaReviewCase[],
): PresetVerificationSummaryStatus {
  const cases = reviewCases.filter((c) => c.presetId === presetId);
  if (cases.length === 0) return 'no-cases';
  if (cases.some((c) => c.status === 'accepted')) return 'accepted';
  if (cases.some((c) => c.status === 'passing')) return 'passing';
  return 'draft-cases';
}

// --- Batch verification (Setup's "Run all verification cases") -------------
//
// Unlike summarizeVariantVerification (one rolled-up status per variant,
// for the Setup table's "Status" column), this runs and reports on EVERY
// individual saved review case across the whole project, resolved fresh
// against current project state each time — for the batch "Run all
// verification cases" action and its per-case failure report. Purely
// read-only: it never mutates a SchemaReviewCase's stored `status` — the
// caller decides whether/how to persist what it learns, the same way the
// existing single-case "Run verification" click handlers already do.

export type SchemaReviewCaseRunStatus = 'passing' | 'failing' | 'not-available' | 'accepted' | 'draft';

export interface SchemaReviewCaseRunResult {
  reviewCase: SchemaReviewCase;
  actionKey?: string;
  actionLabel?: string;
  variantId?: string;
  schemaId?: string;
  scriptId?: string;
  target?: GameTarget;
  scriptFilename?: string;
  status: SchemaReviewCaseRunStatus;
  /** Present only when this case was actually live-verified (i.e. status is 'passing' or 'failing'). */
  verification?: SchemaReviewVerificationResult;
  /** Present only when status is 'not-available' — why this case couldn't be verified at all. */
  setupError?: string;
}

export interface SchemaReviewCaseBatchSummary {
  total: number;
  passing: number;
  failing: number;
  notAvailable: number;
  accepted: number;
  draft: number;
}

export interface SchemaReviewCaseBatchResult {
  results: readonly SchemaReviewCaseRunResult[];
  summary: SchemaReviewCaseBatchSummary;
}

/**
 * Run every saved SchemaReviewCase in the project, resolving each one's
 * schema/script through CURRENT project state (never trusting whatever the
 * case itself last recorded). Per case:
 *  - a schema that no longer exists, or that's detached/missing its
 *    script/disabled/draft-only/target-mismatched (see
 *    describeSchemaVerificationSetupError) is "not-available" — never
 *    silently skipped or crashed on;
 *  - a case explicitly marked "accepted" by a human keeps that status,
 *    unchecked, the same override rule summarizeVariantVerification uses;
 *  - a case still in its initial "draft" status (never yet run once by a
 *    human) is reported as "draft," not force-verified — this batch action
 *    re-checks cases that have already been vetted at least once, it
 *    doesn't promote brand-new drafts on a human's behalf;
 *  - everything else is freshly re-verified via verifySchemaReviewCase.
 */
export function runAllSchemaReviewCases(project: Project): SchemaReviewCaseBatchResult {
  const registry = buildSupportedActionRegistry(project);
  const variantsBySchemaId = new Map(
    registry.flatMap((action) => action.variants.map((variant) => [variant.schemaId, { action, variant }] as const)),
  );

  const results: SchemaReviewCaseRunResult[] = project.schemaReviewCases.map((reviewCase) => {
    const schema = reviewCase.schemaId ? project.curatedSchemas.find((s) => s.id === reviewCase.schemaId) : undefined;

    if (!schema) {
      const result: SchemaReviewCaseRunResult = {
        reviewCase,
        status: 'not-available',
        setupError: 'This case\'s schema no longer exists in this project — cannot verify.',
      };
      if (reviewCase.schemaId) result.schemaId = reviewCase.schemaId;
      if (reviewCase.actionKey) result.actionKey = reviewCase.actionKey;
      result.target = reviewCase.target;
      if (reviewCase.scriptFilename) result.scriptFilename = reviewCase.scriptFilename;
      return result;
    }

    const matchedVariant = variantsBySchemaId.get(schema.id);
    const base: Omit<SchemaReviewCaseRunResult, 'status'> = {
      reviewCase,
      variantId: schema.id,
      schemaId: schema.id,
      target: schema.target,
    };
    if (schema.actionKey) base.actionKey = schema.actionKey;
    if (matchedVariant) base.actionLabel = matchedVariant.action.label;
    if (schema.scriptId) base.scriptId = schema.scriptId;
    if (schema.scriptFilename) base.scriptFilename = schema.scriptFilename;

    if (reviewCase.status === 'accepted') {
      return { ...base, status: 'accepted' };
    }
    const setupError = describeSchemaVerificationSetupError(schema, project);
    if (setupError) {
      return { ...base, status: 'not-available', setupError };
    }
    if (reviewCase.status === 'draft') {
      return { ...base, status: 'draft' };
    }
    const verification = verifySchemaReviewCase(project, schema, reviewCase);
    return { ...base, status: verification.status, verification };
  });

  const summary: SchemaReviewCaseBatchSummary = {
    total: results.length,
    passing: results.filter((r) => r.status === 'passing').length,
    failing: results.filter((r) => r.status === 'failing').length,
    notAvailable: results.filter((r) => r.status === 'not-available').length,
    accepted: results.filter((r) => r.status === 'accepted').length,
    draft: results.filter((r) => r.status === 'draft').length,
  };

  return { results, summary };
}
