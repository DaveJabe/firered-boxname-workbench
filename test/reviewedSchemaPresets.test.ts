import { describe, it, expect } from 'vitest';
import type { CuratedActionSchema, CuratedSchemaField, GameTarget } from '../src/core/types.js';
import {
  normalizeFilenameForMatch,
  matchReviewedPresets,
  buildCuratedSchemaFromPreset,
  isPresetReadyForTarget,
  buildReviewedPresetExport,
  serializeReviewedPresetForExport,
  validateReviewedPreset,
  type ReviewedSchemaPreset,
} from '../src/core/reviewedSchemaPresets.js';
import { UNKNOWN_TARGET } from '../src/core/gameTarget.js';

const FR_EN_11: GameTarget = { game: 'FireRed', language: 'English', revision: '1.1' };
const FR_EN_10: GameTarget = { game: 'FireRed', language: 'English', revision: '1.0' };

function toyField(over: Partial<CuratedSchemaField> = {}): CuratedSchemaField {
  return { key: 'Move', label: 'Move', type: 'text', required: true, variableName: 'Move', ...over };
}

function toyPreset(over: Partial<ReviewedSchemaPreset> = {}): ReviewedSchemaPreset {
  return {
    id: 'toy-preset',
    actionKey: 'toy-action',
    label: 'Toy preset',
    description: 'A toy preset for tests only.',
    status: 'reviewed',
    target: FR_EN_11,
    match: { filenamePattern: 'ToyScript.txt', category: 'pkmn' },
    fields: [toyField()],
    sourceNotes: { reviewedAt: '2026-01-01T00:00:00.000Z', reviewedFromScriptFilename: 'ToyScript.txt' },
    ...over,
  };
}

describe('normalizeFilenameForMatch', () => {
  it('lowercases, drops the extension, and strips punctuation/spacing', () => {
    expect(normalizeFilenameForMatch('ToyScript.txt')).toBe('toyscript');
    expect(normalizeFilenameForMatch('toy-script.TXT')).toBe('toyscript');
    expect(normalizeFilenameForMatch('Toy_Script (1).txt')).toBe('toyscript1');
  });
});

describe('matchReviewedPresets', () => {
  it('matches by exact filename', () => {
    const preset = toyPreset();
    const matches = matchReviewedPresets([preset], { filename: 'ToyScript.txt' });
    expect(matches).toHaveLength(1);
    expect(matches[0].matchedBy).toBe('filename');
  });

  it('matches by normalized filename when case/punctuation differ', () => {
    const preset = toyPreset();
    const matches = matchReviewedPresets([preset], { filename: 'toy-script.TXT' });
    expect(matches).toHaveLength(1);
    expect(matches[0].matchedBy).toBe('normalized-filename');
  });

  it('matches by title pattern when the filename does not match', () => {
    const preset = toyPreset({
      match: { titlePattern: '^Toy Script Title$' },
      id: 'toy-title-preset',
    });
    const matches = matchReviewedPresets([preset], { filename: 'unrelated.txt', title: 'Toy Script Title' });
    expect(matches).toHaveLength(1);
    expect(matches[0].matchedBy).toBe('title');
  });

  it('matches by category as a last resort', () => {
    const preset = toyPreset({ match: { category: 'rng' }, id: 'toy-category-preset' });
    const matches = matchReviewedPresets([preset], { filename: 'unrelated.txt', category: 'rng' });
    expect(matches).toHaveLength(1);
    expect(matches[0].matchedBy).toBe('category');
  });

  it('never matches a draft or disabled preset, even if the filename matches exactly', () => {
    const draft = toyPreset({ status: 'draft', id: 'draft-preset' });
    const disabled = toyPreset({ status: 'disabled', id: 'disabled-preset' });
    expect(matchReviewedPresets([draft, disabled], { filename: 'ToyScript.txt' })).toHaveLength(0);
  });

  it('returns every matching preset when more than one applies — ambiguous cases are not resolved automatically', () => {
    const presetA = toyPreset({ id: 'preset-a', label: 'Preset A' });
    const presetB = toyPreset({ id: 'preset-b', label: 'Preset B' });
    const matches = matchReviewedPresets([presetA, presetB], { filename: 'ToyScript.txt' });
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.preset.id).sort()).toEqual(['preset-a', 'preset-b']);
  });

  it('ignores a malformed titlePattern instead of throwing', () => {
    const preset = toyPreset({ match: { titlePattern: '(unclosed' }, id: 'bad-pattern' });
    expect(() => matchReviewedPresets([preset], { filename: 'unrelated.txt', title: 'anything' })).not.toThrow();
    expect(matchReviewedPresets([preset], { filename: 'unrelated.txt', title: 'anything' })).toHaveLength(0);
  });
});

