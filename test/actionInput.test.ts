import { describe, it, expect } from 'vitest';
import type { ActionField, ActionTemplate } from '../src/templates/action-templates.js';
import { defaultActionValues, coerceActionFieldValue, missingRequiredActionFields } from '../src/core/actionInput.js';

function moveField(over: Partial<ActionField> = {}): ActionField {
  return {
    key: 'move',
    label: 'Move',
    type: 'reference-select',
    required: true,
    options: [
      { value: '1', label: 'Pound — 1' },
      { value: '85', label: 'Thunderbolt — 85' },
    ],
    ...over,
  };
}

describe('reference-select fields store/coerce a numeric value only', () => {
  it('defaultActionValues seeds the first catalog option as a number when no defaultValue is set', () => {
    const template: ActionTemplate = { id: 't', label: 'T', description: '', fields: [moveField()] };
    const values = defaultActionValues(template);
    expect(values.move).toBe(1);
    expect(typeof values.move).toBe('number');
  });

  it('defaultActionValues uses the field default when set, e.g. 325 for TeachAnyMove', () => {
    const template: ActionTemplate = { id: 't', label: 'T', description: '', fields: [moveField({ defaultValue: 325 })] };
    expect(defaultActionValues(template).move).toBe(325);
  });

  it('coerceActionFieldValue converts the selected option string to a number', () => {
    const field = moveField();
    expect(coerceActionFieldValue(field, '85', undefined)).toBe(85);
    expect(typeof coerceActionFieldValue(field, '85', undefined)).toBe('number');
  });

  it('coerceActionFieldValue never returns the display label, only the numeric value', () => {
    const field = moveField();
    const coerced = coerceActionFieldValue(field, '85', undefined);
    expect(coerced).not.toBe('Thunderbolt — 85');
    expect(coerced).toBe(85);
  });

  it('coerceActionFieldValue falls back to 0 for a non-numeric string rather than throwing', () => {
    const field = moveField();
    expect(coerceActionFieldValue(field, 'not-a-number', undefined)).toBe(0);
  });

  it('missingRequiredActionFields flags a required reference-select field with no numeric value yet', () => {
    const template: ActionTemplate = { id: 't', label: 'T', description: '', fields: [moveField({ defaultValue: undefined })] };
    expect(missingRequiredActionFields(template, {}).map((f) => f.key)).toEqual(['move']);
    expect(missingRequiredActionFields(template, { move: 85 })).toEqual([]);
    expect(missingRequiredActionFields(template, { move: Number.NaN })).toHaveLength(1);
  });
});
