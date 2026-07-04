// Pure formatting for the box-name sheet. No generation happens here — it
// only turns an already-computed MockGeneratedOutput into display/export
// text, verbatim. This is the single source of the "raw output string" used
// both for the Copy all button and for the rawText saved into a project.

import type { MockGeneratedOutput, PastedOutputRow } from './types.js';
import { splitLines } from './normalize.js';

export function formatBoxNameSheetText(output: MockGeneratedOutput): string {
  return output.rows.map((r) => `${r.boxLabel}: ${r.text}`).join('\n');
}

/**
 * Split manually pasted generator output into rows for DISPLAY ONLY. This
 * never changes the raw text that gets saved — it only pairs each line with
 * a row number and an optional "Box N" label for the presenter.
 */
export function splitPastedOutputForDisplay(rawText: string, startingBoxNumber: number | null): PastedOutputRow[] {
  return splitLines(rawText).map((text, i) => ({
    rowNumber: i + 1,
    boxLabel: startingBoxNumber !== null ? `Box ${startingBoxNumber + i}` : null,
    text,
  }));
}
