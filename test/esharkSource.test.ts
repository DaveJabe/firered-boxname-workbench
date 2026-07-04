import { describe, it, expect } from 'vitest';
import {
  detectFilesFrlgRoot,
  isUnderFilesFrlgRoot,
  displayRootPath,
  selectEsharkFiles,
  parseEsharkListEntries,
  lookupEsharkListEntry,
  SOURCE_PROFILE_INFO,
  ESHARK_SOURCE_PROFILES,
} from '../src/core/esharkSource.js';
import type { CollectedFile } from '../src/core/scriptPack.js';

// Harmless, invented toy fixtures — no real script, item ID, address,
// offset, route step, opcode, or payload byte.
const TOY_SCRIPT = 'widgetCount = 5\n@@\nPretendBodyLine';

describe('detectFilesFrlgRoot', () => {
  it('detects a direct files_frlg folder selection', () => {
    const paths = ['files_frlg/misc/Example.txt', 'files_frlg/pkmn/TeachAnyMove.txt', 'files_frlg/list.json'];
    expect(detectFilesFrlgRoot(paths)).toBe('files_frlg/');
  });

  it('detects a nested files_frlg folder inside a repo-root/offline-app selection', () => {
    const paths = [
      'EmeraldACE_web-main/files_frlg/misc/Example.txt',
      'EmeraldACE_web-main/files_frlg/pkmn/TeachAnyMove.txt',
      'EmeraldACE_web-main/files_frlg/list.json',
      'EmeraldACE_web-main/README.md',
    ];
    expect(detectFilesFrlgRoot(paths)).toBe('EmeraldACE_web-main/files_frlg/');
  });

  it('detects an already-nested path containing files_frlg/ at arbitrary depth', () => {
    const paths = ['some/deeper/clone/path/files_frlg/rng/ExampleRng.txt'];
    expect(detectFilesFrlgRoot(paths)).toBe('some/deeper/clone/path/files_frlg/');
  });

  it('returns undefined when no path contains a files_frlg segment', () => {
    const paths = ['some-folder/misc/Example.txt', 'some-folder/readme.txt'];
    expect(detectFilesFrlgRoot(paths)).toBeUndefined();
  });

  it('is case-insensitive on the files_frlg segment name', () => {
    expect(detectFilesFrlgRoot(['Files_FRLG/misc/Example.txt'])).toBe('Files_FRLG/');
  });
});

describe('isUnderFilesFrlgRoot / displayRootPath', () => {
  it('matches only paths under the given root', () => {
    const root = 'EmeraldACE_web-main/files_frlg/';
    expect(isUnderFilesFrlgRoot('EmeraldACE_web-main/files_frlg/misc/a.txt', root)).toBe(true);
    expect(isUnderFilesFrlgRoot('EmeraldACE_web-main/README.md', root)).toBe(false);
  });

  it('strips the trailing slash for display/storage', () => {
    expect(displayRootPath('EmeraldACE_web-main/files_frlg/')).toBe('EmeraldACE_web-main/files_frlg');
    expect(displayRootPath('files_frlg/')).toBe('files_frlg');
  });
});

function makeNestedSelection(): CollectedFile[] {
  return [
    { relativePath: 'EmeraldACE_web-main/files_frlg/misc/Example.txt', text: TOY_SCRIPT },
    { relativePath: 'EmeraldACE_web-main/files_frlg/pkmn/TeachAnyMove.txt', text: TOY_SCRIPT },
    { relativePath: 'EmeraldACE_web-main/files_frlg/rng/ExampleRng.txt', text: TOY_SCRIPT },
    { relativePath: 'EmeraldACE_web-main/files_frlg/list.json', text: '{"Example.txt":"Example display name"}' },
    { relativePath: 'EmeraldACE_web-main/README.md', text: 'not a script' },
    { relativePath: 'EmeraldACE_web-main/other-tool/unrelated.txt', text: 'unrelated script, outside files_frlg' },
  ];
}

