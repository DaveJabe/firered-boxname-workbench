import { describe, it, expect } from 'vitest';
import type { CuratedActionSchema, ScriptFile, ScriptPack } from '../src/core/types.js';
import { scanScript } from '../src/core/scriptScanner.js';
import { summarizeWorkspaceStatus, formatWorkspaceStatusLine } from '../src/core/workspaceStatus.js';
import { UNKNOWN_TARGET } from '../src/core/gameTarget.js';

const ISO = '2026-01-01T00:00:00.000Z';
const FR_EN_11 = { game: 'FireRed', language: 'English', revision: '1.1' } as const;

// Harmless, invented toy fixtures — no real script, item ID, address, opcode, or payload byte.
const TOY_SCRIPT_WITH_CANDIDATES = ['; toy header', 'widgetCount = 5 ; example count', '@@', 'PretendBodyLine'].join('\n');

function makeScript(over: Partial<ScriptFile> & { rawText: string }): ScriptFile {
  return { id: 's1', filename: 'toy.txt', importedAt: ISO, ...over };
}

function makeSchema(over: Partial<CuratedActionSchema> = {}): CuratedActionSchema {
  return {
    id: 'schema-1', label: 'Toy schema', description: '', target: FR_EN_11,
    supportedRevisionLabels: [], status: 'draft', fields: [], scriptId: 's1', scriptFilename: 'toy.txt', ...over,
  };
}

describe('summarizeWorkspaceStatus', () => {
  it('counts total/scanned scripts and delegates ready/needs-review to summarizeSupportedScripts', () => {
    const ready = makeScript({ id: 'a', rawText: TOY_SCRIPT_WITH_CANDIDATES });
    const needsReview = makeScript({ id: 'b', rawText: TOY_SCRIPT_WITH_CANDIDATES });
    const unscanned = makeScript({ id: 'c', rawText: TOY_SCRIPT_WITH_CANDIDATES });

    const schema = makeSchema({ id: 'ready-schema', scriptId: 'a', status: 'reviewed', target: FR_EN_11 });

    const summary = summarizeWorkspaceStatus([ready, needsReview, unscanned], [schema], []);
    expect(summary.totalScripts).toBe(3);
    expect(summary.readyCount).toBe(1);
    expect(summary.needsReviewCount).toBe(2);
  });

  it('counts scanned scripts by presence of lastScan, independent of bucket', () => {
    const scanned = makeScript({ id: 'a', rawText: TOY_SCRIPT_WITH_CANDIDATES });
    scanned.lastScan = scanScript(scanned, () => ISO);
    const unscanned = makeScript({ id: 'b', rawText: TOY_SCRIPT_WITH_CANDIDATES });

    const summary = summarizeWorkspaceStatus([scanned, unscanned], [], []);
    expect(summary.scannedScripts).toBe(1);
  });

  it('omits latestEsharkGithubPack when no script pack came from the E-Sh4rk GitHub source', () => {
    const localPack: ScriptPack = { id: 'p1', name: 'Local', importedAt: ISO, defaultTarget: UNKNOWN_TARGET, scriptIds: [] };
    const summary = summarizeWorkspaceStatus([], [], [localPack]);
    expect(summary.latestEsharkGithubPack).toBeUndefined();
  });

  it('picks the most recently fetched E-Sh4rk GitHub pack when more than one exists', () => {
    const older: ScriptPack = {
      id: 'p1', name: 'Older', importedAt: ISO, defaultTarget: UNKNOWN_TARGET, scriptIds: [],
      sourceProfile: 'eshark-github', sourceRef: 'main', fetchedAt: '2026-01-01T00:00:00.000Z',
    };
    const newer: ScriptPack = {
      id: 'p2', name: 'Newer', importedAt: ISO, defaultTarget: UNKNOWN_TARGET, scriptIds: [],
      sourceProfile: 'eshark-github', sourceRef: 'main', fetchedAt: '2026-06-01T00:00:00.000Z',
    };
    const summary = summarizeWorkspaceStatus([], [], [older, newer]);
    expect(summary.latestEsharkGithubPack).toEqual({ sourceRef: 'main', fetchedAt: '2026-06-01T00:00:00.000Z' });
  });
});

describe('formatWorkspaceStatusLine', () => {
  it('formats the full line with source, counts, and singular/plural "script(s)"', () => {
    const line = formatWorkspaceStatusLine({
      totalScripts: 112, scannedScripts: 112, readyCount: 1, needsReviewCount: 97,
      latestEsharkGithubPack: { sourceRef: 'main' },
    });
    expect(line).toBe('E-Sh4rk @ main · 112 scripts · 1 ready · 97 need review');
  });

  it('uses singular "script" for exactly one script', () => {
    const line = formatWorkspaceStatusLine({ totalScripts: 1, scannedScripts: 1, readyCount: 1, needsReviewCount: 0 });
    expect(line).toBe('1 script · 1 ready · 0 need review');
  });

  it('omits the source prefix entirely when there is no E-Sh4rk GitHub pack', () => {
    const line = formatWorkspaceStatusLine({ totalScripts: 3, scannedScripts: 0, readyCount: 0, needsReviewCount: 3 });
    expect(line).toBe('3 scripts · 0 ready · 3 need review');
  });

  it('omits the source prefix when a pack exists but has no sourceRef recorded', () => {
    const line = formatWorkspaceStatusLine({
      totalScripts: 2, scannedScripts: 0, readyCount: 0, needsReviewCount: 2,
      latestEsharkGithubPack: {},
    });
    expect(line).toBe('2 scripts · 0 ready · 2 need review');
  });
});
