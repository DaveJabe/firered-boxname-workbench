import { describe, it, expect } from 'vitest';
import type { CuratedActionSchema, GameTarget, Project, ScriptFile, SchemaReviewCase } from '../src/core/types.js';
import { scanScript } from '../src/core/scriptScanner.js';
import {
  verifySchemaReviewCase,
  hashGeneratorOutput,
  buildManualPasteProvenance,
  summarizeVariantVerification,
  summarizeAllVariantVerifications,
  summarizePresetVerification,
  describeSchemaVerificationSetupError,
} from '../src/core/schemaVerification.js';
import { GENERATOR_OUTPUT_PARSER_VERSION } from '../src/core/generatorOutputParser.js';
import { UNKNOWN_TARGET } from '../src/core/gameTarget.js';
import { createProject } from '../src/core/factory.js';
import {
  exportSchemaReviewCaseJson,
  importSchemaReviewCaseJson,
  exportProjectJson,
  importProjectJson,
} from '../src/data/storage.js';

const ISO = '2026-01-01T00:00:00.000Z';
const FR_EN_10: GameTarget = { game: 'FireRed', language: 'English', revision: '1.0' };
const FR_EN_11: GameTarget = { game: 'FireRed', language: 'English', revision: '1.1' };

// Harmless, invented toy fixture — no real script, move ID, address, or payload byte.
const TOY_SCRIPT = [
  'Move = 1',
  'MoveSlot = 0',
  '; Do not modify these values',
  'ScriptStart = (Move * 2)',
  '@@',
  'PretendBodyLine',
].join('\n');

function makeScript(): ScriptFile {
  const script: ScriptFile = { id: 'script-1', filename: 'toy.txt', rawText: TOY_SCRIPT, importedAt: ISO };
  script.lastScan = scanScript(script, () => ISO);
  return script;
}

function makeCleanSchema(over: Partial<CuratedActionSchema> = {}): CuratedActionSchema {
  return {
    id: 'toy-schema', label: 'Toy schema', description: '', actionKey: 'toy-action', target: FR_EN_10,
    scriptId: 'script-1', scriptFilename: 'toy.txt', supportedRevisionLabels: [], status: 'reviewed',
    fields: [
      { key: 'Move', label: 'Move', type: 'number', required: true, variableName: 'Move' },
      { key: 'MoveSlot', label: 'Move slot', type: 'number', required: true, variableName: 'MoveSlot' },
    ],
    ...over,
  };
}

/** A misconfigured schema that (mistakenly) also maps the internal/helper ScriptStart variable. */
function makeSchemaMappingInternalVariable(): CuratedActionSchema {
  const schema = makeCleanSchema();
  return {
    ...schema,
    fields: [...schema.fields, { key: 'ScriptStart', label: 'Script start', type: 'number', required: false, variableName: 'ScriptStart' }],
  };
}

function makeReviewCase(over: Partial<SchemaReviewCase> = {}): SchemaReviewCase {
  return {
    id: 'case-1',
    schemaId: 'toy-schema',
    variantId: 'toy-schema',
    scriptId: 'script-1',
    actionKey: 'toy-action',
    target: FR_EN_10,
    createdAt: ISO,
    inputValues: { Move: 5, MoveSlot: 1 },
    expectedChangedVariables: ['Move', 'MoveSlot'],
    forbiddenChangedVariables: [],
    status: 'draft',
    ...over,
  };
}

