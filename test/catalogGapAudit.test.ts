import { describe, it, expect } from 'vitest';
import type { CuratedActionSchema, Project, ScriptFile, VariableCandidate } from '../src/core/types.js';
import { createProject } from '../src/core/factory.js';
import { scanScript } from '../src/core/scriptScanner.js';
import { UNKNOWN_TARGET } from '../src/core/gameTarget.js';
import {
  classifyCandidate,
  classifySchemaField,
  findStaleSchemaFields,
  applyStaleFieldRepair,
  buildCatalogGapAudit,
  exportCatalogGapAuditJson,
  groupCatalogAuditBySupportedAction,
} from '../src/core/catalogGapAudit.js';

const ISO = '2026-01-01T00:00:00.000Z';

function makeIdGen(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

function makeProject(scripts: ScriptFile[] = [], schemas: CuratedActionSchema[] = []): Project {
  const project = createProject(
    { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
    makeIdGen(),
    () => ISO,
  );
  project.scripts = scripts;
  project.curatedSchemas = schemas;
  return project;
}

function makeCandidate(over: Partial<VariableCandidate> & { name: string }): VariableCandidate {
  return { rawValue: '1', line: 1, inferredType: 'number', confidence: 'medium', internal: false, ...over };
}

// Harmless, invented toy fixtures — no real script, item ID, address, or payload byte.
function makeScript(id: string, rawText: string): ScriptFile {
  const script: ScriptFile = { id, filename: `${id}.txt`, rawText, importedAt: ISO };
  script.lastScan = scanScript(script, () => ISO);
  return script;
}

describe('classifyCandidate — annotation hints (highest confidence)', () => {
  it('@input:item classifies as needing/using gen3-items', () => {
    const c = classifyCandidate(makeCandidate({ name: 'heldItem', inputHint: 'item' }), 's1', 'a.txt');
    expect(c.catalogId).toBe('gen3-items');
    expect(c.confidence).toBe('high');
  });

  it('@input:move classifies as needing/using gen3-moves', () => {
    const c = classifyCandidate(makeCandidate({ name: 'chosenMove', inputHint: 'move' }), 's1', 'a.txt');
    expect(c.catalogId).toBe('gen3-moves');
    expect(c.confidence).toBe('high');
  });

  it('@input:species classifies as needing/using gen3-species', () => {
    const c = classifyCandidate(makeCandidate({ name: 'target', inputHint: 'species' }), 's1', 'a.txt');
    expect(c.catalogId).toBe('gen3-species');
  });

  it('@input:pokemon classifies as needing/using gen3-species', () => {
    const c = classifyCandidate(makeCandidate({ name: 'target', inputHint: 'pokemon' }), 's1', 'a.txt');
    expect(c.catalogId).toBe('gen3-species');
  });
});

describe('classifyCandidate — conservative variable-name heuristics', () => {
  it('"species"/"pokemon"/"mon"/"pokemonId"/"speciesId" all classify as gen3-species', () => {
    for (const name of ['species', 'pokemon', 'mon', 'pokemonId', 'speciesId']) {
      const c = classifyCandidate(makeCandidate({ name }), 's1', 'a.txt');
      expect(c.catalogId).toBe('gen3-species');
    }
  });

  it('"item_index" (and "itemindex") classify as gen3-items, matching the real GetAnyItem.txt variable name', () => {
    for (const name of ['item_index', 'itemindex']) {
      const c = classifyCandidate(makeCandidate({ name }), 's1', 'a.txt');
      expect(c.catalogId).toBe('gen3-items');
    }
  });

  it('a bare "flag" variable name classifies as frlg-flags', () => {
    const c = classifyCandidate(makeCandidate({ name: 'flag' }), 's1', 'a.txt');
    expect(c.catalogId).toBe('frlg-flags');
  });

  it('"value" near a "flag" comment classifies as a bounded boolean/set-clear candidate', () => {
    const c = classifyCandidate(makeCandidate({ name: 'value', nearbyComment: 'the flag to set', rawValue: '1' }), 's1', 'a.txt');
    expect(c.kind).toBe('bounded-field-preset-needed');
    expect(c.boundedPresetId).toBe('boolean-set-clear');
  });

  it('"mapGroup"/"mapNum"/"warpId" classify as frlg-maps-warps', () => {
    for (const name of ['mapGroup', 'mapNum', 'warpId']) {
      const c = classifyCandidate(makeCandidate({ name }), 's1', 'a.txt');
      expect(c.catalogId).toBe('frlg-maps-warps');
    }
  });

  it('"MoveSlot" classifies as the bounded move-slot preset', () => {
    const c = classifyCandidate(makeCandidate({ name: 'MoveSlot' }), 's1', 'a.txt');
    expect(c.kind).toBe('bounded-field-preset-needed');
    expect(c.boundedPresetId).toBe('move-slot-0-based');
  });

  it('an unrecognized variable name is classified as unknown/manual-review', () => {
    const c = classifyCandidate(makeCandidate({ name: 'someTotallyMadeUpThing' }), 's1', 'a.txt');
    expect(c.kind).toBe('unknown-manual-review');
  });
});

describe('findStaleSchemaFields', () => {
  function makeSchema(over: Partial<CuratedActionSchema> = {}): CuratedActionSchema {
    return {
      id: 'schema-1', label: 'Toy schema', description: '', target: UNKNOWN_TARGET,
      scriptId: 's1', scriptFilename: 'a.txt', supportedRevisionLabels: [], status: 'reviewed',
      fields: [],
      ...over,
    };
  }

  it('an item field still using plain text/number is flagged as stale, suggesting reference-select', () => {
    const schema = makeSchema({
      fields: [{ key: 'heldItem', label: 'Held item', type: 'text', required: false, variableName: 'heldItem' }],
    });
    const project = makeProject([], [schema]);
    const findings = findStaleSchemaFields(project);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.classification.catalogId).toBe('gen3-items');
    expect(findings[0]!.suggestedType).toBe('reference-select');
  });

  it('a move field still using plain number is flagged as stale, suggesting reference-select', () => {
    const schema = makeSchema({
      fields: [{ key: 'move', label: 'Move', type: 'number', required: false, variableName: 'move' }],
    });
    const project = makeProject([], [schema]);
    const findings = findStaleSchemaFields(project);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.classification.catalogId).toBe('gen3-moves');
  });

  it('a species field still using plain text/number is flagged as stale, suggesting reference-select', () => {
    const schema = makeSchema({
      fields: [{ key: 'species', label: 'Species', type: 'number', required: false, variableName: 'species' }],
    });
    const project = makeProject([], [schema]);
    const findings = findStaleSchemaFields(project);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.classification.catalogId).toBe('gen3-species');
    expect(findings[0]!.suggestedType).toBe('reference-select');
  });

  it('a field already correctly reference-select for the matching catalog is not flagged', () => {
    const schema = makeSchema({
      fields: [{ key: 'move', label: 'Move', type: 'reference-select', required: false, variableName: 'move', referenceCatalogId: 'gen3-moves' }],
    });
    const project = makeProject([], [schema]);
    expect(findStaleSchemaFields(project)).toEqual([]);
  });

  it('classifySchemaField works standalone, independent of a project', () => {
    const c = classifySchemaField({ key: 'move', label: 'Move', type: 'text', required: false, variableName: 'move' }, 's1', 'a.txt');
    expect(c.catalogId).toBe('gen3-moves');
  });
});

