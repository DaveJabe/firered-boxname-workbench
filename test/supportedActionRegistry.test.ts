import { describe, it, expect } from 'vitest';
import type { CuratedActionSchema, Project, ScriptFile } from '../src/core/types.js';
import { createProject } from '../src/core/factory.js';
import { scanScript } from '../src/core/scriptScanner.js';
import { UNKNOWN_TARGET } from '../src/core/gameTarget.js';
import {
  buildSupportedActionRegistry,
  groupSchemasByActionKey,
  getRunnableActionsForTarget,
  getReadyVariantsForAction,
  getNeedsReviewScripts,
  getUnsupportedScripts,
} from '../src/core/supportedActionRegistry.js';

const ISO = '2026-01-01T00:00:00.000Z';
const FR_EN_10 = { game: 'FireRed', language: 'English', revision: '1.0' } as const;
const FR_EN_11 = { game: 'FireRed', language: 'English', revision: '1.1' } as const;
const LG_EN_10 = { game: 'LeafGreen', language: 'English', revision: '1.0' } as const;
const LG_EN_11 = { game: 'LeafGreen', language: 'English', revision: '1.1' } as const;

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

// Harmless, invented toy fixtures — no real script, item ID, address, opcode, or payload byte.
const TOY_SCRIPT_WITH_CANDIDATES = ['; toy header', 'widgetCount = 5 ; example count', '@@', 'PretendBodyLine'].join('\n');
const TOY_SCRIPT_NO_CANDIDATES = ['; toy header, no assignments before the marker', '@@', 'PretendBodyLine'].join('\n');

function makeScript(over: Partial<ScriptFile> & { id: string; rawText: string }): ScriptFile {
  return { filename: `${over.id}.txt`, importedAt: ISO, ...over };
}

function makeSchema(over: Partial<CuratedActionSchema> = {}): CuratedActionSchema {
  return {
    id: 'schema-1',
    label: 'Teach Pokémon Any Move',
    description: 'Teach a Pokémon any move, by NPC and move slot.',
    actionKey: 'teach-any-move',
    target: FR_EN_11,
    scriptId: 'script-1',
    scriptFilename: 'TeachAnyMove.txt',
    supportedRevisionLabels: [],
    status: 'reviewed',
    fields: [{ key: 'Move', label: 'Move', type: 'text', required: true, variableName: 'Move' }],
    ...over,
  };
}

describe('groupSchemasByActionKey', () => {
  it('groups schemas sharing the same actionKey together, in encounter order', () => {
    const project = makeProject([], [
      makeSchema({ id: 'a', actionKey: 'teach-any-move', target: FR_EN_10 }),
      makeSchema({ id: 'b', actionKey: 'teach-any-move', target: FR_EN_11 }),
      makeSchema({ id: 'c', actionKey: 'other-action', target: FR_EN_11 }),
    ]);
    const groups = groupSchemasByActionKey(project);
    expect(groups.get('teach-any-move')?.map((s) => s.id)).toEqual(['a', 'b']);
    expect(groups.get('other-action')?.map((s) => s.id)).toEqual(['c']);
  });

  it('groups a schema with no actionKey by its own id, standalone — never merged into an unrelated group', () => {
    const project = makeProject([], [
      makeSchema({ id: 'lone', actionKey: undefined }),
      makeSchema({ id: 'also-lone', actionKey: undefined }),
    ]);
    const groups = groupSchemasByActionKey(project);
    expect(groups.get('lone')?.map((s) => s.id)).toEqual(['lone']);
    expect(groups.get('also-lone')?.map((s) => s.id)).toEqual(['also-lone']);
  });
});

