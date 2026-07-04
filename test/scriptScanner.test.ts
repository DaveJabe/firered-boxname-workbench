import { describe, it, expect } from 'vitest';
import type { ScriptFile } from '../src/core/types.js';
import { scanScript, buildDraftActionSchema } from '../src/core/scriptScanner.js';
import { createProject } from '../src/core/factory.js';
import {
  importProjectJson,
  exportProjectJson,
  exportDraftActionSchemaJson,
  importCuratedActionSchemaJson,
} from '../src/data/storage.js';

const ISO = '2026-01-01T00:00:00.000Z';

function makeIdGen(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

function makeScript(rawText: string, over: Partial<ScriptFile> = {}): ScriptFile {
  return { id: 's1', filename: 'toy.txt', rawText, importedAt: ISO, ...over };
}

// A harmless, invented toy fixture — no real script, item ID, address, offset,
// route step, opcode, or payload byte. "value1"/"value2" are generic names;
// @input:item and @input:move are only the annotation-tag examples named in
// this phase's own spec, used here purely as literal strings to recognize.
const TOY_SCRIPT = [
  '; sample header for a toy fixture',
  'value1 = 5 ; example count, @input:item',
  'value2 = "SAMPLE" ; example label, @input:move',
  'flagValue = true',
  'CONST_NAME = TOY_CONST',
  '@@',
  '; everything below this line is body text only, never scanned as code',
  'PretendBodyLine',
].join('\n');

describe('scanScript header/body split around @@', () => {
  it('splits lines before and after the marker into header/body sections', () => {
    const scan = scanScript(makeScript(TOY_SCRIPT), () => ISO);
    expect(scan.markerLine).toBe(6);
    const header = scan.sections.find((s) => s.kind === 'header')!;
    const body = scan.sections.find((s) => s.kind === 'body')!;
    expect(header.text).toContain('value1 = 5');
    expect(header.text).not.toContain('PretendBodyLine');
    expect(body.text).toContain('PretendBodyLine');
    expect(body.text).not.toContain('value1 = 5');
  });

  it('treats a script with no @@ marker as a single body section with no candidates', () => {
    const scan = scanScript(makeScript('just some text\nmore text'), () => ISO);
    expect(scan.markerLine).toBeNull();
    expect(scan.sections.map((s) => s.kind)).toEqual(['body']);
    expect(scan.candidates).toEqual([]);
  });
});

describe('scanScript candidate detection', () => {
  it('finds simple assignment candidates before the marker, in order', () => {
    const scan = scanScript(makeScript(TOY_SCRIPT), () => ISO);
    expect(scan.candidates.map((c) => c.name)).toEqual(['value1', 'value2', 'flagValue', 'CONST_NAME']);
  });

  it('does not treat a plain (non-comment) preceding line as a nearby comment', () => {
    const script = makeScript(['not a comment line', 'x = 1', '@@', 'body'].join('\n'));
    const scan = scanScript(script, () => ISO);
    expect(scan.candidates.find((c) => c.name === 'x')?.nearbyComment).toBeUndefined();
  });

  it('captures a same-line trailing comment as the nearby comment', () => {
    const scan = scanScript(makeScript(TOY_SCRIPT), () => ISO);
    expect(scan.candidates.find((c) => c.name === 'value1')?.nearbyComment).toBe('example count, @input:item');
  });

  it('captures a preceding full-line comment when there is no trailing comment', () => {
    const script = makeScript(['; context note', 'plain = 1', '@@', 'body'].join('\n'));
    const scan = scanScript(script, () => ISO);
    expect(scan.candidates.find((c) => c.name === 'plain')?.nearbyComment).toBe('context note');
  });

  it('recognizes @input:* annotations wherever they appear near a candidate', () => {
    const scan = scanScript(makeScript(TOY_SCRIPT), () => ISO);
    expect(scan.candidates.find((c) => c.name === 'value1')?.annotation).toBe('@input:item');
    expect(scan.candidates.find((c) => c.name === 'value2')?.annotation).toBe('@input:move');
    expect(scan.candidates.find((c) => c.name === 'flagValue')?.annotation).toBeUndefined();
  });

  it('assigns a rough inferred field type from the raw value shape', () => {
    const scan = scanScript(makeScript(TOY_SCRIPT), () => ISO);
    const byName = Object.fromEntries(scan.candidates.map((c) => [c.name, c.inferredType]));
    expect(byName.value1).toBe('number');
    expect(byName.value2).toBe('text');
    expect(byName.flagValue).toBe('checkbox');
    expect(byName.CONST_NAME).toBe('select');
  });

  it('assigns confidence levels: high with annotation+type, medium with only one, low with neither', () => {
    const scan = scanScript(makeScript(TOY_SCRIPT), () => ISO);
    const byName = Object.fromEntries(scan.candidates.map((c) => [c.name, c.confidence]));
    expect(byName.value1).toBe('high');
    expect(byName.value2).toBe('high');
    expect(byName.flagValue).toBe('medium');
    expect(byName.CONST_NAME).toBe('medium');

    const weak = scanScript(makeScript(['weirdValue = something_odd', '@@', 'body'].join('\n')), () => ISO);
    // 'something_odd' matches no known shape and has no annotation -> low confidence.
    expect(weak.candidates[0]?.inferredType).toBe('unknown');
    expect(weak.candidates[0]?.confidence).toBe('low');
  });

  it('never mutates the ScriptFile it is given', () => {
    const script = makeScript(TOY_SCRIPT);
    const before = JSON.stringify(script);
    scanScript(script, () => ISO);
    expect(JSON.stringify(script)).toBe(before);
  });

  it('is deterministic given the same script text', () => {
    const script = makeScript(TOY_SCRIPT);
    const a = scanScript(script, () => ISO);
    const b = scanScript(script, () => ISO);
    expect(a).toEqual(b);
  });
});

describe('imported script rawText preservation', () => {
  it('round-trips a script file rawText and notes unchanged through project export/import', () => {
    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    project.scripts.push(makeScript(TOY_SCRIPT, { id: 'sc1', notes: 'toy fixture' }));
    const roundTripped = importProjectJson(exportProjectJson(project));
    expect(roundTripped.scripts[0].rawText).toBe(TOY_SCRIPT);
    expect(roundTripped.scripts[0].notes).toBe('toy fixture');

    // A second round trip must still be byte-for-byte identical.
    const twice = importProjectJson(exportProjectJson(roundTripped));
    expect(twice.scripts[0].rawText).toBe(TOY_SCRIPT);
  });

  it('defaults scripts to an empty array when importing an older project export without the field', () => {
    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    const obj = JSON.parse(exportProjectJson(project));
    delete obj.scripts;
    expect(importProjectJson(JSON.stringify(obj)).scripts).toEqual([]);
  });

  it('round-trips a scanned script, including lastScan, through project export/import', () => {
    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    const script = makeScript(TOY_SCRIPT, { id: 'sc1' });
    script.lastScan = scanScript(script, () => ISO);
    project.scripts.push(script);
    const roundTripped = importProjectJson(exportProjectJson(project));
    expect(roundTripped.scripts[0].lastScan).toEqual(script.lastScan);
  });

  it('rejects a script with an invalid candidate confidence value', () => {
    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    const script = makeScript(TOY_SCRIPT, { id: 'sc1' });
    script.lastScan = scanScript(script, () => ISO);
    project.scripts.push(script);
    const obj = JSON.parse(exportProjectJson(project));
    obj.scripts[0].lastScan.candidates[0].confidence = 'nope';
    expect(() => importProjectJson(JSON.stringify(obj))).toThrow(/confidence/);
  });
});

describe('draft action schema', () => {
  it('is deterministic: the same scan produces byte-identical exported JSON', () => {
    const script = makeScript(TOY_SCRIPT);
    const scan = scanScript(script, () => ISO);
    const a = buildDraftActionSchema(script, scan, () => ISO);
    const b = buildDraftActionSchema(script, scan, () => ISO);
    expect(exportDraftActionSchemaJson(a)).toBe(exportDraftActionSchemaJson(b));
  });

  it('is always marked isDraft, and round-trips through the curated-schema JSON import path', () => {
    const script = makeScript(TOY_SCRIPT);
    const scan = scanScript(script, () => ISO);
    const schema = buildDraftActionSchema(script, scan, () => ISO);
    expect(schema.isDraft).toBe(true);
    const reimported = importCuratedActionSchemaJson(exportDraftActionSchemaJson(schema));
    expect(reimported).toEqual(schema);
  });

  it('rejects a curated schema JSON missing isDraft: true', () => {
    const script = makeScript(TOY_SCRIPT);
    const scan = scanScript(script, () => ISO);
    const schema = buildDraftActionSchema(script, scan, () => ISO);
    const obj = JSON.parse(exportDraftActionSchemaJson(schema));
    obj.isDraft = false;
    expect(() => importCuratedActionSchemaJson(JSON.stringify(obj))).toThrow(/isDraft/);
  });
});
