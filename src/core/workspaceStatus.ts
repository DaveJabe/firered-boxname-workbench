// Pure helpers for the compact status strip shown at the top of Run Script
// and Manage Scripts — a quick "where am I" summary instead of a giant
// table, built entirely from data already in the workspace.

import type { CuratedActionSchema, ScriptFile, ScriptPack } from './types.js';
import { summarizeSupportedScripts } from './supportedScripts.js';

export interface WorkspaceStatusSummary {
  totalScripts: number;
  scannedScripts: number;
  readyCount: number;
  needsReviewCount: number;
  /** The most recently fetched E-Sh4rk GitHub pack, if any script pack came from one. */
  latestEsharkGithubPack?: { sourceRef?: string; fetchedAt?: string };
}

/** Summarize the workspace's scripts/schemas/packs into the few numbers the status strip shows. */
export function summarizeWorkspaceStatus(
  scripts: readonly ScriptFile[],
  curatedSchemas: readonly CuratedActionSchema[],
  scriptPacks: readonly ScriptPack[],
): WorkspaceStatusSummary {
  const support = summarizeSupportedScripts(scripts, curatedSchemas);
  const esharkGithubPacks = scriptPacks.filter((p) => p.sourceProfile === 'eshark-github');
  const latestEsharkGithubPack = esharkGithubPacks
    .slice()
    .sort((a, b) => (b.fetchedAt ?? '').localeCompare(a.fetchedAt ?? ''))[0];

  const summary: WorkspaceStatusSummary = {
    totalScripts: scripts.length,
    scannedScripts: scripts.filter((s) => s.lastScan).length,
    readyCount: support.ready.length,
    needsReviewCount: support.needsReview.length,
  };
  if (latestEsharkGithubPack) {
    summary.latestEsharkGithubPack = {
      sourceRef: latestEsharkGithubPack.sourceRef,
      fetchedAt: latestEsharkGithubPack.fetchedAt,
    };
  }
  return summary;
}

/** The compact one-line status strip text, e.g. "E-Sh4rk @ main · 112 scripts · 1 ready · 97 need review". */
export function formatWorkspaceStatusLine(summary: WorkspaceStatusSummary): string {
  const sourcePart = summary.latestEsharkGithubPack?.sourceRef ? `E-Sh4rk @ ${summary.latestEsharkGithubPack.sourceRef} · ` : '';
  const scriptWord = summary.totalScripts === 1 ? 'script' : 'scripts';
  return `${sourcePart}${summary.totalScripts} ${scriptWord} · ${summary.readyCount} ready · ${summary.needsReviewCount} need review`;
}
