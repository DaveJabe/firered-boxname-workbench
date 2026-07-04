// Pure helpers for building and validating ActionInput values against an
// ActionTemplate. No I/O, no DOM — used by the UI layer and unit-tested
// directly here.

import type { ActionFieldValue } from './types.js';
import type { ActionField, ActionTemplate } from '../templates/action-templates.js';
import { isBlank } from './normalize.js';

function emptyFieldValue(field: ActionField): ActionFieldValue {
  if (field.type === 'checkbox') return false;
  if (field.type === 'number') return 0;
  if (field.type === 'select') return field.options?.[0]?.value ?? '';
  return '';
}

/** Seed a values map from a template's declared defaults (or a type-appropriate empty value). */
export function defaultActionValues(template: ActionTemplate): Record<string, ActionFieldValue> {
  const values: Record<string, ActionFieldValue> = {};
  for (const f of template.fields) values[f.key] = f.defaultValue ?? emptyFieldValue(f);
  return values;
}

/** Coerce a raw form value to the field's declared type. */
export function coerceActionFieldValue(field: ActionField, value: string, checked: boolean | undefined): ActionFieldValue {
  if (field.type === 'checkbox') return checked ?? false;
  if (field.type === 'number') {
    const n = Number(value);
    return Number.isNaN(n) ? 0 : n;
  }
  return value;
}

/** Required fields from the template whose current value is missing/blank/invalid. */
export function missingRequiredActionFields(
  template: ActionTemplate,
  values: Record<string, ActionFieldValue>,
): ActionField[] {
  return template.fields.filter((f) => {
    if (!f.required) return false;
    const v = values[f.key];
    if (f.type === 'text') return isBlank(typeof v === 'string' ? v : '');
    if (f.type === 'number') return typeof v !== 'number' || Number.isNaN(v);
    if (f.type === 'select') return typeof v !== 'string' || v === '';
    return false;
  });
}
