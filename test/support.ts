import type { ImportedTextBlock } from '../src/core/types.js';

export const ISO = '2026-01-01T00:00:00.000Z';

/** Build an ImportedTextBlock with sensible defaults for tests. */
export function makeBlock(over: Partial<ImportedTextBlock> & { rawText: string }): ImportedTextBlock {
  return {
    id: 'b1',
    title: 'T',
    categoryLabel: '',
    revisionLabel: 'Rev 1',
    notes: '',
    source: { type: 'manual-paste', label: 'test', importedAt: ISO, schemaVersion: 1 },
    ...over,
  };
}
