// Pure parser for pasted external-generator output (manual generator
// workflow — no generator invocation).
//
// SAFETY CONTRACT: this module reads pasted text as TEXT ONLY, recognizing
// `Box N: ...` display lines by pattern alone. It never executes, decodes,
// or assigns operational meaning to anything else in the pasted output —
// encoded command lines (e.g. `0x...`), an "All commands" section, a "Raw
// data" section, or any other content are simply not `Box N:` lines and are
// ignored by construction, not by special-casing section names. rawText is
// always returned exactly as given; splitting into rows is for the box-name
// sheet presenter's DISPLAY ONLY and never changes what gets saved.

import type { ParsedBoxNameRow, ParsedGeneratorOutput } from './types.js';
import { splitLines } from './normalize.js';

/**
 * Bumped whenever parseGeneratorOutput's line-recognition rules change in a
 * way that could affect a previously-saved parsedBoxRows/hash comparison.
 * Recorded as provenance on a schema review case's pasted-output snapshot
 * (SchemaReviewCase.outputProvenance.parserVersion) — informational only,
 * never read or compared by verifySchemaReviewCase itself.
 */
export const GENERATOR_OUTPUT_PARSER_VERSION = 1;

// Tolerant match for a "Box N: <spaced display>   [<compact>]" line:
//  - one or more spaces after "Box" (handles "Box  1:" and "Box 10:" alike)
//  - the bracketed compact section is optional
//  - the spaced-display capture is lazy so it stops before the run of
//    whitespace leading into "[", leaving no trailing spaces in the capture
const BOX_LINE = /^\s*Box\s+(\d+)\s*:\s*(.*?)(?:\s*\[(.*)\])?\s*$/;

export function parseGeneratorOutput(rawText: string): ParsedGeneratorOutput {
  const rows: ParsedBoxNameRow[] = [];
  const warnings: string[] = [];

  for (const line of splitLines(rawText)) {
    const match = BOX_LINE.exec(line);
    if (!match) continue;
    const [, boxNumberText, spacedDisplay, compactText] = match;
    if (compactText === undefined) {
      warnings.push(`Box ${boxNumberText}: no bracketed compact text found; showing spaced display only.`);
    }
    rows.push({
      boxNumber: Number(boxNumberText),
      rawLine: line,
      spacedDisplay,
      compactText: compactText ?? null,
    });
  }

  if (rows.length === 0) {
    warnings.push('No "Box N:" rows were found. The raw output was preserved, but the box-name sheet could not be parsed.');
  }

  return { rawText, rows, warnings };
}

/** Join only the compact bracket text for rows that have it, one per line. */
export function formatCompactBoxNames(rows: readonly ParsedBoxNameRow[]): string {
  return rows
    .filter((r): r is ParsedBoxNameRow & { compactText: string } => r.compactText !== null)
    .map((r) => r.compactText)
    .join('\n');
}

/** Join the original raw `Box N:` lines exactly, one per line. */
export function formatRawBoxLines(rows: readonly ParsedBoxNameRow[]): string {
  return rows.map((r) => r.rawLine).join('\n');
}
