import { describe, it, expect } from 'vitest';
import type { ActionInput, CuratedActionSchema, ImportedTextBlock, Project, ScriptFile } from '../src/core/types.js';
import { createProject } from '../src/core/factory.js';
import { scanScript } from '../src/core/scriptScanner.js';
import { missingRequiredActionFields } from '../src/core/actionInput.js';
import { MockGeneratorAdapter, MOCK_PLACEHOLDER_TEXT, MOCK_ROW_COUNT } from '../src/core/generatorAdapter.js';
import {
  toActionTemplateShape,
  isSchemaSelectable,
  isSchemaRunnable,
  resolveCuratedSchema,
  supportsRevision,
  defaultRunnableSchemas,
  advancedRunnableSchemas,
  removeCuratedSchema,
  nextDuplicateSchemaId,
  duplicateCuratedSchema,
  detachCuratedSchema,
  countSavedOutputsUsingSchema,
  repairStaleSchemaFields,
  MOVE_SLOT_FIELD_OPTIONS,
  NPC_FIELD_OPTIONS,
} from '../src/core/curatedSchemas.js';
import { UNKNOWN_TARGET } from '../src/core/gameTarget.js';
import { GEN3_ITEMS_CATALOG, GEN3_MOVES_CATALOG, GEN3_SPECIES_CATALOG } from '../src/reference/index.js';
import {
  importProjectJson,
  exportProjectJson,
  importCuratedActionSchemaJson,
  exportCuratedActionSchemaJson,
} from '../src/data/storage.js';

const ISO = '2026-01-01T00:00:00.000Z';

