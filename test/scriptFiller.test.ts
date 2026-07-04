import { describe, it, expect } from 'vitest';
import type { CuratedActionSchema, ScriptFile } from '../src/core/types.js';
import { fillScriptFromSchema } from '../src/core/scriptFiller.js';
import { scanScript } from '../src/core/scriptScanner.js';
import { candidateToDraftField, defaultIncludedCandidateNames } from '../src/core/schemaBuilder.js';

// A harmless, invented toy fixture — no real script, item ID, address,
// offset, route step, opcode, or payload byte. Irregular spacing and a
// trailing comment are deliberate, to exercise preservation rules.
const TOY_SCRIPT = [
  '; sample header for a toy fixture',
  'widgetCount   =   5   ; example count',
  'widgetLabel = "SAMPLE"',
  'flagValue = true',
  '@@',
  '; body text only, never touched by the filler',
  'PretendBodyLine',
].join('\n');

function makeSchema(over: Partial<CuratedActionSchema> = {}): CuratedActionSchema {
  return {
    id: 'toy-schema',
    label: 'Toy schema',
    description: 'toy',
    supportedRevisionLabels: [],
    status: 'reviewed',
    fields: [
      { key: 'count', label: 'Widget count', type: 'number', required: true, variableName: 'widgetCount' },
      { key: 'label', label: 'Widget label', type: 'text', required: false, variableName: 'widgetLabel' },
    ],
    ...over,
  };
}

describe('fillScriptFromSchema — replacement rules', () => {
  it('replaces a simple mapped assignment value before @@', () => {
    const result = fillScriptFromSchema(TOY_SCRIPT, makeSchema(), { count: 42, label: 'SAMPLE' });
    expect(result.errors).toEqual([]);
    expect(result.filledScriptText).toContain('widgetCount   =   42   ; example count');
  });

  it('preserves the trailing comment exactly', () => {
    const result = fillScriptFromSchema(TOY_SCRIPT, makeSchema(), { count: 42, label: 'SAMPLE' });
    const line = result.filledScriptText.split('\n').find((l) => l.startsWith('widgetCount'));
    expect(line).toBe('widgetCount   =   42   ; example count');
  });

  it('preserves irregular spacing around =', () => {
    const result = fillScriptFromSchema(TOY_SCRIPT, makeSchema(), { count: 7, label: 'SAMPLE' });
    const line = result.filledScriptText.split('\n').find((l) => l.startsWith('widgetCount'));
    expect(line).toBe('widgetCount   =   7   ; example count');
  });

  it('wraps a text-type replacement value in double quotes', () => {
    const result = fillScriptFromSchema(TOY_SCRIPT, makeSchema(), { count: 5, label: 'NEWVAL' });
    expect(result.filledScriptText).toContain('widgetLabel = "NEWVAL"');
  });

  it('leaves body lines after @@ byte-for-byte unchanged', () => {
    const result = fillScriptFromSchema(TOY_SCRIPT, makeSchema(), { count: 5, label: 'NEWVAL' });
    const originalBody = TOY_SCRIPT.split('@@')[1];
    const filledBody = result.filledScriptText.split('@@')[1];
    expect(filledBody).toBe(originalBody);
  });

  it('leaves unmapped variables in the header unchanged', () => {
    const result = fillScriptFromSchema(TOY_SCRIPT, makeSchema(), { count: 5, label: 'NEWVAL' });
    expect(result.filledScriptText).toContain('flagValue = true');
  });

  it('records exactly the lines it changed', () => {
    const result = fillScriptFromSchema(TOY_SCRIPT, makeSchema(), { count: 42, label: 'NEWVAL' });
    expect(result.changedLines).toHaveLength(2);
    expect(result.changedLines.map((c) => c.variableName).sort()).toEqual(['widgetCount', 'widgetLabel']);
  });

  it('skips an optional field left blank, with a warning, and does not touch its line', () => {
    const result = fillScriptFromSchema(TOY_SCRIPT, makeSchema(), { count: 5, label: '' });
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes('Widget label'))).toBe(true);
    expect(result.filledScriptText).toContain('widgetLabel = "SAMPLE"');
  });
});

describe('fillScriptFromSchema — rejections', () => {
  it('rejects a missing required value and leaves the script unchanged', () => {
    const result = fillScriptFromSchema(TOY_SCRIPT, makeSchema(), { label: 'NEWVAL' });
    expect(result.errors.some((e) => e.includes('Widget count'))).toBe(true);
    expect(result.filledScriptText).toBe(TOY_SCRIPT);
    expect(result.changedLines).toEqual([]);
  });

  it('rejects a mapped variable that does not exist in the script header', () => {
    const schema = makeSchema({
      fields: [{ key: 'ghost', label: 'Ghost field', type: 'text', required: false, variableName: 'doesNotExist' }],
    });
    const result = fillScriptFromSchema(TOY_SCRIPT, schema, { ghost: 'x' });
    expect(result.errors.some((e) => e.includes('doesNotExist'))).toBe(true);
    expect(result.filledScriptText).toBe(TOY_SCRIPT);
  });

  it('rejects duplicate mapped variables across fields', () => {
    const schema = makeSchema({
      fields: [
        { key: 'a', label: 'A', type: 'number', required: false, variableName: 'widgetCount' },
        { key: 'b', label: 'B', type: 'number', required: false, variableName: 'widgetCount' },
      ],
    });
    const result = fillScriptFromSchema(TOY_SCRIPT, schema, { a: 1, b: 2 });
    expect(result.errors.some((e) => e.includes('widgetCount'))).toBe(true);
    expect(result.filledScriptText).toBe(TOY_SCRIPT);
  });

  it('does not evaluate expressions or assign hidden meaning — a variable never mentioned by the schema is invisible to it', () => {
    const schema = makeSchema({ fields: [] });
    const result = fillScriptFromSchema(TOY_SCRIPT, schema, {});
    expect(result.errors).toEqual([]);
    expect(result.changedLines).toEqual([]);
    expect(result.filledScriptText).toBe(TOY_SCRIPT);
  });
});

