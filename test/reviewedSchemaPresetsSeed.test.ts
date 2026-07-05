import { describe, it, expect } from 'vitest';
import { REVIEWED_SCHEMA_PRESETS } from '../src/templates/reviewed-schema-presets.js';
import {
  validateReviewedPreset,
  matchReviewedPresets,
  buildCuratedSchemaFromPreset,
} from '../src/core/reviewedSchemaPresets.js';
import { fillScriptFromSchema } from '../src/core/scriptFiller.js';

describe('seeded reviewed schema presets', () => {
  it('seeds a small, deliberately non-exhaustive catalog (1-3 presets)', () => {
    expect(REVIEWED_SCHEMA_PRESETS.length).toBeGreaterThanOrEqual(1);
    expect(REVIEWED_SCHEMA_PRESETS.length).toBeLessThanOrEqual(3);
  });

  it('every seeded preset passes validation', () => {
    for (const preset of REVIEWED_SCHEMA_PRESETS) {
      expect(validateReviewedPreset(preset)).toEqual([]);
    }
  });
});

describe('Teach Pokémon Any Move preset', () => {
  const preset = REVIEWED_SCHEMA_PRESETS.find((p) => p.actionKey === 'teach-any-move')!;

  it('exists and is reviewed', () => {
    expect(preset).toBeDefined();
    expect(preset.status).toBe('reviewed');
  });

  it('includes exactly the user-facing fields: Move, MoveSlot, NPC', () => {
    const variableNames = preset.fields.map((f) => f.variableName).sort();
    expect(variableNames).toEqual(['Move', 'MoveSlot', 'NPC']);
  });

  it('excludes internal/helper variables: ScriptStart, ScriptEnd, NPCOffset', () => {
    const variableNames = preset.fields.map((f) => f.variableName);
    expect(variableNames).not.toContain('ScriptStart');
    expect(variableNames).not.toContain('ScriptEnd');
    expect(variableNames).not.toContain('NPCOffset');
  });

  it('has an explicit target compatibility (FireRed / English / 1.1)', () => {
    expect(preset.target).toEqual({ game: 'FireRed', language: 'English', revision: '1.1' });
  });

  it('matches a script literally named TeachAnyMove.txt', () => {
    const matches = matchReviewedPresets(REVIEWED_SCHEMA_PRESETS, { filename: 'TeachAnyMove.txt', category: 'pkmn' });
    expect(matches.some((m) => m.preset.id === preset.id)).toBe(true);
  });

  it('applying it to a script produces a reviewed schema with the same target and fields', () => {
    const schema = buildCuratedSchemaFromPreset(preset, { id: 'script-1', filename: 'TeachAnyMove.txt' });
    expect(schema.status).toBe('reviewed');
    expect(schema.target).toEqual(preset.target);
    expect(schema.fields.map((f) => f.variableName).sort()).toEqual(['Move', 'MoveSlot', 'NPC']);
  });

  it('records honest source/review notes, not a fabricated script title', () => {
    expect(preset.sourceNotes.reviewedFromScriptFilename).toBe('TeachAnyMove.txt');
    expect(preset.sourceNotes.reviewedFromScriptTitle).toBeUndefined();
    expect(preset.sourceNotes.reviewerNote).toBeTruthy();
  });

  it('renders Move as a reference-select backed by the local gen3-moves catalog, not a plain text box', () => {
    const move = preset.fields.find((f) => f.variableName === 'Move')!;
    expect(move.type).toBe('reference-select');
    expect(move.referenceCatalogId).toBe('gen3-moves');
  });

  it('renders MoveSlot as a select of exactly 0-3', () => {
    const moveSlot = preset.fields.find((f) => f.variableName === 'MoveSlot')!;
    expect(moveSlot.type).toBe('select');
    expect(moveSlot.options?.map((o) => o.value)).toEqual(['0', '1', '2', '3']);
  });

  it('renders NPC as a select of exactly 1-3', () => {
    const npc = preset.fields.find((f) => f.variableName === 'NPC')!;
    expect(npc.type).toBe('select');
    expect(npc.options?.map((o) => o.value)).toEqual(['1', '2', '3']);
  });

  it('applying it still fills only the numeric value into the script, never a display name', () => {
    const schema = buildCuratedSchemaFromPreset(preset, { id: 'script-1', filename: 'TeachAnyMove.txt' });
    const move = schema.fields.find((f) => f.variableName === 'Move')!;
    const moveSlot = schema.fields.find((f) => f.variableName === 'MoveSlot')!;
    const npc = schema.fields.find((f) => f.variableName === 'NPC')!;
    expect(move.type).toBe('reference-select');
    expect(moveSlot.type).toBe('select');
    expect(npc.type).toBe('select');
  });

  it('end-to-end: filling the reviewed preset schema writes bare numeric tokens for Move/MoveSlot/NPC, never a quoted string or catalog display name', () => {
    // Harmless, invented toy fixture — no real script, move ID, or address.
    const toyScript = ['Move = 1', 'MoveSlot = 0', 'NPC = 1', '@@', 'PretendBodyLine'].join('\n');
    const schema = buildCuratedSchemaFromPreset(preset, { id: 'script-1', filename: 'TeachAnyMove.txt' });
    const result = fillScriptFromSchema(toyScript, schema, { Move: 85, MoveSlot: '2', NPC: '3' });
    expect(result.errors).toEqual([]);
    expect(result.filledScriptText).toContain('Move = 85');
    expect(result.filledScriptText).toContain('MoveSlot = 2');
    expect(result.filledScriptText).toContain('NPC = 3');
    expect(result.filledScriptText).not.toContain('"85"');
    expect(result.filledScriptText).not.toContain('Thunderbolt');
  });
});
