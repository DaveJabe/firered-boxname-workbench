// Pure helpers for curated action schemas — the data behind Run Script's
// manual script-filling workflow (fillScriptFromSchema, called separately
// with the full schema) and, historically, the built-in mock templates.
//
// A CuratedActionSchema only ever changes which fields the Action Builder
// renders and validates. toActionTemplateShape strips it down to the same
// ActionField[] shape a built-in template uses, purely for rendering —
// it never reads variableName, helpText, or warnings, so no script filling
// happens through this specific conversion; filling reads the original
// CuratedActionSchema directly, not this adapted shape.

import type { ActionField, ActionTemplate } from '../templates/action-templates.js';
import type { ActionFieldOption, CuratedActionSchema, CuratedSchemaField, GameTarget, ImportedTextBlock, Project } from './types.js';
import { normalizeLabel } from './normalize.js';
import { checkTargetCompatibility, isUnknownTarget } from './gameTarget.js';
import { referenceEntryLabel } from './referenceData.js';
import { getReferenceCatalog } from '../reference/index.js';

/**
 * For a 'reference-select' field, resolve its options from the local static
 * catalog named by referenceCatalogId — never fetched, never looked up
 * remotely. Falls back to any hand-set options if the catalog id isn't
 * registered (should not normally happen, but must never crash rendering).
 */
function resolveFieldOptions(field: CuratedSchemaField): readonly ActionFieldOption[] | undefined {
  if (field.type !== 'reference-select') return field.options;
  const catalog = field.referenceCatalogId ? getReferenceCatalog(field.referenceCatalogId) : undefined;
  if (!catalog) return field.options;
  return catalog.entries.map((e) => ({ value: String(e.value), label: referenceEntryLabel(e) }));
}

/** Adapt a CuratedActionSchema to the same shape the Action Builder already
 *  renders/validates for built-in templates — no catalog wiring needed. */
export function toActionTemplateShape(schema: CuratedActionSchema): ActionTemplate {
  return {
    id: schema.id,
    label: schema.label,
    description: schema.description,
    fields: schema.fields.map(
      (f): ActionField => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        options: resolveFieldOptions(f),
        defaultValue: f.defaultValue,
        min: f.min,
        max: f.max,
      }),
    ),
  };
}

/**
 * Disabled schemas are excluded; draft and reviewed schemas are both
 * selectable for Setup/schema-editing purposes (e.g. the Manage Scripts
 * "Unattached schemas" list, editing an existing schema). This is
 * deliberately broader than Run Script's own filter — see isSchemaRunnable
 * and defaultRunnableSchemas/advancedRunnableSchemas for that.
 */
export function isSchemaSelectable(schema: CuratedActionSchema): boolean {
  return schema.status !== 'disabled';
}

/**
 * Pick which curated schema is "current" for the Action Builder: the
 * preferred id if it's still selectable, else the first selectable one, else
 * null (no selectable schemas at all — the caller must fall back to a
 * built-in template rather than generate from nothing).
 */
export function resolveCuratedSchema(
  schemas: readonly CuratedActionSchema[],
  preferredId: string,
): CuratedActionSchema | null {
  const selectable = schemas.filter(isSchemaSelectable);
  return selectable.find((s) => s.id === preferredId) ?? selectable[0] ?? null;
}

/** A schema with no listed revisions supports any revision label. */
export function supportsRevision(schema: CuratedActionSchema, revisionLabel: string): boolean {
  if (schema.supportedRevisionLabels.length === 0) return true;
  const norm = normalizeLabel(revisionLabel);
  return schema.supportedRevisionLabels.some((r) => normalizeLabel(r) === norm);
}

/** Add a new curated schema, or replace the existing one with the same id, in place. */
export function upsertCuratedSchema(schemas: CuratedActionSchema[], schema: CuratedActionSchema): void {
  const idx = schemas.findIndex((s) => s.id === schema.id);
  if (idx >= 0) schemas[idx] = schema;
  else schemas.push(schema);
}

/** Remove one schema by id, in place. Never touches Project.scripts or Project.importedBlocks. */
export function removeCuratedSchema(schemas: CuratedActionSchema[], id: string): void {
  const idx = schemas.findIndex((s) => s.id === id);
  if (idx >= 0) schemas.splice(idx, 1);
}

/**
 * A new, human-readable id for a duplicate of `baseId` that doesn't collide
 * with any id already in use — "<baseId>-copy", then "-copy-2", "-copy-3", etc.
 */
export function nextDuplicateSchemaId(baseId: string, existingIds: readonly string[]): string {
  const existing = new Set(existingIds);
  let candidate = `${baseId}-copy`;
  let n = 2;
  while (existing.has(candidate)) {
    candidate = `${baseId}-copy-${n}`;
    n += 1;
  }
  return candidate;
}

/** A copy of a schema under a new id — same script attachment, fields, and status as the original. */
export function duplicateCuratedSchema(schema: CuratedActionSchema, newId: string): CuratedActionSchema {
  return { ...schema, id: newId };
}

/** A copy of a schema no longer attached to any script, leaving the original schemas array untouched. */
export function detachCuratedSchema(schema: CuratedActionSchema): CuratedActionSchema {
  const detached: CuratedActionSchema = { ...schema };
  delete detached.scriptId;
  delete detached.scriptFilename;
  return detached;
}

/**
 * How many saved output blocks (Saved Outputs / Imported text) were
 * generated using this schema, purely for a pre-deletion warning — deleting
 * or detaching a schema never removes, alters, or invalidates these blocks;
 * TextSource.actionId is a stored string, never re-resolved against
 * Project.curatedSchemas after the fact.
 */
