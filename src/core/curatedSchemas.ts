// Pure helpers for curated action schemas (mock mode only).
//
// A CuratedActionSchema only ever changes which fields the Action Builder
// renders and validates. Generation itself is untouched: toActionTemplateShape
// produces the same ActionTemplate-shaped object the built-in mock templates
// use, so the Action Builder can call MockGeneratorAdapter identically either
// way — it never reads variableName, helpText, or warnings, so no script
// filling or real generation can happen through this path.

import type { ActionTemplate } from '../templates/action-templates.js';
import type { CuratedActionSchema } from './types.js';
import { normalizeLabel } from './normalize.js';

/** Adapt a CuratedActionSchema to the same shape the Action Builder already
 *  renders/validates for built-in templates — no catalog wiring needed. */
export function toActionTemplateShape(schema: CuratedActionSchema): ActionTemplate {
  return {
    id: schema.id,
    label: schema.label,
    description: schema.description,
    fields: schema.fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.options,
      defaultValue: f.defaultValue,
    })),
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
