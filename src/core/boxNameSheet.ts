// Pure formatting for the box-name sheet. No generation happens here — it
// only turns an already-computed MockGeneratedOutput into display/export
// text, verbatim. This is the single source of the "raw output string" used
// both for the Copy all button and for the rawText saved into a project.

import type { MockGeneratedOutput } from './types.js';

export function formatBoxNameSheetText(output: MockGeneratedOutput): string {
  return output.rows.map((r) => `${r.boxLabel}: ${r.text}`).join('\n');
}
