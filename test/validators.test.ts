import { describe, it, expect } from 'vitest';
import type { Project, ChecklistItem } from '../src/core/types.js';
import { createProject } from '../src/core/factory.js';
import { validateProject } from '../src/core/validators.js';
import { countChars, normalizeLabel } from '../src/core/normalize.js';
import { makeBlock } from './support.js';

const ISO = '2026-01-01T00:00:00.000Z';

function makeIdGen(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

/** Base project with an EMPTY checklist (templateKey '' => no items), so tests
 *  control exactly what is present. */
function base(): Project {
  return createProject(
    { revisionLabel: 'Rev 1', languageLabel: 'English', projectTitle: 'Test', mode: 'documentation', templateKey: '' },
    makeIdGen(),
    () => ISO,
  );
}

function item(overrides: Partial<ChecklistItem>): ChecklistItem {
  return { id: 'c1', prompt: 'Prompt', category: 'Cat', state: 'unchecked', note: '', required: false, ...overrides };
}

const rules = (p: Project) => validateProject(p).map((f) => f.rule);

describe('metadata validation', () => {
  it('clean project produces no findings', () => {
    expect(validateProject(base())).toEqual([]);
  });

  it('flags empty required revision label', () => {
    const p = base();
    p.metadata.revisionLabel = '   ';
    const errors = validateProject(p).filter((f) => f.severity === 'error');
    expect(errors.some((f) => f.rule === 'empty-field')).toBe(true);
  });

  it('flags missing language label as a warning, not an error', () => {
    const p = base();
    p.metadata.languageLabel = '';
    const f = validateProject(p).find((x) => x.rule === 'missing-field');
    expect(f?.severity).toBe('warning');
  });
});

describe('checklist validation', () => {
  it('detects duplicate prompts', () => {
    const p = base();
    p.checklist = [item({ id: 'a', prompt: 'Same  prompt' }), item({ id: 'b', prompt: 'same prompt' })];
    expect(rules(p)).toContain('duplicate-item');
  });

  it('flags required items left unchecked', () => {
    const p = base();
    p.checklist = [item({ id: 'a', required: true, state: 'unchecked' })];
    const f = validateProject(p).find((x) => x.rule === 'incomplete-assumptions');
    expect(f?.severity).toBe('error');
  });

  it('flags needs-follow-up items', () => {
    const p = base();
    p.checklist = [item({ id: 'a', state: 'needs-follow-up' })];
    expect(rules(p)).toContain('incomplete-assumptions');
  });
});

describe('imported block formatting', () => {
  it('flags a line over the max length', () => {
    const p = base();
    p.settings.maxLineLength = 5;
    p.importedBlocks = [makeBlock({ rawText: 'abcdefgh' })];
    const f = validateProject(p).find((x) => x.rule === 'line-length');
    expect(f?.target.line).toBe(1);
  });

  it('reports a line count', () => {
    const p = base();
    p.importedBlocks = [makeBlock({ rawText: 'a\nb\nc' })];
    const f = validateProject(p).find((x) => x.rule === 'line-count');
    expect(f?.message).toContain('3 lines');
  });

  it('flags an unsupported display glyph', () => {
    const p = base();
    p.importedBlocks = [makeBlock({ rawText: 'star ★' })];
    expect(rules(p)).toContain('unsupported-glyph');
  });

  it('flags a homoglyph look-alike character', () => {
    const p = base();
    // Cyrillic small 'a' (U+0430) looks like ASCII 'a'.
    p.importedBlocks = [makeBlock({ rawText: 'cаt' })];
    const f = validateProject(p).find((x) => x.rule === 'ambiguous-glyph');
    expect(f?.severity).toBe('warning');
  });

  it('flags trailing whitespace as an info-level ambiguity', () => {
    const p = base();
    p.importedBlocks = [makeBlock({ rawText: 'hello ' })];
    const f = validateProject(p).find((x) => x.rule === 'ambiguous-glyph');
    expect(f?.severity).toBe('info');
  });

  it('flags a block revision label that disagrees with the project', () => {
    const p = base();
    p.importedBlocks = [makeBlock({ rawText: 'ok', revisionLabel: 'Rev 2' })];
    expect(rules(p)).toContain('inconsistent-label');
  });

  it('respects a custom allowed-glyph set', () => {
    const p = base();
    p.settings.allowedGlyphs = 'ab';
    p.importedBlocks = [makeBlock({ rawText: 'abc' })];
    // 'c' is outside the allowed set.
    expect(rules(p)).toContain('unsupported-glyph');
  });
});

describe('purity and determinism (safety contract)', () => {
  it('does not mutate the input project', () => {
    const p = base();
    p.importedBlocks = [makeBlock({ rawText: 'aа ', revisionLabel: 'Rev 2' })];
    const before = JSON.stringify(p);
    validateProject(p);
    expect(JSON.stringify(p)).toBe(before);
  });

  it('is deterministic across runs', () => {
    const p = base();
    p.importedBlocks = [makeBlock({ rawText: 'aа ', revisionLabel: 'Rev 2' })];
    expect(JSON.stringify(validateProject(p))).toBe(JSON.stringify(validateProject(p)));
  });
});

describe('normalize helpers', () => {
  it('counts astral characters by code point vs utf-16 units', () => {
    const emoji = '\u{1F600}';
    expect(countChars(emoji, 'codepoints')).toBe(1);
    expect(countChars(emoji, 'utf16')).toBe(2);
  });

  it('normalizes labels for comparison', () => {
    expect(normalizeLabel('  Rev   1 ')).toBe('rev 1');
  });
});
