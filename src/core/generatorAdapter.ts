// Mock generator adapter (Phase 1 — placeholder output only).
//
// SAFETY CONTRACT: this adapter never computes real game-related output. It
// is a pure function of its inputs that deterministically returns a fixed
// placeholder string (MOCK_PLACEHOLDER_TEXT) for every row, regardless of the
// action template or field values it is given. It performs no file, process,
// or network I/O. A real generator (a future branch) would implement the
// same GeneratorAdapter interface — this file must not grow real generation
// logic; existing local scripts/generators remain the source of truth for
// anything operational.

import type { ActionInput, BoxNameRow, MockGeneratedOutput } from './types.js';
import type { ActionTemplate } from '../templates/action-templates.js';

/** Obvious, non-operational placeholder text used for every mock row. */
export const MOCK_PLACEHOLDER_TEXT = 'PLACEHLD';

/** Fixed number of placeholder rows a mock sheet shows in this phase. */
export const MOCK_ROW_COUNT = 3;

export interface GeneratorAdapter {
  generate(template: ActionTemplate, input: ActionInput, nowIso: () => string): MockGeneratedOutput;
}

function placeholderRows(count: number): BoxNameRow[] {
  return Array.from({ length: count }, (_, i) => ({
    boxLabel: `Box ${i + 1}`,
    rowLabel: `Row ${i + 1}`,
    text: MOCK_PLACEHOLDER_TEXT,
  }));
}

export const MockGeneratorAdapter: GeneratorAdapter = {
  generate(template, input, nowIso) {
    return {
      actionId: template.id,
      actionLabel: template.label,
      revisionLabel: input.revisionLabel,
      generatedAt: nowIso(),
      rows: placeholderRows(MOCK_ROW_COUNT),
      isMock: true,
    };
  },
};
