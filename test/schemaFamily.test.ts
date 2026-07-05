import { describe, it, expect } from 'vitest';
import type { CuratedActionSchema, ScriptFile } from '../src/core/types.js';
import { scanScript } from '../src/core/scriptScanner.js';
import { UNKNOWN_TARGET } from '../src/core/gameTarget.js';
import {
  computeSchemaShapeSignature,
  groupScriptsByShapeSignature,
  findSimilarScripts,
  createDraftSchemaFromFamilyMember,
} from '../src/core/schemaFamily.js';

const ISO = '2026-01-01T00:00:00.000Z';

// Harmless, invented toy fixtures — no real script, item ID, address, or payload byte.
const ITEM_COUNT_SCRIPT_A = ['widgetCount = 5 ; @input:item', '@@', 'PretendBodyLine'].join('\n');
const ITEM_COUNT_SCRIPT_B = ['widgetCount = 9 ; @input:item', '@@', 'PretendBodyLine'].join('\n'); // same shape, different value
const MOVE_SLOT_NPC_SCRIPT = ['Move = 1 ; @input:move', 'MoveSlot = 0', 'NPC = 1', '@@', 'PretendBodyLine'].join('\n');
const NO_INPUT_SCRIPT = ['; nothing before the marker', '@@', 'PretendBodyLine'].join('\n');

function makeScannedScript(id: string, rawText: string, category?: 'misc' | 'pkmn' | 'rng'): ScriptFile {
  const script: ScriptFile = { id, filename: `${id}.txt`, rawText, importedAt: ISO };
  if (category) script.category = category;
  script.lastScan = scanScript(script, () => ISO);
  return script;
}

describe('computeSchemaShapeSignature', () => {
  it('is undefined for a script that has not been scanned yet', () => {
    const script: ScriptFile = { id: 'a', filename: 'a.txt', rawText: ITEM_COUNT_SCRIPT_A, importedAt: ISO };
    expect(computeSchemaShapeSignature(script)).toBeUndefined();
  });

  it('captures user-facing candidate names, input hints, field count, and category', () => {
    const script = makeScannedScript('a', ITEM_COUNT_SCRIPT_A, 'misc');
    const sig = computeSchemaShapeSignature(script)!;
    expect(sig.userFacingNames).toEqual(['widgetCount']);
    expect(sig.inputHints).toEqual(['item']);
    expect(sig.fieldCount).toBe(1);
    expect(sig.category).toBe('misc');
  });

  it('two scripts with the same candidate names/hints produce the same signature key regardless of their actual values', () => {
    const a = makeScannedScript('a', ITEM_COUNT_SCRIPT_A);
    const b = makeScannedScript('b', ITEM_COUNT_SCRIPT_B);
    expect(computeSchemaShapeSignature(a)!.key).toBe(computeSchemaShapeSignature(b)!.key);
  });

  it('scripts with a different variable set produce a different signature key', () => {
    const itemCount = makeScannedScript('a', ITEM_COUNT_SCRIPT_A);
    const moveSlotNpc = makeScannedScript('b', MOVE_SLOT_NPC_SCRIPT);
    expect(computeSchemaShapeSignature(itemCount)!.key).not.toBe(computeSchemaShapeSignature(moveSlotNpc)!.key);
  });

  it('a no-input script has an empty userFacingNames signature, distinct from any script with fields', () => {
    const noInput = makeScannedScript('a', NO_INPUT_SCRIPT);
    const sig = computeSchemaShapeSignature(noInput)!;
    expect(sig.userFacingNames).toEqual([]);
    expect(sig.fieldCount).toBe(0);
  });
});

