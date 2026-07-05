import { describe, it, expect } from 'vitest';
import { REVIEWED_SCHEMA_PRESETS } from '../src/templates/reviewed-schema-presets.js';
import {
  validateReviewedPreset,
  matchReviewedPresets,
  buildCuratedSchemaFromPreset,
} from '../src/core/reviewedSchemaPresets.js';
import { fillScriptFromSchema } from '../src/core/scriptFiller.js';

describe('seeded reviewed schema presets', () => {
  it('seeds a small, deliberately non-exhaustive catalog (1-10 presets)', () => {
    expect(REVIEWED_SCHEMA_PRESETS.length).toBeGreaterThanOrEqual(1);
    expect(REVIEWED_SCHEMA_PRESETS.length).toBeLessThanOrEqual(10);
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

describe('Start Wild Battle With Any Pokémon preset', () => {
  const preset = REVIEWED_SCHEMA_PRESETS.find((p) => p.actionKey === 'start-wild-battle-any-pokemon')!;

  it('exists and is reviewed with an explicit target', () => {
    expect(preset).toBeDefined();
    expect(preset.status).toBe('reviewed');
    expect(preset.target).toEqual({ game: 'FireRed', language: 'English', revision: '1.1' });
  });

  it('includes exactly the user-facing fields: PokemonHex, PokemonLV, NPC', () => {
    expect(preset.fields.map((f) => f.variableName).sort()).toEqual(['NPC', 'PokemonHex', 'PokemonLV']);
  });

  it('excludes internal/helper variables: ScriptStart, ScriptEnd, NPCOffset', () => {
    const variableNames = preset.fields.map((f) => f.variableName);
    expect(variableNames).not.toContain('ScriptStart');
    expect(variableNames).not.toContain('ScriptEnd');
    expect(variableNames).not.toContain('NPCOffset');
  });

  it('matches a script literally named StartWildBattleWithAnyPokemon.txt', () => {
    const matches = matchReviewedPresets(REVIEWED_SCHEMA_PRESETS, { filename: 'StartWildBattleWithAnyPokemon.txt', category: 'pkmn' });
    expect(matches.some((m) => m.preset.id === preset.id)).toBe(true);
  });

  it('renders PokemonHex as a reference-select backed by gen3-species', () => {
    const species = preset.fields.find((f) => f.variableName === 'PokemonHex')!;
    expect(species.type).toBe('reference-select');
    expect(species.referenceCatalogId).toBe('gen3-species');
  });

  it('renders PokemonLV as a bounded number field (1-100)', () => {
    const level = preset.fields.find((f) => f.variableName === 'PokemonLV')!;
    expect(level.type).toBe('number');
    expect(level.min).toBe(1);
    expect(level.max).toBe(100);
  });

  it('renders NPC as a select of exactly 1-3', () => {
    const npc = preset.fields.find((f) => f.variableName === 'NPC')!;
    expect(npc.type).toBe('select');
    expect(npc.options?.map((o) => o.value)).toEqual(['1', '2', '3']);
  });

  it('applying it to a script produces a reviewed schema with the same target and fields', () => {
    const schema = buildCuratedSchemaFromPreset(preset, { id: 'script-1', filename: 'StartWildBattleWithAnyPokemon.txt' });
    expect(schema.status).toBe('reviewed');
    expect(schema.target).toEqual(preset.target);
    expect(schema.fields.map((f) => f.variableName).sort()).toEqual(['NPC', 'PokemonHex', 'PokemonLV']);
  });

  it('end-to-end: filling writes bare numeric tokens, never a quoted string or catalog display name', () => {
    // Harmless, invented toy fixture — no real script, species value, or address.
    const toyScript = ['PokemonHex = 0x00C4', 'PokemonLV = 25', 'NPC = 2', '@@', 'PretendBodyLine'].join('\n');
    const schema = buildCuratedSchemaFromPreset(preset, { id: 'script-1', filename: 'StartWildBattleWithAnyPokemon.txt' });
    const result = fillScriptFromSchema(toyScript, schema, { PokemonHex: 6, PokemonLV: 50, NPC: '1' });
    expect(result.errors).toEqual([]);
    expect(result.filledScriptText).toContain('PokemonHex = 6');
    expect(result.filledScriptText).toContain('PokemonLV = 50');
    expect(result.filledScriptText).toContain('NPC = 1');
    expect(result.filledScriptText).not.toContain('Charizard');
  });
});

describe('Create Any Gift Pokémon (Bootstrapped) preset', () => {
  const preset = REVIEWED_SCHEMA_PRESETS.find((p) => p.actionKey === 'create-gift-pokemon-bootstrapped')!;

  it('exists and is reviewed with an explicit target', () => {
    expect(preset).toBeDefined();
    expect(preset.status).toBe('reviewed');
    expect(preset.target).toEqual({ game: 'FireRed', language: 'English', revision: '1.1' });
  });

  it('includes exactly the user-facing fields: PokemonHex, PokemonLV, NPC', () => {
    expect(preset.fields.map((f) => f.variableName).sort()).toEqual(['NPC', 'PokemonHex', 'PokemonLV']);
  });

  it('excludes internal/helper variables: ScriptStart, ScriptEnd, NPCOffset', () => {
    const variableNames = preset.fields.map((f) => f.variableName);
    expect(variableNames).not.toContain('ScriptStart');
    expect(variableNames).not.toContain('ScriptEnd');
    expect(variableNames).not.toContain('NPCOffset');
  });

  it('matches a script literally named CreateAnyGiftPokemonBootstrapped.txt', () => {
    const matches = matchReviewedPresets(REVIEWED_SCHEMA_PRESETS, { filename: 'CreateAnyGiftPokemonBootstrapped.txt', category: 'pkmn' });
    expect(matches.some((m) => m.preset.id === preset.id)).toBe(true);
  });

  it('renders PokemonHex as a reference-select backed by gen3-species', () => {
    const species = preset.fields.find((f) => f.variableName === 'PokemonHex')!;
    expect(species.type).toBe('reference-select');
    expect(species.referenceCatalogId).toBe('gen3-species');
  });

  it('renders PokemonLV as a bounded number field (1-100)', () => {
    const level = preset.fields.find((f) => f.variableName === 'PokemonLV')!;
    expect(level.type).toBe('number');
    expect(level.min).toBe(1);
    expect(level.max).toBe(100);
  });

  it('has a distinct id/actionKey from the field-shape-identical start-wild-battle-any-pokemon preset', () => {
    const other = REVIEWED_SCHEMA_PRESETS.find((p) => p.actionKey === 'start-wild-battle-any-pokemon')!;
    expect(preset.id).not.toBe(other.id);
    expect(preset.actionKey).not.toBe(other.actionKey);
    expect(preset.match.filenamePattern).not.toBe(other.match.filenamePattern);
  });

  it('end-to-end: filling writes bare numeric tokens, never a quoted string or catalog display name', () => {
    // Harmless, invented toy fixture — no real script, species value, or address.
    const toyScript = ['PokemonHex = 133', 'PokemonLV = 25', 'NPC = 2', '@@', 'PretendBodyLine'].join('\n');
    const schema = buildCuratedSchemaFromPreset(preset, { id: 'script-1', filename: 'CreateAnyGiftPokemonBootstrapped.txt' });
    const result = fillScriptFromSchema(toyScript, schema, { PokemonHex: 1, PokemonLV: 5, NPC: '3' });
    expect(result.errors).toEqual([]);
    expect(result.filledScriptText).toContain('PokemonHex = 1');
    expect(result.filledScriptText).toContain('PokemonLV = 5');
    expect(result.filledScriptText).toContain('NPC = 3');
    expect(result.filledScriptText).not.toContain('Bulbasaur');
  });
});

describe('Change Level of Party Slot 6 preset', () => {
  const preset = REVIEWED_SCHEMA_PRESETS.find((p) => p.actionKey === 'change-level-party-slot-6')!;

  it('exists and is reviewed with an explicit target', () => {
    expect(preset).toBeDefined();
    expect(preset.status).toBe('reviewed');
    expect(preset.target).toEqual({ game: 'FireRed', language: 'English', revision: '1.1' });
  });

  it('includes exactly the one user-facing field: level', () => {
    expect(preset.fields.map((f) => f.variableName)).toEqual(['level']);
  });

  it('matches a script literally named ChangeLevel.txt', () => {
    const matches = matchReviewedPresets(REVIEWED_SCHEMA_PRESETS, { filename: 'ChangeLevel.txt', category: 'pkmn' });
    expect(matches.some((m) => m.preset.id === preset.id)).toBe(true);
  });

  it('renders level as a bounded number field (1-100)', () => {
    const level = preset.fields.find((f) => f.variableName === 'level')!;
    expect(level.type).toBe('number');
    expect(level.min).toBe(1);
    expect(level.max).toBe(100);
  });

  it('end-to-end: filling writes a bare numeric token', () => {
    // Harmless, invented toy fixture — no real script or address.
    const toyScript = ['level = 99', '@@', 'PretendBodyLine'].join('\n');
    const schema = buildCuratedSchemaFromPreset(preset, { id: 'script-1', filename: 'ChangeLevel.txt' });
    const result = fillScriptFromSchema(toyScript, schema, { level: 50 });
    expect(result.errors).toEqual([]);
    expect(result.filledScriptText).toContain('level = 50');
  });
});

describe('Create Pokémon From Nothing preset', () => {
  const preset = REVIEWED_SCHEMA_PRESETS.find((p) => p.actionKey === 'create-pokemon-from-nothing')!;

  it('exists and is reviewed with an explicit target', () => {
    expect(preset).toBeDefined();
    expect(preset.status).toBe('reviewed');
    expect(preset.target).toEqual({ game: 'FireRed', language: 'English', revision: '1.1' });
  });

  it('includes exactly the user-facing fields: species, inaccurate_emu (this script has no computed helper variables)', () => {
    expect(preset.fields.map((f) => f.variableName).sort()).toEqual(['inaccurate_emu', 'species']);
  });

  it('matches a script literally named PokemonFromNothing.txt', () => {
    const matches = matchReviewedPresets(REVIEWED_SCHEMA_PRESETS, { filename: 'PokemonFromNothing.txt', category: 'pkmn' });
    expect(matches.some((m) => m.preset.id === preset.id)).toBe(true);
  });

  it('renders species as a reference-select backed by gen3-species', () => {
    const species = preset.fields.find((f) => f.variableName === 'species')!;
    expect(species.type).toBe('reference-select');
    expect(species.referenceCatalogId).toBe('gen3-species');
  });

  it('renders inaccurate_emu as the shared boolean-set-clear bounded control (0/1)', () => {
    const toggle = preset.fields.find((f) => f.variableName === 'inaccurate_emu')!;
    expect(toggle.type).toBe('select');
    expect(toggle.options?.map((o) => o.value)).toEqual(['0', '1']);
  });

  it('end-to-end: filling writes bare numeric tokens, never a quoted string or catalog display name', () => {
    // Harmless, invented toy fixture — no real script or species value.
    const toyScript = ['species = 0x3200', 'inaccurate_emu = 0', '@@', 'PretendBodyLine'].join('\n');
    const schema = buildCuratedSchemaFromPreset(preset, { id: 'script-1', filename: 'PokemonFromNothing.txt' });
    const result = fillScriptFromSchema(toyScript, schema, { species: 25, inaccurate_emu: '1' });
    expect(result.errors).toEqual([]);
    expect(result.filledScriptText).toContain('species = 25');
    expect(result.filledScriptText).toContain('inaccurate_emu = 1');
    expect(result.filledScriptText).not.toContain('Pikachu');
  });
});