describe('buildCuratedSchemaFromPreset', () => {
  it('preserves the preset status (reviewed) rather than forcing draft', () => {
    const preset = toyPreset({ status: 'reviewed' });
    const schema = buildCuratedSchemaFromPreset(preset, { id: 'script-1', filename: 'ToyScript.txt' });
    expect(schema.status).toBe('reviewed');
  });

  it('preserves target compatibility from the preset', () => {
    const preset = toyPreset({ target: FR_EN_11 });
    const schema = buildCuratedSchemaFromPreset(preset, { id: 'script-1', filename: 'ToyScript.txt' });
    expect(schema.target).toEqual(FR_EN_11);
  });

  it('links the schema to the given script and copies actionKey/fields', () => {
    const preset = toyPreset();
    const schema = buildCuratedSchemaFromPreset(preset, { id: 'script-1', filename: 'ToyScript.txt' });
    expect(schema.scriptId).toBe('script-1');
    expect(schema.scriptFilename).toBe('ToyScript.txt');
    expect(schema.actionKey).toBe('toy-action');
    expect(schema.fields).toEqual(preset.fields);
  });

  it('produces a schema that appears in Run Script\'s default runnable list for that target', async () => {
    const { defaultRunnableSchemas } = await import('../src/core/curatedSchemas.js');
    const { createProject } = await import('../src/core/factory.js');
    const preset = toyPreset({ target: FR_EN_11 });
    const schema = buildCuratedSchemaFromPreset(preset, { id: 'script-1', filename: 'ToyScript.txt' });
    const schemas: CuratedActionSchema[] = [schema];
    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      () => 'id-0',
      () => '2026-01-01T00:00:00.000Z',
    );
    project.scripts = [{ id: 'script-1', filename: 'ToyScript.txt', rawText: '', importedAt: '2026-01-01T00:00:00.000Z' }];
    expect(defaultRunnableSchemas(schemas, project, FR_EN_11).map((s) => s.id)).toContain(schema.id);
  });
});

describe('isPresetReadyForTarget', () => {
  it('is true only for a reviewed preset with an exact target match', () => {
    const preset = toyPreset({ status: 'reviewed', target: FR_EN_11 });
    expect(isPresetReadyForTarget(preset, FR_EN_11)).toBe(true);
    expect(isPresetReadyForTarget(preset, FR_EN_10)).toBe(false);
  });

  it('is false for a draft preset even with an exact target match', () => {
    const preset = toyPreset({ status: 'draft', target: FR_EN_11 });
    expect(isPresetReadyForTarget(preset, FR_EN_11)).toBe(false);
  });
});