describe('buildSupportedActionRegistry — variant grouping', () => {
  it('groups FireRed 1.0/1.1 and LeafGreen 1.0/1.1 variants under one action, never duplicating it as separate top-level rows', () => {
    const scripts = ['a', 'b', 'c', 'd'].map((id) => makeScript({ id: `script-${id}`, rawText: TOY_SCRIPT_WITH_CANDIDATES }));
    const schemas = [
      makeSchema({ id: 'fr10', target: FR_EN_10, scriptId: 'script-a' }),
      makeSchema({ id: 'fr11', target: FR_EN_11, scriptId: 'script-b' }),
      makeSchema({ id: 'lg10', target: LG_EN_10, scriptId: 'script-c' }),
      makeSchema({ id: 'lg11', target: LG_EN_11, scriptId: 'script-d' }),
    ];
    const project = makeProject(scripts, schemas);
    const registry = buildSupportedActionRegistry(project);

    expect(registry).toHaveLength(1); // one action, not four top-level rows
    const action = registry[0]!;
    expect(action.actionKey).toBe('teach-any-move');
    expect(action.variants).toHaveLength(4);
    expect(action.variants.map((v) => v.target)).toEqual([FR_EN_10, FR_EN_11, LG_EN_10, LG_EN_11]);
    expect(action.variants.every((v) => v.status === 'ready')).toBe(true);
  });

  it('keeps unrelated actionKeys as separate SupportedAction entries', () => {
    const project = makeProject(
      [makeScript({ id: 'script-a', rawText: TOY_SCRIPT_WITH_CANDIDATES }), makeScript({ id: 'script-b', rawText: TOY_SCRIPT_WITH_CANDIDATES })],
      [
        makeSchema({ id: 'a', actionKey: 'teach-any-move', scriptId: 'script-a' }),
        makeSchema({ id: 'b', actionKey: 'warp-anywhere', scriptId: 'script-b', label: 'Warp anywhere' }),
      ],
    );
    const registry = buildSupportedActionRegistry(project);
    expect(registry.map((a) => a.actionKey).sort()).toEqual(['teach-any-move', 'warp-anywhere']);
  });

  it('a draft variant has status "needs-review"', () => {
    const project = makeProject(
      [makeScript({ id: 'script-1', rawText: TOY_SCRIPT_WITH_CANDIDATES })],
      [makeSchema({ status: 'draft' })],
    );
    expect(buildSupportedActionRegistry(project)[0]!.variants[0]!.status).toBe('needs-review');
  });

  it('a disabled variant has status "disabled"', () => {
    const project = makeProject(
      [makeScript({ id: 'script-1', rawText: TOY_SCRIPT_WITH_CANDIDATES })],
      [makeSchema({ status: 'disabled' })],
    );
    expect(buildSupportedActionRegistry(project)[0]!.variants[0]!.status).toBe('disabled');
  });

  it('a detached (scriptId-less) variant has status "missing-script"', () => {
    const project = makeProject([], [makeSchema({ scriptId: undefined, scriptFilename: undefined })]);
    const variant = buildSupportedActionRegistry(project)[0]!.variants[0]!;
    expect(variant.status).toBe('missing-script');
    expect(variant.scriptId).toBeUndefined();
  });

  it('a variant whose scriptId no longer resolves to an existing script has status "missing-script"', () => {
    const project = makeProject([], [makeSchema({ scriptId: 'script-1' })]); // no scripts in the project at all
    expect(buildSupportedActionRegistry(project)[0]!.variants[0]!.status).toBe('missing-script');
  });

  it('a reviewed, linked schema with an Unknown/Mixed target has status "incompatible-target" — never silently ready', () => {
    const project = makeProject(
      [makeScript({ id: 'script-1', rawText: TOY_SCRIPT_WITH_CANDIDATES })],
      [makeSchema({ target: UNKNOWN_TARGET })],
    );
    expect(buildSupportedActionRegistry(project)[0]!.variants[0]!.status).toBe('incompatible-target');
  });

  it('a reviewed, linked, explicit-target schema with zero fields has status "needs-review"', () => {
    const project = makeProject(
      [makeScript({ id: 'script-1', rawText: TOY_SCRIPT_WITH_CANDIDATES })],
      [makeSchema({ fields: [] })],
    );
    expect(buildSupportedActionRegistry(project)[0]!.variants[0]!.status).toBe('needs-review');
  });

  it('carries scriptFilename/relativePath/category from the linked script when available', () => {
    const script = makeScript({ id: 'script-1', rawText: TOY_SCRIPT_WITH_CANDIDATES, relativePath: 'files_frlg/pkmn/TeachAnyMove.txt', category: 'pkmn' });
    const project = makeProject([script], [makeSchema()]);
    const variant = buildSupportedActionRegistry(project)[0]!.variants[0]!;
    expect(variant.scriptFilename).toBe('TeachAnyMove.txt');
    expect(variant.relativePath).toBe('files_frlg/pkmn/TeachAnyMove.txt');
    expect(variant.category).toBe('pkmn');
  });
});

