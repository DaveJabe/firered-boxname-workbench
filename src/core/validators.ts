// Formatting validators.
//
// SAFETY CONTRACT:
//   Every function in this module is a pure function of its inputs. It reads
//   text as text — counting lines, counting characters, comparing labels,
//   classifying characters for *display legibility* — and returns Finding[].
//   It never mutates its inputs and never produces, derives, or transforms
//   content. There is deliberately no code path here that decodes a value,
//   maps a character to a number, or emits anything other than review findings.

import type {
  Finding,
  FindingRule,
  FindingTarget,
  Project,
  Severity,
  ValidationResult,
  ValidationSettings,
} from './types.js';
import { countChars, isBlank, normalizeLabel, splitLines } from './normalize.js';

// --- character classification (display legibility only) ---------------------
//
// The hexadecimal numbers in the Sets below are UNICODE CODE POINTS (e.g. U+200B,
// U+0430), used purely to check how text will DISPLAY — spotting invisible
// characters, unusual spaces, and look-alike (homoglyph) letters when a human
// proofreads. They are NOT game memory addresses, offsets, values, opcodes, or
// encoded game data, and nothing here decodes text into or out of any such form.
// This module only reads text as text and returns display-legibility findings.

// Invisible / zero-width characters that are easy to miss when proofreading.
const ZERO_WIDTH = new Set<number>([
  0x200b, 0x200c, 0x200d, 0x2060, 0xfeff,
]);

// Whitespace that is not a plain space and can be mistaken for one.
const SPACE_ANOMALIES = new Set<number>([
  0x09, 0x00a0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
  0x2007, 0x2008, 0x2009, 0x200a, 0x202f, 0x205f, 0x3000,
]);

// A representative set of non-ASCII characters that look like ASCII letters
// (Cyrillic / Greek homoglyphs). Presence of these is a proofreading flag only.
const HOMOGLYPHS = new Set<number>([
  // Cyrillic uppercase look-alikes
  0x0410, 0x0412, 0x0415, 0x041a, 0x041c, 0x041d, 0x041e, 0x0420, 0x0421,
  0x0422, 0x0425,
  // Cyrillic lowercase look-alikes
  0x0430, 0x0435, 0x043e, 0x0440, 0x0441, 0x0443, 0x0445,
  // Greek look-alikes
  0x0391, 0x0392, 0x0395, 0x0396, 0x0397, 0x0399, 0x039a, 0x039c, 0x039d,
  0x039f, 0x03a1, 0x03a4, 0x03a7, 0x03bf,
]);

function isFullwidthAscii(cp: number): boolean {
  return cp >= 0xff01 && cp <= 0xff5e;
}

type CharClass =
  | { type: 'ok' }
  | { type: 'zero-width'; label: string }
  | { type: 'space-anomaly'; label: string }
  | { type: 'homoglyph'; label: string }
  | { type: 'unsupported'; label: string };

function defaultAllowed(cp: number): boolean {
  // Printable ASCII, space through tilde.
  return cp >= 0x20 && cp <= 0x7e;
}

function classifyChar(ch: string, allowedSet: Set<number> | null): CharClass {
  const cp = ch.codePointAt(0) ?? 0;
  if (ZERO_WIDTH.has(cp)) {
    return { type: 'zero-width', label: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}` };
  }
  if (SPACE_ANOMALIES.has(cp)) {
    return { type: 'space-anomaly', label: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}` };
  }
  if (HOMOGLYPHS.has(cp) || isFullwidthAscii(cp)) {
    return { type: 'homoglyph', label: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}` };
  }
  const allowed = allowedSet ? allowedSet.has(cp) : defaultAllowed(cp);
  if (allowed) return { type: 'ok' };
  return { type: 'unsupported', label: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}` };
}

// --- finding factory --------------------------------------------------------

function makeFactory() {
  let n = 0;
  return function finding(
    rule: FindingRule,
    severity: Severity,
    target: FindingTarget,
    message: string,
  ): Finding {
    n += 1;
    return { id: `${rule}#${n}`, rule, severity, target, message, acknowledged: false };
  };
}

type Emit = ReturnType<typeof makeFactory>;

