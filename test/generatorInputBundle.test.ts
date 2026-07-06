import { describe, it, expect } from 'vitest';
import type { ExitCompanionResolution, GameTarget } from '../src/core/types.js';
import { buildGeneratorInputBundle, formatGeneratorInputBundleText, GENERATOR_INPUT_BUNDLE_ATTRIBUTION_NOTE } from '../src/core/generatorInputBundle.js';

const ISO = '2026-01-01T00:00:00.000Z';
const FR_EN_11: GameTarget = { game: 'FireRed', language: 'English', revision: '1.1' };

const RESOLVED: ExitCompanionResolution = {
  status: 'resolved',
  exitName: 'ToyExit',
  companionScriptId: 'companion-1',
  companionFilename: 'exit.txt',
  companionRawText: '@@ filename = "ToyExit"\n@@\ntoy body',
  resolvedAt: ISO,
};

const MISSING: ExitCompanionResolution = { status: 'missing', exitName: 'ToyExit', resolvedAt: ISO };

describe('buildGeneratorInputBundle', () => {
  it('includes the filled script text and, when resolved, the companion filename/text', () => {
    const bundle = buildGeneratorInputBundle({
      generatedAt: ISO,
      actionKey: 'toy-action',
      schemaId: 'schema-1',
      schemaLabel: 'Toy Action',
      scriptId: 'script-1',
      scriptFilename: 'ToyScript.txt',
      target: FR_EN_11,
      filledScriptText: 'level = 42\n@@\nmovs r0, {level} ?',
      exitResolution: RESOLVED,
    });

    expect(bundle.filledScriptText).toBe('level = 42\n@@\nmovs r0, {level} ?');
    expect(bundle.exitName).toBe('ToyExit');
    expect(bundle.companionFilename).toBe('exit.txt');
    expect(bundle.companionRawText).toBe(RESOLVED.companionRawText);
    expect(bundle.schemaId).toBe('schema-1');
    expect(bundle.schemaLabel).toBe('Toy Action');
    expect(bundle.scriptFilename).toBe('ToyScript.txt');
    expect(bundle.target).toEqual(FR_EN_11);
    expect(bundle.attributionNote).toBe(GENERATOR_INPUT_BUNDLE_ATTRIBUTION_NOTE);
  });

  it('omits companion fields when the exit companion is missing, but still records the exit name', () => {
    const bundle = buildGeneratorInputBundle({
      generatedAt: ISO,
      schemaId: 'schema-1',
      schemaLabel: 'Toy Action',
      target: FR_EN_11,
      filledScriptText: 'level = 42\n@@\nmovs r0, {level} ?',
      exitResolution: MISSING,
    });

    expect(bundle.exitName).toBe('ToyExit');
    expect(bundle.companionFilename).toBeUndefined();
    expect(bundle.companionRawText).toBeUndefined();
  });

  it('omits exit fields entirely when there is no exit resolution at all (no exit directive)', () => {
    const bundle = buildGeneratorInputBundle({
      generatedAt: ISO,
      schemaId: 'schema-1',
      schemaLabel: 'Toy Action',
      target: FR_EN_11,
      filledScriptText: 'level = 42\n@@\nmovs r0, {level} ?',
    });

    expect(bundle.exitName).toBeUndefined();
    expect(bundle.companionFilename).toBeUndefined();
    expect(bundle.companionRawText).toBeUndefined();
  });

  it('never includes anything resembling generated box output', () => {
    const bundle = buildGeneratorInputBundle({
      generatedAt: ISO,
      schemaId: 'schema-1',
      schemaLabel: 'Toy Action',
      target: FR_EN_11,
      filledScriptText: 'level = 42\n@@\nmovs r0, {level} ?',
      exitResolution: RESOLVED,
    });
    // The bundle type has no field for box rows/raw generator output at all —
    // assert none of its own keys smuggle that concept in under another name.
    expect(Object.keys(bundle)).not.toContain('rawGeneratorOutput');
    expect(Object.keys(bundle)).not.toContain('parsedBoxRows');
    expect(Object.keys(bundle)).not.toContain('boxRows');
  });
});

describe('formatGeneratorInputBundleText', () => {
  it('includes the filled script, exit directive, companion text, and attribution note as readable text', () => {
    const bundle = buildGeneratorInputBundle({
      generatedAt: ISO,
      actionKey: 'toy-action',
      actionLabel: 'Toy Action Label',
      schemaId: 'schema-1',
      schemaLabel: 'Toy Action',
      scriptFilename: 'ToyScript.txt',
      target: FR_EN_11,
      filledScriptText: 'level = 42\n@@\nmovs r0, {level} ?',
      exitResolution: RESOLVED,
    });
    const text = formatGeneratorInputBundleText(bundle);

    expect(text).toContain('level = 42');
    expect(text).toContain('movs r0, {level} ?');
    expect(text).toContain('ToyExit');
    expect(text).toContain('exit.txt');
    expect(text).toContain(RESOLVED.companionRawText!);
    expect(text).toContain(GENERATOR_INPUT_BUNDLE_ATTRIBUTION_NOTE);
    expect(text).toContain('ToyScript.txt');
    expect(text).toContain('Toy Action Label');
  });

  it('excludes companion/exit sections entirely when the bundle has neither', () => {
    const bundle = buildGeneratorInputBundle({
      generatedAt: ISO,
      schemaId: 'schema-1',
      schemaLabel: 'Toy Action',
      target: FR_EN_11,
      filledScriptText: 'level = 42\n@@\nmovs r0, {level} ?',
    });
    const text = formatGeneratorInputBundleText(bundle);
    expect(text).not.toContain('Exit directive');
    expect(text).not.toContain('Exit companion text');
  });

  it('never includes unrelated scripts\' text — only the one script/companion the bundle was built from', () => {
    const bundle = buildGeneratorInputBundle({
      generatedAt: ISO,
      schemaId: 'schema-1',
      schemaLabel: 'Toy Action',
      target: FR_EN_11,
      filledScriptText: 'level = 42\n@@\nmovs r0, {level} ?',
      exitResolution: RESOLVED,
    });
    const text = formatGeneratorInputBundleText(bundle);
    expect(text).not.toContain('SomeOtherUnrelatedScript');
  });
});
