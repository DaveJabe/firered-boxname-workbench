import { describe, it, expect } from 'vitest';
import type { ScriptFile, ScriptPack } from '../src/core/types.js';
import { UNKNOWN_TARGET } from '../src/core/gameTarget.js';
import {
  looksLikeExitCompanionFile,
  parseExitCompanionSectionNames,
  findExitCompanionCandidates,
  resolveExitCompanion,
  resolveExitCompanionForScript,
} from '../src/core/exitCompanion.js';
import { extractExitDirectiveValue } from '../src/core/scriptScanner.js';

const ISO = '2026-01-01T00:00:00.000Z';

function makeScript(over: Partial<ScriptFile> = {}): ScriptFile {
  return { id: 's1', filename: 'toy.txt', rawText: '', importedAt: ISO, ...over };
}

function makePack(over: Partial<ScriptPack> = {}): ScriptPack {
  return {
    id: 'pack1',
    name: 'toy pack',
    importedAt: ISO,
    defaultTarget: UNKNOWN_TARGET,
    scriptIds: [],
    ...over,
  };
}

// A harmless, invented toy fixture matching the real multi-section companion
// format found in upstream files_frlg/exit.txt (see docs/generator-adapter-spike.md):
// several named sections, each with a `@@ filename = "..."` header and a
// bare `@@` line, separated by a `====`-style line. No real ACE code.
const TOY_COMPANION_TEXT = [
  '@@ filename = "ToyExitA"',
  '@@ start = 1',
  '@@',
  '',
  '; toy body line, not real ACE assembly',
  'MOV r0, #0x0',
  '',
  '====================',
  '',
  '@@ filename = "ToyExitB"',
  '@@ start = 2',
  '@@',
  '',
  'MOV r1, #0x1',
].join('\n');

const TOY_ACTION_SCRIPT = [
  '@@ title = "Toy action"',
  '@@ exit = "ToyExitB"',
  '',
  'level = 5',
  '@@',
  '',
  'movs r0, {level} ?',
].join('\n');

describe('extractExitDirectiveValue', () => {
  it('extracts a quoted @@ exit directive value from a script header', () => {
    expect(extractExitDirectiveValue(TOY_ACTION_SCRIPT)).toBe('ToyExitB');
  });

  it('returns undefined when there is no exit directive', () => {
    expect(extractExitDirectiveValue('title = "no exit here"\n@@\nbody')).toBeUndefined();
  });

  it('returns undefined for a script with no header at all', () => {
    expect(extractExitDirectiveValue('just a body line, no @@ marker')).toBeUndefined();
  });
});

describe('parseExitCompanionSectionNames', () => {
  it('finds every named section in a multi-section companion file', () => {
    expect(parseExitCompanionSectionNames(TOY_COMPANION_TEXT)).toEqual(['ToyExitA', 'ToyExitB']);
  });

  it('returns an empty list for text with no filename directives', () => {
    expect(parseExitCompanionSectionNames('just some text\nwith no directives at all')).toEqual([]);
  });
});

describe('looksLikeExitCompanionFile — conservative detection', () => {
  it('recognizes "exit.txt" with multi-section content', () => {
    expect(looksLikeExitCompanionFile('exit.txt', TOY_COMPANION_TEXT)).toBe(true);
  });

  it('recognizes a differently-named file if both name and content are plausible', () => {
    expect(looksLikeExitCompanionFile('SharedExitCodes.txt', TOY_COMPANION_TEXT)).toBe(true);
  });

  it('does not flag an ordinary action script, even one with "exit" nowhere in it', () => {
    expect(looksLikeExitCompanionFile('ChangeLevel.txt', TOY_ACTION_SCRIPT)).toBe(false);
  });

  it('does not flag a file merely named with "exit" if its content has no section markers', () => {
    expect(looksLikeExitCompanionFile('exit.txt', 'just plain text, no sections here')).toBe(false);
  });

  it('does not flag a plausible-content file whose name gives no signal at all', () => {
    expect(looksLikeExitCompanionFile('RandomScript.txt', TOY_COMPANION_TEXT)).toBe(false);
  });

  it('ignores non-.txt files regardless of content', () => {
    expect(looksLikeExitCompanionFile('exit.json', TOY_COMPANION_TEXT)).toBe(false);
  });
});

describe('findExitCompanionCandidates', () => {
  it('finds only the companion-shaped script among a mixed toy fetched file tree', () => {
    const scripts: ScriptFile[] = [
      makeScript({ id: 'action', filename: 'ChangeLevel.txt', rawText: TOY_ACTION_SCRIPT }),
      makeScript({ id: 'companion', filename: 'exit.txt', rawText: TOY_COMPANION_TEXT }),
      makeScript({ id: 'empty', filename: 'empty.txt', rawText: '' }),
    ];
    const candidates = findExitCompanionCandidates(scripts);
    expect(candidates.map((s) => s.id)).toEqual(['companion']);
  });

  it('returns an empty list when no script looks like a companion', () => {
    const scripts: ScriptFile[] = [makeScript({ id: 'action', filename: 'ChangeLevel.txt', rawText: TOY_ACTION_SCRIPT })];
    expect(findExitCompanionCandidates(scripts)).toEqual([]);
  });
});

