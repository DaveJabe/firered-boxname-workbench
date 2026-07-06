// Exit-code companion detection/resolution (manual generator workflow).
//
// SAFETY CONTRACT: every function here only reads already-imported
// ScriptFile/ScriptPack text — no file, process, or network I/O, and no new
// fetch source (see docs/scope.md's "no hidden network calls" boundary and
// src/data/esharkRemote.ts, the one allowlisted fetch module, which this
// file never touches). It never modifies a script's rawText; a companion's
// rawText is always returned verbatim, exactly as imported. Detection is
// conservative by design: a script is only treated as a companion when both
// its filename and its content match, so an unrelated script that happens
// to have "exit" in its name isn't misidentified.
//
// Format note (from docs/generator-adapter-spike.md's research): E-Sh4rk's
// upstream `files_frlg/exit.txt` bundles many independently-named exit-code
// sections in one file, each with its own `@@ filename = "Name"` header,
// separated by a line of `=` characters. A script's own `@@ exit = "Name"`
// directive (see scriptScanner.ts) names which section the generator should
// use — but the generator takes the WHOLE companion file as input and looks
// the name up internally, so resolution here only needs to confirm the name
// exists somewhere in the companion text, never extract/isolate that one
// section for use elsewhere.

import type { ExitCompanionResolution, ScriptFile, ScriptPack } from './types.js';
import { extractExitDirectiveValue } from './scriptScanner.js';

/** A line consisting only of `=` characters (4 or more) — the separator between named sections in a companion file. */
const SECTION_SEPARATOR = /^=+$/;
/** Matches `@ filename = "Name"` or `@@ filename = "Name"` — same directive shape scriptScanner.ts recognizes. */
const FILENAME_DIRECTIVE = /^\s*@{1,2}\s*filename\s*=\s*(.*)$/i;

function unquote(v: string): string {
  const m = /^(["'])(.*)\1$/.exec(v.trim());
  return m ? m[2] : v.trim();
}

/**
 * Every `@@ filename = "..."` section name found in a companion file's text,
 * in order. Purely informational/derived — never mutates or reconstructs
 * the companion's own rawText.
 */
export function parseExitCompanionSectionNames(rawText: string): string[] {
  const names: string[] = [];
  for (const rawLine of rawText.split(/\r\n|\r|\n/)) {
    const m = FILENAME_DIRECTIVE.exec(rawLine);
    if (m) names.push(unquote(m[1]));
  }
  return names;
}

/**
 * Conservative heuristic: is this script LIKELY an exit-code companion file,
 * as opposed to an ordinary action script? Requires both a plausible
 * filename ("exit.txt" exactly, or any name containing "exit") AND content
 * that actually looks like the multi-section companion format (at least one
 * `@@ filename = "..."` directive, or a `====`-style section separator) —
 * matching either signal alone risks false positives (an action script
 * could coincidentally have "exit" in a comment, or a companion file could
 * have only one section and no separator yet).
 */
export function looksLikeExitCompanionFile(filename: string, rawText: string): boolean {
  const name = filename.toLowerCase();
  if (!name.endsWith('.txt')) return false;
  const plausibleName = name === 'exit.txt' || name.includes('exit');
  if (!plausibleName) return false;
  const hasSectionMarker = parseExitCompanionSectionNames(rawText).length > 0;
  const hasSeparator = rawText.split(/\r\n|\r|\n/).some((l) => SECTION_SEPARATOR.test(l.trim()));
  return hasSectionMarker || hasSeparator;
}

/** Every script among the given set that looks like an exit-code companion file. */
export function findExitCompanionCandidates(scripts: readonly ScriptFile[]): ScriptFile[] {
  return scripts.filter((s) => looksLikeExitCompanionFile(s.filename, s.rawText));
}

function buildResolvedResolution(
  exitName: string,
  companion: ScriptFile,
  packsById: ReadonlyMap<string, ScriptPack>,
  resolvedAt: string,
): ExitCompanionResolution {
  const pack = companion.packId ? packsById.get(companion.packId) : undefined;
  const result: ExitCompanionResolution = {
    status: 'resolved',
    exitName,
    companionScriptId: companion.id,
    companionFilename: companion.filename,
    companionRawText: companion.rawText,
    companionImportedAt: pack?.fetchedAt ?? companion.importedAt,
    resolvedAt,
  };
  if (companion.relativePath) result.companionRelativePath = companion.relativePath;
  if (pack) {
    result.companionSourcePackId = pack.id;
    if (pack.sourceProfile) result.companionSourceProfile = pack.sourceProfile;
    if (pack.sourceRef) result.companionSourceRef = pack.sourceRef;
  }
  return result;
}

/**
 * Resolve a script's exit-directive name against a set of candidate
 * companion scripts. `nowIso` supplies `resolvedAt` — this function never
 * reads the system clock itself, matching this codebase's existing
 * pure-function convention (e.g. scanScript takes the same parameter).
 */
export function resolveExitCompanion(
  exitName: string | undefined,
  candidates: readonly ScriptFile[],
  packs: readonly ScriptPack[],
  nowIso: () => string,
): ExitCompanionResolution {
  const resolvedAt = nowIso();
  if (exitName === undefined) return { status: 'no-exit-directive', resolvedAt };

  const packsById = new Map(packs.map((p) => [p.id, p]));
  for (const companion of candidates) {
    if (parseExitCompanionSectionNames(companion.rawText).includes(exitName)) {
      return buildResolvedResolution(exitName, companion, packsById, resolvedAt);
    }
  }
  return { status: 'missing', exitName, resolvedAt };
}

/**
 * Convenience wrapper: extract the script's own exit directive, find
 * companion candidates among all imported scripts, and resolve. This is
 * what UI code should call — resolveExitCompanion above stays independently
 * testable with a fixed exitName and candidate list.
 */
export function resolveExitCompanionForScript(
  script: ScriptFile,
  allScripts: readonly ScriptFile[],
  packs: readonly ScriptPack[],
  nowIso: () => string,
): ExitCompanionResolution {
  const exitName = extractExitDirectiveValue(script.rawText);
  const candidates = findExitCompanionCandidates(allScripts.filter((s) => s.id !== script.id));
  return resolveExitCompanion(exitName, candidates, packs, nowIso);
}