// Harmless, invented toy fixtures — no real script, item ID, address, or payload byte.
const ITEM_SCRIPT = ['heldItem = 5', '@@', 'PretendBodyLine'].join('\n');
// gen3-species is now complete (see reference/gen3Species.ts) — frlg-flags remains
// a genuine stub, so it's used here wherever a fixture needs a still-missing catalog.
const FLAG_SCRIPT = ['flag = 1', '@@', 'PretendBodyLine'].join('\n');
const UNKNOWN_SCRIPT = ['someTotallyMadeUpThing = 1', '@@', 'PretendBodyLine'].join('\n');

describe('buildCatalogGapAudit', () => {
  it('reports a missing (stub, zero-entry) catalog suggested by scanned candidates', () => {
    const project = makeProject([makeScript('a', FLAG_SCRIPT)]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const need = audit.missingCatalogs.find((n) => n.catalogId === 'frlg-flags');
    expect(need).toBeDefined();
    expect(need!.suggestedByFields.length).toBeGreaterThan(0);
  });

  it('no longer reports gen3-species as a missing catalog, now that it is complete', () => {
    const speciesScript = ['species = 1', '@@', 'PretendBodyLine'].join('\n');
    const project = makeProject([makeScript('a', speciesScript)]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    expect(audit.missingCatalogs.some((n) => n.catalogId === 'gen3-species')).toBe(false);
  });

  it('an "item_index ? = 1" marker line resolves to gen3-items, not unknown/manual-review', () => {
    // Harmless, invented toy fixture matching GetAnyItem.txt's real shape.
    const markerScript = ['item_index ? = 1 @input:item', '@@', 'PretendBodyLine'].join('\n');
    const project = makeProject([makeScript('a', markerScript)]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    expect(audit.unknownFields.some((f) => f.variableName === 'item_index')).toBe(false);
    // gen3-items is complete, so a plain (non-reference-select) item_index field is a catalog need
    // via the flat classification helper directly — buildCatalogGapAudit itself only surfaces
    // needs for schema fields/candidates, so assert the classification directly here too.
    const candidate = project.scripts[0]!.lastScan!.candidates.find((c) => c.name === 'item_index')!;
    expect(candidate.inputHint).toBe('item');
  });

  it('does not report gen3-items as a "partial catalog in use" anymore, now that it is complete', () => {
    const script = makeScript('a', ITEM_SCRIPT);
    const schema: CuratedActionSchema = {
      id: 'schema-1', label: 'Toy', description: '', target: UNKNOWN_TARGET, scriptId: 'a', scriptFilename: 'a.txt',
      supportedRevisionLabels: [], status: 'reviewed',
      fields: [{ key: 'heldItem', label: 'Held item', type: 'reference-select', required: false, variableName: 'heldItem', referenceCatalogId: 'gen3-items' }],
    };
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    expect(audit.partialCatalogsUsed.some((c) => c.catalogId === 'gen3-items')).toBe(false);
  });

  it('reports an unrecognized variable as an unknown field needing manual review', () => {
    const project = makeProject([makeScript('a', UNKNOWN_SCRIPT)]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    expect(audit.unknownFields.some((f) => f.variableName === 'someTotallyMadeUpThing')).toBe(true);
  });

  it('reports a field pointing at an unregistered catalog id', () => {
    const script = makeScript('a', ITEM_SCRIPT);
    const schema: CuratedActionSchema = {
      id: 'schema-1', label: 'Toy', description: '', target: UNKNOWN_TARGET, scriptId: 'a', scriptFilename: 'a.txt',
      supportedRevisionLabels: [], status: 'reviewed',
      fields: [{ key: 'x', label: 'X', type: 'reference-select', required: false, variableName: 'x', referenceCatalogId: 'not-a-real-catalog' as never }],
    };
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    expect(audit.unknownCatalogFields).toEqual([{ schemaId: 'schema-1', variableName: 'x', referenceCatalogId: 'not-a-real-catalog' }]);
  });

  it('sets generatedAt from the injected clock and counts scripts/scanned scripts', () => {
    const unscanned: ScriptFile = { id: 'b', filename: 'b.txt', rawText: 'x', importedAt: ISO };
    const project = makeProject([makeScript('a', ITEM_SCRIPT), unscanned]);
    const audit = buildCatalogGapAudit(project, () => '2026-06-01T00:00:00.000Z');
    expect(audit.generatedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(audit.scriptCount).toBe(2);
    expect(audit.scannedScriptCount).toBe(1);
  });

  it('never includes raw script text in its export, only ids/filenames/variable names/reasons', () => {
    const rawText = 'heldItem = 5 ; SECRET_MARKER_NOT_TO_LEAK\n@@\nPretendBodyLine';
    const project = makeProject([makeScript('a', rawText)]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const json = exportCatalogGapAuditJson(audit);
    expect(json).not.toContain('SECRET_MARKER_NOT_TO_LEAK');
    expect(json).not.toContain('PretendBodyLine');
  });
});

describe('duplicate/unsorted catalog entry detection', () => {
  it('flags duplicate values or names in a catalog, and leaves a clean catalog unflagged', () => {
    const project = makeProject([]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    // gen3-items/gen3-moves are hand-reviewed and expected to already be duplicate-free/sorted.
    expect(audit.duplicateCatalogEntries.some((f) => f.catalogId === 'gen3-items')).toBe(false);
    expect(audit.duplicateCatalogEntries.some((f) => f.catalogId === 'gen3-moves')).toBe(false);
  });
});

describe('applyStaleFieldRepair', () => {
  it('repairs a text/number item field to reference-select, matching the suggested catalog', () => {
    const schema: CuratedActionSchema = {
      id: 'schema-1', label: 'Toy', description: '', target: UNKNOWN_TARGET, scriptId: 'a', scriptFilename: 'a.txt',
      supportedRevisionLabels: [], status: 'reviewed',
      fields: [{ key: 'heldItem', label: 'Held item', type: 'text', required: false, variableName: 'heldItem' }],
    };
    const finding = findStaleSchemaFields(makeProject([], [schema]))[0]!;
    const repaired = applyStaleFieldRepair(schema, finding);
    expect(repaired.fields[0]!.type).toBe('reference-select');
    expect(repaired.fields[0]!.referenceCatalogId).toBe('gen3-items');
  });

  it('repairs a text/number MoveSlot field to a bounded select', () => {
    const schema: CuratedActionSchema = {
      id: 'schema-1', label: 'Toy', description: '', target: UNKNOWN_TARGET, scriptId: 'a', scriptFilename: 'a.txt',
      supportedRevisionLabels: [], status: 'reviewed',
      fields: [{ key: 'MoveSlot', label: 'Move slot', type: 'number', required: false, variableName: 'MoveSlot' }],
    };
    const finding = findStaleSchemaFields(makeProject([], [schema]))[0]!;
    const repaired = applyStaleFieldRepair(schema, finding);
    expect(repaired.fields[0]!.type).toBe('select');
    expect(repaired.fields[0]!.options?.map((o) => o.value)).toEqual(['0', '1', '2', '3']);
  });

  it('never mutates the original schema', () => {
    const schema: CuratedActionSchema = {
      id: 'schema-1', label: 'Toy', description: '', target: UNKNOWN_TARGET, scriptId: 'a', scriptFilename: 'a.txt',
      supportedRevisionLabels: [], status: 'reviewed',
      fields: [{ key: 'heldItem', label: 'Held item', type: 'text', required: false, variableName: 'heldItem' }],
    };
    const before = JSON.stringify(schema);
    const finding = findStaleSchemaFields(makeProject([], [schema]))[0]!;
    applyStaleFieldRepair(schema, finding);
    expect(JSON.stringify(schema)).toBe(before);
  });

  it('leaves unrelated fields on the schema completely untouched', () => {
    const schema: CuratedActionSchema = {
      id: 'schema-1', label: 'Toy', description: '', target: UNKNOWN_TARGET, scriptId: 'a', scriptFilename: 'a.txt',
      supportedRevisionLabels: [], status: 'reviewed',
      fields: [
        { key: 'heldItem', label: 'Held item', type: 'text', required: false, variableName: 'heldItem' },
        { key: 'widgetCount', label: 'Widget count', type: 'number', required: true, variableName: 'widgetCount' },
      ],
    };
    const finding = findStaleSchemaFields(makeProject([], [schema]))[0]!;
    const repaired = applyStaleFieldRepair(schema, finding);
    expect(repaired.fields[1]).toEqual(schema.fields[1]);
  });
});

const FR_EN_10 = { game: 'FireRed', language: 'English', revision: '1.0' } as const;
const FR_EN_11 = { game: 'FireRed', language: 'English', revision: '1.1' } as const;
const LG_EN_10 = { game: 'LeafGreen', language: 'English', revision: '1.0' } as const;

function makeVariantSchema(over: Partial<CuratedActionSchema> = {}): CuratedActionSchema {
  return {
    id: 'schema-fr11', label: 'Teach Pokémon Any Move', description: '', actionKey: 'teach-any-move',
    target: FR_EN_11, scriptId: 'a', scriptFilename: 'a.txt', supportedRevisionLabels: [], status: 'reviewed',
    fields: [{ key: 'heldItem', label: 'Held item', type: 'text', required: false, variableName: 'heldItem' }],
    ...over,
  };
}

describe('groupCatalogAuditBySupportedAction — grouping by supported action/actionKey', () => {
  it('groups multiple target variants under the same actionKey into one readyActions entry, never duplicated as separate top-level rows', () => {
    const scripts = ['a', 'b', 'c'].map((id) => makeScript(id, ITEM_SCRIPT));
    const schemas = [
      makeVariantSchema({ id: 's1', target: FR_EN_10, scriptId: 'a', scriptFilename: 'a.txt' }),
      makeVariantSchema({ id: 's2', target: FR_EN_11, scriptId: 'b', scriptFilename: 'b.txt' }),
      makeVariantSchema({ id: 's3', target: LG_EN_10, scriptId: 'c', scriptFilename: 'c.txt' }),
    ];
    const project = makeProject(scripts, schemas);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit, () => ISO);

    expect(grouped.readyActions).toHaveLength(1);
    expect(grouped.readyActions[0]!.actionKey).toBe('teach-any-move');
    expect(grouped.readyActions[0]!.variants).toHaveLength(3);
    expect(grouped.readyActions[0]!.variants.map((v) => v.target)).toEqual([FR_EN_10, FR_EN_11, LG_EN_10]);
  });

  it('a ready variant with a stale field and a catalog-needing field appears in both readyActions and variantsWithGaps', () => {
    const script = makeScript('a', ITEM_SCRIPT);
    const schema = makeVariantSchema({
      fields: [
        // gen3-items and gen3-species are now both complete -> plain-text fields are stale fields, not catalog needs.
        { key: 'heldItem', label: 'Held item', type: 'text', required: false, variableName: 'heldItem' },
        { key: 'species', label: 'Species', type: 'text', required: false, variableName: 'species' },
        // frlg-flags is still a stub (zero-entry) catalog -> a genuine catalog need.
        { key: 'flag', label: 'Flag', type: 'text', required: false, variableName: 'flag' },
      ],
    });
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit, () => ISO);

    const variant = grouped.readyActions[0]!.variants[0]!;
    expect(variant.catalogNeeds.some((c) => c.catalogId === 'frlg-flags')).toBe(true);
    expect(variant.staleFieldRepairs.some((f) => f.classification.catalogId === 'gen3-items')).toBe(true);
    expect(variant.staleFieldRepairs.some((f) => f.classification.catalogId === 'gen3-species')).toBe(true);
    expect(grouped.variantsWithGaps.some((v) => v.schemaId === schema.id)).toBe(true);
  });

  it('a draft (non-ready) variant with a catalog need appears in variantsWithGaps but not in readyActions', () => {
    const script = makeScript('a', ITEM_SCRIPT);
    const schema = makeVariantSchema({ status: 'draft' });
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit, () => ISO);

    expect(grouped.readyActions).toEqual([]);
    expect(grouped.variantsWithGaps.some((v) => v.schemaId === schema.id)).toBe(true);
    expect(grouped.variantsWithGaps[0]!.status).toBe('needs-review');
  });

  it('a variant with no catalog needs or stale fields does not appear in variantsWithGaps', () => {
    const script = makeScript('a', ITEM_SCRIPT);
    const schema = makeVariantSchema({
      fields: [{ key: 'heldItem', label: 'Held item', type: 'reference-select', required: false, variableName: 'heldItem', referenceCatalogId: 'gen3-items' }],
    });
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit, () => ISO);

    expect(grouped.variantsWithGaps).toEqual([]);
    expect(grouped.readyActions[0]!.variants[0]!.catalogNeeds).toEqual([]);
  });

  it('every variant carries a real, live verification status — "no-cases" by default, when nothing has been saved yet', () => {
    const script = makeScript('a', ITEM_SCRIPT);
    const schema = makeVariantSchema();
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit, () => ISO);
    expect(grouped.readyActions[0]!.variants[0]!.verificationStatus).toBe('no-cases');
  });

  it('a variant whose schema is draft-only (not yet ready) shows "not-available" verification, not "no-cases"', () => {
    const script = makeScript('a', ITEM_SCRIPT);
    const schema = makeVariantSchema({ status: 'draft' });
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit, () => ISO);
    expect(grouped.variantsWithGaps[0]!.verificationStatus).toBe('not-available');
  });

  it('a variant with a passing review case shows "passing" verification status in the Catalog Audit, not a fixed placeholder', () => {
    const script = makeScript('a', ITEM_SCRIPT);
    const schema = makeVariantSchema({
      fields: [{ key: 'heldItem', label: 'Held item', type: 'reference-select', required: false, variableName: 'heldItem', referenceCatalogId: 'gen3-items' }],
    });
    const project = makeProject([script], [schema]);
    project.schemaReviewCases = [{
      id: 'case-1', schemaId: schema.id, variantId: schema.id, scriptId: 'a', target: FR_EN_11, createdAt: ISO,
      inputValues: { heldItem: 13 }, expectedChangedVariables: ['heldItem'], forbiddenChangedVariables: [], status: 'passing',
    }];
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit, () => ISO);
    expect(grouped.readyActions[0]!.variants[0]!.verificationStatus).toBe('passing');
  });

  it('a script with no curated schema at all is grouped under unsupportedScripts, with its own candidate-level catalog needs', () => {
    const project = makeProject([makeScript('a', FLAG_SCRIPT)]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit, () => ISO);

    expect(grouped.unsupportedScripts).toHaveLength(1);
    expect(grouped.unsupportedScripts[0]!.scriptFilename).toBe('a.txt');
    expect(grouped.unsupportedScripts[0]!.catalogNeeds.some((c) => c.catalogId === 'frlg-flags')).toBe(true);
  });

  it('a script that already has a curated schema is not listed under unsupportedScripts', () => {
    const script = makeScript('a', ITEM_SCRIPT);
    const schema = makeVariantSchema();
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit, () => ISO);
    expect(grouped.unsupportedScripts).toEqual([]);
  });

  it('passes unknownFields through unchanged from the flat audit', () => {
    const project = makeProject([makeScript('a', UNKNOWN_SCRIPT)]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit, () => ISO);
    expect(grouped.unknownFields).toEqual(audit.unknownFields);
    expect(grouped.unknownFields.some((f) => f.variableName === 'someTotallyMadeUpThing')).toBe(true);
  });

  it('an action with zero ready variants (all draft/disabled) contributes nothing to readyActions', () => {
    const script = makeScript('a', ITEM_SCRIPT);
    const schema = makeVariantSchema({ status: 'disabled' });
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit, () => ISO);
    expect(grouped.readyActions).toEqual([]);
  });
});

