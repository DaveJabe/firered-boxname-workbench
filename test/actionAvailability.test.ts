import { describe, it, expect } from 'vitest';
import type { CuratedActionSchema, GameTarget, Project, ScriptFile } from '../src/core/types.js';
import { createProject } from '../src/core/factory.js';
import {
  summarizeActionAvailabilityForTarget,
  targetsWithReadyActions,
  buildActionAvailabilityMatrix,
  collectKnownTargets,
} from '../src/core/actionAvailability.js';

const ISO = '2026-01-01T00:00:00.000Z';
const FR_EN_11: GameTarget = { game: 'FireRed', language: 'English', revision: '1.1' };
const FR_EN_10: GameTarget = { game: 'FireRed', language: 'English', revision: '1.0' };
const LG_EN_10: GameTarget = { game: 'LeafGreen', language: 'English', revision: '1.0' };

function makeIdGen(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

function makeProject(scripts: ScriptFile[] = [], schemas: CuratedActionSchema[] = []): Project {
  const project = createProject(
    { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
    makeIdGen(),
    () => ISO,
  );
  project.scripts = scripts;
  project.curatedSchemas = schemas;
  return project;
}

// Harmless, invented toy fixtures — no real script, address, or payload byte.
const TOY_SCRIPT = ['heldItem = 5', '@@', 'PretendBodyLine'].join('\n');
const TOY_SCRIPT_WITH_EXIT = ['@@ exit = "ToyExit"', 'heldItem = 5', '@@', 'PretendBodyLine'].join('\n');
const TOY_COMPANION_TEXT = ['@@ filename = "ToyExit"', '@@', 'toy body'].join('\n');

function makeScript(id: string, rawText: string): ScriptFile {
  return { id, filename: `${id}.txt`, rawText, importedAt: ISO };
}

function makeReadySchema(over: Partial<CuratedActionSchema> = {}): CuratedActionSchema {
  return {
    id: 'schema-a', label: 'Toy Action A', description: '', actionKey: 'toy-action-a', target: FR_EN_11,
    scriptId: 'a', scriptFilename: 'a.txt', supportedRevisionLabels: [], status: 'reviewed',
    fields: [{ key: 'heldItem', label: 'Held item', type: 'text', required: false, variableName: 'heldItem' }],
    ...over,
  };
}

describe('summarizeActionAvailabilityForTarget — counts ready actions correctly', () => {
  it('counts a reviewed, structurally-sound, no-exit-directive action as ready', () => {
    const project = makeProject([makeScript('a', TOY_SCRIPT)], [makeReadySchema()]);
    const summary = summarizeActionAvailabilityForTarget(project, FR_EN_11, () => ISO);
    expect(summary.readyActions).toBe(1);
    expect(summary.totalActions).toBe(1);
    expect(summary.missingNoReviewedVariant).toBe(0);
  });

  it('counts an action with no variant at all for this target as missingNoReviewedVariant', () => {
    const project = makeProject([makeScript('a', TOY_SCRIPT)], [makeReadySchema({ target: FR_EN_10 })]);
    const summary = summarizeActionAvailabilityForTarget(project, FR_EN_11, () => ISO);
    expect(summary.readyActions).toBe(0);
    expect(summary.missingNoReviewedVariant).toBe(1);
  });

  it('counts a draft schema as needsReview, not ready', () => {
    const project = makeProject([makeScript('a', TOY_SCRIPT)], [makeReadySchema({ status: 'draft' })]);
    const summary = summarizeActionAvailabilityForTarget(project, FR_EN_11, () => ISO);
    expect(summary.readyActions).toBe(0);
    expect(summary.needsReview).toBe(1);
  });

  it('counts a disabled schema as blockedBySchemaScriptMismatch, not missingNoReviewedVariant', () => {
    const project = makeProject([makeScript('a', TOY_SCRIPT)], [makeReadySchema({ status: 'disabled' })]);
    const summary = summarizeActionAvailabilityForTarget(project, FR_EN_11, () => ISO);
    expect(summary.blockedBySchemaScriptMismatch).toBe(1);
    expect(summary.readyActions).toBe(0);
  });
});

describe('actions blocked by missing companion are not shown as fully ready', () => {
  it('an action with an unresolved @@ exit directive counts as blockedByMissingCompanion, not readyActions', () => {
    const project = makeProject([makeScript('a', TOY_SCRIPT_WITH_EXIT)], [makeReadySchema()]);
    const summary = summarizeActionAvailabilityForTarget(project, FR_EN_11, () => ISO);
    expect(summary.blockedByMissingCompanion).toBe(1);
    expect(summary.readyActions).toBe(0);
  });

  it('the same action becomes ready once its companion is resolved', () => {
    const project = makeProject(
      [makeScript('a', TOY_SCRIPT_WITH_EXIT), makeScript('exit', TOY_COMPANION_TEXT)],
      [makeReadySchema()],
    );
    const summary = summarizeActionAvailabilityForTarget(project, FR_EN_11, () => ISO);
    expect(summary.readyActions).toBe(1);
    expect(summary.blockedByMissingCompanion).toBe(0);
  });

  it('the availability matrix reflects the same missing-companion cell, not "ready"', () => {
    const project = makeProject([makeScript('a', TOY_SCRIPT_WITH_EXIT)], [makeReadySchema()]);
    const cells = buildActionAvailabilityMatrix(project, [FR_EN_11], () => ISO);
    expect(cells).toHaveLength(1);
    expect(cells[0]!.detail.kind).toBe('missing-companion');
  });
});

describe('a target with no actions gets a well-formed availability summary (for the empty-state UI)', () => {
  it('an empty project reports zero of everything, not an error', () => {
    const project = makeProject([], []);
    const summary = summarizeActionAvailabilityForTarget(project, FR_EN_11, () => ISO);
    expect(summary).toMatchObject({
      totalActions: 0,
      readyActions: 0,
      needsReview: 0,
      blockedByMissingCompanion: 0,
      missingNoReviewedVariant: 0,
      blockedBySchemaScriptMismatch: 0,
      blockedByCatalogGaps: 0,
    });
  });

  it('targetsWithReadyActions never includes the excluded target itself', () => {
    const project = makeProject([makeScript('a', TOY_SCRIPT)], [makeReadySchema()]);
    const nearby = targetsWithReadyActions(project, FR_EN_11, () => ISO);
    expect(nearby.some((n) => n.target.game === 'FireRed' && n.target.revision === '1.1')).toBe(false);
  });

  it('targetsWithReadyActions finds a different target that does have a ready action', () => {
    const project = makeProject(
      [makeScript('a', TOY_SCRIPT), makeScript('b', TOY_SCRIPT)],
      [makeReadySchema({ id: 's1', scriptId: 'a', target: FR_EN_11 }), makeReadySchema({ id: 's2', scriptId: 'b', target: LG_EN_10, actionKey: 'toy-action-b' })],
    );
    const nearby = targetsWithReadyActions(project, FR_EN_11, () => ISO);
    expect(nearby).toHaveLength(1);
    expect(nearby[0]!.target).toEqual(LG_EN_10);
    expect(nearby[0]!.readyActions).toBe(1);
  });

  it('returns an empty list when no target anywhere has a ready action', () => {
    const project = makeProject([makeScript('a', TOY_SCRIPT)], [makeReadySchema({ status: 'draft' })]);
    expect(targetsWithReadyActions(project, FR_EN_11, () => ISO)).toEqual([]);
  });
});

describe('collectKnownTargets', () => {
  it('collects every distinct target across the whole registry, deduplicated', () => {
    const project = makeProject(
      [makeScript('a', TOY_SCRIPT), makeScript('b', TOY_SCRIPT), makeScript('c', TOY_SCRIPT)],
      [
        makeReadySchema({ id: 's1', scriptId: 'a', target: FR_EN_11 }),
        makeReadySchema({ id: 's2', scriptId: 'b', target: FR_EN_10, actionKey: 'toy-action-b' }),
        makeReadySchema({ id: 's3', scriptId: 'c', target: FR_EN_11, actionKey: 'toy-action-c' }),
      ],
    );
    const targets = collectKnownTargets(project);
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([FR_EN_11, FR_EN_10]));
  });

  it('returns an empty list for a project with no curated schemas', () => {
    expect(collectKnownTargets(makeProject([], []))).toEqual([]);
  });
});

describe('existing reviewed actions remain visible for FireRed English 1.1', () => {
  it('a FireRed/English/1.1 action that was already ready stays ready after adding this helper', () => {
    const project = makeProject([makeScript('a', TOY_SCRIPT)], [makeReadySchema({ target: FR_EN_11 })]);
    const summary = summarizeActionAvailabilityForTarget(project, FR_EN_11, () => ISO);
    expect(summary.readyActions).toBe(1);
  });
});
