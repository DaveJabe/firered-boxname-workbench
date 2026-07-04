import { describe, it, expect } from 'vitest';
import type { CuratedActionSchema, Project, ScriptFile } from '../src/core/types.js';
import { createProject } from '../src/core/factory.js';
import { scanScript } from '../src/core/scriptScanner.js';
import { candidateToDraftField, validateDraftSchema } from '../src/core/schemaBuilder.js';
import { isSchemaSelectable, resolveCuratedSchema, upsertCuratedSchema } from '../src/core/curatedSchemas.js';

const ISO = '2026-01-01T00:00:00.000Z';

function makeIdGen(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

function makeProject(): Project {
  return createProject(
    { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
    makeIdGen(),
    () => ISO,
  );
}

// A harmless, invented toy fixture — no real script, item ID, address, offset,
// route step, opcode, or payload byte.
const TOY_SCRIPT = [
  '; sample header for a toy fixture',
  'widgetCount = 5 ; example count, @input:item',
  'widgetLabel = "SAMPLE" ; example label, @input:move',
  'widgetEnabled = true',
  'WIDGET_KIND = TOY_CONST',
  'weirdValue = something_odd',
  '@@',
  '; body text only, never scanned as code',
  'PretendBodyLine',
].join('\n');

function makeScriptFile(over: Partial<ScriptFile> = {}): ScriptFile {
  return { id: 'script-1', filename: 'toy.txt', rawText: TOY_SCRIPT, importedAt: ISO, ...over };
}

function makeSchema(over: Partial<CuratedActionSchema> = {}): CuratedActionSchema {
  return {
    id: 'toy-schema',
    label: 'Toy curated schema',
    description: 'A hand-reviewed, toy-only field mapping for the fixture script.',
    scriptId: 'script-1',
    scriptFilename: 'toy.txt',
    supportedRevisionLabels: [],
    status: 'draft',
    fields: [
      { key: 'count', label: 'Widget count', type: 'number', required: true, variableName: 'widgetCount' },
    ],
    ...over,
  };
}

describe('candidateToDraftField', () => {
  it('never mutates the ScriptFile it is derived from, and rawText stays unchanged', () => {
    const script = makeScriptFile();
    const before = JSON.stringify(script);
    const scan = scanScript(script, () => ISO);
    scan.candidates.forEach(candidateToDraftField);
    expect(JSON.stringify(script)).toBe(before);
    expect(script.rawText).toBe(TOY_SCRIPT);
  });

  it('maps a number candidate to a number field with a numeric default from rawValue', () => {
    const script = makeScriptFile();
    const scan = scanScript(script, () => ISO);
    const candidate = scan.candidates.find((c) => c.name === 'widgetCount')!;
    const field = candidateToDraftField(candidate);
    expect(field.key).toBe('widgetCount');
    expect(field.label).toBe('Widget count');
    expect(field.type).toBe('number');
    expect(field.variableName).toBe('widgetCount');
    expect(field.required).toBe(false);
    expect(field.defaultValue).toBe(5);
    expect(field.helpText).toBe('example count, @input:item');
    expect(field.warnings).toEqual(['Scanner annotation: @input:item']);
  });

  it('maps a text candidate to a text field, unquoting the default value', () => {
    const script = makeScriptFile();
    const scan = scanScript(script, () => ISO);
    const candidate = scan.candidates.find((c) => c.name === 'widgetLabel')!;
    const field = candidateToDraftField(candidate);
    expect(field.type).toBe('text');
    expect(field.defaultValue).toBe('SAMPLE');
  });

  it('maps a checkbox candidate to a checkbox field with a boolean default', () => {
    const script = makeScriptFile();
    const scan = scanScript(script, () => ISO);
    const candidate = scan.candidates.find((c) => c.name === 'widgetEnabled')!;
    const field = candidateToDraftField(candidate);
    expect(field.type).toBe('checkbox');
    expect(field.defaultValue).toBe(true);
    expect(field.warnings).toBeUndefined();
  });

  it('maps a select candidate to a select field seeded with its own raw value as the one option', () => {
    const script = makeScriptFile();
    const scan = scanScript(script, () => ISO);
    const candidate = scan.candidates.find((c) => c.name === 'WIDGET_KIND')!;
    const field = candidateToDraftField(candidate);
    expect(field.type).toBe('select');
    expect(field.options).toEqual([{ value: 'TOY_CONST', label: 'TOY_CONST' }]);
    expect(field.defaultValue).toBe('TOY_CONST');
  });

  it('falls back an "unknown" inferred type to a plain text field, inventing nothing', () => {
    const script = makeScriptFile();
    const scan = scanScript(script, () => ISO);
    const candidate = scan.candidates.find((c) => c.name === 'weirdValue')!;
    expect(candidate.inferredType).toBe('unknown');
    const field = candidateToDraftField(candidate);
    expect(field.type).toBe('text');
    expect(field.defaultValue).toBe('something_odd');
  });
});

// Same directive/"do not modify" shape covered in scriptScanner.test.ts —
// used here to confirm the schema builder seeds labels correctly and
// naturally separates user-facing from internal/helper candidates.
const DIRECTIVE_SHAPED_SCRIPT = [
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

describe('candidateToDraftField label seeding', () => {
  it('humanizes variable names into readable labels: Move, MoveSlot -> Move slot, NPC stays NPC', () => {
    const script = makeScriptFile({ id: 'script-2', filename: 'directive.txt', rawText: DIRECTIVE_SHAPED_SCRIPT });
    const scan = scanScript(script, () => ISO);
    const byName = (n: string) => scan.candidates.find((c) => c.name === n)!;
    expect(candidateToDraftField(byName('Move')).label).toBe('Move');
    expect(candidateToDraftField(byName('MoveSlot')).label).toBe('Move slot');
    expect(candidateToDraftField(byName('NPC')).label).toBe('NPC');
  });

  it('seeds help text from the nearby comment and a warning from the annotation, inventing no constraints', () => {
    const script = makeScriptFile({ id: 'script-2', filename: 'directive.txt', rawText: DIRECTIVE_SHAPED_SCRIPT });
    const scan = scanScript(script, () => ISO);
    const move = scan.candidates.find((c) => c.name === 'Move')!;
    const field = candidateToDraftField(move);
    expect(field.helpText).toBe(move.nearbyComment);
    expect(field.warnings).toEqual([`Scanner annotation: ${move.annotation}`]);
  });
});

describe('schema builder distinguishes user-facing candidates from internal/helper ones', () => {
  it('flags internal/helper candidates via candidate.internal, the signal the UI defaults to unchecked', () => {
    const script = makeScriptFile({ id: 'script-2', filename: 'directive.txt', rawText: DIRECTIVE_SHAPED_SCRIPT });
    const scan = scanScript(script, () => ISO);
    expect(scan.candidates.filter((c) => !c.internal).map((c) => c.name)).toEqual(['Move', 'MoveSlot', 'NPC']);
    expect(scan.candidates.filter((c) => c.internal).map((c) => c.name)).toEqual(['ScriptStart', 'ScriptEnd', 'NPCOffset']);
  });

  it('builds a valid schema from only the user-facing candidates, leaving internal/helper ones out entirely', () => {
    const project = makeProject();
    const script = makeScriptFile({ id: 'script-2', filename: 'directive.txt', rawText: DIRECTIVE_SHAPED_SCRIPT });
    project.scripts.push(script);
    const scan = scanScript(script, () => ISO);
    const userFacing = scan.candidates.filter((c) => !c.internal);

    const draft: CuratedActionSchema = {
      id: 'move-teach-schema',
      label: 'Move slot 1',
      description: 'Toy schema built from only the user-facing candidates.',
      scriptId: script.id,
      scriptFilename: script.filename,
      supportedRevisionLabels: [],
      status: 'draft',
      fields: userFacing.map(candidateToDraftField),
    };
    expect(validateDraftSchema(draft, project)).toEqual([]);
    expect(draft.fields.map((f) => f.variableName)).toEqual(['Move', 'MoveSlot', 'NPC']);
  });
});

describe('validateDraftSchema', () => {
  it('accepts a well-formed draft with a real linked script', () => {
    const project = makeProject();
    project.scripts.push(makeScriptFile());
    const draft = makeSchema();
    expect(validateDraftSchema(draft, project)).toEqual([]);
  });

  it('requires a schema id, a label, and at least one field', () => {
    const project = makeProject();
    project.scripts.push(makeScriptFile());
    const draft = makeSchema({ id: '', label: '  ', fields: [] });
    const errors = validateDraftSchema(draft, project);
    expect(errors).toContain('Schema id is required.');
    expect(errors).toContain('Label is required.');
    expect(errors).toContain('Include at least one field.');
  });

  it('rejects a duplicate field key', () => {
    const project = makeProject();
    project.scripts.push(makeScriptFile());
    const draft = makeSchema({
      fields: [
        { key: 'dup', label: 'A', type: 'text', required: false, variableName: 'widgetLabel' },
        { key: 'dup', label: 'B', type: 'number', required: false, variableName: 'widgetCount' },
      ],
    });
    expect(validateDraftSchema(draft, project)).toContain('Field key "dup" is used more than once.');
  });

  it('rejects a duplicate variableName mapping across two fields', () => {
    const project = makeProject();
    project.scripts.push(makeScriptFile());
    const draft = makeSchema({
      fields: [
        { key: 'a', label: 'A', type: 'text', required: false, variableName: 'widgetLabel' },
        { key: 'b', label: 'B', type: 'text', required: false, variableName: 'widgetLabel' },
      ],
    });
    expect(validateDraftSchema(draft, project)).toContain('Variable "widgetLabel" is mapped by more than one field.');
  });

  it('rejects a select field with no options', () => {
    const project = makeProject();
    project.scripts.push(makeScriptFile());
    const draft = makeSchema({
      fields: [{ key: 'kind', label: 'Kind', type: 'select', required: false, variableName: 'WIDGET_KIND', options: [] }],
    });
    const errors = validateDraftSchema(draft, project);
    expect(errors.some((e) => e.includes('select fields need at least one option'))).toBe(true);
  });

  it('rejects a field missing a key, label, or variableName', () => {
    const project = makeProject();
    project.scripts.push(makeScriptFile());
    const draft = makeSchema({
      fields: [{ key: '', label: '', type: 'text', required: false, variableName: '' }],
    });
    const errors = validateDraftSchema(draft, project);
    expect(errors.some((e) => e.includes('key is required'))).toBe(true);
    expect(errors.some((e) => e.includes('label is required'))).toBe(true);
    expect(errors.some((e) => e.includes('variable name is required'))).toBe(true);
  });

  it('flags a linked script that does not exist in the project', () => {
    const project = makeProject(); // no scripts pushed
    const draft = makeSchema({ scriptId: 'missing-script' });
    expect(validateDraftSchema(draft, project)).toContain('Linked script was not found in this workspace.');
  });

  it('flags an invalid status', () => {
    const project = makeProject();
    project.scripts.push(makeScriptFile());
    const draft = makeSchema({ status: 'archived' as CuratedActionSchema['status'] });
    expect(validateDraftSchema(draft, project)).toContain('Status must be draft, reviewed, or disabled.');
  });
});

describe('schema save/update behavior (upsertCuratedSchema)', () => {
  it('adds a new schema when saving for the first time', () => {
    const schemas: CuratedActionSchema[] = [];
    upsertCuratedSchema(schemas, makeSchema());
    expect(schemas).toHaveLength(1);
    expect(schemas[0].id).toBe('toy-schema');
  });

  it('updates the existing schema in place when saving again with the same id', () => {
    const schemas: CuratedActionSchema[] = [makeSchema({ label: 'Original label' })];
    upsertCuratedSchema(schemas, makeSchema({ label: 'Edited label' }));
    expect(schemas).toHaveLength(1);
    expect(schemas[0].label).toBe('Edited label');
  });

  it('preserves the linked script id/filename through the save', () => {
    const schemas: CuratedActionSchema[] = [];
    const draft = makeSchema({ scriptId: 'script-1', scriptFilename: 'toy.txt' });
    upsertCuratedSchema(schemas, draft);
    expect(schemas[0].scriptId).toBe('script-1');
    expect(schemas[0].scriptFilename).toBe('toy.txt');
  });
});

describe('a schema built by the builder appears in and drives the Action Builder source list', () => {
  it('is immediately selectable via isSchemaSelectable/resolveCuratedSchema once saved', () => {
    const project = makeProject();
    project.scripts.push(makeScriptFile());
    const script = project.scripts[0];
    const scan = scanScript(script, () => ISO);
    const widgetCount = scan.candidates.find((c) => c.name === 'widgetCount')!;

    const draft: CuratedActionSchema = {
      id: 'built-schema',
      label: 'Built from scan',
      description: 'Toy schema assembled from one included candidate.',
      scriptId: script.id,
      scriptFilename: script.filename,
      supportedRevisionLabels: [],
      status: 'draft',
      fields: [candidateToDraftField(widgetCount)],
    };
    expect(validateDraftSchema(draft, project)).toEqual([]);

    upsertCuratedSchema(project.curatedSchemas, draft);
    expect(isSchemaSelectable(project.curatedSchemas[0])).toBe(true);
    expect(resolveCuratedSchema(project.curatedSchemas, 'built-schema')?.id).toBe('built-schema');
    expect(resolveCuratedSchema(project.curatedSchemas, 'built-schema')?.scriptId).toBe(script.id);
    expect(resolveCuratedSchema(project.curatedSchemas, 'built-schema')?.scriptFilename).toBe(script.filename);
  });

  it('is excluded from selection once its status is disabled', () => {
    const schemas = [makeSchema({ id: 'x', status: 'disabled' })];
    expect(isSchemaSelectable(schemas[0])).toBe(false);
    expect(resolveCuratedSchema(schemas, 'x')).toBeNull();
  });
});
