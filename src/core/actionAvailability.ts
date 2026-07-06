// Pure helpers summarizing supported-action availability by game/language/
// revision target — for Run Script's empty-state messaging and Setup's
// compact availability matrix. Reuses the existing supported-action
// registry, generator-input-readiness, and catalog-gap-classification
// primitives rather than reimplementing any of their logic; never scans,
// fills, verifies, or invokes a generator itself.

import type { CuratedActionSchema, GameTarget, Project } from './types.js';
import { targetLabel } from './gameTarget.js';
import { buildSupportedActionRegistry, type SupportedActionVariant } from './supportedActionRegistry.js';
import { describeGeneratorInputReadiness } from './schemaVerification.js';
import { classifySchemaField } from './catalogGapAudit.js';

/** Why a given action isn't (fully) usable for a given target, or that it is. Collapses to the Setup matrix's four cell labels — see actionAvailabilityCellLabel. */
export type ActionAvailabilityDetailKind =
  | 'ready'
  | 'missing-companion'
  | 'needs-review'
  | 'no-variant-for-target'
  | 'schema-script-mismatch';

export interface ActionAvailabilityDetail {
  kind: ActionAvailabilityDetailKind;
  /** Only meaningful when kind is 'ready' or 'missing-companion' — informational, never itself a blocker. */
  hasCatalogGaps: boolean;
}

export interface ActionAvailabilityCell {
  actionKey: string;
  actionLabel: string;
  target: GameTarget;
  detail: ActionAvailabilityDetail;
}

/** Every distinct schema field flagged as needing a registered-but-empty or partial reference catalog — same classification buildVariantCatalogAudit uses, kept in sync by calling the same exported classifier rather than re-deriving the rule. */
function schemaHasCatalogGaps(schema: CuratedActionSchema): boolean {
  return schema.fields.some((field) => {
    const classification = classifySchemaField(field, schema.scriptId, schema.scriptFilename);
    return (
      (classification.kind === 'reference-catalog-needed' || classification.kind === 'existing-catalog-partial') &&
      (field.type !== 'reference-select' || field.referenceCatalogId !== classification.catalogId)
    );
  });
}

function evaluateVariant(
  variant: SupportedActionVariant | undefined,
  project: Project,
  nowIso: () => string,
): ActionAvailabilityDetail {
  if (!variant) return { kind: 'no-variant-for-target', hasCatalogGaps: false };

  const schema = project.curatedSchemas.find((s) => s.id === variant.schemaId);
  const hasCatalogGaps = schema ? schemaHasCatalogGaps(schema) : false;

  if (variant.status === 'needs-review') return { kind: 'needs-review', hasCatalogGaps };
  if (variant.status !== 'ready') return { kind: 'schema-script-mismatch', hasCatalogGaps };

  const readiness = schema ? describeGeneratorInputReadiness(schema, project, nowIso).status : 'not-applicable';
  if (readiness === 'missing-exit-companion') return { kind: 'missing-companion', hasCatalogGaps };
  return { kind: 'ready', hasCatalogGaps };
}

/** Every distinct target that appears on at least one variant anywhere in the registry — never a guessed or invented target. */
export function collectKnownTargets(project: Project): GameTarget[] {
  const registry = buildSupportedActionRegistry(project);
  const seen = new Map<string, GameTarget>();
  for (const action of registry) {
    for (const variant of action.variants) {
      const key = targetLabel(variant.target);
      if (!seen.has(key)) seen.set(key, variant.target);
    }
  }
  return [...seen.values()];
}

/** One cell per (action, target) pair, for every action in the registry against every given target. */
export function buildActionAvailabilityMatrix(
  project: Project,
  targets: readonly GameTarget[],
  nowIso: () => string,
): ActionAvailabilityCell[] {
  const registry = buildSupportedActionRegistry(project);
  const cells: ActionAvailabilityCell[] = [];
  for (const action of registry) {
    for (const target of targets) {
      const variant = action.variants.find((v) => targetLabel(v.target) === targetLabel(target));
      cells.push({
        actionKey: action.actionKey,
        actionLabel: action.label,
        target,
        detail: evaluateVariant(variant, project, nowIso),
      });
    }
  }
  return cells;
}

export interface ActionAvailabilityForTarget {
  target: GameTarget;
  /** Every distinct action in the whole registry, regardless of whether it covers this target. */
  totalActions: number;
  readyActions: number;
  needsReview: number;
  /** Covers this target with a variant, but that variant's exit companion hasn't been resolved. */
  blockedByMissingCompanion: number;
  /** No variant exists for this exact target at all — the action simply isn't reviewed for it. */
  missingNoReviewedVariant: number;
  /** A variant exists for this target but is structurally unusable (detached/missing script/disabled/Unknown target). */
  blockedBySchemaScriptMismatch: number;
  /** Ready actions whose schema also has a catalog gap flagged — informational, a subset of readyActions, not a separate blocker. */
  blockedByCatalogGaps: number;
}

/** Summarize availability for exactly one target — Run Script's own empty-state messaging calls this for the currently selected target. */
export function summarizeActionAvailabilityForTarget(
  project: Project,
  target: GameTarget,
  nowIso: () => string,
): ActionAvailabilityForTarget {
  const registry = buildSupportedActionRegistry(project);
  const summary: ActionAvailabilityForTarget = {
    target,
    totalActions: registry.length,
    readyActions: 0,
    needsReview: 0,
    blockedByMissingCompanion: 0,
    missingNoReviewedVariant: 0,
    blockedBySchemaScriptMismatch: 0,
    blockedByCatalogGaps: 0,
  };
  for (const action of registry) {
    const variant = action.variants.find((v) => targetLabel(v.target) === targetLabel(target));
    const detail = evaluateVariant(variant, project, nowIso);
    switch (detail.kind) {
      case 'ready':
        summary.readyActions++;
        if (detail.hasCatalogGaps) summary.blockedByCatalogGaps++;
        break;
      case 'missing-companion':
        summary.blockedByMissingCompanion++;
        break;
      case 'needs-review':
        summary.needsReview++;
        break;
      case 'no-variant-for-target':
        summary.missingNoReviewedVariant++;
        break;
      case 'schema-script-mismatch':
        summary.blockedBySchemaScriptMismatch++;
        break;
    }
  }
  return summary;
}

/** Every known target with at least one ready action, most-ready first — for "nearby/available targets" in Run Script's empty state. Never includes the queried target itself. */
export function targetsWithReadyActions(project: Project, excluding: GameTarget, nowIso: () => string): Array<{ target: GameTarget; readyActions: number }> {
  return collectKnownTargets(project)
    .filter((t) => targetLabel(t) !== targetLabel(excluding))
    .map((t) => ({ target: t, readyActions: summarizeActionAvailabilityForTarget(project, t, nowIso).readyActions }))
    .filter((t) => t.readyActions > 0)
    .sort((a, b) => b.readyActions - a.readyActions);
}
