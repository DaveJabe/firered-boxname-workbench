import { describe, it, expect } from 'vitest';
import type { CuratedActionSchema, ScriptFile, ScriptPack } from '../src/core/types.js';
import { scanScript } from '../src/core/scriptScanner.js';
import { computeScriptSupportInfo, summarizeSupportedScripts, buildCompactScriptRows } from '../src/core/supportedScripts.js';
import { UNKNOWN_TARGET } from '../src/core/gameTarget.js';

const ISO = '2026-01-01T00:00:00.000Z';
const FR_EN_11 = { game: 'FireRed', language: 'English', revision: '1.1' } as const;

// Harmless, invented toy fixtures — no real script, item ID, address, opcode, or payload byte.
const TOY_SCRIPT_WITH_CANDIDATES = ['; toy header', 'widgetCount = 5 ; example count', '@@', 'PretendBodyLine'].join('\n');
const TOY_SCRIPT_NO_CANDIDATES = ['; toy header, no assignments before the marker', '@@', 'PretendBodyLine'].join('\n');

function makeScript(over: Partial<ScriptFile> & { rawText: string }): ScriptFile {
  return { id: 's1', filename: 'toy.txt', importedAt: ISO, ...over };
}

function makeSchema(over: Partial<CuratedActionSchema> = {}): CuratedActionSchema {
  return {
    id: 'schema-1', label: 'Toy schema', description: '', target: FR_EN_11,
    supportedRevisionLabels: [], status: 'draft', fields: [{ key: 'a', label: 'A', type: 'text', required: false, variableName: 'a' }],
    scriptId: 's1', scriptFilename: 'toy.txt', ...over,
  };
}

describe('computeScriptSupportInfo', () => {
  it('is "ready" when a reviewed schema with an explicit target is attached', () => {
    const script = makeScript({ rawText: TOY_SCRIPT_WITH_CANDIDATES });
    const schema = makeSchema({ status: 'reviewed', target: FR_EN_11 });
    const info = computeScriptSupportInfo(script, [schema]);
    expect(info.bucket).toBe('ready');
    expect(info.readySchema?.id).toBe(schema.id);
  });

  it('is "disabled-or-incompatible" when the attached schema is disabled', () => {
    const script = makeScript({ rawText: TOY_SCRIPT_WITH_CANDIDATES });
    const schema = makeSchema({ status: 'disabled' });
    const info = computeScriptSupportInfo(script, [schema]);
    expect(info.bucket).toBe('disabled-or-incompatible');
  });

  it('is "disabled-or-incompatible" when the attached schema is reviewed but its target is still Unknown/Mixed (e.g. a migration artifact)', () => {
    const script = makeScript({ rawText: TOY_SCRIPT_WITH_CANDIDATES });
    const schema = makeSchema({ status: 'reviewed', target: UNKNOWN_TARGET });
    const info = computeScriptSupportInfo(script, [schema]);
    expect(info.bucket).toBe('disabled-or-incompatible');
  });

  it('is "needs-review" when the attached schema is still a draft', () => {
    const script = makeScript({ rawText: TOY_SCRIPT_WITH_CANDIDATES });
    const schema = makeSchema({ status: 'draft' });
    const info = computeScriptSupportInfo(script, [schema]);
    expect(info.bucket).toBe('needs-review');
  });

  it('is "no-candidates" when scanned with zero non-internal candidates and no schema', () => {
    const script = makeScript({ rawText: TOY_SCRIPT_NO_CANDIDATES });
    script.lastScan = scanScript(script, () => ISO);
    const info = computeScriptSupportInfo(script, []);
    expect(info.bucket).toBe('no-candidates');
  });

  it('falls back to "needs-review" when not yet scanned and no schema exists', () => {
    const script = makeScript({ rawText: TOY_SCRIPT_WITH_CANDIDATES });
    const info = computeScriptSupportInfo(script, []);
    expect(info.bucket).toBe('needs-review');
  });

  it('falls back to "needs-review" when scanned with candidates but no schema created yet', () => {
    const script = makeScript({ rawText: TOY_SCRIPT_WITH_CANDIDATES });
    script.lastScan = scanScript(script, () => ISO);
    const info = computeScriptSupportInfo(script, []);
    expect(info.bucket).toBe('needs-review');
  });
});