describe('groupScriptsByShapeSignature', () => {
  it('groups similar scripts (same candidate shape) into one family', () => {
    const a = makeScannedScript('a', ITEM_COUNT_SCRIPT_A);
    const b = makeScannedScript('b', ITEM_COUNT_SCRIPT_B);
    const families = groupScriptsByShapeSignature([a, b]);
    expect(families).toHaveLength(1);
    expect(families[0]!.scripts.map((s) => s.id).sort()).toEqual(['a', 'b']);
  });

  it('keeps scripts with different variable sets in separate families', () => {
    const itemCount = makeScannedScript('a', ITEM_COUNT_SCRIPT_A);
    const moveSlotNpc = makeScannedScript('b', MOVE_SLOT_NPC_SCRIPT);
    const families = groupScriptsByShapeSignature([itemCount, moveSlotNpc]);
    expect(families).toHaveLength(2);
    expect(families.every((f) => f.scripts.length === 1)).toBe(true);
  });

  it('skips unscanned scripts entirely', () => {
    const unscanned: ScriptFile = { id: 'c', filename: 'c.txt', rawText: ITEM_COUNT_SCRIPT_A, importedAt: ISO };
    const a = makeScannedScript('a', ITEM_COUNT_SCRIPT_A);
    const families = groupScriptsByShapeSignature([a, unscanned]);
    expect(families.flatMap((f) => f.scripts.map((s) => s.id))).toEqual(['a']);
  });

  it('sorts families largest-first', () => {
    const a = makeScannedScript('a', ITEM_COUNT_SCRIPT_A);
    const b = makeScannedScript('b', ITEM_COUNT_SCRIPT_B);
    const c = makeScannedScript('c', MOVE_SLOT_NPC_SCRIPT);
    const families = groupScriptsByShapeSignature([c, a, b]);
    expect(families[0]!.scripts).toHaveLength(2);
    expect(families[1]!.scripts).toHaveLength(1);
  });
});

describe('findSimilarScripts', () => {
  it('finds other scripts sharing the same candidate shape, excluding the script itself', () => {
    const a = makeScannedScript('a', ITEM_COUNT_SCRIPT_A);
    const b = makeScannedScript('b', ITEM_COUNT_SCRIPT_B);
    const other = makeScannedScript('c', MOVE_SLOT_NPC_SCRIPT);
    const similar = findSimilarScripts(a, [a, b, other]);
    expect(similar.map((s) => s.id)).toEqual(['b']);
  });

  it('returns an empty array when the script has not been scanned', () => {
    const unscanned: ScriptFile = { id: 'a', filename: 'a.txt', rawText: ITEM_COUNT_SCRIPT_A, importedAt: ISO };
    expect(findSimilarScripts(unscanned, [unscanned])).toEqual([]);
  });
});

describe('createDraftSchemaFromFamilyMember', () => {
  function makeReviewedSchema(): CuratedActionSchema {
    return {
      id: 'reviewed-schema', label: 'Reviewed schema', description: '', actionKey: 'some-action',
      target: UNKNOWN_TARGET, scriptId: 'script-a', scriptFilename: 'a.txt', supportedRevisionLabels: [],
      status: 'reviewed', fields: [{ key: 'widgetCount', label: 'Widget count', type: 'number', required: true, variableName: 'widgetCount' }],
    };
  }

  it('copies fields onto the target script, but always starts as draft — never inherits "reviewed"', () => {
    const target = makeScannedScript('b', ITEM_COUNT_SCRIPT_B);
    const draft = createDraftSchemaFromFamilyMember(makeReviewedSchema(), target);
    expect(draft.status).toBe('draft');
    expect(draft.fields).toEqual(makeReviewedSchema().fields);
    expect(draft.scriptId).toBe('b');
    expect(draft.scriptFilename).toBe('b.txt');
  });

  it('gets a fresh id distinct from the original reviewed schema', () => {
    const target = makeScannedScript('b', ITEM_COUNT_SCRIPT_B);
    const draft = createDraftSchemaFromFamilyMember(makeReviewedSchema(), target);
    expect(draft.id).not.toBe('reviewed-schema');
  });

  it('drops actionKey — a shared candidate shape is not a claim the two scripts are the same action', () => {
    const target = makeScannedScript('b', ITEM_COUNT_SCRIPT_B);
    const draft = createDraftSchemaFromFamilyMember(makeReviewedSchema(), target);
    expect(draft.actionKey).toBeUndefined();
  });

  it('never mutates the original reviewed schema', () => {
    const original = makeReviewedSchema();
    const before = JSON.stringify(original);
    createDraftSchemaFromFamilyMember(original, makeScannedScript('b', ITEM_COUNT_SCRIPT_B));
    expect(JSON.stringify(original)).toBe(before);
  });
});
