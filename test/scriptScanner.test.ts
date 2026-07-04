import { describe, it, expect } from 'vitest';
import type { ScriptFile } from '../src/core/types.js';
import { scanScript, buildDraftActionSchema } from '../src/core/scriptScanner.js';
import { createProject } from '../src/core/factory.js';
import {
  importProjectJson,
  exportProjectJson,
  exportDraftActionSchemaJson,
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

describe('script pack (batch folder import) round-tripping', () => {
  it('round-trips a script pack and its scripts\' relativePath/packId through project export/import', () => {
    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    project.scripts.push(makeScript(TOY_SCRIPT, { id: 'sc1', relativePath: 'ToyPack/misc/toy.txt', packId: 'pack1' }));
    project.scriptPacks.push({ id: 'pack1', name: 'ToyPack', importedAt: ISO, sourceFolderName: 'ToyPack', scriptIds: ['sc1'] });

    const roundTripped = importProjectJson(exportProjectJson(project));
    expect(roundTripped.scriptPacks).toHaveLength(1);
    expect(roundTripped.scriptPacks[0].sourceFolderName).toBe('ToyPack');
    expect(roundTripped.scriptPacks[0].scriptIds).toEqual(['sc1']);
    expect(roundTripped.scripts[0].relativePath).toBe('ToyPack/misc/toy.txt');
    expect(roundTripped.scripts[0].packId).toBe('pack1');
    expect(roundTripped.scripts[0].rawText).toBe(TOY_SCRIPT);
  });

  it('defaults scriptPacks to an empty array when importing an older project export without the field', () => {
    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    const obj = JSON.parse(exportProjectJson(project));
    delete obj.scriptPacks;
    expect(importProjectJson(JSON.stringify(obj)).scriptPacks).toEqual([]);
  });

  it('leaves a script\'s relativePath/packId undefined when it was not imported as part of a pack', () => {
    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    project.scripts.push(makeScript(TOY_SCRIPT, { id: 'sc1' }));
    const roundTripped = importProjectJson(exportProjectJson(project));
    expect(roundTripped.scripts[0].relativePath).toBeUndefined();
    expect(roundTripped.scripts[0].packId).toBeUndefined();
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

  it('is always marked isDraft — a starting point for a curated schema, not a live template', () => {
    const script = makeScript(TOY_SCRIPT);
    const scan = scanScript(script, () => ISO);
    const schema = buildDraftActionSchema(script, scan, () => ISO);
    expect(schema.isDraft).toBe(true);
  });
});

// A harmless toy fixture modeled on the shape of community NPC-script tools
// (leading `@`/`@@` metadata directives, semicolon comments, an `@input:xxx`
// annotation, a "do not modify" internal-values block) — but with invented
// author/title/exit strings, placeholder hex tokens, and generic body text
// standing in for real offsets/opcodes/payload bytes, none of which this
// module ever evaluates anyway.
const DIRECTIVE_SHAPED_SCRIPT = [
  '@ title = "Toy NPC move-teaching script"',
  '@@ author = "Toy Author"',
  '@@ exit = "ToyExitRoutine"',
  '',
  ';After executing this code, talk to the sample NPC described in this toy fixture.',
  '',
  ';After talking to the NPC, this replaces a move slot with the chosen value, for review purposes only.',
  'Move = 1 @input:move',
  'MoveSlot = 3    ;Slots 0-3 are available',
  '',
  'NPC = 2 ;sets which NPC on the map to run, values 1-3 are usable in this toy fixture',
  '',
  ';Do not modify these values',
  'ScriptStart = (MoveSlot * 0xPLACEHOLDER1) + 0xPLACEHOLDER2',
  'ScriptEnd = Move + (0xPLACEHOLDER3)',
  'NPCOffset = 0xPLACEHOLDER4 + (NPC * 0xPLACEHOLDER5)',
  '@@',
  '',
  '; body text only, never scanned as code',
  'PretendBodyLine1',
  'PretendBodyLine2 referencing {NPCOffset}',
  'PretendBodyLine3 referencing {ScriptStart}',
].join('\n');

function byName(scan: ReturnType<typeof scanScript>, name: string) {
  return scan.candidates.find((c) => c.name === name);
}

describe('marker detection ignores directive lines that merely contain "@@"', () => {
  it('does not treat `@@ author = "..."` as the separator', () => {
    const scan = scanScript(makeScript(DIRECTIVE_SHAPED_SCRIPT), () => ISO);
    expect(scan.markerLine).not.toBe(2);
  });

  it('does not treat `@@ exit = "..."` as the separator', () => {
    const scan = scanScript(makeScript(DIRECTIVE_SHAPED_SCRIPT), () => ISO);
    expect(scan.markerLine).not.toBe(3);
  });

  it('finds the marker only at the line whose trimmed text is exactly "@@"', () => {
    const scan = scanScript(makeScript(DIRECTIVE_SHAPED_SCRIPT), () => ISO);
    expect(scan.markerLine).toBe(17);
  });

  it('reports correct header/body line counts around the real marker', () => {
    const scan = scanScript(makeScript(DIRECTIVE_SHAPED_SCRIPT), () => ISO);
    const header = scan.sections.find((s) => s.kind === 'header')!;
    const body = scan.sections.find((s) => s.kind === 'body')!;
    expect(header.text.split('\n')).toHaveLength(16);
    expect(body.text.split('\n')).toHaveLength(5);
    expect(body.text).toContain('PretendBodyLine1');
  });
});

describe('header directive metadata is captured separately from candidates', () => {
  it('captures title/author/exit as directives, not candidate variables', () => {
    const scan = scanScript(makeScript(DIRECTIVE_SHAPED_SCRIPT), () => ISO);
    expect(scan.directives.map((d) => d.key)).toEqual(['title', 'author', 'exit']);
    expect(scan.title).toBe('Toy NPC move-teaching script');
    expect(scan.author).toBe('Toy Author');
    expect(scan.exit).toBe('ToyExitRoutine');
    expect(byName(scan, 'title')).toBeUndefined();
    expect(byName(scan, 'author')).toBeUndefined();
    expect(byName(scan, 'exit')).toBeUndefined();
  });
});

describe('candidate extraction on the directive-shaped fixture', () => {
  it('detects Move, with its value separated from its inline @input:move annotation', () => {
    const scan = scanScript(makeScript(DIRECTIVE_SHAPED_SCRIPT), () => ISO);
    const move = byName(scan, 'Move');
    expect(move).toBeDefined();
    expect(move?.rawValue).toBe('1');
    expect(move?.annotation).toBe('@input:move');
  });

  it('gives Move high confidence and captures the preceding full-line comment as its nearby comment', () => {
    const scan = scanScript(makeScript(DIRECTIVE_SHAPED_SCRIPT), () => ISO);
    const move = byName(scan, 'Move');
    expect(move?.inferredType).toBe('number');
    expect(move?.confidence).toBe('high');
    expect(move?.nearbyComment).toBe(
      'After talking to the NPC, this replaces a move slot with the chosen value, for review purposes only.',
    );
  });

  it('detects MoveSlot and captures its semicolon trailing comment', () => {
    const scan = scanScript(makeScript(DIRECTIVE_SHAPED_SCRIPT), () => ISO);
    const moveSlot = byName(scan, 'MoveSlot');
    expect(moveSlot).toBeDefined();
    expect(moveSlot?.rawValue).toBe('3');
    expect(moveSlot?.nearbyComment).toBe('Slots 0-3 are available');
    expect(moveSlot?.confidence).toBe('medium');
  });

  it('detects NPC and captures its semicolon trailing comment', () => {
    const scan = scanScript(makeScript(DIRECTIVE_SHAPED_SCRIPT), () => ISO);
    const npc = byName(scan, 'NPC');
    expect(npc).toBeDefined();
    expect(npc?.rawValue).toBe('2');
    expect(npc?.nearbyComment).toBe('sets which NPC on the map to run, values 1-3 are usable in this toy fixture');
    expect(npc?.confidence).toBe('medium');
  });
});

describe('"do not modify" marks following header assignments as internal/helper', () => {
  it('leaves Move, MoveSlot, and NPC as non-internal, user-facing candidates', () => {
    const scan = scanScript(makeScript(DIRECTIVE_SHAPED_SCRIPT), () => ISO);
    expect(byName(scan, 'Move')?.internal).toBe(false);
    expect(byName(scan, 'MoveSlot')?.internal).toBe(false);
    expect(byName(scan, 'NPC')?.internal).toBe(false);
  });

  it('marks ScriptStart, ScriptEnd, and NPCOffset as internal/helper, with low confidence', () => {
    const scan = scanScript(makeScript(DIRECTIVE_SHAPED_SCRIPT), () => ISO);
    for (const name of ['ScriptStart', 'ScriptEnd', 'NPCOffset']) {
      const c = byName(scan, name);
      expect(c?.internal).toBe(true);
      expect(c?.confidence).toBe('low');
    }
  });

  it('still lists internal/helper candidates in scanner output, for transparency', () => {
    const scan = scanScript(makeScript(DIRECTIVE_SHAPED_SCRIPT), () => ISO);
    expect(scan.candidates.map((c) => c.name)).toEqual([
      'Move', 'MoveSlot', 'NPC', 'ScriptStart', 'ScriptEnd', 'NPCOffset',
    ]);
  });
});

describe('body lines are counted but never scanned for candidates', () => {
  it('does not extract `{ScriptStart}`/`{NPCOffset}` body references as candidates', () => {
    const scan = scanScript(makeScript(DIRECTIVE_SHAPED_SCRIPT), () => ISO);
    expect(scan.candidates.some((c) => c.name.includes('{'))).toBe(false);
    // Exactly the six header assignments — nothing extra from the body.
    expect(scan.candidates).toHaveLength(6);
  });

  it('never modifies the script rawText while scanning', () => {
    const script = makeScript(DIRECTIVE_SHAPED_SCRIPT);
    const before = JSON.stringify(script);
    scanScript(script, () => ISO);
    expect(JSON.stringify(script)).toBe(before);
    expect(script.rawText).toBe(DIRECTIVE_SHAPED_SCRIPT);
  });
});