// --- per-field scanners -----------------------------------------------------

function scanGlyphs(
  text: string,
  base: FindingTarget,
  allowedSet: Set<number> | null,
  emit: Emit,
): Finding[] {
  const out: Finding[] = [];
  const lines = splitLines(text);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    if (/\s$/.test(line) && line.length > 0) {
      out.push(
        emit('ambiguous-glyph', 'info', { ...base, line: lineNo, column: line.length }, 'Line has trailing whitespace.'),
      );
    }

    let col = 0;
    for (const ch of line) {
      col += 1;
      const cls = classifyChar(ch, allowedSet);
      const at = { ...base, line: lineNo, column: col };
      switch (cls.type) {
        case 'zero-width':
          out.push(emit('ambiguous-glyph', 'warning', at, `Invisible / zero-width character (${cls.label}).`));
          break;
        case 'space-anomaly':
          out.push(emit('ambiguous-glyph', 'warning', at, `Non-standard space character (${cls.label}); may read as a normal space.`));
          break;
        case 'homoglyph':
          out.push(emit('ambiguous-glyph', 'warning', at, `Look-alike character (${cls.label}); resembles an ASCII letter/digit.`));
          break;
        case 'unsupported':
          out.push(emit('unsupported-glyph', 'warning', at, `Character outside the allowed display set (${cls.label}).`));
          break;
        case 'ok':
          break;
      }
    }
  }
  return out;
}

function scanLineMetrics(
  text: string,
  base: FindingTarget,
  settings: ValidationSettings,
  emit: Emit,
): Finding[] {
  const out: Finding[] = [];
  const lines = splitLines(text);
  const count = lines.length;

  out.push(emit('line-count', 'info', base, `${count} line${count === 1 ? '' : 's'}.`));

  const { expectedLineMin, expectedLineMax } = settings;
  if (typeof expectedLineMin === 'number' && count < expectedLineMin) {
    out.push(emit('line-count', 'warning', base, `Fewer lines (${count}) than expected minimum (${expectedLineMin}).`));
  }
  if (typeof expectedLineMax === 'number' && count > expectedLineMax) {
    out.push(emit('line-count', 'warning', base, `More lines (${count}) than expected maximum (${expectedLineMax}).`));
  }

  for (let i = 0; i < lines.length; i++) {
    const len = countChars(lines[i], settings.countMode);
    if (len > settings.maxLineLength) {
      out.push(
        emit('line-length', 'warning', { ...base, line: i + 1 }, `Line length ${len} exceeds maximum ${settings.maxLineLength}.`),
      );
    }
  }
  return out;
}

// --- section validators -----------------------------------------------------

function validateMetadata(project: Project, emit: Emit): Finding[] {
  const out: Finding[] = [];
  const m = project.metadata;
  const base: FindingTarget = { kind: 'metadata' };

  if (m.game !== 'FireRed') {
    out.push(emit('inconsistent-label', 'error', base, `Game must be "FireRed" (found "${m.game}").`));
  }
  if (isBlank(m.revisionLabel)) {
    out.push(emit('empty-field', 'error', base, 'Revision label is required.'));
  }
  if (isBlank(m.languageLabel)) {
    out.push(emit('missing-field', 'warning', base, 'Language label is recommended.'));
  }
  if (isBlank(m.projectTitle)) {
    out.push(emit('missing-field', 'info', base, 'Project title is empty.'));
  }
  return out;
}

function validateChecklist(project: Project, emit: Emit): Finding[] {
  const out: Finding[] = [];

  // Duplicate prompts (normalized).
  const seen = new Map<string, number>();
  for (const item of project.checklist) {
    const key = normalizeLabel(item.prompt);
    const prior = seen.get(key) ?? 0;
    if (prior > 0) {
      out.push(
        emit('duplicate-item', 'warning', { kind: 'checklist', refId: item.id }, `Duplicate checklist prompt: "${item.prompt}".`),
      );
    }
    seen.set(key, prior + 1);
  }

  // Completeness of assumptions.
  for (const item of project.checklist) {
    if (item.required && item.state === 'unchecked') {
      out.push(
        emit('incomplete-assumptions', 'error', { kind: 'checklist', refId: item.id }, `Required item not yet reviewed: "${item.prompt}".`),
      );
    }
    if (item.state === 'needs-follow-up') {
      out.push(
        emit('incomplete-assumptions', 'warning', { kind: 'checklist', refId: item.id }, `Item marked needs-follow-up: "${item.prompt}".`),
      );
    }
  }
  return out;
}

