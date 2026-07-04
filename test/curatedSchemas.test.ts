import { describe, it, expect } from 'vitest';
import type { ActionInput, CuratedActionSchema, ScriptFile } from '../src/core/types.js';
import { createProject } from '../src/core/factory.js';
import { scanScript } from '../src/core/scriptScanner.js';
import { missingRequiredActionFields } from '../src/core/actionInput.js';
import { MockGeneratorAdapter, MOCK_PLACEHOLDER_TEXT, MOCK_ROW_COUNT } from '../src/core/generatorAdapter.js';
import {
  toActionTemplateShape,
  isSchemaSelectable,
  resolveCuratedSchema,
  supportsRevision,
} from '../src/core/curatedSchemas.js';
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

  it('finds a schema attached to a script by scriptId, the way the Script Library UI does', () => {
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

describe('curated schema appears in and drives the Action Builder (mock mode only)', () => {
  it('is selectable when reviewed or draft, and excluded when disabled', () => {
    const reviewed = makeCuratedSchema({ id: 'a', status: 'reviewed' });
    const draft = makeCuratedSchema({ id: 'b', status: 'draft' });
    const disabled = makeCuratedSchema({ id: 'c', status: 'disabled' });
    expect(isSchemaSelectable(reviewed)).toBe(true);
    expect(isSchemaSelectable(draft)).toBe(true);
    expect(isSchemaSelectable(disabled)).toBe(false);
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
