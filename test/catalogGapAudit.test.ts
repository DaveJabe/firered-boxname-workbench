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

  it('@input:species classifies as gen3-species (a stub catalog) — kind is reference-catalog-needed', () => {
    const c = classifyCandidate(makeCandidate({ name: 'target', inputHint: 'species' }), 's1', 'a.txt');
    expect(c.catalogId).toBe('gen3-species');
    expect(c.kind).toBe('reference-catalog-needed');
  });
});

describe('classifyCandidate — conservative variable-name heuristics', () => {
  it('a bare "species" variable name classifies as gen3-species', () => {
    const c = classifyCandidate(makeCandidate({ name: 'species' }), 's1', 'a.txt');
    expect(c.catalogId).toBe('gen3-species');
    expect(c.kind).toBe('reference-catalog-needed');
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
const SPECIES_SCRIPT = ['species = 1', '@@', 'PretendBodyLine'].join('\n');
const UNKNOWN_SCRIPT = ['someTotallyMadeUpThing = 1', '@@', 'PretendBodyLine'].join('\n');

describe('buildCatalogGapAudit', () => {
  it('reports a missing (stub, zero-entry) catalog suggested by scanned candidates', () => {
    const project = makeProject([makeScript('a', SPECIES_SCRIPT)]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const need = audit.missingCatalogs.find((n) => n.catalogId === 'gen3-species');
    expect(need).toBeDefined();
    expect(need!.suggestedByFields.length).toBeGreaterThan(0);
  });

  it('reports a partial (non-empty) catalog that is actually in use by a schema', () => {
    const script = makeScript('a', ITEM_SCRIPT);
    const schema: CuratedActionSchema = {
      id: 'schema-1', label: 'Toy', description: '', target: UNKNOWN_TARGET, scriptId: 'a', scriptFilename: 'a.txt',
      supportedRevisionLabels: [], status: 'reviewed',
      fields: [{ key: 'heldItem', label: 'Held item', type: 'reference-select', required: false, variableName: 'heldItem', referenceCatalogId: 'gen3-items' }],
    };
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const used = audit.partialCatalogsUsed.find((c) => c.catalogId === 'gen3-items');
    expect(used).toBeDefined();
    expect(used!.usedBySchemaIds).toContain('schema-1');
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
    const grouped = groupCatalogAuditBySupportedAction(project, audit);

    expect(grouped.readyActions).toHaveLength(1);
    expect(grouped.readyActions[0]!.actionKey).toBe('teach-any-move');
    expect(grouped.readyActions[0]!.variants).toHaveLength(3);
    expect(grouped.readyActions[0]!.variants.map((v) => v.target)).toEqual([FR_EN_10, FR_EN_11, LG_EN_10]);
  });

  it('a ready variant with a stale/catalog-needing field appears in both readyActions and variantsWithGaps', () => {
    const script = makeScript('a', ITEM_SCRIPT);
    const schema = makeVariantSchema(); // heldItem is plain text -> classifies as needing gen3-items
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit);

    const variant = grouped.readyActions[0]!.variants[0]!;
    expect(variant.catalogNeeds.some((c) => c.catalogId === 'gen3-items')).toBe(true);
    expect(grouped.variantsWithGaps.some((v) => v.schemaId === schema.id)).toBe(true);
  });

  it('a draft (non-ready) variant with a catalog need appears in variantsWithGaps but not in readyActions', () => {
    const script = makeScript('a', ITEM_SCRIPT);
    const schema = makeVariantSchema({ status: 'draft' });
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit);

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
    const grouped = groupCatalogAuditBySupportedAction(project, audit);

    expect(grouped.variantsWithGaps).toEqual([]);
    expect(grouped.readyActions[0]!.variants[0]!.catalogNeeds).toEqual([]);
  });

  it('every variant carries a "not-available" verification-status placeholder', () => {
    const script = makeScript('a', ITEM_SCRIPT);
    const schema = makeVariantSchema();
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit);
    expect(grouped.readyActions[0]!.variants[0]!.verificationStatus).toBe('not-available');
  });

  it('a script with no curated schema at all is grouped under unsupportedScripts, with its own candidate-level catalog needs', () => {
    const project = makeProject([makeScript('a', SPECIES_SCRIPT)]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit);

    expect(grouped.unsupportedScripts).toHaveLength(1);
    expect(grouped.unsupportedScripts[0]!.scriptFilename).toBe('a.txt');
    expect(grouped.unsupportedScripts[0]!.catalogNeeds.some((c) => c.catalogId === 'gen3-species')).toBe(true);
  });

  it('a script that already has a curated schema is not listed under unsupportedScripts', () => {
    const script = makeScript('a', ITEM_SCRIPT);
    const schema = makeVariantSchema();
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit);
    expect(grouped.unsupportedScripts).toEqual([]);
  });

  it('passes unknownFields through unchanged from the flat audit', () => {
    const project = makeProject([makeScript('a', UNKNOWN_SCRIPT)]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit);
    expect(grouped.unknownFields).toEqual(audit.unknownFields);
    expect(grouped.unknownFields.some((f) => f.variableName === 'someTotallyMadeUpThing')).toBe(true);
  });

  it('an action with zero ready variants (all draft/disabled) contributes nothing to readyActions', () => {
    const script = makeScript('a', ITEM_SCRIPT);
    const schema = makeVariantSchema({ status: 'disabled' });
    const project = makeProject([script], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit);
    expect(grouped.readyActions).toEqual([]);
  });
});
