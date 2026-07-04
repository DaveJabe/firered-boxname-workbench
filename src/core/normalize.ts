// Small, pure string helpers used by the validators.
// None of these interpret content; they only measure and normalize whitespace/case.

/** Collapse internal whitespace, trim, and case-fold — for comparing labels only. */
export function normalizeLabel(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

/** Split on any newline style without dropping trailing empties beyond the last. */
export function splitLines(s: string): string[] {
  return s.split(/\r\n|\r|\n/);
}

/** Count characters either by Unicode code point or by UTF-16 code unit. */
export function countChars(s: string, mode: 'codepoints' | 'utf16'): number {
  return mode === 'utf16' ? s.length : Array.from(s).length;
}

/** True when a string is missing or only whitespace. */
export function isBlank(s: string | undefined | null): boolean {
  return !s || s.trim().length === 0;
}

export interface NumberedLine {
  n: number;
  text: string;
}

/**
 * Pair each line with a 1-based line number for DISPLAY ONLY.
 * The line text is carried through verbatim — this never edits content, it only
 * attaches a number so the UI can render a gutter. Concatenating the `text`
 * values back with "\n" reproduces the input (modulo original newline style).
 */
export function numberLines(text: string): NumberedLine[] {
  return splitLines(text).map((t, i) => ({ n: i + 1, text: t }));
}