describe('summarizeSupportedScripts', () => {
  it('buckets every script in one pass', () => {
    const ready = makeScript({ id: 'a', rawText: TOY_SCRIPT_WITH_CANDIDATES });
    const needsReview = makeScript({ id: 'b', rawText: TOY_SCRIPT_WITH_CANDIDATES });
    const noCandidates = makeScript({ id: 'c', rawText: TOY_SCRIPT_NO_CANDIDATES });
    noCandidates.lastScan = scanScript(noCandidates, () => ISO);
    const disabled = makeScript({ id: 'd', rawText: TOY_SCRIPT_WITH_CANDIDATES });

    const schemas = [
      makeSchema({ id: 'ready-schema', scriptId: 'a', status: 'reviewed', target: FR_EN_11 }),
      makeSchema({ id: 'draft-schema', scriptId: 'b', status: 'draft' }),
      makeSchema({ id: 'disabled-schema', scriptId: 'd', status: 'disabled' }),
    ];

    const summary = summarizeSupportedScripts([ready, needsReview, noCandidates, disabled], schemas);
    expect(summary.ready.map((r) => r.script.id)).toEqual(['a']);
    expect(summary.needsReview.map((s) => s.id)).toEqual(['b']);
    expect(summary.noCandidates.map((s) => s.id)).toEqual(['c']);
    expect(summary.disabledOrIncompatible.map((s) => s.id)).toEqual(['d']);
  });
});

describe('buildCompactScriptRows', () => {
  it('builds one row per script carrying filename, title, target, candidate count, and bucket', () => {
    const pack: ScriptPack = { id: 'pack-1', name: 'Toy pack', importedAt: ISO, defaultTarget: FR_EN_11, scriptIds: ['a'] };
    const script = makeScript({ id: 'a', filename: 'a.txt', rawText: TOY_SCRIPT_WITH_CANDIDATES, packId: pack.id, category: 'misc' });
    script.lastScan = scanScript(script, () => ISO);

    const rows = buildCompactScriptRows([script], [], [pack]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      scriptId: 'a', filename: 'a.txt', category: 'misc', target: FR_EN_11, bucket: 'needs-review',
    });
    expect(rows[0]!.candidateCount).toBeGreaterThan(0);
  });

  it('carries the ready schema id and "reviewed" status only for a ready row', () => {
    const script = makeScript({ id: 'a', rawText: TOY_SCRIPT_WITH_CANDIDATES });
    const schema = makeSchema({ id: 'ready-schema', scriptId: 'a', status: 'reviewed', target: FR_EN_11 });

    const [row] = buildCompactScriptRows([script], [schema], []);
    expect(row!.bucket).toBe('ready');
    expect(row!.readySchemaId).toBe('ready-schema');
    expect(row!.schemaStatus).toBe('reviewed');
  });

  it('omits readySchemaId for a non-ready row even when a draft schema is attached', () => {
    const script = makeScript({ id: 'a', rawText: TOY_SCRIPT_WITH_CANDIDATES });
    const schema = makeSchema({ id: 'draft-schema', scriptId: 'a', status: 'draft' });

    const [row] = buildCompactScriptRows([script], [schema], []);
    expect(row!.bucket).toBe('needs-review');
    expect(row!.readySchemaId).toBeUndefined();
    expect(row!.schemaStatus).toBe('draft');
  });

  it('falls back to Unknown/Mixed target and zero candidates for a script with no pack and no scan', () => {
    const script = makeScript({ id: 'a', rawText: TOY_SCRIPT_WITH_CANDIDATES });
    const [row] = buildCompactScriptRows([script], [], []);
    expect(row!.target).toEqual(UNKNOWN_TARGET);
    expect(row!.candidateCount).toBe(0);
  });
});
