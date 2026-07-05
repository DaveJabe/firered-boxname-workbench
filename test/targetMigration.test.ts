import { describe, it, expect } from 'vitest';
import { createProject } from '../src/core/factory.js';
import { importProjectJson, exportProjectJson } from '../src/data/storage.js';
import { UNKNOWN_TARGET, isUnknownTarget } from '../src/core/gameTarget.js';
import { effectiveScriptTarget } from '../src/core/scriptPack.js';

const ISO = '2026-01-01T00:00:00.000Z';

function makeIdGen(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

// A harmless, invented toy fixture — no real script, item ID, address,
// offset, route step, opcode, or payload byte.
const TOY_SCRIPT = [
  '; sample header for a toy fixture',
  'widgetCount = 5 ; example count',
  '@@',
  '; body text only, never scanned as code',
  'PretendBodyLine',
].join('\n');

function makeProject() {
  return createProject(
    { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
    makeIdGen(),
    () => ISO,
  );
}

describe('importing an old project export that predates the target model', () => {
  it('still imports successfully when scripts/scriptPacks/curatedSchemas have no target fields at all', () => {
    const project = makeProject();
    project.scripts.push({ id: 'sc1', filename: 'toy.txt', rawText: TOY_SCRIPT, importedAt: ISO });
    project.scriptPacks.push({ id: 'pack1', name: 'Old pack', importedAt: ISO, defaultTarget: UNKNOWN_TARGET, scriptIds: ['sc1'] });
    project.curatedSchemas.push({
      id: 'old-schema', label: 'Old schema', description: '', target: UNKNOWN_TARGET,
      supportedRevisionLabels: [], status: 'draft', fields: [], scriptId: 'sc1', scriptFilename: 'toy.txt',
    });

    const obj = JSON.parse(exportProjectJson(project));
    // Simulate a genuinely pre-target-model export: strip every new field.
    delete obj.scripts[0].targetOverride;
    delete obj.scriptPacks[0].defaultTarget;
    delete obj.scriptPacks[0].targetNotes;
    delete obj.curatedSchemas[0].target;
    delete obj.curatedSchemas[0].actionKey;

    const migrated = importProjectJson(JSON.stringify(obj));
    expect(migrated.scripts).toHaveLength(1);
    expect(migrated.scriptPacks).toHaveLength(1);
    expect(migrated.curatedSchemas).toHaveLength(1);
  });

  it('migrates a script pack missing defaultTarget to Unknown/Mixed', () => {
    const project = makeProject();
    project.scriptPacks.push({ id: 'pack1', name: 'Old pack', importedAt: ISO, defaultTarget: UNKNOWN_TARGET, scriptIds: [] });
    const obj = JSON.parse(exportProjectJson(project));
    delete obj.scriptPacks[0].defaultTarget;
    const migrated = importProjectJson(JSON.stringify(obj));
    expect(migrated.scriptPacks[0].defaultTarget).toEqual(UNKNOWN_TARGET);
    expect(isUnknownTarget(migrated.scriptPacks[0].defaultTarget)).toBe(true);
  });

  it('migrates a curated schema missing target to Unknown/Mixed, leaving its status untouched', () => {
    const project = makeProject();
    project.curatedSchemas.push({
      id: 'old-schema', label: 'Old schema', description: '', target: UNKNOWN_TARGET,
      supportedRevisionLabels: [], status: 'reviewed', fields: [],
    });
    const obj = JSON.parse(exportProjectJson(project));
    delete obj.curatedSchemas[0].target;
    const migrated = importProjectJson(JSON.stringify(obj));
    expect(migrated.curatedSchemas[0].target).toEqual(UNKNOWN_TARGET);
    // Migration is non-destructive: it does not retroactively change a
    // pre-existing schema's review status just because it predates the
    // target model — that's only enforced going forward, by the schema
    // builder's own validation when a human edits and re-saves it.
    expect(migrated.curatedSchemas[0].status).toBe('reviewed');
  });

  it('leaves a script with no targetOverride effectively Unknown/Mixed when it has no pack either', () => {
    const project = makeProject();
    project.scripts.push({ id: 'sc1', filename: 'toy.txt', rawText: TOY_SCRIPT, importedAt: ISO });
    const obj = JSON.parse(exportProjectJson(project));
    delete obj.scripts[0].targetOverride;
    const migrated = importProjectJson(JSON.stringify(obj));
    expect(migrated.scripts[0].targetOverride).toBeUndefined();
    expect(effectiveScriptTarget(migrated.scripts[0], undefined)).toEqual(UNKNOWN_TARGET);
  });

  it('never changes rawText while migrating', () => {
    const project = makeProject();
    project.scripts.push({ id: 'sc1', filename: 'toy.txt', rawText: TOY_SCRIPT, importedAt: ISO });
    const obj = JSON.parse(exportProjectJson(project));
    delete obj.scripts[0].targetOverride;
    const migrated = importProjectJson(JSON.stringify(obj));
    expect(migrated.scripts[0].rawText).toBe(TOY_SCRIPT);

    // A second round trip must still be byte-for-byte identical.
    const twice = importProjectJson(exportProjectJson(migrated));
    expect(twice.scripts[0].rawText).toBe(TOY_SCRIPT);
  });

  it('defaults scriptPacks/curatedSchemas/scripts to empty arrays for a genuinely ancient export missing those top-level fields entirely', () => {
    const project = makeProject();
    const obj = JSON.parse(exportProjectJson(project));
    delete obj.scripts;
    delete obj.scriptPacks;
    delete obj.curatedSchemas;
    const migrated = importProjectJson(JSON.stringify(obj));
    expect(migrated.scripts).toEqual([]);
    expect(migrated.scriptPacks).toEqual([]);
    expect(migrated.curatedSchemas).toEqual([]);
  });
});
