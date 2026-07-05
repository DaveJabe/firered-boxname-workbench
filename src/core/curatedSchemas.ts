// Pure helpers for curated action schemas (mock mode only).
//
// A CuratedActionSchema only ever changes which fields the Action Builder
// renders and validates. Generation itself is untouched: toActionTemplateShape
// produces the same ActionTemplate-shaped object the built-in mock templates
// use, so the Action Builder can call MockGeneratorAdapter identically either
// way — it never reads variableName, helpText, or warnings, so no script
// filling or real generation can happen through this path.

import type { ActionField, ActionTemplate } from '../templates/action-templates.js';
import type { ActionFieldOption, CuratedActionSchema, CuratedSchemaField, GameTarget, ImportedTextBlock } from './types.js';
import { normalizeLabel } from './normalize.js';
import { checkTargetCompatibility } from './gameTarget.js';
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

/** Disabled schemas are excluded from selection; draft and reviewed are usable in mock mode. */
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
 * Schemas that should populate Run Script's default dropdown for a selected
 * target: reviewed, non-disabled, and an exact target match. Deliberately
 * excludes draft schemas and non-exact matches even if otherwise selectable
 * — see advancedRunnableSchemas for those. Never a silent fallback.
 */
export function defaultRunnableSchemas(
  schemas: readonly CuratedActionSchema[],
  runTarget: GameTarget,
): CuratedActionSchema[] {
  return schemas.filter((s) => s.status === 'reviewed' && checkTargetCompatibility(s.target, runTarget) === 'exact');
}

/**
 * Selectable schemas that do NOT qualify as default-runnable for this
 * target (draft status, unknown/mixed target, or a different target) —
 * meant for an explicit "show other schemas" disclosure, never auto-selected.
 */
export function advancedRunnableSchemas(
  schemas: readonly CuratedActionSchema[],
  runTarget: GameTarget,
): CuratedActionSchema[] {
  const defaultIds = new Set(defaultRunnableSchemas(schemas, runTarget).map((s) => s.id));
  return schemas.filter((s) => isSchemaSelectable(s) && !defaultIds.has(s.id));
}
