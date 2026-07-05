// Pure helpers for the "supported action" registry — the action-first model
// Run Script renders from (see app.ts's renderActions), grouping curated
// schemas that share an actionKey into one SupportedAction with one
// SupportedActionVariant per game/language/revision target instead of
// exposing raw scripts/schemas directly.
//
// SAFETY CONTRACT: every function here only reads already-known
// Project data (scripts, curatedSchemas) — no scanning, filling,
// generation, or network I/O happens here.

import type { CuratedActionSchema, EsharkCategory, GameTarget, Project, ScriptFile } from './types.js';
import { checkTargetCompatibility, isUnknownTarget } from './gameTarget.js';
import { summarizeSupportedScripts } from './supportedScripts.js';

export type SupportedActionVariantStatus =
  | 'ready'
  | 'missing-script'
  | 'needs-review'
  | 'incompatible-target'
  | 'disabled';

/** One target-specific variant of a supported action — always backed by exactly one curated schema. */
export interface SupportedActionVariant {
  variantId: string;
  actionKey: string;
  target: GameTarget;
  schemaId: string;
  /** Present only when the underlying schema is still linked to a script. */
  scriptId?: string;
  scriptFilename?: string;
  relativePath?: string;
  category?: EsharkCategory;
  status: SupportedActionVariantStatus;
  /** The schema's own description, carried over verbatim — never invented. */
  sourceNotes?: string;
}

/** One action concept, grouping every schema that shares an actionKey (e.g. FireRed 1.0/1.1, LeafGreen 1.0/1.1, ...). */
export interface SupportedAction {
  actionKey: string;
  label: string;
  description: string;
  category?: EsharkCategory;
  tags: readonly string[];
  variants: readonly SupportedActionVariant[];
}

/**
 * Every project.curatedSchemas entry, grouped by actionKey — schemas with no
 * actionKey of their own are each their own single-schema group, keyed by
 * their id, rather than being silently merged into an unrelated group.
 */
export function groupSchemasByActionKey(project: Project): Map<string, CuratedActionSchema[]> {
  const groups = new Map<string, CuratedActionSchema[]>();
  for (const schema of project.curatedSchemas) {
    const key = schema.actionKey ?? schema.id;
    const group = groups.get(key);
    if (group) group.push(schema);
    else groups.set(key, [schema]);
  }
  return groups;
}

/**
 * A variant's status — only ever "ready" when the schema is reviewed,
 * still linked to a script that exists, has an explicit (non-Unknown)
 * target, and has at least one field. Mirrors isSchemaRunnable's
 * structural rules (core/curatedSchemas.ts), independent of any specific
 * selected target — target compatibility is checked separately by callers
 * that have a target to compare against (e.g. getRunnableActionsForTarget).
 */
function buildVariantStatus(schema: CuratedActionSchema, project: Project): SupportedActionVariantStatus {
  if (schema.status === 'disabled') return 'disabled';
  if (!schema.scriptId || !project.scripts.some((s) => s.id === schema.scriptId)) return 'missing-script';
  if (schema.status === 'draft') return 'needs-review';
  if (isUnknownTarget(schema.target)) return 'incompatible-target';
  if (schema.fields.length === 0) return 'needs-review'; // reviewed and linked, but nothing to fill in yet
  return 'ready';
}

function buildVariantForSchema(schema: CuratedActionSchema, project: Project): SupportedActionVariant {
  const script = schema.scriptId ? project.scripts.find((s) => s.id === schema.scriptId) : undefined;
  const variant: SupportedActionVariant = {
    variantId: schema.id,
    actionKey: schema.actionKey ?? schema.id,
    target: schema.target,
    schemaId: schema.id,
    status: buildVariantStatus(schema, project),
  };
  if (schema.scriptId) variant.scriptId = schema.scriptId;
  if (schema.scriptFilename) variant.scriptFilename = schema.scriptFilename;
  if (script?.relativePath) variant.relativePath = script.relativePath;
  if (script?.category) variant.category = script.category;
  if (schema.description) variant.sourceNotes = schema.description;
  return variant;
}

/**
 * The full action registry: one SupportedAction per distinct actionKey (or
 * per standalone schema id, for schemas with no actionKey), each carrying
 * every target-specific variant — FireRed 1.0/1.1, LeafGreen 1.0/1.1, and
 * any future language, all kept as separate variants under the same action
 * rather than duplicated as unrelated top-level entries.
 */
export function buildSupportedActionRegistry(project: Project): SupportedAction[] {
  const groups = groupSchemasByActionKey(project);
  const actions: SupportedAction[] = [];
  for (const [actionKey, schemas] of groups) {
    const variants = schemas.map((schema) => buildVariantForSchema(schema, project));
    const first = schemas[0]!;
    const category = variants.find((v) => v.category)?.category;
    const action: SupportedAction = {
      actionKey,
      label: first.label,
      description: first.description,
      tags: [],
      variants,
    };
    if (category) action.category = category;
    actions.push(action);
  }
  return actions.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Actions with at least one ready variant that exactly matches the
 * selected target — Run Script's own candidate list. An action with no
 * matching ready variant for this target is omitted entirely, not shown
 * with an empty variant list.
 */
export function getRunnableActionsForTarget(project: Project, target: GameTarget): SupportedAction[] {
  const registry = buildSupportedActionRegistry(project);
  const result: SupportedAction[] = [];
  for (const action of registry) {
    const variants = action.variants.filter(
      (v) => v.status === 'ready' && checkTargetCompatibility(v.target, target) === 'exact',
    );
    if (variants.length > 0) result.push({ ...action, variants });
  }
  return result;
}

/** The ready, exact-target-matching variants for one specific action — empty if the action or a match doesn't exist. */
export function getReadyVariantsForAction(
  project: Project,
  actionKey: string,
  target: GameTarget,
): SupportedActionVariant[] {
  const action = buildSupportedActionRegistry(project).find((a) => a.actionKey === actionKey);
  if (!action) return [];
  return action.variants.filter((v) => v.status === 'ready' && checkTargetCompatibility(v.target, target) === 'exact');
}

/** Scripts that still need a human's review before they can produce a ready variant — draft schema, or scanned-with-candidates but no schema yet. */
export function getNeedsReviewScripts(project: Project): ScriptFile[] {
  return summarizeSupportedScripts(project.scripts, project.curatedSchemas).needsReview;
}

/** Scripts scanned with zero non-internal candidates and no schema — nothing here for a human to curate a field mapping from. */
export function getUnsupportedScripts(project: Project): ScriptFile[] {
  return summarizeSupportedScripts(project.scripts, project.curatedSchemas).noCandidates;
}