describe('buildReviewedPresetExport', () => {
  function toySchema(over: Partial<CuratedActionSchema> = {}): CuratedActionSchema {
    return {
      id: 'schema-1', label: 'Toy schema', description: 'desc', actionKey: 'toy-action',
      target: FR_EN_11, scriptId: 'script-1', scriptFilename: 'ToyScript.txt',
      supportedRevisionLabels: [], fields: [toyField()], status: 'reviewed', ...over,
    };
  }

  it('does not include raw script text anywhere in the export', () => {
    const preset = buildReviewedPresetExport({
      schema: toySchema(),
      scriptFilename: 'ToyScript.txt',
      reviewedAt: '2026-01-01T00:00:00.000Z',
    });
    const json = serializeReviewedPresetForExport(preset);
    expect(json).not.toContain('rawText');
    expect(JSON.stringify(preset)).not.toMatch(/PretendBodyLine|widgetCount/);
  });

  it('includes schema fields, target compatibility, match rules, and source/review notes', () => {
    const preset = buildReviewedPresetExport({
      schema: toySchema(),
      scriptFilename: 'ToyScript.txt',
      scriptTitle: 'Toy Script Title',
      category: 'pkmn',
      reviewerNote: 'Reviewed manually.',
      reviewedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(preset.fields).toEqual([toyField()]);
    expect(preset.target).toEqual(FR_EN_11);
    expect(preset.match.filenamePattern).toBe('ToyScript.txt');
    expect(preset.match.category).toBe('pkmn');
    expect(preset.sourceNotes.reviewedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(preset.sourceNotes.reviewedFromScriptFilename).toBe('ToyScript.txt');
    expect(preset.sourceNotes.reviewedFromScriptTitle).toBe('Toy Script Title');
    expect(preset.sourceNotes.reviewerNote).toBe('Reviewed manually.');
  });

  it('escapes regex-special characters in the script title before using it as a title pattern', () => {
    const preset = buildReviewedPresetExport({
      schema: toySchema(),
      scriptFilename: 'ToyScript.txt',
      scriptTitle: 'Weird (Title)',
      reviewedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(new RegExp(preset.match.titlePattern!, 'i').test('Weird (Title)')).toBe(true);
  });
});

describe('validateReviewedPreset', () => {
  it('accepts a well-formed reviewed preset', () => {
    expect(validateReviewedPreset(toyPreset())).toEqual([]);
  });

  it('requires id, actionKey, label, and at least one field', () => {
    const errors = validateReviewedPreset(toyPreset({ id: '', actionKey: '', label: '', fields: [] }));
    expect(errors.some((e) => /id is required/.test(e))).toBe(true);
    expect(errors.some((e) => /actionKey is required/.test(e))).toBe(true);
    expect(errors.some((e) => /label is required/.test(e))).toBe(true);
    expect(errors.some((e) => /at least one field/.test(e))).toBe(true);
  });

  it('requires at least one match rule', () => {
    const errors = validateReviewedPreset(toyPreset({ match: {} }));
    expect(errors.some((e) => /at least one match rule/.test(e))).toBe(true);
  });

  it('requires an explicit target when status is reviewed', () => {
    const errors = validateReviewedPreset(toyPreset({ status: 'reviewed', target: UNKNOWN_TARGET }));
    expect(errors.some((e) => /explicit game\/language\/revision target/.test(e))).toBe(true);
  });

  it('allows Unknown/Mixed target for a draft preset', () => {
    const errors = validateReviewedPreset(toyPreset({ status: 'draft', target: UNKNOWN_TARGET }));
    expect(errors).toEqual([]);
  });

  it('flags duplicate field keys and duplicate variable names', () => {
    const errors = validateReviewedPreset(
      toyPreset({
        fields: [
          toyField({ key: 'a', variableName: 'A' }),
          toyField({ key: 'a', variableName: 'B' }),
          toyField({ key: 'c', variableName: 'A' }),
        ],
      }),
    );
    expect(errors.some((e) => /Field key "a" is used more than once/.test(e))).toBe(true);
    expect(errors.some((e) => /Variable "A" is mapped by more than one field/.test(e))).toBe(true);
  });

  it('requires sourceNotes.reviewedAt and reviewedFromScriptFilename', () => {
    const errors = validateReviewedPreset(
      toyPreset({ sourceNotes: { reviewedAt: '', reviewedFromScriptFilename: '' } }),
    );
    expect(errors.some((e) => /reviewedAt is required/.test(e))).toBe(true);
    expect(errors.some((e) => /reviewedFromScriptFilename is required/.test(e))).toBe(true);
  });
});