export function countSavedOutputsUsingSchema(blocks: readonly ImportedTextBlock[], schemaId: string): number {
  return blocks.filter((b) => b.source.actionId === schemaId).length;
}

/**
 * Every condition that makes a schema runnable in Run Script EXCEPT the
 * target match — reviewed, linked to a script that still exists in this
 * project, an explicit (non-Unknown) target of its own, and at least one
 * field to fill in. Draft, disabled, detached (no scriptId, or scriptId
 * pointing at a script that's since been removed/replaced), Unknown-target,
 * and fieldless schemas never satisfy this, regardless of target — those
 * belong in Setup/Manage Scripts, not Run Script, no matter which target is
 * selected there.
 */
function isSchemaStructurallyRunnable(schema: CuratedActionSchema, project: Project): boolean {
  return (
    schema.status === 'reviewed' &&
    !!schema.scriptId &&
    project.scripts.some((s) => s.id === schema.scriptId) &&
    !isUnknownTarget(schema.target) &&
    schema.fields.length > 0
  );
}

/**
 * True only when a schema is genuinely runnable in Run Script for
 * selectedTarget specifically: everything isSchemaStructurallyRunnable
 * checks, plus an exact match between the schema's own target and
 * selectedTarget. Never a silent fallback — an Unknown/Mixed selectedTarget
 * never exact-matches a schema's explicit target, and vice versa.
 */
export function isSchemaRunnable(
  schema: CuratedActionSchema,
  project: Project,
  selectedTarget: GameTarget,
): boolean {
  return isSchemaStructurallyRunnable(schema, project) && checkTargetCompatibility(schema.target, selectedTarget) === 'exact';
}

/**
 * Schemas that should populate Run Script's default dropdown for a selected
 * target — see isSchemaRunnable for the full criteria. Never a silent
 * fallback: draft, detached, scriptless, fieldless, Unknown-target, or
 * non-exact-target schemas are excluded entirely, not shown some other way,
 * here.
 */
export function defaultRunnableSchemas(
  schemas: readonly CuratedActionSchema[],
  project: Project,
  runTarget: GameTarget,
): CuratedActionSchema[] {
  return schemas.filter((s) => isSchemaRunnable(s, project, runTarget));
}

/**
 * Reviewed, script-linked, fielded schemas with an explicit target that
 * simply doesn't match the currently selected one — a legitimate "run this
 * for a different target" pick, meant for an explicit "show other schemas"
 * disclosure, never auto-selected. Draft, disabled, detached, and fieldless
 * schemas never appear here either — those belong in Setup, not Run Script.
 */
export function advancedRunnableSchemas(
  schemas: readonly CuratedActionSchema[],
  project: Project,
  runTarget: GameTarget,
): CuratedActionSchema[] {
  const defaultIds = new Set(defaultRunnableSchemas(schemas, project, runTarget).map((s) => s.id));
  return schemas.filter((s) => !defaultIds.has(s.id) && isSchemaStructurallyRunnable(s, project));
}

// --- Repairing stale field types (predates reference-select/select support) -

/** The known allowed move-slot indices for a "teach any move"-shaped script — display-only options, never enforced beyond the dropdown itself. */
export const MOVE_SLOT_FIELD_OPTIONS: readonly ActionFieldOption[] = [
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
];

/** The known allowed NPC/Pokémon slot indices for a "teach any move"-shaped script. */
export const NPC_FIELD_OPTIONS: readonly ActionFieldOption[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
];

/**
 * Repair one field that predates this app recognizing a known shape —
 * e.g. a "Move" field saved as plain text before gen3-moves existed, or
 * before this specific fix. Only ever upgrades type/options; never touches
 * key, label, required-ness, helpText, or default value. A field that
 * doesn't match a known shape (or is already correctly typed) is returned
 * unchanged — same object, not a copy, so callers can cheaply detect "no
 * change" via reference equality.
 */
function repairStaleSchemaField(field: CuratedSchemaField): CuratedSchemaField {
  if (field.type !== 'reference-select' && (field.inputHint === 'move' || field.variableName === 'Move')) {
    return { ...field, type: 'reference-select', referenceCatalogId: 'gen3-moves' };
  }
  if (field.type !== 'reference-select' && (field.inputHint === 'item' || field.variableName === 'Item')) {
    return { ...field, type: 'reference-select', referenceCatalogId: 'gen3-items' };
  }
  if (field.variableName === 'MoveSlot' && field.type !== 'select') {
    return { ...field, type: 'select', options: MOVE_SLOT_FIELD_OPTIONS };
  }
  if (field.variableName === 'NPC' && field.type !== 'select') {
    return { ...field, type: 'select', options: NPC_FIELD_OPTIONS };
  }
  return field;
}

/**
 * One-time local repair for a curated schema whose fields predate this app
 * recognizing Move/Item/MoveSlot/NPC shapes as dropdowns rather than plain
 * text — applied on every project load (see storage.ts's parseProject), not
 * persisted as a one-off migration script, so it stays correct even for
 * data saved by an older version of this app. A schema whose fields are
 * already correctly typed is returned unchanged (same object).
 */
export function repairStaleSchemaFields(schema: CuratedActionSchema): CuratedActionSchema {
  const fields = schema.fields.map(repairStaleSchemaField);
  const changed = fields.some((f, i) => f !== schema.fields[i]);
  return changed ? { ...schema, fields } : schema;
}
