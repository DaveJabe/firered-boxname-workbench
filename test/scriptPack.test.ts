import { describe, it, expect } from 'vitest';
import type { CuratedActionSchema, ScriptFile } from '../src/core/types.js';
import { scanScript } from '../src/core/scriptScanner.js';
import {
  collectScriptPackFiles,
  isRelevantPackFile,
  detectSourceFolderName,
  summarizeBatchScan,
  buildScriptPackRows,
  filterScriptRows,
  searchScriptRows,
  type CollectedFile,
} from '../src/core/scriptPack.js';

const ISO = '2026-01-01T00:00:00.000Z';

// Harmless, invented toy fixtures — no real script, item ID, address,
// offset, route step, opcode, or payload byte.
const TOY_SCRIPT_WITH_CANDIDATES = [
  '; toy header',
  'widgetCount = 5 ; example count',
  '@@',
  'PretendBodyLine',
].join('\n');

const TOY_SCRIPT_NO_CANDIDATES = ['; toy header, no assignments before the marker', '@@', 'PretendBodyLine'].join('\n');

const TOY_SCRIPT_INTERNAL_ONLY = [
  ';Do not modify these values',
  'helperValue = (1 + 2)',
  '@@',
  'PretendBodyLine',
].join('\n');

function makeSimulatedFolder(): CollectedFile[] {
  return [
    { relativePath: 'MyPack/files_frlg/misc/toy-a.txt', text: TOY_SCRIPT_WITH_CANDIDATES },
    { relativePath: 'MyPack/files_frlg/pkmn/toy-b.txt', text: TOY_SCRIPT_NO_CANDIDATES },
    { relativePath: 'MyPack/files_frlg/rng/toy-c.txt', text: TOY_SCRIPT_INTERNAL_ONLY },
    { relativePath: 'MyPack/list.json', text: JSON.stringify({ note: 'toy manifest' }) },
    { relativePath: 'MyPack/readme.png', text: 'not really an image, just a toy fixture' },
  ];
}

describe('isRelevantPackFile', () => {
  it('recognizes .txt scripts and list.json, case-insensitively', () => {
    expect(isRelevantPackFile('a/b/Script.TXT')).toBe(true);
    expect(isRelevantPackFile('a/b/LIST.JSON')).toBe(true);
  });

  it('ignores everything else', () => {
    expect(isRelevantPackFile('a/b/readme.png')).toBe(false);
    expect(isRelevantPackFile('a/b/notes.md')).toBe(false);
  });
});

describe('collectScriptPackFiles', () => {
  it('collects every .txt file from a simulated directory import, recursively by relative path', () => {
    const result = collectScriptPackFiles(makeSimulatedFolder());
    expect(result.scripts.map((s) => s.filename).sort()).toEqual(['toy-a.txt', 'toy-b.txt', 'toy-c.txt']);
  });

  it('preserves each script\'s relative path', () => {
    const result = collectScriptPackFiles(makeSimulatedFolder());
    const a = result.scripts.find((s) => s.filename === 'toy-a.txt')!;
    expect(a.relativePath).toBe('MyPack/files_frlg/misc/toy-a.txt');
  });

  it('preserves rawText exactly, byte for byte', () => {
    const result = collectScriptPackFiles(makeSimulatedFolder());
    const a = result.scripts.find((s) => s.filename === 'toy-a.txt')!;
    expect(a.rawText).toBe(TOY_SCRIPT_WITH_CANDIDATES);
  });

  it('tags scripts under recognized common subfolders with a category', () => {
    const result = collectScriptPackFiles(makeSimulatedFolder());
    expect(result.scripts.find((s) => s.filename === 'toy-a.txt')?.category).toBe('misc');
    expect(result.scripts.find((s) => s.filename === 'toy-b.txt')?.category).toBe('pkmn');
    expect(result.scripts.find((s) => s.filename === 'toy-c.txt')?.category).toBe('rng');
  });

  it('does not require any particular folder layout — uncategorized paths still collect fine', () => {
    const result = collectScriptPackFiles([{ relativePath: 'flat-script.txt', text: 'x = 1\n@@\nbody' }]);
    expect(result.scripts).toHaveLength(1);
    expect(result.scripts[0].category).toBeUndefined();
  });

  it('parses a recognized list.json metadata file, if present', () => {
    const result = collectScriptPackFiles(makeSimulatedFolder());
    expect(result.metadata).toEqual({ note: 'toy manifest' });
  });

  it('ignores non-script, non-metadata files, counting them but not collecting them', () => {
    const result = collectScriptPackFiles(makeSimulatedFolder());
    expect(result.ignoredCount).toBe(1);
  });

  it('does not fail when list.json is malformed — just leaves metadata undefined', () => {
    const result = collectScriptPackFiles([{ relativePath: 'list.json', text: 'not valid json {' }]);
    expect(result.metadata).toBeUndefined();
    expect(result.scripts).toEqual([]);
  });
});

describe('detectSourceFolderName', () => {
  it('returns the top-level folder name from a nested relative path', () => {
    expect(detectSourceFolderName(makeSimulatedFolder())).toBe('MyPack');
  });

  it('returns undefined when no file has a nested path', () => {
    expect(detectSourceFolderName([{ relativePath: 'flat.txt', text: 'x' }])).toBeUndefined();
  });
});

