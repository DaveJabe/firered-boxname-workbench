import { describe, it, expect } from 'vitest';
import type { Project, ImportedTextBlock, TextSource } from '../src/core/types.js';
import { createProject } from '../src/core/factory.js';
import { importProjectJson, exportProjectJson } from '../src/data/storage.js';
import { ISO, makeBlock } from './support.js';

function makeIdGen(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

function project(blocks: ImportedTextBlock[]): Project {
  const p = createProject(
    { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
    makeIdGen(),
    () => ISO,
  );
  p.importedBlocks.push(...blocks);
  return p;
}

const roundTrip = (p: Project): Project => importProjectJson(exportProjectJson(p));

describe('text source provenance', () => {
  it('round-trips a manual-paste source unchanged', () => {
    const p = project([makeBlock({ rawText: 'hello', source: { type: 'manual-paste', label: 'Manual paste', importedAt: ISO, schemaVersion: 1 } })]);
    const s = roundTrip(p).importedBlocks[0];
    expect(s.source.type).toBe('manual-paste');
    expect(s.source.label).toBe('Manual paste');
    expect(s.rawText).toBe('hello');
  });

  it('round-trips a file-import source with a filename', () => {
    const p = project([makeBlock({ rawText: 'x', source: { type: 'file-import', label: 'notes.txt', importedAt: ISO, filename: 'notes.txt', schemaVersion: 1 } })]);
    const s = roundTrip(p).importedBlocks[0];
    expect(s.source.type).toBe('file-import');
    expect(s.source.filename).toBe('notes.txt');
  });

  it('recognizes the reserved external-local-tool source type', () => {
    const p = project([makeBlock({ rawText: 'x', source: { type: 'external-local-tool', label: 'reserved', importedAt: ISO, schemaVersion: 1 } })]);
    expect(roundTrip(p).importedBlocks[0].source.type).toBe('external-local-tool');
  });

  it('migrates a legacy block (no source, with filename) to a file-import source', () => {
    const obj = JSON.parse(exportProjectJson(project([makeBlock({ rawText: 'x' })])));
    delete obj.importedBlocks[0].source;
    obj.importedBlocks[0].importedAt = ISO;
    obj.importedBlocks[0].sourceFilename = 'legacy.txt';
    const b = importProjectJson(JSON.stringify(obj)).importedBlocks[0];
    expect(b.source.type).toBe('file-import');
    expect(b.source.filename).toBe('legacy.txt');
    expect(b.source.importedAt).toBe(ISO);
    expect(b.rawText).toBe('x');
  });

  it('migrates a legacy block without a filename to a manual-paste source', () => {
    const obj = JSON.parse(exportProjectJson(project([makeBlock({ rawText: 'y' })])));
    delete obj.importedBlocks[0].source;
    obj.importedBlocks[0].importedAt = ISO;
    const b = importProjectJson(JSON.stringify(obj)).importedBlocks[0];
    expect(b.source.type).toBe('manual-paste');
    expect(b.source.label).toBe('Imported text');
  });

  it('rejects an unknown source type', () => {
    const obj = JSON.parse(exportProjectJson(project([makeBlock({ rawText: 'x' })])));
    obj.importedBlocks[0].source.type = 'nope';
    expect(() => importProjectJson(JSON.stringify(obj))).toThrow(/source\.type/);
  });

  it('keeps rawText verbatim while a source is attached', () => {
    const tricky = 'a\tb \n★ "q" & <x>\u{1F600}';
    const p = project([makeBlock({ rawText: tricky, source: { type: 'file-import', label: 'f.txt', importedAt: ISO, filename: 'f.txt', schemaVersion: 1 } })]);
    expect(roundTrip(p).importedBlocks[0].rawText).toBe(tricky);
  });
});

describe('external-local-tool provenance', () => {
  it('round-trips the documentation fields and leaves rawText unchanged', () => {
    const src: TextSource = {
      type: 'external-local-tool', label: 'Ext', importedAt: ISO, schemaVersion: 1,
      toolName: 'ToolX', toolVersion: '1.2.3', toolUrl: 'https://example.invalid/tool',
      invocationNotes: 'ran with options (documentation only)',
    };
    const b = roundTrip(project([makeBlock({ rawText: 'out', source: src })])).importedBlocks[0];
    expect(b.source.type).toBe('external-local-tool');
    expect(b.source.toolName).toBe('ToolX');
    expect(b.source.toolVersion).toBe('1.2.3');
    expect(b.source.toolUrl).toBe('https://example.invalid/tool');
    expect(b.source.invocationNotes).toContain('documentation only');
    expect(b.rawText).toBe('out');
  });

  it('rejects a non-string toolName', () => {
    const obj = JSON.parse(exportProjectJson(project([makeBlock({ rawText: 'x', source: { type: 'external-local-tool', label: 'e', importedAt: ISO, schemaVersion: 1 } })])));
    obj.importedBlocks[0].source.toolName = 123;
    expect(() => importProjectJson(JSON.stringify(obj))).toThrow(/source\.toolName/);
  });

  it('rejects an over-long toolUrl', () => {
    const obj = JSON.parse(exportProjectJson(project([makeBlock({ rawText: 'x', source: { type: 'external-local-tool', label: 'e', importedAt: ISO, schemaVersion: 1 } })])));
    obj.importedBlocks[0].source.toolUrl = 'a'.repeat(5000);
    expect(() => importProjectJson(JSON.stringify(obj))).toThrow(/source\.toolUrl/);
  });
});