function makeIdGen(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

// A harmless toy script fixture — no real script, item ID, address, offset,
// route step, opcode, or payload byte.
const TOY_SCRIPT = [
  '; sample header for a toy fixture',
  'widgetCount = 5 ; example count, @input:item',
  'widgetLabel = "SAMPLE" ; example label, @input:move',
  '@@',
  '; body text only, never scanned as code',
  'PretendBodyLine',
].join('\n');

function makeScriptFile(over: Partial<ScriptFile> = {}): ScriptFile {
  return { id: 'script-1', filename: 'toy.txt', rawText: TOY_SCRIPT, importedAt: ISO, ...over };
}

function makeCuratedSchema(over: Partial<CuratedActionSchema> = {}): CuratedActionSchema {
  return {
    id: 'toy-schema',
    label: 'Toy curated schema',
    description: 'A hand-reviewed, toy-only field mapping for the fixture script.',
    target: UNKNOWN_TARGET,
    scriptId: 'script-1',
    scriptFilename: 'toy.txt',
    supportedRevisionLabels: [],
    status: 'reviewed',
    fields: [
      {
        key: 'count', label: 'Widget count', type: 'number', required: true,
        variableName: 'widgetCount', helpText: 'How many widgets, per the script header.',
      },
      {
        key: 'label', label: 'Widget label', type: 'text', required: false,
        variableName: 'widgetLabel', warnings: ['Toy warning: double-check spelling.'],
      },
    ],
    ...over,
  };
}

/** A minimal, otherwise-valid Project whose .scripts is the only thing isSchemaRunnable/defaultRunnableSchemas/advancedRunnableSchemas read. */
function makeProjectWithScripts(scripts: ScriptFile[] = [makeScriptFile()]): Project {
  const project = createProject(
    { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
    makeIdGen(),
    () => ISO,
  );
  project.scripts = scripts;
  return project;
}

describe('curated schema validation', () => {
  it('round-trips a valid curated schema through export/import unchanged', () => {
    const schema = makeCuratedSchema();
    const reimported = importCuratedActionSchemaJson(exportCuratedActionSchemaJson(schema));
    expect(reimported).toEqual(schema);
  });

  it('accepts a schema with no scriptId/scriptFilename (curated from scratch)', () => {
    const schema = makeCuratedSchema({ scriptId: undefined, scriptFilename: undefined });
    const json = exportCuratedActionSchemaJson(schema);
    expect(importCuratedActionSchemaJson(json)).toEqual(schema);
  });

  it('accepts every declared review status', () => {
    for (const status of ['draft', 'reviewed', 'disabled'] as const) {
      const schema = makeCuratedSchema({ status });
      expect(importCuratedActionSchemaJson(exportCuratedActionSchemaJson(schema)).status).toBe(status);
    }
  });
});

describe('rejected malformed schemas', () => {
  it('rejects an unknown review status', () => {
    const obj = JSON.parse(exportCuratedActionSchemaJson(makeCuratedSchema()));
    obj.status = 'archived';
    expect(() => importCuratedActionSchemaJson(JSON.stringify(obj))).toThrow(/status/);
  });

  it('rejects an unknown field type', () => {
    const obj = JSON.parse(exportCuratedActionSchemaJson(makeCuratedSchema()));
    obj.fields[0].type = 'unknown';
    expect(() => importCuratedActionSchemaJson(JSON.stringify(obj))).toThrow(/type/);
  });

  it('rejects a field missing variableName', () => {
    const obj = JSON.parse(exportCuratedActionSchemaJson(makeCuratedSchema()));
    delete obj.fields[0].variableName;
    expect(() => importCuratedActionSchemaJson(JSON.stringify(obj))).toThrow(/variableName/);
  });

  it('rejects a non-array supportedRevisionLabels', () => {
    const obj = JSON.parse(exportCuratedActionSchemaJson(makeCuratedSchema()));
    obj.supportedRevisionLabels = 'Rev 1';
    expect(() => importCuratedActionSchemaJson(JSON.stringify(obj))).toThrow(/supportedRevisionLabels/);
  });

  it('rejects a non-array warnings list', () => {
    const obj = JSON.parse(exportCuratedActionSchemaJson(makeCuratedSchema()));
    obj.fields[1].warnings = 'not an array';
    expect(() => importCuratedActionSchemaJson(JSON.stringify(obj))).toThrow(/warnings/);
  });

  it('rejects malformed (non-JSON) text with a clear error', () => {
    expect(() => importCuratedActionSchemaJson('not json at all')).toThrow(/not valid JSON/);
  });

  it('rejects a schema missing required top-level fields', () => {
    expect(() => importCuratedActionSchemaJson('{}')).toThrow(/id must be a string/);
  });
});

describe('attaching a curated schema to a script', () => {
  it('round-trips a project with a script and its attached curated schema', () => {
    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    const script = makeScriptFile();
    project.scripts.push(script);
    project.curatedSchemas.push(makeCuratedSchema({ scriptId: script.id }));

    const roundTripped = importProjectJson(exportProjectJson(project));
    expect(roundTripped.curatedSchemas).toHaveLength(1);
    expect(roundTripped.curatedSchemas[0].scriptId).toBe(script.id);
    expect(roundTripped.curatedSchemas[0].fields.map((f) => f.variableName)).toEqual(['widgetCount', 'widgetLabel']);
  });

  it('finds a schema attached to a script by scriptId, the way the Scripts UI does', () => {
    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    const script = makeScriptFile();
    project.scripts.push(script);
    project.curatedSchemas.push(makeCuratedSchema({ scriptId: script.id }));
    project.curatedSchemas.push(makeCuratedSchema({ id: 'other', scriptId: 'some-other-script' }));

    const attached = project.curatedSchemas.filter((s) => s.scriptId === script.id);
    expect(attached).toHaveLength(1);
    expect(attached[0].id).toBe('toy-schema');
  });

  it('defaults curatedSchemas to an empty array for older project exports missing the field', () => {
    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    const obj = JSON.parse(exportProjectJson(project));
    delete obj.curatedSchemas;
    expect(importProjectJson(JSON.stringify(obj)).curatedSchemas).toEqual([]);
  });

  it('shows scanner candidates alongside curated fields by matching variableName to candidate.name', () => {
    const script = makeScriptFile();
    const scan = scanScript(script, () => ISO);
    const schema = makeCuratedSchema({ scriptId: script.id });
    const candidatesByName = new Map(scan.candidates.map((c) => [c.name, c]));
    for (const field of schema.fields) {
      expect(candidatesByName.has(field.variableName)).toBe(true);
    }
  });
});

describe('curated schema appears in and drives Run Script (mock mode only)', () => {
  it('is selectable when reviewed or draft, and excluded when disabled', () => {
    const reviewed = makeCuratedSchema({ id: 'a', status: 'reviewed' });
    const draft = makeCuratedSchema({ id: 'b', status: 'draft' });
    const disabled = makeCuratedSchema({ id: 'c', status: 'disabled' });
    expect(isSchemaSelectable(reviewed)).toBe(true);
    expect(isSchemaSelectable(draft)).toBe(true);
    expect(isSchemaSelectable(disabled)).toBe(false);
  });

  it('filters a mixed project.curatedSchemas list down to exactly the runnable ones for the Run Script dropdown', () => {
    const schemas = [
      makeCuratedSchema({ id: 'teach-any-move', label: 'Teach Pokémon Any Move', status: 'reviewed' }),
      makeCuratedSchema({ id: 'work-in-progress', label: 'Work in progress schema', status: 'draft' }),
      makeCuratedSchema({ id: 'retired', label: 'Retired schema', status: 'disabled' }),
    ];
    const dropdownOptions = schemas.filter(isSchemaSelectable);
    expect(dropdownOptions.map((s) => s.id)).toEqual(['teach-any-move', 'work-in-progress']);
    expect(dropdownOptions.some((s) => s.id === 'retired')).toBe(false);
  });

  it('resolves the preferred schema id when selectable, falling back to the first selectable one', () => {
    const a = makeCuratedSchema({ id: 'a', status: 'reviewed' });
    const b = makeCuratedSchema({ id: 'b', status: 'disabled' });
    const c = makeCuratedSchema({ id: 'c', status: 'reviewed' });
    expect(resolveCuratedSchema([a, b, c], 'c')?.id).toBe('c');
    expect(resolveCuratedSchema([a, b, c], 'b')?.id).toBe('a'); // 'b' is disabled -> falls back
    expect(resolveCuratedSchema([b], 'b')).toBeNull(); // nothing selectable at all
  });

  it('flags when a schema does not list the current revision as supported', () => {
    const scoped = makeCuratedSchema({ supportedRevisionLabels: ['Rev 1', 'Rev 2'] });
    const unscoped = makeCuratedSchema({ supportedRevisionLabels: [] });
    expect(supportsRevision(scoped, 'Rev 1')).toBe(true);
    expect(supportsRevision(scoped, 'Rev 9')).toBe(false);
    expect(supportsRevision(unscoped, 'Rev 9')).toBe(true);
  });

  it('adapts a curated schema to the same ActionTemplate shape the built-in catalog uses', () => {
    const schema = makeCuratedSchema();
    const template = toActionTemplateShape(schema);
    expect(template.id).toBe(schema.id);
    expect(template.fields.map((f) => f.key)).toEqual(['count', 'label']);
    expect(template.fields[0].type).toBe('number');
    expect(template.fields[0].required).toBe(true);
  });

  it('validates required fields the same way for a curated schema as for a built-in template', () => {
    const schema = makeCuratedSchema();
    const template = toActionTemplateShape(schema);
    expect(missingRequiredActionFields(template, {}).map((f) => f.key)).toEqual(['count']);
    expect(missingRequiredActionFields(template, { count: 5 })).toEqual([]);
  });

  it('still only calls MockGeneratorAdapter and returns fixed placeholder rows for a curated schema', () => {
    const schema = makeCuratedSchema();
    const template = toActionTemplateShape(schema);
    const input: ActionInput = { actionId: template.id, revisionLabel: 'Rev 1', values: { count: 5, label: 'SAMPLE' } };
    const output = MockGeneratorAdapter.generate(template, input, () => ISO);
    expect(output.rows.length).toBe(MOCK_ROW_COUNT);
    for (const row of output.rows) expect(row.text).toBe(MOCK_PLACEHOLDER_TEXT);
  });

  it('produces byte-identical output regardless of the field values passed in — no script filling occurs', () => {
    const schema = makeCuratedSchema();
    const template = toActionTemplateShape(schema);
    const inputA: ActionInput = { actionId: template.id, revisionLabel: 'Rev 1', values: { count: 5, label: 'SAMPLE' } };
    const inputB: ActionInput = { actionId: template.id, revisionLabel: 'Rev 1', values: { count: 999, label: 'totally different' } };
    const outputA = MockGeneratorAdapter.generate(template, inputA, () => ISO);
    const outputB = MockGeneratorAdapter.generate(template, inputB, () => ISO);
    expect(outputA.rows).toEqual(outputB.rows);
    // None of the user-supplied or mapped variable values leak into the output text.
    for (const row of outputA.rows) {
      expect(row.text).not.toContain('5');
      expect(row.text).not.toContain('SAMPLE');
      expect(row.text).not.toContain('widgetCount');
      expect(row.text).not.toContain('widgetLabel');
      expect(row.text).toBe(MOCK_PLACEHOLDER_TEXT);
    }
  });
});

describe('defaultRunnableSchemas / advancedRunnableSchemas — Run Script target filtering', () => {
  const fireRed10 = { game: 'FireRed', language: 'English', revision: '1.0' } as const;
  const fireRed11 = { game: 'FireRed', language: 'English', revision: '1.1' } as const;

  it('defaultRunnableSchemas keeps only reviewed, script-linked, fielded schemas with an exact target match', () => {
    const project = makeProjectWithScripts();
    const reviewedExact = makeCuratedSchema({ id: 'a', status: 'reviewed', target: fireRed10 });
    const reviewedOtherTarget = makeCuratedSchema({ id: 'b', status: 'reviewed', target: fireRed11 });
    const draftExact = makeCuratedSchema({ id: 'c', status: 'draft', target: fireRed10 });
    const disabledExact = makeCuratedSchema({ id: 'd', status: 'disabled', target: fireRed10 });
    const schemas = [reviewedExact, reviewedOtherTarget, draftExact, disabledExact];
    expect(defaultRunnableSchemas(schemas, project, fireRed10).map((s) => s.id)).toEqual(['a']);
  });

  it('excludes reviewed schemas with an Unknown/Mixed target from the default list, even if the selected target is also Unknown', () => {
    const project = makeProjectWithScripts();
    const reviewedUnknown = makeCuratedSchema({ id: 'a', status: 'reviewed', target: UNKNOWN_TARGET });
    expect(defaultRunnableSchemas([reviewedUnknown], project, UNKNOWN_TARGET)).toEqual([]);
  });

  it('advancedRunnableSchemas lists reviewed, script-linked, fielded schemas with a different explicit target — never draft, disabled, detached, or Unknown-target', () => {
    const project = makeProjectWithScripts();
    const reviewedExact = makeCuratedSchema({ id: 'a', status: 'reviewed', target: fireRed10 });
    const draftExact = makeCuratedSchema({ id: 'b', status: 'draft', target: fireRed10 });
    const reviewedOtherTarget = makeCuratedSchema({ id: 'c', status: 'reviewed', target: fireRed11 });
    const disabled = makeCuratedSchema({ id: 'd', status: 'disabled', target: fireRed10 });
    const schemas = [reviewedExact, draftExact, reviewedOtherTarget, disabled];
    const advanced = advancedRunnableSchemas(schemas, project, fireRed10);
    expect(advanced.map((s) => s.id)).toEqual(['c']);
    expect(advanced.some((s) => s.id === 'a')).toBe(false); // already in the default set
    expect(advanced.some((s) => s.id === 'b')).toBe(false); // draft — setup-only, never in Run Script at all
    expect(advanced.some((s) => s.id === 'd')).toBe(false); // disabled, never selectable at all
  });

  it('supports multiple schemas sharing the same actionKey but targeting different revisions', () => {
    const project = makeProjectWithScripts();
    const v10 = makeCuratedSchema({ id: 'teach-any-move-fr-en-10', actionKey: 'teach-any-move', status: 'reviewed', target: fireRed10 });
    const v11 = makeCuratedSchema({ id: 'teach-any-move-fr-en-11', actionKey: 'teach-any-move', status: 'reviewed', target: fireRed11 });
    expect(v10.id).not.toBe(v11.id); // schema id stays unique per target-specific variant
    expect(v10.actionKey).toBe(v11.actionKey); // same stable action concept
    expect(defaultRunnableSchemas([v10, v11], project, fireRed10).map((s) => s.id)).toEqual(['teach-any-move-fr-en-10']);
    expect(defaultRunnableSchemas([v10, v11], project, fireRed11).map((s) => s.id)).toEqual(['teach-any-move-fr-en-11']);
  });
});

describe('isSchemaRunnable — the single source of truth for what belongs in Run Script', () => {
  const fireRed10 = { game: 'FireRed', language: 'English', revision: '1.0' } as const;
  const fireRed11 = { game: 'FireRed', language: 'English', revision: '1.1' } as const;

  it('a reviewed schema linked to an existing script, with an exact target match and at least one field, is runnable', () => {
    const project = makeProjectWithScripts();
    const schema = makeCuratedSchema({ status: 'reviewed', target: fireRed11 });
    expect(isSchemaRunnable(schema, project, fireRed11)).toBe(true);
  });

  it('a draft linked schema is not runnable', () => {
    const project = makeProjectWithScripts();
    const schema = makeCuratedSchema({ status: 'draft', target: fireRed11 });
    expect(isSchemaRunnable(schema, project, fireRed11)).toBe(false);
  });

  it('a disabled linked schema is not runnable', () => {
    const project = makeProjectWithScripts();
    const schema = makeCuratedSchema({ status: 'disabled', target: fireRed11 });
    expect(isSchemaRunnable(schema, project, fireRed11)).toBe(false);
  });

  it('a reviewed but detached (scriptId-less) schema is not runnable', () => {
    const project = makeProjectWithScripts();
    const schema = detachCuratedSchema(makeCuratedSchema({ status: 'reviewed', target: fireRed11 }));
    expect(isSchemaRunnable(schema, project, fireRed11)).toBe(false);
  });

  it('a reviewed schema attached to a script id that no longer exists in the project is not runnable', () => {
    const project = makeProjectWithScripts([]); // script-1 was removed/replaced since the schema was reviewed
    const schema = makeCuratedSchema({ status: 'reviewed', target: fireRed11, scriptId: 'script-1' });
    expect(isSchemaRunnable(schema, project, fireRed11)).toBe(false);
  });

  it('a reviewed Unknown/Mixed-target schema never silently matches an explicit FireRed/English/1.1 selected target', () => {
    const project = makeProjectWithScripts();
    const schema = makeCuratedSchema({ status: 'reviewed', target: UNKNOWN_TARGET });
    expect(isSchemaRunnable(schema, project, fireRed11)).toBe(false);
  });

  it('a reviewed, linked, fielded schema with a different explicit target is not runnable for the currently selected target', () => {
    const project = makeProjectWithScripts();
    const schema = makeCuratedSchema({ status: 'reviewed', target: fireRed10 });
    expect(isSchemaRunnable(schema, project, fireRed11)).toBe(false);
  });

  it('a reviewed, linked schema with zero fields is not runnable', () => {
    const project = makeProjectWithScripts();
    const schema = makeCuratedSchema({ status: 'reviewed', target: fireRed11, fields: [] });
    expect(isSchemaRunnable(schema, project, fireRed11)).toBe(false);
  });

  it('Setup/Manage Scripts can still display draft and detached schemas via isSchemaSelectable, even though neither is Run-Script-runnable', () => {
    const project = makeProjectWithScripts();
    const draft = makeCuratedSchema({ id: 'draft', status: 'draft', target: fireRed11 });
    const detached = detachCuratedSchema(makeCuratedSchema({ id: 'detached', status: 'reviewed', target: fireRed11 }));
    expect(isSchemaSelectable(draft)).toBe(true);
    expect(isSchemaSelectable(detached)).toBe(true);
    expect(isSchemaRunnable(draft, project, fireRed11)).toBe(false);
    expect(isSchemaRunnable(detached, project, fireRed11)).toBe(false);
  });
});

function makeBlock(over: Partial<ImportedTextBlock> = {}): ImportedTextBlock {
  return {
    id: 'block-1', title: 'Toy output', categoryLabel: 'Filled script', revisionLabel: 'Rev 1',
    rawText: 'toy output text', notes: '',
    source: { type: 'filled-script', label: 'Filled script (this app)', importedAt: ISO, schemaVersion: 1 },
    ...over,
  };
}

describe('schema management: delete/duplicate/detach', () => {
  it('removeCuratedSchema deletes a schema by id, leaving others untouched', () => {
    const schemas = [makeCuratedSchema({ id: 'a' }), makeCuratedSchema({ id: 'b' })];
    removeCuratedSchema(schemas, 'a');
    expect(schemas.map((s) => s.id)).toEqual(['b']);
  });

  it('deleting a schema never touches Project.scripts — the script file itself survives', () => {
    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    const script = makeScriptFile();
    project.scripts.push(script);
    project.curatedSchemas.push(makeCuratedSchema({ scriptId: script.id }));

    removeCuratedSchema(project.curatedSchemas, 'toy-schema');
    expect(project.curatedSchemas).toEqual([]);
    expect(project.scripts).toHaveLength(1);
    expect(project.scripts[0].id).toBe(script.id);
    expect(project.scripts[0].rawText).toBe(TOY_SCRIPT);
  });

  it('deleting a schema removes it from Run Script default and advanced candidates', () => {
    const project = makeProjectWithScripts();
    const fireRed10 = { game: 'FireRed', language: 'English', revision: '1.0' } as const;
    const schemas = [makeCuratedSchema({ id: 'a', status: 'reviewed', target: fireRed10 })];
    expect(defaultRunnableSchemas(schemas, project, fireRed10)).toHaveLength(1);
    removeCuratedSchema(schemas, 'a');
    expect(defaultRunnableSchemas(schemas, project, fireRed10)).toHaveLength(0);
    expect(advancedRunnableSchemas(schemas, project, fireRed10)).toHaveLength(0);
  });

  it('disabling a schema removes it from Run Script default and advanced candidates', () => {
    const project = makeProjectWithScripts();
    const fireRed10 = { game: 'FireRed', language: 'English', revision: '1.0' } as const;
    const schemas = [makeCuratedSchema({ id: 'a', status: 'reviewed', target: fireRed10 })];
    expect(defaultRunnableSchemas(schemas, project, fireRed10)).toHaveLength(1);
    schemas[0].status = 'disabled';
    expect(defaultRunnableSchemas(schemas, project, fireRed10)).toHaveLength(0);
    expect(advancedRunnableSchemas(schemas, project, fireRed10)).toHaveLength(0);
    expect(isSchemaSelectable(schemas[0])).toBe(false);
  });

  it('draft schemas stay out of both the default and advanced lists; reviewed+exact-target stays in the default list', () => {
    const project = makeProjectWithScripts();
    const fireRed10 = { game: 'FireRed', language: 'English', revision: '1.0' } as const;
    const draft = makeCuratedSchema({ id: 'a', status: 'draft', target: fireRed10 });
    const reviewed = makeCuratedSchema({ id: 'b', status: 'reviewed', target: fireRed10 });
    const schemas = [draft, reviewed];
    expect(defaultRunnableSchemas(schemas, project, fireRed10).map((s) => s.id)).toEqual(['b']);
    expect(advancedRunnableSchemas(schemas, project, fireRed10)).toEqual([]); // draft is setup-only, never in Run Script at all
  });

  it('nextDuplicateSchemaId avoids collisions, incrementing a numeric suffix', () => {
    expect(nextDuplicateSchemaId('toy-schema', ['toy-schema'])).toBe('toy-schema-copy');
    expect(nextDuplicateSchemaId('toy-schema', ['toy-schema', 'toy-schema-copy'])).toBe('toy-schema-copy-2');
    expect(nextDuplicateSchemaId('toy-schema', ['toy-schema', 'toy-schema-copy', 'toy-schema-copy-2'])).toBe('toy-schema-copy-3');
  });

  it('duplicateCuratedSchema copies fields/status/target under a new id', () => {
    const original = makeCuratedSchema({ id: 'toy-schema', status: 'reviewed' });
    const copy = duplicateCuratedSchema(original, 'toy-schema-copy');
    expect(copy.id).toBe('toy-schema-copy');
    expect(copy.id).not.toBe(original.id);
    expect(copy.fields).toEqual(original.fields);
    expect(copy.status).toBe(original.status);
    expect(copy.target).toEqual(original.target);
    expect(copy.scriptId).toBe(original.scriptId);
  });

  it('detachCuratedSchema clears scriptId/scriptFilename without mutating the original', () => {
    const original = makeCuratedSchema({ scriptId: 'script-1', scriptFilename: 'toy.txt' });
    const detached = detachCuratedSchema(original);
    expect(detached.scriptId).toBeUndefined();
    expect(detached.scriptFilename).toBeUndefined();
    expect(original.scriptId).toBe('script-1'); // input untouched
    expect(detached.fields).toEqual(original.fields);
  });

  it('a detached (scriptId-less) reviewed schema is still selectable for Setup, but is no longer Run-Script-runnable — detach is not delete/disable, but it does leave Run Script', () => {
    const project = makeProjectWithScripts();
    const fireRed10 = { game: 'FireRed', language: 'English', revision: '1.0' } as const;
    const detached = detachCuratedSchema(makeCuratedSchema({ status: 'reviewed', target: fireRed10 }));
    expect(isSchemaSelectable(detached)).toBe(true); // still fine for Setup/Unattached schemas
    expect(defaultRunnableSchemas([detached], project, fireRed10)).toHaveLength(0);
    expect(advancedRunnableSchemas([detached], project, fireRed10)).toHaveLength(0);
  });
});

describe('deleting/detaching a schema never corrupts saved outputs', () => {
  it('countSavedOutputsUsingSchema counts blocks whose source.actionId matches this schema', () => {
    const blocks = [
      makeBlock({ id: 'b1', source: { type: 'filled-script', label: 'x', importedAt: ISO, schemaVersion: 1, actionId: 'toy-schema' } }),
      makeBlock({ id: 'b2', source: { type: 'filled-script', label: 'x', importedAt: ISO, schemaVersion: 1, actionId: 'other-schema' } }),
      makeBlock({ id: 'b3', source: { type: 'filled-script', label: 'x', importedAt: ISO, schemaVersion: 1, actionId: 'toy-schema' } }),
    ];
    expect(countSavedOutputsUsingSchema(blocks, 'toy-schema')).toBe(2);
    expect(countSavedOutputsUsingSchema(blocks, 'other-schema')).toBe(1);
    expect(countSavedOutputsUsingSchema(blocks, 'nonexistent')).toBe(0);
  });

  it('a saved output block referencing a schema keeps its rawText and provenance string intact after the schema is deleted', () => {
    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    project.curatedSchemas.push(makeCuratedSchema({ id: 'toy-schema' }));
    project.importedBlocks.push(
      makeBlock({ source: { type: 'filled-script', label: 'x', importedAt: ISO, schemaVersion: 1, actionId: 'toy-schema' } }),
    );

    removeCuratedSchema(project.curatedSchemas, 'toy-schema');

    expect(project.curatedSchemas).toEqual([]);
    expect(project.importedBlocks).toHaveLength(1);
    expect(project.importedBlocks[0].rawText).toBe('toy output text');
    expect(project.importedBlocks[0].source.actionId).toBe('toy-schema'); // stored string, never re-resolved
  });

  it('project export/import round-trips correctly after a schema has been deleted', () => {
    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    const script = makeScriptFile();
    project.scripts.push(script);
    project.curatedSchemas.push(makeCuratedSchema({ id: 'to-delete', scriptId: script.id }));
    project.curatedSchemas.push(makeCuratedSchema({ id: 'keeper', scriptId: script.id }));
    removeCuratedSchema(project.curatedSchemas, 'to-delete');

    const roundTripped = importProjectJson(exportProjectJson(project));
    expect(roundTripped.curatedSchemas.map((s) => s.id)).toEqual(['keeper']);
    expect(roundTripped.scripts).toHaveLength(1);
  });
});

describe('toActionTemplateShape — reference-select fields resolve options from the local catalog', () => {
  it('resolves options as "Name — value" from the gen3-moves catalog for a reference-select field', () => {
    const schema = makeCuratedSchema({
      fields: [
        { key: 'Move', label: 'Move', type: 'reference-select', required: true, variableName: 'Move', referenceCatalogId: 'gen3-moves' },
      ],
    });
    const template = toActionTemplateShape(schema);
    const moveField = template.fields[0];
    expect(moveField.type).toBe('reference-select');
    expect(moveField.options?.some((o) => o.value === '85' && o.label === 'Thunderbolt — 85')).toBe(true);
  });

  it('resolves options from the gen3-items catalog for a reference-select field', () => {
    const schema = makeCuratedSchema({
      fields: [
        { key: 'Item', label: 'Item', type: 'reference-select', required: false, variableName: 'HeldItem', referenceCatalogId: 'gen3-items' },
      ],
    });
    const template = toActionTemplateShape(schema);
    expect(template.fields[0].options?.some((o) => o.value === '13' && o.label === 'Potion — 13')).toBe(true);
  });

  it('every resolved gen3-items option writes a numeric value string, never the display name, across the now-complete catalog', () => {
    const schema = makeCuratedSchema({
      fields: [
        { key: 'Item', label: 'Item', type: 'reference-select', required: false, variableName: 'HeldItem', referenceCatalogId: 'gen3-items' },
      ],
    });
    const options = toActionTemplateShape(schema).fields[0].options ?? [];
    expect(options).toHaveLength(GEN3_ITEMS_CATALOG.entries.length);
    for (const option of options) {
      expect(option.value).toMatch(/^\d+$/);
    }
  });

  it('every resolved gen3-moves option writes a numeric value string, never the display name, across the now-complete catalog', () => {
    const schema = makeCuratedSchema({
      fields: [
        { key: 'Move', label: 'Move', type: 'reference-select', required: true, variableName: 'Move', referenceCatalogId: 'gen3-moves' },
      ],
    });
    const options = toActionTemplateShape(schema).fields[0].options ?? [];
    expect(options).toHaveLength(GEN3_MOVES_CATALOG.entries.length);
    for (const option of options) {
      expect(option.value).toMatch(/^\d+$/);
    }
  });

  it('resolves options from the gen3-species catalog for a reference-select field', () => {
    const schema = makeCuratedSchema({
      fields: [
        { key: 'Species', label: 'Species', type: 'reference-select', required: false, variableName: 'Species', referenceCatalogId: 'gen3-species' },
      ],
    });
    const template = toActionTemplateShape(schema);
    expect(template.fields[0].options?.some((o) => o.value === '1' && o.label === 'Bulbasaur — 1')).toBe(true);
  });

  it('every resolved gen3-species option writes a numeric (internal index) value string only, never the display name or National Dex number', () => {
    const schema = makeCuratedSchema({
      fields: [
        { key: 'Species', label: 'Species', type: 'reference-select', required: false, variableName: 'Species', referenceCatalogId: 'gen3-species' },
      ],
    });
    const options = toActionTemplateShape(schema).fields[0].options ?? [];
    expect(options).toHaveLength(GEN3_SPECIES_CATALOG.entries.length);
    for (const option of options) {
      expect(option.value).toMatch(/^\d+$/);
    }
    // Treecko's internal index (277) is used, never its National Dex number (252).
    const treecko = options.find((o) => o.label.startsWith('Treecko'));
    expect(treecko?.value).toBe('277');
  });

  it('falls back to any hand-set options rather than crashing when referenceCatalogId is missing', () => {
    const schema = makeCuratedSchema({
      fields: [
        { key: 'Item', label: 'Item', type: 'reference-select', required: false, variableName: 'HeldItem', options: [{ value: '1', label: 'Fallback' }] },
      ],
    });
    const template = toActionTemplateShape(schema);
    expect(template.fields[0].options).toEqual([{ value: '1', label: 'Fallback' }]);
  });

  it('leaves plain select/number/text/checkbox fields unaffected — no catalog resolution attempted', () => {
    const schema = makeCuratedSchema({
      fields: [
        { key: 'a', label: 'A', type: 'select', required: false, variableName: 'a', options: [{ value: 'x', label: 'X' }] },
      ],
    });
    const template = toActionTemplateShape(schema);
    expect(template.fields[0].options).toEqual([{ value: 'x', label: 'X' }]);
  });
});

describe('repairStaleSchemaFields — one-time local repair for pre-dropdown text fields', () => {
  function toyField(over: Partial<CuratedActionSchema['fields'][number]> = {}): CuratedActionSchema['fields'][number] {
    return { key: 'x', label: 'X', type: 'text', required: true, variableName: 'x', ...over };
  }

  it('upgrades a "Move" text field to reference-select backed by gen3-moves', () => {
    const schema = makeCuratedSchema({ fields: [toyField({ key: 'Move', label: 'Move', variableName: 'Move' })] });
    const repaired = repairStaleSchemaFields(schema);
    expect(repaired.fields[0]).toMatchObject({ type: 'reference-select', referenceCatalogId: 'gen3-moves' });
  });

  it('upgrades a field with inputHint "move" to reference-select even if its variableName differs', () => {
    const schema = makeCuratedSchema({ fields: [toyField({ key: 'chosenMove', label: 'Chosen move', variableName: 'chosenMove', inputHint: 'move' })] });
    const repaired = repairStaleSchemaFields(schema);
    expect(repaired.fields[0]).toMatchObject({ type: 'reference-select', referenceCatalogId: 'gen3-moves' });
  });

  it('upgrades an "Item" text field to reference-select backed by gen3-items', () => {
    const schema = makeCuratedSchema({ fields: [toyField({ key: 'Item', label: 'Item', variableName: 'Item' })] });
    const repaired = repairStaleSchemaFields(schema);
    expect(repaired.fields[0]).toMatchObject({ type: 'reference-select', referenceCatalogId: 'gen3-items' });
  });

  it('upgrades a "MoveSlot" text field to a select with options 0-3', () => {
    const schema = makeCuratedSchema({ fields: [toyField({ key: 'MoveSlot', label: 'Move slot', variableName: 'MoveSlot' })] });
    const repaired = repairStaleSchemaFields(schema);
    expect(repaired.fields[0]!.type).toBe('select');
    expect(repaired.fields[0]!.options).toEqual(MOVE_SLOT_FIELD_OPTIONS);
  });

  it('upgrades an "NPC" text field to a select with options 1-3', () => {
    const schema = makeCuratedSchema({ fields: [toyField({ key: 'NPC', label: 'NPC', variableName: 'NPC' })] });
    const repaired = repairStaleSchemaFields(schema);
    expect(repaired.fields[0]!.type).toBe('select');
    expect(repaired.fields[0]!.options).toEqual(NPC_FIELD_OPTIONS);
  });

  it('never touches key/label/required/helpText/defaultValue while upgrading a field', () => {
    const schema = makeCuratedSchema({
      fields: [toyField({ key: 'Move', label: 'Custom label', variableName: 'Move', required: false, helpText: 'help', defaultValue: 'x' })],
    });
    const repaired = repairStaleSchemaFields(schema);
    expect(repaired.fields[0]).toMatchObject({ key: 'Move', label: 'Custom label', required: false, helpText: 'help', defaultValue: 'x' });
  });

  it('leaves an already-correctly-typed field completely unchanged (same object reference)', () => {
    const field = toyField({ key: 'Move', label: 'Move', variableName: 'Move', type: 'reference-select', referenceCatalogId: 'gen3-moves' });
    const schema = makeCuratedSchema({ fields: [field] });
    const repaired = repairStaleSchemaFields(schema);
    expect(repaired.fields[0]).toBe(field);
    expect(repaired).toBe(schema); // no fields changed -> the whole schema object is returned as-is
  });

  it('leaves an unrelated field (not Move/Item/MoveSlot/NPC-shaped) unchanged', () => {
    const schema = makeCuratedSchema({ fields: [toyField({ key: 'widgetCount', label: 'Widget count', variableName: 'widgetCount', type: 'number' })] });
    const repaired = repairStaleSchemaFields(schema);
    expect(repaired.fields[0]!.type).toBe('number');
  });

  it('repairs only the stale fields in a mixed field list, preserving field order', () => {
    const schema = makeCuratedSchema({
      fields: [
        toyField({ key: 'Move', label: 'Move', variableName: 'Move' }),
        toyField({ key: 'MoveSlot', label: 'Move slot', variableName: 'MoveSlot' }),
        toyField({ key: 'NPC', label: 'NPC', variableName: 'NPC' }),
        toyField({ key: 'widgetCount', label: 'Widget count', variableName: 'widgetCount', type: 'number' }),
      ],
    });
    const repaired = repairStaleSchemaFields(schema);
    expect(repaired.fields.map((f) => f.type)).toEqual(['reference-select', 'select', 'select', 'number']);
    expect(repaired.fields.map((f) => f.variableName)).toEqual(['Move', 'MoveSlot', 'NPC', 'widgetCount']);
  });
});