describe('resolveExitCompanion', () => {
  it('resolves a known exit name to its companion script, carrying provenance', () => {
    const companion = makeScript({
      id: 'companion',
      filename: 'exit.txt',
      relativePath: 'files_frlg/exit.txt',
      rawText: TOY_COMPANION_TEXT,
      packId: 'pack1',
    });
    const pack = makePack({ id: 'pack1', sourceProfile: 'eshark-github', sourceRef: 'main', fetchedAt: ISO });
    const result = resolveExitCompanion('ToyExitB', [companion], [pack], () => ISO);

    expect(result.status).toBe('resolved');
    expect(result.exitName).toBe('ToyExitB');
    expect(result.companionScriptId).toBe('companion');
    expect(result.companionFilename).toBe('exit.txt');
    expect(result.companionRelativePath).toBe('files_frlg/exit.txt');
    expect(result.companionRawText).toBe(TOY_COMPANION_TEXT);
    expect(result.companionSourcePackId).toBe('pack1');
    expect(result.companionSourceProfile).toBe('eshark-github');
    expect(result.companionSourceRef).toBe('main');
    expect(result.resolvedAt).toBe(ISO);
  });

  it('produces a missing-companion status when the exit name is not found in any candidate', () => {
    const companion = makeScript({ id: 'companion', filename: 'exit.txt', rawText: TOY_COMPANION_TEXT });
    const result = resolveExitCompanion('SomeUnknownExit', [companion], [], () => ISO);

    expect(result.status).toBe('missing');
    expect(result.exitName).toBe('SomeUnknownExit');
    expect(result.companionRawText).toBeUndefined();
    expect(result.companionScriptId).toBeUndefined();
  });

  it('produces a missing status when there are no candidates at all', () => {
    const result = resolveExitCompanion('ToyExitB', [], [], () => ISO);
    expect(result.status).toBe('missing');
  });

  it('produces a no-exit-directive status when exitName is undefined', () => {
    const result = resolveExitCompanion(undefined, [], [], () => ISO);
    expect(result.status).toBe('no-exit-directive');
    expect(result.exitName).toBeUndefined();
  });

  it('never modifies the companion rawText it returns', () => {
    const companion = makeScript({ id: 'companion', filename: 'exit.txt', rawText: TOY_COMPANION_TEXT });
    const result = resolveExitCompanion('ToyExitA', [companion], [], () => ISO);
    expect(result.companionRawText).toBe(TOY_COMPANION_TEXT);
  });
});

describe('resolveExitCompanionForScript — end-to-end convenience wrapper', () => {
  it('resolves a script with an exit directive against a companion elsewhere in the project', () => {
    const action = makeScript({ id: 'action', filename: 'ChangeLevel.txt', rawText: TOY_ACTION_SCRIPT });
    const companion = makeScript({ id: 'companion', filename: 'exit.txt', rawText: TOY_COMPANION_TEXT });
    const result = resolveExitCompanionForScript(action, [action, companion], [], () => ISO);

    expect(result.status).toBe('resolved');
    expect(result.exitName).toBe('ToyExitB');
    expect(result.companionScriptId).toBe('companion');
  });

  it('reports missing when no companion in the project resolves the name', () => {
    const action = makeScript({ id: 'action', filename: 'ChangeLevel.txt', rawText: TOY_ACTION_SCRIPT });
    const result = resolveExitCompanionForScript(action, [action], [], () => ISO);
    expect(result.status).toBe('missing');
    expect(result.exitName).toBe('ToyExitB');
  });

  it('reports no-exit-directive for a script with no @@ exit line', () => {
    const action = makeScript({ id: 'action', filename: 'NoExit.txt', rawText: 'level = 5\n@@\nbody' });
    const result = resolveExitCompanionForScript(action, [action], [], () => ISO);
    expect(result.status).toBe('no-exit-directive');
  });

  it('never considers the script itself as its own companion', () => {
    // A pathological case: a script that both declares an exit directive
    // AND happens to look companion-shaped shouldn't resolve against itself.
    const weird = makeScript({ id: 'weird', filename: 'exit.txt', rawText: `${TOY_ACTION_SCRIPT}\n${TOY_COMPANION_TEXT}` });
    const result = resolveExitCompanionForScript(weird, [weird], [], () => ISO);
    expect(result.status).toBe('missing');
  });
});