function makeScript(over: Partial<ScriptFile> & { rawText: string }): ScriptFile {
  return { id: 's1', filename: 'toy.txt', importedAt: ISO, ...over };
}

describe('summarizeBatchScan', () => {
  it('counts totals, scanned, and candidate/directive categories correctly across a batch', () => {
    const withCandidates = makeScript({ id: 'a', rawText: TOY_SCRIPT_WITH_CANDIDATES });
    withCandidates.lastScan = scanScript(withCandidates, () => ISO);
    const noCandidates = makeScript({ id: 'b', rawText: TOY_SCRIPT_NO_CANDIDATES });
    noCandidates.lastScan = scanScript(noCandidates, () => ISO);
    const internalOnly = makeScript({ id: 'c', rawText: TOY_SCRIPT_INTERNAL_ONLY });
    internalOnly.lastScan = scanScript(internalOnly, () => ISO);
    const unscanned = makeScript({ id: 'd', rawText: TOY_SCRIPT_WITH_CANDIDATES });

    const summary = summarizeBatchScan([withCandidates, noCandidates, internalOnly, unscanned]);
    expect(summary.totalScripts).toBe(4);
    expect(summary.scannedScripts).toBe(3);
    expect(summary.scriptsWithUserFacingCandidates).toBe(1); // only withCandidates has a non-internal candidate
    expect(summary.scriptsWithNoCandidates).toBe(1); // noCandidates
    expect(summary.scriptsWithInternalCandidates).toBe(1); // internalOnly
  });

  it('detects scripts with directives separately from candidates', () => {
    const withDirective = makeScript({
      id: 'a',
      rawText: ['@ title = "Toy title"', '@@', 'x = 1', '@@', 'body'].join('\n'),
    });
    withDirective.lastScan = scanScript(withDirective, () => ISO);
    const summary = summarizeBatchScan([withDirective]);
    expect(summary.scriptsWithDirectives).toBe(1);
  });
});

function makeSchema(over: Partial<CuratedActionSchema> = {}): CuratedActionSchema {
  return {
    id: 'schema-1', label: 'Toy schema', description: '', supportedRevisionLabels: [], status: 'draft',
    fields: [], ...over,
  };
}

describe('buildScriptPackRows', () => {
  it('builds one row per script with candidate counts and schema-attached status', () => {
    const withCandidates = makeScript({ id: 'a', filename: 'a.txt', rawText: TOY_SCRIPT_WITH_CANDIDATES, relativePath: 'Pack/a.txt' });
    withCandidates.lastScan = scanScript(withCandidates, () => ISO);
    const internalOnly = makeScript({ id: 'b', filename: 'b.txt', rawText: TOY_SCRIPT_INTERNAL_ONLY });
    internalOnly.lastScan = scanScript(internalOnly, () => ISO);

    const schemas = [makeSchema({ scriptId: 'a' })];
    const rows = buildScriptPackRows([withCandidates, internalOnly], schemas);

    expect(rows).toHaveLength(2);
    const rowA = rows.find((r) => r.scriptId === 'a')!;
    expect(rowA.relativePath).toBe('Pack/a.txt');
    expect(rowA.candidateCount).toBe(1);
    expect(rowA.userFacingCandidateCount).toBe(1);
    expect(rowA.internalCandidateCount).toBe(0);
    expect(rowA.hasSchema).toBe(true);

    const rowB = rows.find((r) => r.scriptId === 'b')!;
    expect(rowB.userFacingCandidateCount).toBe(0);
    expect(rowB.internalCandidateCount).toBe(1);
    expect(rowB.hasSchema).toBe(false);
  });
});

describe('filterScriptRows / searchScriptRows', () => {
  const rows = buildScriptPackRows(
    [
      (() => { const s = makeScript({ id: 'a', filename: 'toy-alpha.txt', rawText: TOY_SCRIPT_WITH_CANDIDATES }); s.lastScan = scanScript(s, () => ISO); return s; })(),
      (() => { const s = makeScript({ id: 'b', filename: 'toy-beta.txt', rawText: TOY_SCRIPT_NO_CANDIDATES }); s.lastScan = scanScript(s, () => ISO); return s; })(),
    ],
    [makeSchema({ scriptId: 'a' })],
  );

  it('"all" returns every row unchanged', () => {
    expect(filterScriptRows(rows, 'all')).toHaveLength(2);
  });

  it('"has-candidates" keeps only rows with candidateCount > 0', () => {
    expect(filterScriptRows(rows, 'has-candidates').map((r) => r.scriptId)).toEqual(['a']);
  });

  it('"needs-schema" keeps only rows without an attached schema', () => {
    expect(filterScriptRows(rows, 'needs-schema').map((r) => r.scriptId)).toEqual(['b']);
  });

  it('"runnable" keeps only rows with an attached schema', () => {
    expect(filterScriptRows(rows, 'runnable').map((r) => r.scriptId)).toEqual(['a']);
  });

  it('searches by filename, case-insensitively', () => {
    expect(searchScriptRows(rows, 'ALPHA').map((r) => r.scriptId)).toEqual(['a']);
  });

  it('an empty search query returns every row', () => {
    expect(searchScriptRows(rows, '   ')).toHaveLength(2);
  });
});