function makeProject(scripts: ScriptFile[] = [], schemas: CuratedActionSchema[] = [], reviewCases: SchemaReviewCase[] = []): Project {
  const project = createProject(
    { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
    (() => { let n = 0; return () => `id-${n++}`; })(),
    () => ISO,
  );
  project.scripts = scripts;
  project.curatedSchemas = schemas;
  project.schemaReviewCases = reviewCases;
  return project;
}

describe('SchemaReviewCase — references the supported-action/variant model', () => {
  it('can reference actionKey, schemaId, scriptId, target, and variantId all at once', () => {
    const reviewCase = makeReviewCase();
    expect(reviewCase.actionKey).toBe('toy-action');
    expect(reviewCase.schemaId).toBe('toy-schema');
    expect(reviewCase.scriptId).toBe('script-1');
    expect(reviewCase.variantId).toBe('toy-schema');
    expect(reviewCase.target).toEqual(FR_EN_10);
  });
});

describe('verifySchemaReviewCase — filling and expected/forbidden variables', () => {
  it('fills the script using reviewCase.inputValues and passes when the expected variables change', () => {
    const project = makeProject([makeScript()], [makeCleanSchema()]);
    const result = verifySchemaReviewCase(project, makeCleanSchema(), makeReviewCase());
    expect(result.status).toBe('passing');
    expect(result.errors).toEqual([]);
    expect(result.changedVariables.sort()).toEqual(['Move', 'MoveSlot']);
  });

  it('fails if fillScriptFromSchema itself returns errors (e.g. a mapped variable not found before @@)', () => {
    const schema = makeCleanSchema({ fields: [{ key: 'Nope', label: 'Nope', type: 'number' as const, required: true, variableName: 'DoesNotExist' }] });
    const project = makeProject([makeScript()], [schema]);
    const result = verifySchemaReviewCase(project, schema, makeReviewCase({ inputValues: { Nope: 1 }, expectedChangedVariables: [] }));
    expect(result.status).toBe('failing');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('fails when an expected changed variable does not actually change', () => {
    // MoveSlot's input value (0) equals the script's current value — no line changes, so "MoveSlot changed" is false.
    const project = makeProject([makeScript()], [makeCleanSchema()]);
    const reviewCase = makeReviewCase({ inputValues: { Move: 5, MoveSlot: 0 } });
    const result = verifySchemaReviewCase(project, makeCleanSchema(), reviewCase);
    expect(result.status).toBe('failing');
    expect(result.errors.some((e) => e.includes('MoveSlot'))).toBe(true);
  });

  it('fails when a forbidden variable changes', () => {
    const schema = makeSchemaMappingInternalVariable();
    const project = makeProject([makeScript()], [schema]);
    const reviewCase = makeReviewCase({
      inputValues: { Move: 5, MoveSlot: 1, ScriptStart: 99 },
      expectedChangedVariables: ['Move', 'MoveSlot'],
      forbiddenChangedVariables: ['ScriptStart'],
    });
    const result = verifySchemaReviewCase(project, schema, reviewCase);
    expect(result.status).toBe('failing');
    expect(result.errors.some((e) => e.includes('ScriptStart'))).toBe(true);
  });

  it('warns (without necessarily being requested as forbidden) when an internal/helper variable changes unexpectedly', () => {
    const schema = makeSchemaMappingInternalVariable();
    const project = makeProject([makeScript()], [schema]);
    const reviewCase = makeReviewCase({
      inputValues: { Move: 5, MoveSlot: 1, ScriptStart: 99 },
      expectedChangedVariables: ['Move', 'MoveSlot'],
      forbiddenChangedVariables: [], // not explicitly forbidden — the internal-variable check is independent
    });
    const result = verifySchemaReviewCase(project, schema, reviewCase);
    expect(result.warnings.some((w) => w.includes('ScriptStart'))).toBe(true);
  });

  it('checks expectedFilledAssignments verbatim against the actual after-text', () => {
    const project = makeProject([makeScript()], [makeCleanSchema()]);
    const passingCase = makeReviewCase({ expectedFilledAssignments: { Move: 'Move = 5' } });
    expect(verifySchemaReviewCase(project, makeCleanSchema(), passingCase).status).toBe('passing');

    const failingCase = makeReviewCase({ expectedFilledAssignments: { Move: 'Move = 999' } });
    const result = verifySchemaReviewCase(project, makeCleanSchema(), failingCase);
    expect(result.status).toBe('failing');
    expect(result.errors.some((e) => e.includes('Move'))).toBe(true);
  });
});

describe('verifySchemaReviewCase — setup-facing errors (short-circuit before any fill is attempted)', () => {
  it('fails with a clear error when the schema is detached (no scriptId)', () => {
    const schema = makeCleanSchema({ scriptId: undefined, scriptFilename: undefined });
    const project = makeProject([makeScript()], [schema]);
    const result = verifySchemaReviewCase(project, schema, makeReviewCase());
    expect(result.status).toBe('failing');
    expect(result.errors.some((e) => /detached/i.test(e))).toBe(true);
  });

  it('fails with a clear error when the linked script no longer exists in this project', () => {
    const schema = makeCleanSchema({ scriptId: 'ghost-script' });
    const project = makeProject([], [schema]); // no scripts at all
    const result = verifySchemaReviewCase(project, schema, makeReviewCase());
    expect(result.status).toBe('failing');
    expect(result.errors.some((e) => /no longer exists/i.test(e))).toBe(true);
  });

  it('fails with a clear error when the schema is disabled', () => {
    const schema = makeCleanSchema({ status: 'disabled' });
    const project = makeProject([makeScript()], [schema]);
    const result = verifySchemaReviewCase(project, schema, makeReviewCase());
    expect(result.status).toBe('failing');
    expect(result.errors.some((e) => /disabled/i.test(e))).toBe(true);
  });

  it('fails with a clear error when the schema is still a draft', () => {
    const schema = makeCleanSchema({ status: 'draft' });
    const project = makeProject([makeScript()], [schema]);
    const result = verifySchemaReviewCase(project, schema, makeReviewCase());
    expect(result.status).toBe('failing');
    expect(result.errors.some((e) => /draft/i.test(e))).toBe(true);
  });

  it('fails with a clear error when the review case target does not match the schema\'s current target', () => {
    const schema = makeCleanSchema({ target: FR_EN_11 }); // schema's target changed since the case was saved
    const project = makeProject([makeScript()], [schema]);
    const result = verifySchemaReviewCase(project, schema, makeReviewCase({ target: FR_EN_10 }));
    expect(result.status).toBe('failing');
    expect(result.errors.some((e) => /target/i.test(e))).toBe(true);
  });

  it('fails when the schema has no explicit target at all (Unknown/Mixed)', () => {
    const schema = makeCleanSchema({ target: UNKNOWN_TARGET });
    const project = makeProject([makeScript()], [schema]);
    const result = verifySchemaReviewCase(project, schema, makeReviewCase({ target: UNKNOWN_TARGET }));
    expect(result.status).toBe('failing');
    expect(result.errors.some((e) => /target/i.test(e))).toBe(true);
  });

  it('describeSchemaVerificationSetupError returns undefined for a fully verifiable schema', () => {
    const schema = makeCleanSchema();
    const project = makeProject([makeScript()], [schema]);
    expect(describeSchemaVerificationSetupError(schema, project)).toBeUndefined();
  });
});

describe('verifySchemaReviewCase — pasted generator output', () => {
  it('parses raw generator output into Box N rows and reports a summary', () => {
    const project = makeProject([makeScript()], [makeCleanSchema()]);
    const reviewCase = makeReviewCase({ rawGeneratorOutput: 'Box 1: FOO BAR [abc]\nBox 2: BAZ QUX [def]' });
    const result = verifySchemaReviewCase(project, makeCleanSchema(), reviewCase);
    expect(result.status).toBe('passing');
    expect(result.parsedOutputSummary).toEqual({ rowCount: 2, boxNumbers: [1, 2] });
  });

  it('fails verification when raw generator output has no parseable "Box N:" rows', () => {
    const project = makeProject([makeScript()], [makeCleanSchema()]);
    const reviewCase = makeReviewCase({ rawGeneratorOutput: 'not a box line at all' });
    const result = verifySchemaReviewCase(project, makeCleanSchema(), reviewCase);
    expect(result.status).toBe('failing');
    expect(result.errors.some((e) => /Box N/.test(e))).toBe(true);
  });

  it('passes generator output hash comparison when the hash still matches', () => {
    const project = makeProject([makeScript()], [makeCleanSchema()]);
    const rawGeneratorOutput = 'Box 1: FOO [abc]';
    const reviewCase = makeReviewCase({ rawGeneratorOutput, generatorOutputHash: hashGeneratorOutput(rawGeneratorOutput) });
    expect(verifySchemaReviewCase(project, makeCleanSchema(), reviewCase).status).toBe('passing');
  });

  it('fails generator output hash comparison when the saved output has drifted', () => {
    const project = makeProject([makeScript()], [makeCleanSchema()]);
    const reviewCase = makeReviewCase({ rawGeneratorOutput: 'Box 1: FOO [abc]', generatorOutputHash: 'deadbeef' });
    const result = verifySchemaReviewCase(project, makeCleanSchema(), reviewCase);
    expect(result.status).toBe('failing');
    expect(result.errors.some((e) => /hash/i.test(e))).toBe(true);
  });

  it('fails when the saved parsedBoxRows snapshot no longer matches a fresh parse', () => {
    const project = makeProject([makeScript()], [makeCleanSchema()]);
    const reviewCase = makeReviewCase({
      rawGeneratorOutput: 'Box 1: FOO [abc]',
      parsedBoxRows: [{ boxNumber: 1, rawLine: 'Box 1: DIFFERENT [xyz]', spacedDisplay: 'DIFFERENT', compactText: 'xyz' }],
    });
    const result = verifySchemaReviewCase(project, makeCleanSchema(), reviewCase);
    expect(result.status).toBe('failing');
    expect(result.errors.some((e) => /snapshot/i.test(e))).toBe(true);
  });
});

describe('generator output provenance', () => {
  it('buildManualPasteProvenance captures manual-paste source, label, capturedAt, and the current parser version', () => {
    const provenance = buildManualPasteProvenance('2026-07-05T12:00:00.000Z');
    expect(provenance).toEqual({
      source: 'manual-paste',
      sourceLabel: 'Manual E-Sh4rk paste-back',
      capturedAt: '2026-07-05T12:00:00.000Z',
      parserVersion: GENERATOR_OUTPUT_PARSER_VERSION,
    });
  });

  it('verification ignores provenance entirely for pass/fail logic — identical otherwise, one with provenance and one without', () => {
    const project = makeProject([makeScript()], [makeCleanSchema()]);
    const rawGeneratorOutput = 'Box 1: FOO [abc]';
    const withProvenance = makeReviewCase({ rawGeneratorOutput, outputProvenance: buildManualPasteProvenance(ISO) });
    const withoutProvenance = makeReviewCase({ rawGeneratorOutput, outputProvenance: undefined });

    const resultWith = verifySchemaReviewCase(project, makeCleanSchema(), withProvenance);
    const resultWithout = verifySchemaReviewCase(project, makeCleanSchema(), withoutProvenance);
    expect(resultWith).toEqual(resultWithout);
    expect(resultWith.status).toBe('passing');

    // Also true on the failure path — a bogus/mismatched provenance never turns a pass into a fail or vice versa.
    const bogusProvenance = makeReviewCase({
      rawGeneratorOutput, generatorOutputHash: 'deadbeef',
      outputProvenance: { source: 'future-adapter', capturedAt: ISO },
    });
    const noProvenanceSameBreak = makeReviewCase({ rawGeneratorOutput, generatorOutputHash: 'deadbeef' });
    expect(verifySchemaReviewCase(project, makeCleanSchema(), bogusProvenance)).toEqual(
      verifySchemaReviewCase(project, makeCleanSchema(), noProvenanceSameBreak),
    );
  });
});

function makeProjectWithReviewCase(): Project {
  const project = makeProject([makeScript()], [makeCleanSchema()]);
  project.scriptPacks = [{ id: 'pack-1', name: 'Unrelated pack', importedAt: ISO, defaultTarget: UNKNOWN_TARGET, scriptIds: [] }];
  project.schemaReviewCases = [makeReviewCase({ rawGeneratorOutput: 'Box 1: FOO [abc]', outputProvenance: buildManualPasteProvenance(ISO) })];
  return project;
}

describe('schema review case export/import', () => {
  it('round-trips a project with a schema review case (including provenance) through export/import unchanged', () => {
    const project = makeProjectWithReviewCase();
    const roundTripped = importProjectJson(exportProjectJson(project));
    expect(roundTripped.schemaReviewCases).toEqual(project.schemaReviewCases);
    expect(roundTripped.schemaReviewCases[0]!.outputProvenance).toEqual(buildManualPasteProvenance(ISO));
  });

  it('defaults schemaReviewCases to an empty array for older project exports missing the field', () => {
    const project = makeProjectWithReviewCase();
    const obj = JSON.parse(exportProjectJson(project));
    delete obj.schemaReviewCases;
    expect(importProjectJson(JSON.stringify(obj)).schemaReviewCases).toEqual([]);
  });

  it('round-trips a single review case (including scriptId/variantId) through its own export/import unchanged', () => {
    const reviewCase = makeReviewCase({ rawGeneratorOutput: 'Box 1: FOO [abc]', reviewerNote: 'looks right' });
    expect(importSchemaReviewCaseJson(exportSchemaReviewCaseJson(reviewCase))).toEqual(reviewCase);
  });

  it('round-trips generator output provenance (source/sourceLabel/capturedAt/parserVersion) through export/import unchanged', () => {
    const reviewCase = makeReviewCase({
      rawGeneratorOutput: 'Box 1: FOO [abc]',
      outputProvenance: buildManualPasteProvenance('2026-07-05T12:00:00.000Z'),
    });
    const roundTripped = importSchemaReviewCaseJson(exportSchemaReviewCaseJson(reviewCase));
    expect(roundTripped.outputProvenance).toEqual({
      source: 'manual-paste',
      sourceLabel: 'Manual E-Sh4rk paste-back',
      capturedAt: '2026-07-05T12:00:00.000Z',
      parserVersion: GENERATOR_OUTPUT_PARSER_VERSION,
    });
  });

  it('round-trips a "future-adapter" provenance (no sourceLabel/parserVersion set) without inventing values', () => {
    const reviewCase = makeReviewCase({
      rawGeneratorOutput: 'Box 1: FOO [abc]',
      outputProvenance: { source: 'future-adapter', capturedAt: ISO },
    });
    const roundTripped = importSchemaReviewCaseJson(exportSchemaReviewCaseJson(reviewCase));
    expect(roundTripped.outputProvenance).toEqual({ source: 'future-adapter', capturedAt: ISO });
  });

  it('exporting a single review case never includes unrelated script packs or other project data', () => {
    const project = makeProjectWithReviewCase();
    const json = exportSchemaReviewCaseJson(project.schemaReviewCases[0]!);
    expect(json).not.toContain('Unrelated pack');
    expect(json).not.toContain('scriptPacks');
    const obj = JSON.parse(json);
    expect(Object.keys(obj).sort()).toEqual(
      Object.keys(project.schemaReviewCases[0]!).sort(),
    );
  });
});

describe('summarizeVariantVerification / summarizeAllVariantVerifications', () => {
  it('is "no-cases" when a verifiable variant has no review cases at all', () => {
    const project = makeProject([makeScript()], [makeCleanSchema()]);
    const summary = summarizeVariantVerification(makeCleanSchema(), project, []);
    expect(summary).toEqual({ variantId: 'toy-schema', schemaId: 'toy-schema', caseCount: 0, status: 'no-cases' });
  });

  it('is "draft-cases" when every saved case is still unrun (stored status draft)', () => {
    const project = makeProject([makeScript()], [makeCleanSchema()]);
    const summary = summarizeVariantVerification(makeCleanSchema(), project, [makeReviewCase({ status: 'draft' })]);
    expect(summary.status).toBe('draft-cases');
    expect(summary.caseCount).toBe(1);
  });

  it('is "passing" when every case currently verifies successfully', () => {
    const project = makeProject([makeScript()], [makeCleanSchema()]);
    const summary = summarizeVariantVerification(makeCleanSchema(), project, [makeReviewCase({ status: 'passing' })]);
    expect(summary.status).toBe('passing');
    expect(summary.caseCount).toBe(1);
  });

  it('is "failing" when any one case currently fails to verify, re-checked live rather than trusting the stored status', () => {
    const project = makeProject([makeScript()], [makeCleanSchema()]);
    const staleCase = makeReviewCase({ status: 'passing', inputValues: { Move: 5, MoveSlot: 0 } }); // MoveSlot won't actually change
    const summary = summarizeVariantVerification(makeCleanSchema(), project, [staleCase]);
    expect(summary.status).toBe('failing');
  });

  it('is "accepted" whenever any case has been explicitly marked accepted, regardless of live verification', () => {
    const project = makeProject([makeScript()], [makeCleanSchema()]);
    const brokenButAccepted = makeReviewCase({ status: 'accepted', inputValues: { Move: 5, MoveSlot: 0 } });
    const summary = summarizeVariantVerification(makeCleanSchema(), project, [brokenButAccepted]);
    expect(summary.status).toBe('accepted');
  });

  it('is "not-available" when the schema is detached/disabled/draft-only, regardless of any saved cases', () => {
    const project = makeProject([makeScript()], []);
    const detachedSchema = makeCleanSchema({ scriptId: undefined, scriptFilename: undefined });
    const summary = summarizeVariantVerification(detachedSchema, project, [makeReviewCase()]);
    expect(summary.status).toBe('not-available');
  });

  it('"accepted" wins even over a variant that has since become unverifiable', () => {
    const project = makeProject([], []); // no scripts — this schema is now missing its script
    const schema = makeCleanSchema();
    const accepted = makeReviewCase({ status: 'accepted' });
    expect(summarizeVariantVerification(schema, project, [accepted]).status).toBe('accepted');
  });

  it('summarizeAllVariantVerifications covers every schema, not just reviewed ones — an unready variant still reports "not-available", not omitted', () => {
    const project = makeProjectWithReviewCase();
    const draftSchema = makeCleanSchema({ id: 'draft-schema', status: 'draft' });
    project.curatedSchemas.push(draftSchema);
    const summaries = summarizeAllVariantVerifications(project);
    expect(summaries.map((s) => s.schemaId).sort()).toEqual(['draft-schema', 'toy-schema']);
    expect(summaries.find((s) => s.schemaId === 'draft-schema')!.status).toBe('not-available');
  });

  it('two target variants of the same action are verified independently — one failing does not affect the other', () => {
    const schemaA = makeCleanSchema({ id: 'variant-a', target: FR_EN_10 });
    const schemaB = makeCleanSchema({ id: 'variant-b', target: FR_EN_11 });
    const project = makeProject([makeScript()], [schemaA, schemaB]);
    const passingCase = makeReviewCase({ id: 'case-a', schemaId: 'variant-a', variantId: 'variant-a', target: FR_EN_10, status: 'passing' });
    const failingCase = makeReviewCase({
      id: 'case-b', schemaId: 'variant-b', variantId: 'variant-b', target: FR_EN_11, status: 'passing',
      inputValues: { Move: 5, MoveSlot: 0 }, // MoveSlot won't actually change
    });
    const summaries = summarizeAllVariantVerifications({ ...project, schemaReviewCases: [passingCase, failingCase] });
    expect(summaries.find((s) => s.schemaId === 'variant-a')!.status).toBe('passing');
    expect(summaries.find((s) => s.schemaId === 'variant-b')!.status).toBe('failing');
  });
});

describe('summarizePresetVerification', () => {
  it('is "no-cases" for a preset with no review cases', () => {
    expect(summarizePresetVerification('some-preset', [])).toBe('no-cases');
  });

  it('is "draft-cases" when cases exist but none are passing or accepted', () => {
    const cases = [makeReviewCase({ id: 'c1', schemaId: undefined, presetId: 'some-preset', status: 'draft' })];
    expect(summarizePresetVerification('some-preset', cases)).toBe('draft-cases');
  });

  it('is "passing" when at least one case\'s stored status is passing', () => {
    const cases = [makeReviewCase({ id: 'c1', schemaId: undefined, presetId: 'some-preset', status: 'passing' })];
    expect(summarizePresetVerification('some-preset', cases)).toBe('passing');
  });

  it('is "accepted" when at least one case has been explicitly accepted', () => {
    const cases = [makeReviewCase({ id: 'c1', schemaId: undefined, presetId: 'some-preset', status: 'accepted' })];
    expect(summarizePresetVerification('some-preset', cases)).toBe('accepted');
  });

  it('only counts cases matching this exact presetId', () => {
    const cases = [makeReviewCase({ id: 'c1', schemaId: undefined, presetId: 'other-preset', status: 'passing' })];
    expect(summarizePresetVerification('some-preset', cases)).toBe('no-cases');
  });
});
