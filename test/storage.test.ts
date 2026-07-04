import { describe, it, expect } from 'vitest';
import type { Project } from '../src/core/types.js';
import { createProject } from '../src/core/factory.js';
import { importProjectJson, exportProjectJson } from '../src/data/storage.js';

const ISO = '2026-01-01T00:00:00.000Z';
function makeIdGen(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

// Deliberately tricky text: newlines, tab, trailing space, punctuation that gets
// HTML-escaped elsewhere, a homoglyph, a zero-width space, and an astral emoji.
const TRICKY = 'a\tb \nстар ★ "q" & <x>​\u{1F600}';

function sampleProject(): Project {
  const p = createProject(
    { revisionLabel: 'Rev 1', languageLabel: 'English', projectTitle: 'Sample', mode: 'documentation', templateKey: 'firered-setup-review' },
    makeIdGen(),
    () => ISO,
  );
  p.importedBlocks.push({
    id: 'b1', title: 'Block', categoryLabel: 'cat', revisionLabel: 'Rev 1',
    rawText: TRICKY, notes: 'block note',
    source: { type: 'manual-paste', label: 'pasted', importedAt: ISO, schemaVersion: 1 },
  });
  p.notes.push({ id: 'n1', sectionTitle: 'Section', body: TRICKY, order: 0 });
  return p;
}

describe('deep import validation', () => {
  it('accepts a valid, exported project (round-trips to an equal object)', () => {
    const json = exportProjectJson(sampleProject());
    const imported = importProjectJson(json);
    expect(imported).toEqual(JSON.parse(json));
    expect(imported.metadata.projectTitle).toBe('Sample');
  });

  it('rejects malformed (non-JSON) text with a clear error', () => {
    expect(() => importProjectJson('not json at all')).toThrow(/not valid JSON/);
  });

  it('rejects JSON that is not our schema', () => {
    expect(() => importProjectJson('{"foo":"bar"}')).toThrow(/Invalid project/);
  });

  it('rejects a malformed nested field (metadata.revisionLabel not a string)', () => {
    const obj = JSON.parse(exportProjectJson(sampleProject()));
    obj.metadata.revisionLabel = 123;
    expect(() => importProjectJson(JSON.stringify(obj))).toThrow(/metadata\.revisionLabel/);
  });

  it('rejects a malformed nested checklist state', () => {
    const obj = JSON.parse(exportProjectJson(sampleProject()));
    obj.checklist[0].state = 'bogus-state';
    expect(() => importProjectJson(JSON.stringify(obj))).toThrow(/checklist\[0\]\.state/);
  });

  it('rejects a malformed imported block (rawText missing)', () => {
    const obj = JSON.parse(exportProjectJson(sampleProject()));
    delete obj.importedBlocks[0].rawText;
    expect(() => importProjectJson(JSON.stringify(obj))).toThrow(/importedBlocks\[0\]\.rawText/);
  });

  it('rejects a wrong game value', () => {
    const obj = JSON.parse(exportProjectJson(sampleProject()));
    obj.metadata.game = 'Emerald';
    expect(() => importProjectJson(JSON.stringify(obj))).toThrow(/metadata\.game/);
  });

  it('reads legacy routeFamilyLabel but stores/exports projectTitle', () => {
    const obj = JSON.parse(exportProjectJson(sampleProject()));
    delete obj.metadata.projectTitle;
    obj.metadata.routeFamilyLabel = 'Legacy Title';
    const imported = importProjectJson(JSON.stringify(obj));
    expect(imported.metadata.projectTitle).toBe('Legacy Title');
    const reexported = JSON.parse(exportProjectJson(imported));
    expect(reexported.metadata.projectTitle).toBe('Legacy Title');
    expect(reexported.metadata.routeFamilyLabel).toBeUndefined();
  });
});

describe('imported text is preserved verbatim', () => {
  it('keeps block rawText and note body string-for-string unchanged after import/export', () => {
    const p = sampleProject();
    const imported = importProjectJson(exportProjectJson(p));
    expect(imported.importedBlocks[0].rawText).toBe(TRICKY);
    expect(imported.notes[0].body).toBe(TRICKY);
    // A second round trip must also be identical.
    const twice = importProjectJson(exportProjectJson(imported));
    expect(twice.importedBlocks[0].rawText).toBe(TRICKY);
  });
});
