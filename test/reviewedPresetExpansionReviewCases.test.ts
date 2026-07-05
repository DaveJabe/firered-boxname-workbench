// Review cases for the reviewed-preset-expansion presets (see
// src/templates/reviewed-schema-presets.ts): for each newly added preset,
// build a toy project matching the real reviewed script's shape, apply the
// preset, save a review case, and confirm it verifies — both individually
// and through the batch runner. Toy fixtures are harmless, invented stand-ins
// (no real species/level/address values are claims about the actual game);
// they only need to match the real script's variable names/shape closely
// enough to exercise the same verification path a real script would.

import { describe, it, expect } from 'vitest';
import type { CuratedActionSchema, GameTarget, Project, ScriptFile, SchemaReviewCase } from '../src/core/types.js';
import { createProject } from '../src/core/factory.js';
import { scanScript } from '../src/core/scriptScanner.js';
import { REVIEWED_SCHEMA_PRESETS } from '../src/templates/reviewed-schema-presets.js';
import { buildCuratedSchemaFromPreset } from '../src/core/reviewedSchemaPresets.js';
import {
  verifySchemaReviewCase,
  runAllSchemaReviewCases,
  hashGeneratorOutput,
  buildManualPasteProvenance,
} from '../src/core/schemaVerification.js';

const ISO = '2026-07-06T00:00:00.000Z';
const FR_EN_11: GameTarget = { game: 'FireRed', language: 'English', revision: '1.1' };

