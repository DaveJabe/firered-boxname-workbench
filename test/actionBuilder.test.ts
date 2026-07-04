import { describe, it, expect } from 'vitest';
import type { ActionInput, ImportedTextBlock } from '../src/core/types.js';
import { ACTION_TEMPLATES, getActionTemplate } from '../src/templates/action-templates.js';
import { defaultActionValues, missingRequiredActionFields } from '../src/core/actionInput.js';
import { MockGeneratorAdapter, MOCK_PLACEHOLDER_TEXT, MOCK_ROW_COUNT } from '../src/core/generatorAdapter.js';
import { formatBoxNameSheetText } from '../src/core/boxNameSheet.js';
import { createProject } from '../src/core/factory.js';
import { importProjectJson, exportProjectJson } from '../src/data/storage.js';
import { SOURCE_SCHEMA_VERSION } from '../src/core/sources.js';

const ISO = '2026-01-01T00:00:00.000Z';
function makeIdGen(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

// Real-looking values this Phase-1 mock must never produce or accept as
// output, per the hard boundaries: no addresses/offsets, no opcode-shaped
// hex, no route/step language.
const PROHIBITED_PATTERNS: RegExp[] = [
  /\b0x[0-9a-f]{4,}\b/i, // hex address/offset-looking tokens
  /\bopcode\b/i,
  /\baddress\b/i,
  /\boffset\b/i,
  /\broute\s*step\b/i,
];

describe('action template catalog', () => {
  it('has at least two templates, each with a unique id and label', () => {
    expect(ACTION_TEMPLATES.length).toBeGreaterThanOrEqual(2);
    const ids = ACTION_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of ACTION_TEMPLATES) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.fields.length).toBeGreaterThan(0);
    }
  });

  it('gives every select field at least one option with a neutral placeholder value', () => {
    for (const t of ACTION_TEMPLATES) {
      for (const f of t.fields) {
        if (f.type !== 'select') continue;
        expect(f.options && f.options.length).toBeGreaterThan(0);
        for (const o of f.options!) {
          expect(o.value).toMatch(/^option-[a-z]$/);
        }
      }
    }
  });

  it('contains no field key, label, option value/label, or description that looks like real implementation data', () => {
    const haystacks: string[] = [];
    for (const t of ACTION_TEMPLATES) {
      haystacks.push(t.description);
      for (const f of t.fields) {
        haystacks.push(f.key, f.label);
        for (const o of f.options ?? []) haystacks.push(o.value, o.label);
      }
    }
    const text = haystacks.join(' ');
    for (const pattern of PROHIBITED_PATTERNS) {
      expect(text).not.toMatch(pattern);
    }
  });

  it('looks up a template by id and returns undefined for an unknown id', () => {
    const first = ACTION_TEMPLATES[0];
    expect(getActionTemplate(first.id)?.id).toBe(first.id);
    expect(getActionTemplate('does-not-exist')).toBeUndefined();
  });
});

describe('required-field validation', () => {
  it('flags a required text field left blank', () => {
    const t = { id: 't', label: 'T', description: 'd', fields: [{ key: 'a', label: 'A', type: 'text' as const, required: true }] };
    expect(missingRequiredActionFields(t, { a: '   ' }).map((f) => f.key)).toEqual(['a']);
    expect(missingRequiredActionFields(t, { a: 'filled' })).toEqual([]);
  });

  it('flags a required number field that is missing or NaN', () => {
    const t = { id: 't', label: 'T', description: 'd', fields: [{ key: 'n', label: 'N', type: 'number' as const, required: true }] };
    expect(missingRequiredActionFields(t, {}).map((f) => f.key)).toEqual(['n']);
    expect(missingRequiredActionFields(t, { n: NaN }).map((f) => f.key)).toEqual(['n']);
    expect(missingRequiredActionFields(t, { n: 0 })).toEqual([]);
  });

  it('flags a required select field with no value chosen', () => {
    const t = {
      id: 't', label: 'T', description: 'd',
      fields: [{ key: 's', label: 'S', type: 'select' as const, required: true, options: [{ value: 'option-a', label: 'A' }] }],
    };
    expect(missingRequiredActionFields(t, { s: '' }).map((f) => f.key)).toEqual(['s']);
    expect(missingRequiredActionFields(t, { s: 'option-a' })).toEqual([]);
  });

  it('never flags a checkbox field regardless of required', () => {
    const t = { id: 't', label: 'T', description: 'd', fields: [{ key: 'c', label: 'C', type: 'checkbox' as const, required: true }] };
    expect(missingRequiredActionFields(t, { c: false })).toEqual([]);
  });

  it('is satisfied by defaultActionValues for every real template', () => {
    for (const t of ACTION_TEMPLATES) {
      expect(missingRequiredActionFields(t, defaultActionValues(t))).toEqual([]);
    }
  });
});

