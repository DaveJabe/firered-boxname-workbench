// Pure, cross-screen HTML/formatting helpers — no `state` access, no DOM
// beyond string-building, no side effects. Extracted from app.ts as part of
// splitting the UI layer into smaller modules (no behavior change): every
// function here is used by two or more of the render*.ts screen modules (or
// by state.ts/eventHandlers.ts), so it lives in one shared place instead of
// being duplicated or arbitrarily owned by a single screen.

import type { GameTarget, Project, ScriptFile } from '../core/types.js';
import { TARGET_GAMES, TARGET_LANGUAGES, TARGET_REVISIONS } from '../core/gameTarget.js';
import { numberLines } from '../core/normalize.js';
import { summarizeWorkspaceStatus, formatWorkspaceStatusLine } from '../core/workspaceStatus.js';
import { matchReviewedPresets, type ReviewedSchemaPreset } from '../core/reviewedSchemaPresets.js';
import { REVIEWED_SCHEMA_PRESETS } from '../templates/reviewed-schema-presets.js';
import { isExitCompanionScript } from '../core/exitCompanion.js';
import { escapeHtml, attr } from './dom.js';

export function opt(value: string, label: string, current: string): string {
  return `<option value="${attr(value)}"${value === current ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function parseOptInt(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

export function splitCommaList(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Game/Language/Revision selects, reused by the schema editor, script-pack import, and Run Script. */
export function targetSelectsHtml(bindPrefix: string, target: GameTarget, idPrefix: string): string {
  const gameOpts = TARGET_GAMES.map((g) => opt(g, g, target.game)).join('');
  const langOpts = TARGET_LANGUAGES.map((l) => opt(l, l, target.language)).join('');
  const revOpts = TARGET_REVISIONS.map((r) => opt(r, r, target.revision)).join('');
  return `<div class="grid2">
    <div><label for="${idPrefix}-game">Game</label><select id="${idPrefix}-game" data-bind="${bindPrefix}.game">${gameOpts}</select></div>
    <div><label for="${idPrefix}-lang">Language</label><select id="${idPrefix}-lang" data-bind="${bindPrefix}.language">${langOpts}</select></div>
  </div>
  <label for="${idPrefix}-rev">Revision</label>
  <select id="${idPrefix}-rev" data-bind="${bindPrefix}.revision">${revOpts}</select>`;
}

export function lineNumberView(text: string): string {
  const rows = numberLines(text)
    .map((l) => `<tr><td class="ln" aria-hidden="true">${l.n}</td><td class="lc"><span>${escapeHtml(l.text)}</span></td></tr>`)
    .join('');
  return `<div class="linebox"><table class="lines"><tbody>${rows}</tbody></table></div>`;
}

/** Compact one-line orientation strip, e.g. "E-Sh4rk @ main · 112 scripts · 1 ready · 97 need review". */
export function workspaceStatusStripHtml(project: Project): string {
  if (project.scripts.length === 0) return '';
  const summary = summarizeWorkspaceStatus(project.scripts, project.curatedSchemas, project.scriptPacks);
  const scannedNote = summary.scannedScripts < summary.totalScripts ? ` (${summary.scannedScripts} scanned)` : '';
  const fetchedNote = summary.latestEsharkGithubPack?.fetchedAt ? ` · fetched ${escapeHtml(summary.latestEsharkGithubPack.fetchedAt.slice(0, 10))}` : '';
  return `<p class="muted" style="font-size:0.9rem">${escapeHtml(formatWorkspaceStatusLine(summary))}${scannedNote}${fetchedNote}</p>`;
}

/** The single reviewed preset that unambiguously matches this script and isn't already applied to it, if exactly one does. */
export function unambiguousPresetMatch(script: ScriptFile, project: Project): ReviewedSchemaPreset | undefined {
  // Exit-code companion files (e.g. exit.txt) are support material, never a
  // reviewed-preset candidate — see core/exitCompanion.ts.
  if (isExitCompanionScript(script)) return undefined;
  const matches = matchReviewedPresets(REVIEWED_SCHEMA_PRESETS, {
    filename: script.filename,
    title: script.lastScan?.title,
    category: script.category,
  }).filter((m) => !project.curatedSchemas.some((cs) => cs.id === `${m.preset.id}-for-${script.id}`));
  return matches.length === 1 ? matches[0].preset : undefined;
}
