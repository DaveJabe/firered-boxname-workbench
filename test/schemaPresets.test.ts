import { describe, it, expect } from 'vitest';
import { findMatchingPreset, applyPreset, type CuratedSchemaPreset } from '../src/core/schemaPresets.js';
import { UNKNOWN_TARGET } from '../src/core/gameTarget.js';

// A harmless, invented toy preset — no real script, item ID, address,
// offset, route step, opcode, payload byte, or generated output.
function makeToyPreset(over: Partial<CuratedSchemaPreset> = {}): CuratedSchemaPreset {
  return {
    id: 'toy-preset',
    label: 'Toy preset',
    matchFilenamePattern: '^toy-example',
    schema: {
      id: 'toy-preset-schema',
      label: 'Toy preset schema',
      description: 'A toy-only demo schema.',
      target: UNKNOWN_TARGET,
      supportedRevisionLabels: [],
      fields: [{ key: 'exampleValue', label: 'Example value', type: 'text', required: false, variableName: 'exampleValue' }],
    },
    ...over,
  };
}

describe('findMatchingPreset', () => {
  it('matches by filename pattern', () => {
    const preset = makeToyPreset();
    const match = findMatchingPreset([preset], { filename: 'toy-example-1.txt' });
    expect(match?.id).toBe('toy-preset');
  });

  it('matches by title pattern', () => {
    const preset = makeToyPreset({ matchFilenamePattern: undefined, matchTitlePattern: 'Toy Demo Title' });
    const match = findMatchingPreset([preset], { filename: 'unrelated.txt', title: 'A Toy Demo Title here' });
    expect(match?.id).toBe('toy-preset');
  });

  it('returns undefined when nothing matches', () => {
    const preset = makeToyPreset();
    expect(findMatchingPreset([preset], { filename: 'completely-different.txt' })).toBeUndefined();
  });

  it('never invents a match from an empty/undefined title when only a title pattern is set', () => {
    const preset = makeToyPreset({ matchFilenamePattern: undefined, matchTitlePattern: 'anything' });
    expect(findMatchingPreset([preset], { filename: 'toy-example.txt' })).toBeUndefined();
  });

  it('does not crash on a malformed pattern — just never matches', () => {
    const preset = makeToyPreset({ matchFilenamePattern: '(unclosed' });
    expect(findMatchingPreset([preset], { filename: 'toy-example.txt' })).toBeUndefined();
  });
});

describe('applyPreset', () => {
  it('produces a CuratedActionSchema scoped to the given script', () => {
    const preset = makeToyPreset();
    const schema = applyPreset(preset, { id: 'script-1', filename: 'toy-example-1.txt' });
    expect(schema.scriptId).toBe('script-1');
    expect(schema.scriptFilename).toBe('toy-example-1.txt');
    expect(schema.fields).toEqual(preset.schema.fields);
  });

  it('always forces status to draft, so it still requires explicit user review', () => {
    const preset = makeToyPreset();
    const schema = applyPreset(preset, { id: 'script-1', filename: 'toy-example-1.txt' });
    expect(schema.status).toBe('draft');
  });

  it('produces a distinct schema id per script, so applying the same preset twice never collides', () => {
    const preset = makeToyPreset();
    const schemaA = applyPreset(preset, { id: 'script-a', filename: 'toy-example-a.txt' });
    const schemaB = applyPreset(preset, { id: 'script-b', filename: 'toy-example-b.txt' });
    expect(schemaA.id).not.toBe(schemaB.id);
  });

  it('applying a preset only returns a schema object — it does not itself attach anything to a project', () => {
    // applyPreset is a pure function: it has no access to a Project and cannot
    // push into curatedSchemas on its own. The caller (UI click handler) must
    // explicitly call upsertCuratedSchema — applying is never automatic.
    const preset = makeToyPreset();
    const schema = applyPreset(preset, { id: 'script-1', filename: 'toy-example-1.txt' });
    expect(typeof schema).toBe('object');
    expect(schema).not.toHaveProperty('project');
  });
});
