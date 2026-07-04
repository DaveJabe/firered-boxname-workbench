import { describe, it, expect } from 'vitest';
import { createProject } from '../src/core/factory.js';
import { importProjectJson, exportProjectJson } from '../src/data/storage.js';
import { UNKNOWN_TARGET } from '../src/core/gameTarget.js';

const ISO = '2026-01-01T00:00:00.000Z';

function makeIdGen(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

function makeProject() {
  return createProject(
    { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
    makeIdGen(),
    () => ISO,
  );
}

// Harmless, invented toy fixture.
const TOY_SCRIPT = ['; sample header for a toy fixture', 'widgetCount = 5', '@@', 'PretendBodyLine'].join('\n');

describe('E-Sh4rk source metadata on ScriptPack/ScriptFile', () => {
  it('round-trips sourceProfile, detectedRootPath, hasListJson, and categoriesDetected on a script pack', () => {
    const project = makeProject();
    project.scripts.push({
      id: 'sc1',
      filename: 'Example.txt',
      rawText: TOY_SCRIPT,
      importedAt: ISO,
      relativePath: 'EmeraldACE_web-main/files_frlg/misc/Example.txt',
      packId: 'pack1',
      category: 'misc',
      displayName: 'Example display name',
    });
    project.scriptPacks.push({
      id: 'pack1',
      name: 'EmeraldACE_web-main',
      importedAt: ISO,
      defaultTarget: UNKNOWN_TARGET,
      scriptIds: ['sc1'],
      sourceProfile: 'eshark-offline-app',
      detectedRootPath: 'EmeraldACE_web-main/files_frlg',
      hasListJson: true,
      categoriesDetected: ['misc'],
    });

    const migrated = importProjectJson(exportProjectJson(project));
    expect(migrated.scriptPacks[0].sourceProfile).toBe('eshark-offline-app');
    expect(migrated.scriptPacks[0].detectedRootPath).toBe('EmeraldACE_web-main/files_frlg');
    expect(migrated.scriptPacks[0].hasListJson).toBe(true);
    expect(migrated.scriptPacks[0].categoriesDetected).toEqual(['misc']);
    expect(migrated.scripts[0].category).toBe('misc');
    expect(migrated.scripts[0].displayName).toBe('Example display name');
  });

  it('never stores an absolute filesystem path in detectedRootPath', () => {
    const project = makeProject();
    project.scriptPacks.push({
      id: 'pack1', name: 'Pack', importedAt: ISO, defaultTarget: UNKNOWN_TARGET, scriptIds: [],
      sourceProfile: 'eshark-files-frlg', detectedRootPath: 'files_frlg',
    });
    const migrated = importProjectJson(exportProjectJson(project));
    expect(migrated.scriptPacks[0].detectedRootPath?.startsWith('/')).toBe(false);
    expect(/^[a-zA-Z]:/.test(migrated.scriptPacks[0].detectedRootPath ?? '')).toBe(false);
  });

  it('still imports a project exported before these E-Sh4rk fields existed', () => {
    const project = makeProject();
    project.scripts.push({ id: 'sc1', filename: 'toy.txt', rawText: TOY_SCRIPT, importedAt: ISO });
    project.scriptPacks.push({
      id: 'pack1', name: 'Old pack', importedAt: ISO, defaultTarget: UNKNOWN_TARGET, scriptIds: ['sc1'],
    });
    const obj = JSON.parse(exportProjectJson(project));
    // Simulate a genuinely pre-E-Sh4rk-source export: these fields never existed.
    delete obj.scripts[0].category;
    delete obj.scripts[0].displayName;
    delete obj.scriptPacks[0].sourceProfile;
    delete obj.scriptPacks[0].detectedRootPath;
    delete obj.scriptPacks[0].hasListJson;
    delete obj.scriptPacks[0].categoriesDetected;

    const migrated = importProjectJson(JSON.stringify(obj));
    expect(migrated.scripts).toHaveLength(1);
    expect(migrated.scriptPacks).toHaveLength(1);
    expect(migrated.scriptPacks[0].sourceProfile).toBeUndefined();
    expect(migrated.scripts[0].category).toBeUndefined();
  });

  it('rejects an unrecognized category value rather than silently accepting it', () => {
    const project = makeProject();
    project.scripts.push({ id: 'sc1', filename: 'toy.txt', rawText: TOY_SCRIPT, importedAt: ISO });
    const obj = JSON.parse(exportProjectJson(project));
    obj.scripts[0].category = 'not-a-real-category';
    expect(() => importProjectJson(JSON.stringify(obj))).toThrow();
  });

  it('never changes rawText while migrating E-Sh4rk-imported scripts', () => {
    const project = makeProject();
    project.scripts.push({
      id: 'sc1', filename: 'toy.txt', rawText: TOY_SCRIPT, importedAt: ISO, category: 'rng',
    });
    const migrated = importProjectJson(exportProjectJson(project));
    expect(migrated.scripts[0].rawText).toBe(TOY_SCRIPT);
  });
});
