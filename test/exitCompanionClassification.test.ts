import { describe, it, expect } from 'vitest';
import type { CuratedActionSchema, Project, ScriptFile } from '../src/core/types.js';
import { createProject } from '../src/core/factory.js';
import { isExitCompanionScript, resolveExitCompanionForScript } from '../src/core/exitCompanion.js';
import { computeScriptSupportInfo, summarizeSupportedScripts, buildCompactScriptRows } from '../src/core/supportedScripts.js';
import { buildScriptPackRows } from '../src/core/scriptPack.js';
import { buildSupportedActionRegistry, getRunnableActionsForTarget } from '../src/core/supportedActionRegistry.js';
import { buildCatalogGapAudit, groupCatalogAuditBySupportedAction } from '../src/core/catalogGapAudit.js';

const ISO = '2026-01-01T00:00:00.000Z';
const FR_EN_11 = { game: 'FireRed' as const, language: 'English' as const, revision: '1.1' as const };

// Toy fixtures matching the real upstream files_frlg/exit.txt format (see
// docs/generator-adapter-spike.md) — no real ACE code.
const EXIT_TXT_TEXT = [
  '@@ filename = "ToyExitA"',
  '@@ start = 1',
  '@@',
  '',
  'MOV r0, #0x0',
  '',
  '====================',
  '',
  '@@ filename = "GrabACEExit"',
  '@@ start = 2',
  '@@',
  '',
  'MOV r1, #0x1',
].join('\n');

const ACTION_SCRIPT_TEXT = ['@@ title = "Toy action"', '@@ exit = "GrabACEExit"', '', 'level = 5', '@@', '', 'movs r0, {level} ?'].join('\n');

function makeProject(scripts: ScriptFile[], schemas: CuratedActionSchema[] = []): Project {
  const project = createProject(
    { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
    (() => { let n = 0; return () => `id-${n++}`; })(),
    () => ISO,
  );
  project.scripts = scripts;
  project.curatedSchemas = schemas;
  return project;
}

function makeExitTxt(): ScriptFile {
  return { id: 'exit-script', filename: 'exit.txt', relativePath: 'files_frlg/exit.txt', rawText: EXIT_TXT_TEXT, importedAt: ISO };
}

function makeActionScript(): ScriptFile {
  return { id: 'action-script', filename: 'ToyAction.txt', rawText: ACTION_SCRIPT_TEXT, importedAt: ISO };
}

function makeSchemaFor(scriptId: string, over: Partial<CuratedActionSchema> = {}): CuratedActionSchema {
  return {
    id: 'toy-schema',
    label: 'Toy Action',
    description: '',
    actionKey: 'toy-action',
    target: FR_EN_11,
    scriptId,
    scriptFilename: 'ToyAction.txt',
    supportedRevisionLabels: [],
    status: 'reviewed',
    fields: [{ key: 'level', label: 'Level', type: 'number', required: true, variableName: 'level' }],
    ...over,
  };
}

describe('Task 1 — exit.txt can still be used for companion resolution', () => {
  it('is recognized as an exit-code companion file', () => {
    expect(isExitCompanionScript(makeExitTxt())).toBe(true);
  });

  it('an action script\'s @@ exit directive still resolves against it', () => {
    const action = makeActionScript();
    const companion = makeExitTxt();
    const result = resolveExitCompanionForScript(action, [action, companion], [], () => ISO);
    expect(result.status).toBe('resolved');
    expect(result.companionScriptId).toBe('exit-script');
  });
});

describe('Task 2 — exit.txt never appears as a runnable action', () => {
  it('a schema pointed at exit.txt is never "ready" in the supported-action registry', () => {
    const exitTxt = makeExitTxt();
    // A schema that (mistakenly, or by some future bug) points at the
    // companion file rather than a real action script.
    const schema = makeSchemaFor(exitTxt.id);
    const project = makeProject([exitTxt], [schema]);

    const registry = buildSupportedActionRegistry(project);
    expect(registry[0]!.variants[0]!.status).not.toBe('ready');
    expect(registry[0]!.variants[0]!.status).toBe('missing-script');
  });

  it('getRunnableActionsForTarget never returns it for any target', () => {
    const exitTxt = makeExitTxt();
    const schema = makeSchemaFor(exitTxt.id);
    const project = makeProject([exitTxt], [schema]);
    expect(getRunnableActionsForTarget(project, FR_EN_11)).toEqual([]);
  });
});

describe('Task 2 — exit.txt is not a reviewed-preset candidate', () => {
  it('exit.txt never appears as a "Needs review" or "no-candidates" bucket row — it gets its own support-file bucket', () => {
    const exitTxt = makeExitTxt();
    const project = makeProject([exitTxt]);
    const info = computeScriptSupportInfo(exitTxt, project.curatedSchemas);
    expect(info.bucket).toBe('support-file');
  });

  it('summarizeSupportedScripts buckets it as a support file, not needs-review/no-candidates', () => {
    const exitTxt = makeExitTxt();
    const summary = summarizeSupportedScripts([exitTxt], []);
    expect(summary.supportFiles.map((s) => s.id)).toEqual(['exit-script']);
    expect(summary.needsReview).toEqual([]);
    expect(summary.noCandidates).toEqual([]);
  });

  it('buildCompactScriptRows marks it with the support-file bucket', () => {
    const exitTxt = makeExitTxt();
    const rows = buildCompactScriptRows([exitTxt], [], []);
    expect(rows[0]!.bucket).toBe('support-file');
  });
});

describe('Task 2 — exit.txt is not counted as an unsupported script', () => {
  it('Catalog Audit\'s grouped unsupportedScripts list excludes it, even with zero curated schemas at all', () => {
    const exitTxt = makeExitTxt();
    const action = makeActionScript();
    const project = makeProject([exitTxt, action]); // neither has a schema
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit, () => ISO);

    const unsupportedIds = grouped.unsupportedScripts.map((s) => s.scriptId);
    expect(unsupportedIds).not.toContain('exit-script');
    expect(unsupportedIds).toContain('action-script'); // the real unsupported script still shows up
  });
});

describe('Task 4 — Catalog Audit ignores companion files as action candidates entirely', () => {
  it('exit.txt contributes no catalog-need classifications, blocked-script entries, or unknown fields', () => {
    const exitTxt = makeExitTxt();
    const project = makeProject([exitTxt]);
    const audit = buildCatalogGapAudit(project, () => ISO);

    expect(audit.topBlockedScripts.some((b) => b.scriptId === 'exit-script')).toBe(false);
    expect(audit.unknownFields.some((f) => f.scriptId === 'exit-script')).toBe(false);
  });

  it('a schema attached to exit.txt contributes no "ready supported actions" or "variants with gaps" entries', () => {
    const exitTxt = makeExitTxt();
    const schema = makeSchemaFor(exitTxt.id);
    const project = makeProject([exitTxt], [schema]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    const grouped = groupCatalogAuditBySupportedAction(project, audit, () => ISO);

    expect(grouped.readyActions).toEqual([]);
  });
});

describe('Task 5 — support-file labeling is preserved when shown in Advanced/raw inventory', () => {
  it('ScriptPackRow marks exit.txt as a companion file for the raw script table', () => {
    const exitTxt = makeExitTxt();
    const rows = buildScriptPackRows([exitTxt], [], []);
    expect(rows[0]!.isCompanionFile).toBe(true);
  });

  it('an ordinary action script is never mislabeled as a companion file', () => {
    const action = makeActionScript();
    const rows = buildScriptPackRows([action], [], []);
    expect(rows[0]!.isCompanionFile).toBe(false);
  });
});