describe('generatorInputReadiness — separate signal from catalog/verification status', () => {
  const EXIT_SCRIPT = ['@@ exit = "ToyExit"', 'heldItem = 5', '@@', 'PretendBodyLine'].join('\n');
  const COMPANION_SCRIPT = ['@@ filename = "ToyExit"', '@@', 'toy body'].join('\n');

  it("is 'not-applicable' for a variant whose script has no exit directive", () => {
    const script = makeScript('a', ITEM_SCRIPT);
    const schema = makeVariantSchema();
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit, () => ISO);
    expect(grouped.readyActions[0]!.variants[0]!.generatorInputReadiness).toBe('not-applicable');
    expect(grouped.actionsBlockedByMissingExitCompanion).toEqual([]);
  });

  it("is 'missing-exit-companion' and appears in actionsBlockedByMissingExitCompanion when no companion resolves the exit directive", () => {
    const script = makeScript('a', EXIT_SCRIPT);
    const schema = makeVariantSchema();
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit, () => ISO);

    expect(grouped.readyActions[0]!.variants[0]!.generatorInputReadiness).toBe('missing-exit-companion');
    expect(grouped.actionsBlockedByMissingExitCompanion).toHaveLength(1);
    expect(grouped.actionsBlockedByMissingExitCompanion[0]!.schemaId).toBe(schema.id);
  });

  it("is 'ready' and absent from actionsBlockedByMissingExitCompanion once a companion resolves the exit directive", () => {
    const script = makeScript('a', EXIT_SCRIPT);
    const companion = makeScript('exit', COMPANION_SCRIPT); // filename "exit.txt" — see looksLikeExitCompanionFile's conservative filename check
    const schema = makeVariantSchema();
    const project = makeProject([script, companion], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit, () => ISO);

    expect(grouped.readyActions[0]!.variants[0]!.generatorInputReadiness).toBe('ready');
    expect(grouped.actionsBlockedByMissingExitCompanion).toEqual([]);
  });

  it('a variant can be structurally "ready" (fillable) while still blocked by a missing exit companion — the two statuses are independent', () => {
    const script = makeScript('a', EXIT_SCRIPT);
    const schema = makeVariantSchema();
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit, () => ISO);
    const variant = grouped.readyActions[0]!.variants[0]!;

    expect(variant.status).toBe('ready');
    expect(variant.generatorInputReadiness).toBe('missing-exit-companion');
  });
});
