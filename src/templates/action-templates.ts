// Placeholder FireRed action templates (Phase 1 — mock output only).
//
// These are UI/template placeholders only. Field options use neutral labels
// (Option A, Option B, Example item) and carry NO real item IDs, bag pocket
// IDs, map IDs, coordinates, offsets, addresses, opcodes, or other
// implementation values. Selecting a template and filling its fields only
// feeds the mock generator adapter (src/core/generatorAdapter.ts), which
// always returns a fixed placeholder string — nothing here encodes or
// derives real game data.

import type { ActionFieldValue, ActionFieldType, ActionFieldOption } from '../core/types.js';

export interface ActionField {
  key: string;
  label: string;
  type: ActionFieldType;
  required: boolean;
  placeholder?: string;
  /**
   * Only meaningful for type 'select' or 'reference-select'. For built-in
   * templates these are neutral placeholder labels; for a curated schema's
   * 'reference-select' field, toActionTemplateShape resolves these from a
   * local reference catalog (see core/referenceData.ts) at render time.
   */
  options?: readonly ActionFieldOption[];
  defaultValue?: ActionFieldValue;
  /** Only meaningful for type 'number'. Display-only range hint — never enforced or evaluated. */
  min?: number;
  max?: number;
}

export interface ActionTemplate {
  id: string;
  label: string;
  description: string;
  fields: readonly ActionField[];
}

const ADD_ITEM_TO_BAG: ActionTemplate = {
  id: 'add-item-to-bag',
  label: 'Add item to bag',
  description:
    'Placeholder template for an "add item" action. Options below are neutral labels, not real item data.',
  fields: [
    {
      key: 'item',
      label: 'Item (placeholder)',
      type: 'select',
      required: true,
      options: [
        { value: 'option-a', label: 'Example item A' },
        { value: 'option-b', label: 'Example item B' },
        { value: 'option-c', label: 'Example item C' },
      ],
    },
    { key: 'quantity', label: 'Quantity', type: 'number', required: true, defaultValue: 1 },
    { key: 'notes', label: 'Notes', type: 'text', required: false, placeholder: 'Optional notes for your own records' },
  ],
};

const SET_MONEY_AMOUNT: ActionTemplate = {
  id: 'set-money-amount',
  label: 'Set money amount',
  description:
    'Placeholder template for a "set money" action. The amount is a user-typed placeholder value only.',
  fields: [
    { key: 'amount', label: 'Amount (placeholder)', type: 'number', required: true, defaultValue: 0 },
    { key: 'confirmHighValue', label: 'Confirm high value', type: 'checkbox', required: false, defaultValue: false },
  ],
};

const WARP: ActionTemplate = {
  id: 'warp',
  label: 'Warp',
  description:
    'Placeholder template for a "warp" action. Destination options are neutral labels, not real map IDs or coordinates.',
  fields: [
    {
      key: 'destination',
      label: 'Destination (placeholder)',
      type: 'select',
      required: true,
      options: [
        { value: 'option-a', label: 'Example destination A' },
        { value: 'option-b', label: 'Example destination B' },
      ],
    },
    { key: 'note', label: 'Note', type: 'text', required: false, placeholder: 'Optional notes for your own records' },
  ],
};

export const ACTION_TEMPLATES: readonly ActionTemplate[] = Object.freeze([
  ADD_ITEM_TO_BAG,
  SET_MONEY_AMOUNT,
  WARP,
]);

export function getActionTemplate(id: string): ActionTemplate | undefined {
  return ACTION_TEMPLATES.find((t) => t.id === id);
}