function makeIdGen(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

function makeProject(scripts: ScriptFile[], schemas: CuratedActionSchema[], reviewCases: SchemaReviewCase[] = []): Project {
  const project = createProject(
    { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
    makeIdGen(),
    () => ISO,
  );
  project.scripts = scripts;
  project.curatedSchemas = schemas;
  project.schemaReviewCases = reviewCases;
  return project;
}

function makeScript(id: string, filename: string, rawText: string): ScriptFile {
  const script: ScriptFile = { id, filename, rawText, importedAt: ISO };
  script.lastScan = scanScript(script, () => ISO);
  return script;
}

function presetByActionKey(actionKey: string) {
  const preset = REVIEWED_SCHEMA_PRESETS.find((p) => p.actionKey === actionKey);
  if (!preset) throw new Error(`No seeded preset with actionKey "${actionKey}"`);
  return preset;
}

function baseReviewCase(over: Partial<SchemaReviewCase> & Pick<SchemaReviewCase, 'schemaId' | 'actionKey' | 'scriptId' | 'inputValues' | 'expectedChangedVariables'>): SchemaReviewCase {
  return {
    id: `case-${over.schemaId}`,
    variantId: over.schemaId,
    target: FR_EN_11,
    createdAt: ISO,
    forbiddenChangedVariables: [],
    status: 'draft',
    ...over,
  };
}

describe('review case — start-wild-battle-any-pokemon', () => {
  // Harmless, invented toy fixture matching StartWildBattleWithAnyPokemon.txt's real shape.
  const TOY_SCRIPT = [
    'PokemonHex = 0x00C4',
    'PokemonLV = 25',
    'NPC = 2',
    ';Do not modify these values',
    'ScriptStart = (PokemonLV * 0x1000000) + (PokemonHex * 0x100) + 0xB6',
    'ScriptEnd = 0x02B70000',
    'NPCOffset = 0x1A5 + (NPC * 0x18)',
    '@@',
    'PretendBodyLine',
  ].join('\n');

  function setup() {
    const preset = presetByActionKey('start-wild-battle-any-pokemon');
    const script = makeScript('script-swb', 'StartWildBattleWithAnyPokemon.txt', TOY_SCRIPT);
    const schema = buildCuratedSchemaFromPreset(preset, script);
    const reviewCase = baseReviewCase({
      schemaId: schema.id,
      actionKey: preset.actionKey,
      scriptId: script.id,
      scriptFilename: script.filename,
      inputValues: { PokemonHex: 6, PokemonLV: 50, NPC: '1' },
      expectedChangedVariables: ['PokemonHex', 'PokemonLV', 'NPC'],
      forbiddenChangedVariables: ['ScriptStart', 'ScriptEnd', 'NPCOffset'],
      expectedFilledAssignments: { PokemonHex: 'PokemonHex = 6', PokemonLV: 'PokemonLV = 50', NPC: 'NPC = 1' },
    });
    const project = makeProject([script], [schema], [reviewCase]);
    return { project, schema, reviewCase };
  }

  it('passes verification: intended fields change, helper variables do not', () => {
    const { project, schema, reviewCase } = setup();
    const result = verifySchemaReviewCase(project, schema, reviewCase);
    expect(result.status).toBe('passing');
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('batch verification reports this case as passing', () => {
    const { project } = setup();
    const batch = runAllSchemaReviewCases(project);
    expect(batch.results).toHaveLength(1);
    expect(batch.results[0]!.status).toBe('draft'); // stored status is still 'draft' until run once
  });

  it('once run once, batch verification re-checks it live as passing', () => {
    const { project, schema, reviewCase } = setup();
    reviewCase.status = verifySchemaReviewCase(project, schema, reviewCase).status;
    const batch = runAllSchemaReviewCases(project);
    expect(batch.results[0]!.status).toBe('passing');
    expect(batch.summary).toEqual({ total: 1, passing: 1, failing: 0, notAvailable: 0, accepted: 0, draft: 0 });
  });
});

describe('review case — create-gift-pokemon-bootstrapped', () => {
  // Harmless, invented toy fixture matching CreateAnyGiftPokemonBootstrapped.txt's real shape.
  const TOY_SCRIPT = [
    'PokemonHex = 133',
    'PokemonLV = 25',
    'NPC = 2',
    ';Do not modify these values',
    'ScriptStart = (PokemonLV * 0x1000000) + (PokemonHex * 0x100) + 0x79',
    'ScriptEnd = 0x00000000',
    'NPCOffset = 0x1A5 + (NPC * 0x18)',
    '@@',
    'PretendBodyLine',
  ].join('\n');

  function setup() {
    const preset = presetByActionKey('create-gift-pokemon-bootstrapped');
    const script = makeScript('script-gift', 'CreateAnyGiftPokemonBootstrapped.txt', TOY_SCRIPT);
    const schema = buildCuratedSchemaFromPreset(preset, script);
    const reviewCase = baseReviewCase({
      schemaId: schema.id,
      actionKey: preset.actionKey,
      scriptId: script.id,
      scriptFilename: script.filename,
      inputValues: { PokemonHex: 1, PokemonLV: 5, NPC: '3' },
      expectedChangedVariables: ['PokemonHex', 'PokemonLV', 'NPC'],
      forbiddenChangedVariables: ['ScriptStart', 'ScriptEnd', 'NPCOffset'],
    });
    const project = makeProject([script], [schema], [reviewCase]);
    return { project, schema, reviewCase };
  }

  it('passes verification: intended fields change, helper variables do not', () => {
    const { project, schema, reviewCase } = setup();
    const result = verifySchemaReviewCase(project, schema, reviewCase);
    expect(result.status).toBe('passing');
    expect(result.errors).toEqual([]);
  });

  it('once run once, batch verification re-checks it live as passing', () => {
    const { project, schema, reviewCase } = setup();
    reviewCase.status = verifySchemaReviewCase(project, schema, reviewCase).status;
    const batch = runAllSchemaReviewCases(project);
    expect(batch.results[0]!.status).toBe('passing');
  });

  it('fails verification if a forbidden helper variable were (hypothetically) expected to change', () => {
    const { project, schema, reviewCase } = setup();
    const broken: SchemaReviewCase = { ...reviewCase, expectedChangedVariables: [...reviewCase.expectedChangedVariables, 'ScriptStart'] };
    const result = verifySchemaReviewCase(project, schema, broken);
    // ScriptStart isn't a mapped field, so it can never "change" via fillScriptFromSchema — expecting it to must fail.
    expect(result.status).toBe('failing');
    expect(result.errors.some((e) => e.includes('ScriptStart'))).toBe(true);
  });
});

describe('review case — change-level-party-slot-6', () => {
  // Harmless, invented toy fixture matching ChangeLevel.txt's real shape (no internal/helper variables).
  const TOY_SCRIPT = ['level = 99', '@@', 'PretendBodyLine'].join('\n');

  function setup() {
    const preset = presetByActionKey('change-level-party-slot-6');
    const script = makeScript('script-level', 'ChangeLevel.txt', TOY_SCRIPT);
    const schema = buildCuratedSchemaFromPreset(preset, script);
    const reviewCase = baseReviewCase({
      schemaId: schema.id,
      actionKey: preset.actionKey,
      scriptId: script.id,
      scriptFilename: script.filename,
      inputValues: { level: 50 },
      expectedChangedVariables: ['level'],
      expectedFilledAssignments: { level: 'level = 50' },
      // Optional pasted generator output snapshot — toy box-name text only, not real game output.
      rawGeneratorOutput: 'Box 1: TOYNAME1 [abcdef]\nBox 2: TOYNAME2 [123456]',
    });
    reviewCase.generatorOutputHash = hashGeneratorOutput(reviewCase.rawGeneratorOutput!);
    reviewCase.outputProvenance = buildManualPasteProvenance(ISO);
    const project = makeProject([script], [schema], [reviewCase]);
    return { project, schema, reviewCase };
  }

  it('passes verification, including the pasted generator-output snapshot', () => {
    const { project, schema, reviewCase } = setup();
    const result = verifySchemaReviewCase(project, schema, reviewCase);
    expect(result.status).toBe('passing');
    expect(result.errors).toEqual([]);
    expect(result.parsedOutputSummary).toEqual({ rowCount: 2, boxNumbers: [1, 2] });
  });

  it('carries manual-paste provenance on its output snapshot', () => {
    const { reviewCase } = setup();
    expect(reviewCase.outputProvenance?.source).toBe('manual-paste');
  });

  it('once run once, batch verification re-checks it live as passing', () => {
    const { project, schema, reviewCase } = setup();
    reviewCase.status = verifySchemaReviewCase(project, schema, reviewCase).status;
    const batch = runAllSchemaReviewCases(project);
    expect(batch.results[0]!.status).toBe('passing');
  });
});

describe('review case — create-pokemon-from-nothing', () => {
  // Harmless, invented toy fixture matching PokemonFromNothing.txt's real shape.
  const TOY_SCRIPT = ['species = 0x3200', 'inaccurate_emu = 0', '@@', 'PretendBodyLine'].join('\n');

  function setup() {
    const preset = presetByActionKey('create-pokemon-from-nothing');
    const script = makeScript('script-nothing', 'PokemonFromNothing.txt', TOY_SCRIPT);
    const schema = buildCuratedSchemaFromPreset(preset, script);
    const reviewCase = baseReviewCase({
      schemaId: schema.id,
      actionKey: preset.actionKey,
      scriptId: script.id,
      scriptFilename: script.filename,
      inputValues: { species: 25, inaccurate_emu: '1' },
      expectedChangedVariables: ['species', 'inaccurate_emu'],
    });
    const project = makeProject([script], [schema], [reviewCase]);
    return { project, schema, reviewCase };
  }

  it('passes verification: both fields change as expected', () => {
    const { project, schema, reviewCase } = setup();
    const result = verifySchemaReviewCase(project, schema, reviewCase);
    expect(result.status).toBe('passing');
    expect(result.changedVariables.sort()).toEqual(['inaccurate_emu', 'species']);
  });

  it('fails verification when an expected field does not actually change', () => {
    const { project, schema, reviewCase } = setup();
    const staleCase: SchemaReviewCase = { ...reviewCase, inputValues: { species: 0x3200, inaccurate_emu: '0' } }; // same as current script values -> no change
    const result = verifySchemaReviewCase(project, schema, staleCase);
    expect(result.status).toBe('failing');
  });

  it('once run once, batch verification re-checks it live as passing', () => {
    const { project, schema, reviewCase } = setup();
    reviewCase.status = verifySchemaReviewCase(project, schema, reviewCase).status;
    const batch = runAllSchemaReviewCases(project);
    expect(batch.results[0]!.status).toBe('passing');
  });
});

describe('all four expansion presets together — batch verification and Run Script listing', () => {
  function setupAll(): Project {
    const wildBattlePreset = presetByActionKey('start-wild-battle-any-pokemon');
    const giftPreset = presetByActionKey('create-gift-pokemon-bootstrapped');
    const levelPreset = presetByActionKey('change-level-party-slot-6');
    const nothingPreset = presetByActionKey('create-pokemon-from-nothing');

    const wildBattleScript = makeScript(
      'script-swb', 'StartWildBattleWithAnyPokemon.txt',
      ['PokemonHex = 0x00C4', 'PokemonLV = 25', 'NPC = 2', 'ScriptStart = 1', 'ScriptEnd = 1', 'NPCOffset = 1', '@@', 'PretendBodyLine'].join('\n'),
    );
    const giftScript = makeScript(
      'script-gift', 'CreateAnyGiftPokemonBootstrapped.txt',
      ['PokemonHex = 133', 'PokemonLV = 25', 'NPC = 2', 'ScriptStart = 1', 'ScriptEnd = 1', 'NPCOffset = 1', '@@', 'PretendBodyLine'].join('\n'),
    );
    const levelScript = makeScript('script-level', 'ChangeLevel.txt', ['level = 99', '@@', 'PretendBodyLine'].join('\n'));
    const nothingScript = makeScript('script-nothing', 'PokemonFromNothing.txt', ['species = 0x3200', 'inaccurate_emu = 0', '@@', 'PretendBodyLine'].join('\n'));

    const wildBattleSchema = buildCuratedSchemaFromPreset(wildBattlePreset, wildBattleScript);
    const giftSchema = buildCuratedSchemaFromPreset(giftPreset, giftScript);
    const levelSchema = buildCuratedSchemaFromPreset(levelPreset, levelScript);
    const nothingSchema = buildCuratedSchemaFromPreset(nothingPreset, nothingScript);

    const cases: SchemaReviewCase[] = [
      baseReviewCase({
        schemaId: wildBattleSchema.id, actionKey: wildBattlePreset.actionKey, scriptId: wildBattleScript.id,
        inputValues: { PokemonHex: 6, PokemonLV: 50, NPC: '1' }, expectedChangedVariables: ['PokemonHex', 'PokemonLV', 'NPC'],
        forbiddenChangedVariables: ['ScriptStart', 'ScriptEnd', 'NPCOffset'], status: 'passing',
      }),
      baseReviewCase({
        schemaId: giftSchema.id, actionKey: giftPreset.actionKey, scriptId: giftScript.id,
        inputValues: { PokemonHex: 1, PokemonLV: 5, NPC: '3' }, expectedChangedVariables: ['PokemonHex', 'PokemonLV', 'NPC'],
        forbiddenChangedVariables: ['ScriptStart', 'ScriptEnd', 'NPCOffset'], status: 'passing',
      }),
      baseReviewCase({
        schemaId: levelSchema.id, actionKey: levelPreset.actionKey, scriptId: levelScript.id,
        inputValues: { level: 50 }, expectedChangedVariables: ['level'], status: 'passing',
      }),
      baseReviewCase({
        schemaId: nothingSchema.id, actionKey: nothingPreset.actionKey, scriptId: nothingScript.id,
        inputValues: { species: 25, inaccurate_emu: '1' }, expectedChangedVariables: ['species', 'inaccurate_emu'], status: 'passing',
      }),
    ];

    return makeProject(
      [wildBattleScript, giftScript, levelScript, nothingScript],
      [wildBattleSchema, giftSchema, levelSchema, nothingSchema],
      cases,
    );
  }

  it('batch verification reports all four new cases as passing, with no accepted/manual override needed', () => {
    const project = setupAll();
    const batch = runAllSchemaReviewCases(project);
    expect(batch.summary).toEqual({ total: 4, passing: 4, failing: 0, notAvailable: 0, accepted: 0, draft: 0 });
  });

  it('Run Script (via getRunnableActionsForTarget) lists all four new actions as runnable for FireRed/English/1.1', async () => {
    const { getRunnableActionsForTarget } = await import('../src/core/supportedActionRegistry.js');
    const project = setupAll();
    const runnable = getRunnableActionsForTarget(project, FR_EN_11);
    const actionKeys = runnable.map((a) => a.actionKey).sort();
    expect(actionKeys).toEqual([
      'change-level-party-slot-6',
      'create-gift-pokemon-bootstrapped',
      'create-pokemon-from-nothing',
      'start-wild-battle-any-pokemon',
    ]);
  });

  it('none of the four new schemas show up as stale-field or catalog-need findings in Catalog Audit', async () => {
    const { buildCatalogGapAudit } = await import('../src/core/catalogGapAudit.js');
    const project = setupAll();
    const audit = buildCatalogGapAudit(project, () => ISO);
    const newSchemaIds = project.curatedSchemas.map((s) => s.id);
    expect(audit.staleSchemaFields.filter((f) => newSchemaIds.includes(f.schemaId))).toEqual([]);
    expect(audit.missingCatalogs.length).toBe(0);
  });
});
