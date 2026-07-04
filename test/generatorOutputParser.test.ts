import { describe, it, expect } from 'vitest';
import {
  parseGeneratorOutput,
  formatCompactBoxNames,
  formatRawBoxLines,
} from '../src/core/generatorOutputParser.js';

// A harmless, invented fixture mirroring the SECTION STRUCTURE of real
// generator output (encoded command lines, a Box-name section, an "All
// commands" section, a "Raw data" section) — no real script, item ID,
// address, offset, route step, opcode, or payload byte.
const FIXTURE = [
  '0xPLACEHOLDER1 ; placeholder command line one',
  '0xPLACEHOLDER2 ; placeholder command line two',
  '',
  'Box  1: / ? U n F E 3 n   [/?UnFE3n]',
  'Box 10: A A A _ _ . o a   [AAA  .oa]',
  'Box 11: . o               [.o]',
  'Box 12: no brackets here at all',
  '',
  'All commands:',
  '0xPLACEHOLDER1',
  '0xPLACEHOLDER2',
  '',
  'Raw data:',
  '00 01 02 03',
].join('\n');

describe('parseGeneratorOutput', () => {
  it('extracts only the Box N: rows', () => {
    const parsed = parseGeneratorOutput(FIXTURE);
    expect(parsed.rows).toHaveLength(4);
  });

  it('ignores encoded command lines (0x...)', () => {
    const parsed = parseGeneratorOutput(FIXTURE);
    expect(parsed.rows.some((r) => r.rawLine.startsWith('0x'))).toBe(false);
  });

  it('ignores the "All commands" section', () => {
    const parsed = parseGeneratorOutput(FIXTURE);
    expect(parsed.rows.some((r) => r.rawLine.includes('All commands'))).toBe(false);
    // The repeated 0x lines under "All commands" must not add extra rows.
    expect(parsed.rows).toHaveLength(4);
  });

  it('ignores the "Raw data" section', () => {
    const parsed = parseGeneratorOutput(FIXTURE);
    expect(parsed.rows.some((r) => r.rawLine.includes('00 01 02 03'))).toBe(false);
  });

  it('parses box numbers correctly, including one- and two-digit numbers', () => {
    const parsed = parseGeneratorOutput(FIXTURE);
    expect(parsed.rows.map((r) => r.boxNumber)).toEqual([1, 10, 11, 12]);
  });

  it('parses spaced display text correctly, excluding the whitespace run before the bracket', () => {
    const parsed = parseGeneratorOutput(FIXTURE);
    expect(parsed.rows[0].spacedDisplay).toBe('/ ? U n F E 3 n');
    expect(parsed.rows[1].spacedDisplay).toBe('A A A _ _ . o a');
    expect(parsed.rows[2].spacedDisplay).toBe('. o');
  });

  it('parses compact bracket text correctly, preserving internal spacing', () => {
    const parsed = parseGeneratorOutput(FIXTURE);
    expect(parsed.rows[0].compactText).toBe('/?UnFE3n');
    expect(parsed.rows[1].compactText).toBe('AAA  .oa');
    expect(parsed.rows[2].compactText).toBe('.o');
  });

  it('produces a warning (not a crash) for a row with no bracketed compact text', () => {
    const parsed = parseGeneratorOutput(FIXTURE);
    const boxTwelve = parsed.rows.find((r) => r.boxNumber === 12)!;
    expect(boxTwelve.compactText).toBeNull();
    expect(boxTwelve.spacedDisplay).toBe('no brackets here at all');
    expect(parsed.warnings.some((w) => w.includes('12'))).toBe(true);
  });

  it('preserves rawText exactly', () => {
    const parsed = parseGeneratorOutput(FIXTURE);
    expect(parsed.rawText).toBe(FIXTURE);
  });

  it('warns when no Box N: rows are found at all, but still preserves rawText', () => {
    const noBoxText = '0xPLACEHOLDER1\nAll commands:\n0xPLACEHOLDER1\nRaw data:\n00 01';
    const parsed = parseGeneratorOutput(noBoxText);
    expect(parsed.rows).toEqual([]);
    expect(parsed.rawText).toBe(noBoxText);
    expect(parsed.warnings.some((w) => w.includes('No "Box N:" rows'))).toBe(true);
  });

  it('handles one-digit and two-digit box numbers, and one or more spaces after "Box"', () => {
    const parsed = parseGeneratorOutput('Box 1: a [a]\nBox  99: b [b]');
    expect(parsed.rows.map((r) => r.boxNumber)).toEqual([1, 99]);
  });

  it('is deterministic for the same input', () => {
    expect(parseGeneratorOutput(FIXTURE)).toEqual(parseGeneratorOutput(FIXTURE));
  });
});

describe('formatCompactBoxNames', () => {
  it('joins only the compact bracket text for rows that have it, one per line', () => {
    const parsed = parseGeneratorOutput(FIXTURE);
    expect(formatCompactBoxNames(parsed.rows)).toBe('/?UnFE3n\nAAA  .oa\n.o');
  });

  it('returns an empty string when no rows have compact text', () => {
    const parsed = parseGeneratorOutput('Box 1: no brackets\nBox 2: still none');
    expect(formatCompactBoxNames(parsed.rows)).toBe('');
  });
});

describe('formatRawBoxLines', () => {
  it('joins the original raw Box N: lines exactly, one per line', () => {
    const parsed = parseGeneratorOutput(FIXTURE);
    expect(formatRawBoxLines(parsed.rows)).toBe(
      [
        'Box  1: / ? U n F E 3 n   [/?UnFE3n]',
        'Box 10: A A A _ _ . o a   [AAA  .oa]',
        'Box 11: . o               [.o]',
        'Box 12: no brackets here at all',
      ].join('\n'),
    );
  });
});
