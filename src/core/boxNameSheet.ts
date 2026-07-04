// Pure formatting for the box-name sheet. No generation happens here — it
// only turns an already-computed MockGeneratedOutput into display/export
// text, verbatim. This is the single source of the "raw output string" used
// both for the Copy all button and for the rawText saved into a project.
//
// For manually PASTED generator output (as opposed to this app's own mock
// output), see src/core/generatorOutputParser.ts — real generator output
// mixes several kinds of lines, so it needs pattern-based extraction of the
// `Box N:` rows rather than a naive per-line split.

import type { MockGeneratedOutput } from './types.js';

export function formatBoxNameSheetText(output: MockGeneratedOutput): string {
  return output.rows.map((r) => `${r.boxLabel}: ${r.text}`).join('\n');
}