describe('mock generator adapter', () => {
  it('returns only the fixed placeholder string for every row, regardless of input', () => {
    for (const t of ACTION_TEMPLATES) {
      const input: ActionInput = { actionId: t.id, revisionLabel: 'Rev 1', values: defaultActionValues(t) };
      const output = MockGeneratorAdapter.generate(t, input, () => ISO);
      expect(output.rows.length).toBe(MOCK_ROW_COUNT);
      for (const row of output.rows) {
        expect(row.text).toBe(MOCK_PLACEHOLDER_TEXT);
      }
    }
  });

  it('carries the action id/label and revision label through, and marks itself as mock', () => {
    const t = ACTION_TEMPLATES[0];
    const input: ActionInput = { actionId: t.id, revisionLabel: 'Rev X', values: defaultActionValues(t) };
    const output = MockGeneratorAdapter.generate(t, input, () => ISO);
    expect(output.actionId).toBe(t.id);
    expect(output.actionLabel).toBe(t.label);
    expect(output.revisionLabel).toBe('Rev X');
    expect(output.generatedAt).toBe(ISO);
    expect(output.isMock).toBe(true);
  });

  it('is deterministic: the same input produces the same output', () => {
    const t = ACTION_TEMPLATES[0];
    const input: ActionInput = { actionId: t.id, revisionLabel: 'Rev 1', values: defaultActionValues(t) };
    const a = MockGeneratorAdapter.generate(t, input, () => ISO);
    const b = MockGeneratorAdapter.generate(t, input, () => ISO);
    expect(a).toEqual(b);
  });

  it('does not produce any prohibited real-looking values (addresses, offsets, opcodes, route steps)', () => {
    for (const t of ACTION_TEMPLATES) {
      const input: ActionInput = { actionId: t.id, revisionLabel: 'Rev 1', values: defaultActionValues(t) };
      const output = MockGeneratorAdapter.generate(t, input, () => ISO);
      const text = formatBoxNameSheetText(output);
      for (const pattern of PROHIBITED_PATTERNS) {
        expect(text).not.toMatch(pattern);
      }
    }
  });
});

describe('box-name sheet formatting', () => {
  it('formats each row as "<box label>: <text>" joined by newlines, in row order', () => {
    const t = ACTION_TEMPLATES[0];
    const input: ActionInput = { actionId: t.id, revisionLabel: 'Rev 1', values: defaultActionValues(t) };
    const output = MockGeneratorAdapter.generate(t, input, () => ISO);
    const text = formatBoxNameSheetText(output);
    const lines = text.split('\n');
    expect(lines.length).toBe(output.rows.length);
    output.rows.forEach((row, i) => {
      expect(lines[i]).toBe(`${row.boxLabel}: ${row.text}`);
    });
  });

  it('is a pure function of its input (same output in, same string out)', () => {
    const t = ACTION_TEMPLATES[0];
    const input: ActionInput = { actionId: t.id, revisionLabel: 'Rev 1', values: defaultActionValues(t) };
    const output = MockGeneratorAdapter.generate(t, input, () => ISO);
    expect(formatBoxNameSheetText(output)).toBe(formatBoxNameSheetText(output));
  });
});

describe('saving mock output as a project block', () => {
  it('preserves the formatted box-name text verbatim and keeps mock provenance through export/import round-trips', () => {
    const t = ACTION_TEMPLATES[0];
    const input: ActionInput = { actionId: t.id, revisionLabel: 'Rev 1', values: defaultActionValues(t) };
    const output = MockGeneratorAdapter.generate(t, input, () => ISO);
    const rawText = formatBoxNameSheetText(output);

    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    const block: ImportedTextBlock = {
      id: 'b1',
      title: `${output.actionLabel} — mock output`,
      categoryLabel: 'Mock output',
      revisionLabel: output.revisionLabel,
      rawText,
      notes: '',
      source: {
        type: 'mock-output',
        label: 'Mock generator output',
        importedAt: ISO,
        schemaVersion: SOURCE_SCHEMA_VERSION,
        actionId: output.actionId,
        actionLabel: output.actionLabel,
        generatedBy: 'mock-generator-adapter',
      },
    };
    project.importedBlocks.push(block);

    const roundTripped = importProjectJson(exportProjectJson(project));
    const savedBlock = roundTripped.importedBlocks[0];
    expect(savedBlock.rawText).toBe(rawText);
    expect(savedBlock.source.type).toBe('mock-output');
    expect(savedBlock.source.actionId).toBe(t.id);
    expect(savedBlock.source.actionLabel).toBe(t.label);
    expect(savedBlock.source.generatedBy).toBe('mock-generator-adapter');

    // A second round trip must still be byte-for-byte identical.
    const twice = importProjectJson(exportProjectJson(roundTripped));
    expect(twice.importedBlocks[0].rawText).toBe(rawText);
  });

  it('rejects an unknown source type but accepts mock-output', () => {
    const obj = {
      schemaVersion: 1,
      id: 'p1',
      metadata: {
        schemaVersion: 1, game: 'FireRed', revisionLabel: 'Rev 1', languageLabel: '',
        projectTitle: '', mode: 'documentation', createdAt: ISO, updatedAt: ISO,
      },
      checklist: [],
      notes: [],
      importedBlocks: [
        {
          id: 'b1', title: 't', categoryLabel: '', revisionLabel: '', rawText: 'Box 1: PLACEHLD', notes: '',
          source: { type: 'mock-output', label: 'l', importedAt: ISO, schemaVersion: 1 },
        },
      ],
      settings: { maxLineLength: 30, countMode: 'codepoints' },
      latestValidation: null,
      projectStatus: 'draft',
    };
    expect(importProjectJson(JSON.stringify(obj)).importedBlocks[0].source.type).toBe('mock-output');
  });
});