function validateNotes(project: Project, allowedSet: Set<number> | null, emit: Emit): Finding[] {
  const out: Finding[] = [];

  const seenTitles = new Map<string, number>();
  for (const note of project.notes) {
    if (!isBlank(note.sectionTitle)) {
      const key = normalizeLabel(note.sectionTitle);
      const prior = seenTitles.get(key) ?? 0;
      if (prior > 0) {
        out.push(
          emit('duplicate-item', 'info', { kind: 'note', refId: note.id }, `Duplicate note section title: "${note.sectionTitle}".`),
        );
      }
      seenTitles.set(key, prior + 1);
    }
    out.push(...scanGlyphs(note.body, { kind: 'note', refId: note.id }, allowedSet, emit));
  }
  return out;
}

function validateImportedBlocks(
  project: Project,
  settings: ValidationSettings,
  allowedSet: Set<number> | null,
  emit: Emit,
): Finding[] {
  const out: Finding[] = [];
  const projectRevision = normalizeLabel(project.metadata.revisionLabel);

  for (const block of project.importedBlocks) {
    const base: FindingTarget = { kind: 'importedBlock', refId: block.id };

    if (isBlank(block.title)) {
      out.push(emit('empty-field', 'error', base, 'Imported block has no title.'));
    }
    if (isBlank(block.rawText)) {
      out.push(emit('empty-field', 'warning', base, 'Imported block has no text.'));
    }
    if (!isBlank(block.revisionLabel) && normalizeLabel(block.revisionLabel) !== projectRevision) {
      out.push(
        emit('inconsistent-label', 'warning', base, `Block revision label "${block.revisionLabel}" differs from project revision "${project.metadata.revisionLabel}".`),
      );
    }

    if (!isBlank(block.rawText)) {
      out.push(...scanLineMetrics(block.rawText, base, settings, emit));
      out.push(...scanGlyphs(block.rawText, base, allowedSet, emit));
    }
  }

  // Category label spelling consistency across blocks.
  const byNorm = new Map<string, Set<string>>();
  for (const block of project.importedBlocks) {
    if (isBlank(block.categoryLabel)) continue;
    const key = normalizeLabel(block.categoryLabel);
    const set = byNorm.get(key) ?? new Set<string>();
    set.add(block.categoryLabel.trim());
    byNorm.set(key, set);
  }
  for (const [, spellings] of byNorm) {
    if (spellings.size > 1) {
      out.push(
        emit('inconsistent-label', 'info', { kind: 'importedBlock' }, `Category label spelled inconsistently: ${[...spellings].map((s) => `"${s}"`).join(', ')}.`),
      );
    }
  }
  return out;
}

// --- public API -------------------------------------------------------------

/** Run all validators and return findings in a stable, deterministic order. */
export function validateProject(project: Project): Finding[] {
  const emit = makeFactory();
  const settings = project.settings;
  const allowedSet =
    settings.allowedGlyphs && settings.allowedGlyphs.length > 0
      ? new Set<number>(Array.from(settings.allowedGlyphs, (c) => c.codePointAt(0) ?? 0))
      : null;

  return [
    ...validateMetadata(project, emit),
    ...validateChecklist(project, emit),
    ...validateNotes(project, allowedSet, emit),
    ...validateImportedBlocks(project, settings, allowedSet, emit),
  ];
}

/** Wrap findings in a timestamped ValidationResult. Timestamp is supplied by the caller. */
export function buildValidationResult(project: Project, runAtIso: string): ValidationResult {
  return { runAt: runAtIso, findings: validateProject(project) };
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const acc: Record<Severity, number> = { info: 0, warning: 0, error: 0 };
  for (const f of findings) acc[f.severity] += 1;
  return acc;
}