describe('getRunnableActionsForTarget', () => {
  it('lists only actions with at least one ready, exact-target-matching variant', () => {
    const scripts = ['a', 'b'].map((id) => makeScript({ id: `script-${id}`, rawText: TOY_SCRIPT_WITH_CANDIDATES }));
    const schemas = [
      makeSchema({ id: 'ready-fr11', target: FR_EN_11, scriptId: 'script-a' }),
      makeSchema({ id: 'draft-fr11', actionKey: 'other-action', label: 'Other action', status: 'draft', target: FR_EN_11, scriptId: 'script-b' }),
    ];
    const project = makeProject(scripts, schemas);
    const actions = getRunnableActionsForTarget(project, FR_EN_11);
    expect(actions.map((a) => a.actionKey)).toEqual(['teach-any-move']); // the draft-only action never appears
    expect(actions[0]!.variants).toHaveLength(1);
    expect(actions[0]!.variants[0]!.schemaId).toBe('ready-fr11');
  });

  it('excludes a ready variant reviewed for a different target than the one selected', () => {
    const project = makeProject(
      [makeScript({ id: 'script-1', rawText: TOY_SCRIPT_WITH_CANDIDATES })],
      [makeSchema({ target: FR_EN_10 })],
    );
    expect(getRunnableActionsForTarget(project, FR_EN_11)).toEqual([]);
  });

  it('never lets an Unknown/Mixed selected target silently match an explicit-target variant', () => {
    const project = makeProject(
      [makeScript({ id: 'script-1', rawText: TOY_SCRIPT_WITH_CANDIDATES })],
      [makeSchema({ target: FR_EN_11 })],
    );
    expect(getRunnableActionsForTarget(project, UNKNOWN_TARGET)).toEqual([]);
  });

  it('when an action has variants for multiple targets, only the matching one is included', () => {
    const scripts = ['a', 'b'].map((id) => makeScript({ id: `script-${id}`, rawText: TOY_SCRIPT_WITH_CANDIDATES }));
    const schemas = [
      makeSchema({ id: 'fr10', target: FR_EN_10, scriptId: 'script-a' }),
      makeSchema({ id: 'fr11', target: FR_EN_11, scriptId: 'script-b' }),
    ];
    const project = makeProject(scripts, schemas);
    const actions = getRunnableActionsForTarget(project, FR_EN_11);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.variants.map((v) => v.schemaId)).toEqual(['fr11']);
  });
});

describe('getReadyVariantsForAction', () => {
  it('returns the ready, exact-target-matching variants for one specific action', () => {
    const scripts = ['a', 'b'].map((id) => makeScript({ id: `script-${id}`, rawText: TOY_SCRIPT_WITH_CANDIDATES }));
    const schemas = [
      makeSchema({ id: 'fr10', target: FR_EN_10, scriptId: 'script-a' }),
      makeSchema({ id: 'fr11', target: FR_EN_11, scriptId: 'script-b' }),
    ];
    const project = makeProject(scripts, schemas);
    expect(getReadyVariantsForAction(project, 'teach-any-move', FR_EN_11).map((v) => v.schemaId)).toEqual(['fr11']);
  });

  it('returns an empty array for an unknown actionKey', () => {
    const project = makeProject([], []);
    expect(getReadyVariantsForAction(project, 'nonexistent-action', FR_EN_11)).toEqual([]);
  });
});

describe('getNeedsReviewScripts / getUnsupportedScripts', () => {
  it('getNeedsReviewScripts lists scripts with a draft schema, or scanned-with-candidates but no schema yet', () => {
    const draftLinked = makeScript({ id: 'a', rawText: TOY_SCRIPT_WITH_CANDIDATES });
    const scannedNoSchema = makeScript({ id: 'b', rawText: TOY_SCRIPT_WITH_CANDIDATES });
    scannedNoSchema.lastScan = scanScript(scannedNoSchema, () => ISO);
    const project = makeProject(
      [draftLinked, scannedNoSchema],
      [makeSchema({ id: 'draft-schema', status: 'draft', scriptId: 'a' })],
    );
    const needsReview = getNeedsReviewScripts(project);
    expect(needsReview.map((s) => s.id).sort()).toEqual(['a', 'b']);
  });

  it('getUnsupportedScripts lists scripts scanned with zero non-internal candidates and no schema', () => {
    const noCandidates = makeScript({ id: 'a', rawText: TOY_SCRIPT_NO_CANDIDATES });
    noCandidates.lastScan = scanScript(noCandidates, () => ISO);
    const project = makeProject([noCandidates], []);
    expect(getUnsupportedScripts(project).map((s) => s.id)).toEqual(['a']);
  });
});