describe('fillScriptFromSchema — safety properties', () => {
  it('is deterministic for the same script/schema/values', () => {
    const a = fillScriptFromSchema(TOY_SCRIPT, makeSchema(), { count: 5, label: 'SAMPLE' });
    const b = fillScriptFromSchema(TOY_SCRIPT, makeSchema(), { count: 5, label: 'SAMPLE' });
    expect(a).toEqual(b);
  });

  it('does not mutate the original script text', () => {
    const before = TOY_SCRIPT;
    fillScriptFromSchema(TOY_SCRIPT, makeSchema(), { count: 5, label: 'SAMPLE' });
    expect(TOY_SCRIPT).toBe(before);
  });

  it('returns the exact original text as originalScriptText', () => {
    const result = fillScriptFromSchema(TOY_SCRIPT, makeSchema(), { count: 5, label: 'SAMPLE' });
    expect(result.originalScriptText).toBe(TOY_SCRIPT);
  });
});

// Same directive/"do not modify" shape covered in scriptScanner.test.ts and
// schemaBuilder.test.ts — a harmless, invented toy fixture modeled on a
// real-world script shape (leading `@`/`@@` directives, an inline
// `@input:xxx` annotation with no semicolon, semicolon trailing comments,
// and an internal/helper block) but with placeholder hex tokens and generic
// body text standing in for real offsets/opcodes.
const REAL_SHAPED_SCRIPT = [
  '@ title = "Toy NPC move-teaching script"',
  '@@ author = "Toy Author"',
  '@@ exit = "ToyExitRoutine"',
  '',
  'Move = 1 @input:move',
  'MoveSlot = 3    ;Slots 0-3 are available',
  'NPC = 2 ;sets which NPC on the map to run, values 1-3 are usable in this toy fixture',
  '',
  ';Do not modify these values',
  'ScriptStart = (MoveSlot * 0xPLACEHOLDER1) + 0xPLACEHOLDER2',
  'ScriptEnd = Move + (0xPLACEHOLDER3)',
  'NPCOffset = 0xPLACEHOLDER4 + (NPC * 0xPLACEHOLDER5)',
  '@@',
  'PretendBodyLine',
].join('\n');

function schemaFromDefaultCandidates(script: ScriptFile): CuratedActionSchema {
  const scan = scanScript(script, () => '2026-01-01T00:00:00.000Z');
  const included = defaultIncludedCandidateNames(scan.candidates);
  const fields = included.map((name) => candidateToDraftField(scan.candidates.find((c) => c.name === name)!));
  return {
    id: 'toy-move-schema',
    label: 'Toy move schema',
    description: 'Built from only the default-included (user-facing) candidates.',
    scriptId: script.id,
    scriptFilename: script.filename,
    supportedRevisionLabels: [],
    status: 'draft',
    fields,
  };
}

describe('fillScriptFromSchema on a real-script-shaped fixture (Move/MoveSlot/NPC)', () => {
  const script: ScriptFile = { id: 's1', filename: 'toy.txt', rawText: REAL_SHAPED_SCRIPT, importedAt: '2026-01-01T00:00:00.000Z' };

  it('preserves the inline @input:move annotation instead of swallowing it when Move is filled', () => {
    const schema = schemaFromDefaultCandidates(script);
    const result = fillScriptFromSchema(script.rawText, schema, { Move: 99, MoveSlot: '1', NPC: '3' });
    expect(result.errors).toEqual([]);
    expect(result.filledScriptText).toContain('Move = 99 @input:move');
  });

  it('changes only the Move, MoveSlot, and NPC assignment lines', () => {
    const schema = schemaFromDefaultCandidates(script);
    const result = fillScriptFromSchema(script.rawText, schema, { Move: 99, MoveSlot: '1', NPC: '3' });
    expect(result.errors).toEqual([]);
    expect(result.changedLines.map((c) => c.variableName).sort()).toEqual(['Move', 'MoveSlot', 'NPC']);
  });

  it('leaves the internal/helper variable lines byte-for-byte unchanged', () => {
    const schema = schemaFromDefaultCandidates(script);
    const result = fillScriptFromSchema(script.rawText, schema, { Move: 99, MoveSlot: '1', NPC: '3' });
    for (const helperLine of [
      'ScriptStart = (MoveSlot * 0xPLACEHOLDER1) + 0xPLACEHOLDER2',
      'ScriptEnd = Move + (0xPLACEHOLDER3)',
      'NPCOffset = 0xPLACEHOLDER4 + (NPC * 0xPLACEHOLDER5)',
    ]) {
      expect(result.filledScriptText).toContain(helperLine);
    }
  });

  it('never mutates the original script rawText', () => {
    const before = script.rawText;
    const schema = schemaFromDefaultCandidates(script);
    fillScriptFromSchema(script.rawText, schema, { Move: 99, MoveSlot: '1', NPC: '3' });
    expect(script.rawText).toBe(before);
  });
});
