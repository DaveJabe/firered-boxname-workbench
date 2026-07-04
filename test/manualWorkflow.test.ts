import { describe, it, expect } from 'vitest';
import type { ImportedTextBlock } from '../src/core/types.js';
import { createProject } from '../src/core/factory.js';
import { importProjectJson, exportProjectJson } from '../src/data/storage.js';
import { SOURCE_SCHEMA_VERSION } from '../src/core/sources.js';
import { ISO, makeBlock } from './support.js';

function makeIdGen(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

// A harmless, invented placeholder "generator output" for manual verification
// only — not a real box name, item, address, offset, route step, or opcode.
// See test/generatorOutputParser.test.ts for parsing/presenter coverage.
const FAKE_PASTED_OUTPUT = 'Box 1: PLACEHLD-A   [PLACEHLD-A]\nBox 2: PLACEHLD-B   [PLACEHLD-B]';

describe('manual paste-back: rawText saved verbatim with provenance', () => {
  function pasteBackBlock(): ImportedTextBlock {
    return makeBlock({
      id: 'pb1',
      title: 'Toy schema — manual generator output',
      categoryLabel: 'Manual generator output',
      rawText: FAKE_PASTED_OUTPUT,
      source: {
        type: 'external-local-tool',
        label: 'Manual external generator output',
        importedAt: ISO,
        schemaVersion: SOURCE_SCHEMA_VERSION,
        actionId: 'toy-schema',
        actionLabel: 'Toy schema',
        generatedBy: 'manual external generator',
        scriptId: 'script-1',
        filename: 'toy.txt',
      },
    });
  }

  it('round-trips rawText and all provenance fields exactly through export/import', () => {
    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    project.importedBlocks.push(pasteBackBlock());

    const roundTripped = importProjectJson(exportProjectJson(project));
    const block = roundTripped.importedBlocks[0];
    expect(block.rawText).toBe(FAKE_PASTED_OUTPUT);
    expect(block.source.type).toBe('external-local-tool');
    expect(block.source.actionId).toBe('toy-schema');
    expect(block.source.actionLabel).toBe('Toy schema');
    expect(block.source.generatedBy).toBe('manual external generator');
    expect(block.source.scriptId).toBe('script-1');
    expect(block.source.filename).toBe('toy.txt');

    // A second round trip must still be byte-for-byte identical.
    const twice = importProjectJson(exportProjectJson(roundTripped));
    expect(twice.importedBlocks[0].rawText).toBe(FAKE_PASTED_OUTPUT);
  });

  it('preserves rawText exactly even with tricky whitespace (tabs, blank lines, mixed newlines)', () => {
    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    project.importedBlocks.push(pasteBackBlock());
    const json = exportProjectJson(project);
    expect(JSON.parse(json).importedBlocks[0].rawText).toBe(FAKE_PASTED_OUTPUT);
  });
});

describe('filled-script block: provenance saved', () => {
  it('round-trips filled-script provenance fields through export/import', () => {
    const project = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    const filledText = 'widgetCount = 42\nwidgetLabel = "NEWVAL"\n@@\nbody';
    project.importedBlocks.push(
      makeBlock({
        id: 'fs1',
        title: 'Toy schema — filled script',
        categoryLabel: 'Filled script',
        rawText: filledText,
        source: {
          type: 'filled-script',
          label: 'Filled script (this app)',
          importedAt: ISO,
          schemaVersion: SOURCE_SCHEMA_VERSION,
          actionId: 'toy-schema',
          actionLabel: 'Toy schema',
          generatedBy: 'manual script filler',
          scriptId: 'script-1',
          filename: 'toy.txt',
        },
      }),
    );

    const roundTripped = importProjectJson(exportProjectJson(project));
    const block = roundTripped.importedBlocks[0];
    expect(block.rawText).toBe(filledText);
    expect(block.source.type).toBe('filled-script');
    expect(block.source.generatedBy).toBe('manual script filler');
    expect(block.source.scriptId).toBe('script-1');
  });

  it('rejects an unknown source type but accepts filled-script and external-local-tool', () => {
    const obj = {
      schemaVersion: 1,
      id: 'p1',
      metadata: {
        schemaVersion: 1, game: 'FireRed', revisionLabel: 'Rev 1', languageLabel: '',
        projectTitle: '', mode: 'documentation', createdAt: ISO, updatedAt: ISO,
      },
      checklist: [],
      notes: [],
      importedBlocks: [
        {
          id: 'b1', title: 't', categoryLabel: '', revisionLabel: '', rawText: 'x', notes: '',
          source: { type: 'filled-script', label: 'l', importedAt: ISO, schemaVersion: 1 },
        },
      ],
      settings: { maxLineLength: 30, countMode: 'codepoints' },
      latestValidation: null,
      projectStatus: 'draft',
      scripts: [],
      curatedSchemas: [],
    };
    expect(importProjectJson(JSON.stringify(obj)).importedBlocks[0].source.type).toBe('filled-script');
  });
});