describe('selectEsharkFiles', () => {
  it('imports only files under the detected files_frlg root, dropping everything else', () => {
    const selection = selectEsharkFiles(makeNestedSelection())!;
    expect(selection.root).toBe('EmeraldACE_web-main/files_frlg/');
    const relativePaths = selection.files.map((f) => f.relativePath).sort();
    expect(relativePaths).toEqual([
      'EmeraldACE_web-main/files_frlg/list.json',
      'EmeraldACE_web-main/files_frlg/misc/Example.txt',
      'EmeraldACE_web-main/files_frlg/pkmn/TeachAnyMove.txt',
      'EmeraldACE_web-main/files_frlg/rng/ExampleRng.txt',
    ]);
    expect(relativePaths.some((p) => p.includes('other-tool'))).toBe(false);
    expect(relativePaths.some((p) => p.includes('README'))).toBe(false);
  });

  it('preserves rawText exactly for files kept under the root', () => {
    const selection = selectEsharkFiles(makeNestedSelection())!;
    const example = selection.files.find((f) => f.relativePath.endsWith('Example.txt'))!;
    expect(example.text).toBe(TOY_SCRIPT);
  });

  it('returns undefined when the selection has no files_frlg folder at all', () => {
    const selection = selectEsharkFiles([{ relativePath: 'some-folder/misc/Example.txt', text: TOY_SCRIPT }]);
    expect(selection).toBeUndefined();
  });

  it('never introduces an absolute path — every returned relativePath stays relative', () => {
    const selection = selectEsharkFiles(makeNestedSelection())!;
    for (const f of selection.files) {
      expect(f.relativePath.startsWith('/')).toBe(false);
      expect(/^[a-zA-Z]:/.test(f.relativePath)).toBe(false);
    }
    expect(selection.root.startsWith('/')).toBe(false);
  });
});

describe('parseEsharkListEntries', () => {
  it('parses a flat filename -> display name map', () => {
    const entries = parseEsharkListEntries({ 'Example.txt': 'Example display name' });
    expect(lookupEsharkListEntry(entries, 'Example.txt')?.displayName).toBe('Example display name');
  });

  it('parses a filename -> {name, category} object map', () => {
    const entries = parseEsharkListEntries({ 'teachanymove.txt': { name: 'Teach any move', category: 'pkmn' } });
    const entry = lookupEsharkListEntry(entries, 'TeachAnyMove.txt');
    expect(entry?.displayName).toBe('Teach any move');
    expect(entry?.category).toBe('pkmn');
  });

  it('parses an array of {file, name} entries', () => {
    const entries = parseEsharkListEntries([{ file: 'example.txt', name: 'Example display name' }]);
    expect(lookupEsharkListEntry(entries, 'Example.txt')?.displayName).toBe('Example display name');
  });

  it('looks up by filename with or without the .txt extension', () => {
    const entries = parseEsharkListEntries({ example: 'Example display name' });
    expect(lookupEsharkListEntry(entries, 'Example.txt')?.displayName).toBe('Example display name');
  });

  it('is non-fatal and yields no entries for an unrecognized shape', () => {
    expect(parseEsharkListEntries('just a string').size).toBe(0);
    expect(parseEsharkListEntries(42).size).toBe(0);
    expect(parseEsharkListEntries(null).size).toBe(0);
    expect(parseEsharkListEntries(undefined).size).toBe(0);
  });

  it('never executes or requires anything from the manifest — plain data only', () => {
    const entries = parseEsharkListEntries({ 'a.txt': { name: 'A', extra: 'ignored, not executed' } });
    expect(lookupEsharkListEntry(entries, 'a.txt')).toEqual({ displayName: 'A' });
  });
});

describe('SOURCE_PROFILE_INFO', () => {
  it('has a plain-language label and description for every profile, including generic', () => {
    for (const profile of ['generic', ...ESHARK_SOURCE_PROFILES] as const) {
      expect(SOURCE_PROFILE_INFO[profile].label.length).toBeGreaterThan(0);
      expect(SOURCE_PROFILE_INFO[profile].description.length).toBeGreaterThan(0);
    }
  });
});
