// Pure helpers for importing a folder of local .txt scripts as a batch
// ("script pack") and summarizing/filtering them for Manage Scripts.
//
// SAFETY CONTRACT: every function here only reads already-provided text —
// no file, process, or network I/O, and never invokes a generator or any
// external tool. Script rawText is never modified, evaluated, or
// transformed. Recognizing a "list.json" metadata file only means parsing
// it as JSON for informational display; its content is never executed or
// fed back into scanning/filling.

import type { CuratedActionSchema, EsharkCategory, GameTarget, ScriptFile, ScriptPack, VariableCandidate } from './types.js';
import { UNKNOWN_TARGET } from './gameTarget.js';

// --- Collecting a folder selection into scripts + optional metadata --------

export interface CollectedFile {
  /** Path relative to the imported folder root (forward-slash separated). */
  relativePath: string;
  text: string;
}

export interface CollectedScript {
  filename: string;
  relativePath: string;
  rawText: string;
  /** A recognized common FireRed script-pack subfolder, if the relative path matches one. */
  category?: EsharkCategory;
}

export interface ScriptPackCollectionResult {
  scripts: CollectedScript[];
  /** Parsed content of a recognized metadata file (e.g. list.json), if present and valid JSON. */
  metadata: unknown;
  /** True if a recognized metadata file (e.g. list.json) was found, whether or not it parsed. */
  hasMetadataFile: boolean;
  /** True if a recognized metadata file was found but failed to parse as JSON. */
  metadataParseError: boolean;
  /** Count of files that were neither a .txt script nor a recognized metadata file. */
  ignoredCount: number;
}

const RECOGNIZED_METADATA_FILENAMES = ['list.json'];

/** Common FireRed/LeafGreen script-pack subfolders, recognized but never required. */
const COMMON_CATEGORY_PATTERNS: ReadonlyArray<{ pattern: RegExp; category: EsharkCategory }> = [
  { pattern: /(^|\/)files_frlg\/misc\//i, category: 'misc' },
  { pattern: /(^|\/)files_frlg\/pkmn\//i, category: 'pkmn' },
  { pattern: /(^|\/)files_frlg\/rng\//i, category: 'rng' },
];

function normalizePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/');
}

function baseName(relativePath: string): string {
  const parts = normalizePath(relativePath).split('/');
  return parts[parts.length - 1];
}

function detectCategory(relativePath: string): EsharkCategory | undefined {
  const normalized = normalizePath(relativePath);
  return COMMON_CATEGORY_PATTERNS.find((p) => p.pattern.test(normalized))?.category;
}

/** True for a file worth reading during folder import: a .txt script or a recognized metadata file. */
export function isRelevantPackFile(relativePath: string): boolean {
  const name = baseName(relativePath).toLowerCase();
  return name.endsWith('.txt') || RECOGNIZED_METADATA_FILENAMES.includes(name);
}

/**
 * Collect .txt scripts and an optional recognized metadata file from a flat
 * list of already-read files (e.g. from a directory-picker selection).
 * Requires no particular folder layout, but tags a few common FireRed
 * script-pack subfolders (misc/pkmn/rng) as a category, if present.
 */
export function collectScriptPackFiles(files: readonly CollectedFile[]): ScriptPackCollectionResult {
  const scripts: CollectedScript[] = [];
  let metadata: unknown;
  let hasMetadataFile = false;
  let metadataParseError = false;
  let ignoredCount = 0;

  for (const file of files) {
    const name = baseName(file.relativePath);
    if (name.toLowerCase().endsWith('.txt')) {
      const script: CollectedScript = {
        filename: name,
        relativePath: normalizePath(file.relativePath),
        rawText: file.text,
      };
      const category = detectCategory(file.relativePath);
      if (category) script.category = category;
      scripts.push(script);
      continue;
    }
    if (RECOGNIZED_METADATA_FILENAMES.includes(name.toLowerCase())) {
      hasMetadataFile = true;
      try {
        metadata = JSON.parse(file.text);
      } catch {
        // Malformed or unparsable metadata is fine — it's optional and informational only.
        metadataParseError = true;
      }
      continue;
    }
    ignoredCount++;
  }

  return { scripts, metadata, hasMetadataFile, metadataParseError, ignoredCount };
}

/** The top-level folder name the user selected, derived from the first nested relative path. */
export function detectSourceFolderName(files: readonly CollectedFile[]): string | undefined {
  const nested = files.find((f) => normalizePath(f.relativePath).includes('/'));
  return nested ? normalizePath(nested.relativePath).split('/')[0] : undefined;
}

/**
 * The target that actually applies to a script: its own override if set,
 * else its pack's default target, else Unknown/Mixed (no pack, no override).
 * Never guesses a real value — only ever what was explicitly recorded.
 */
export function effectiveScriptTarget(script: ScriptFile, pack: ScriptPack | undefined): GameTarget {
  return script.targetOverride ?? pack?.defaultTarget ?? UNKNOWN_TARGET;
}

// --- Batch scan summary ------------------------------------------------------

export interface BatchScanSummary {
  totalScripts: number;
  scannedScripts: number;
  scriptsWithUserFacingCandidates: number;
  scriptsWithNoCandidates: number;
  scriptsWithDirectives: number;
  scriptsWithInternalCandidates: number;
}

function candidatesOf(s: ScriptFile): readonly VariableCandidate[] {
  return s.lastScan?.candidates ?? [];
}

/** Summarize a batch of scripts (a mix of scanned and not-yet-scanned is fine). */
export function summarizeBatchScan(scripts: readonly ScriptFile[]): BatchScanSummary {
  const scanned = scripts.filter((s) => s.lastScan);
  return {
    totalScripts: scripts.length,
    scannedScripts: scanned.length,
    scriptsWithUserFacingCandidates: scanned.filter((s) => candidatesOf(s).some((c) => !c.internal)).length,
    scriptsWithNoCandidates: scanned.filter((s) => candidatesOf(s).length === 0).length,
    scriptsWithDirectives: scanned.filter((s) => (s.lastScan?.directives.length ?? 0) > 0).length,
    scriptsWithInternalCandidates: scanned.filter((s) => candidatesOf(s).some((c) => c.internal)).length,
  };
}

// --- Per-script summary rows, for the Manage Scripts table ------------------

export interface ScriptPackRow {
  scriptId: string;
  filename: string;
  relativePath?: string;
  title?: string;
  candidateCount: number;
  userFacingCandidateCount: number;
  internalCandidateCount: number;
  hasSchema: boolean;
  target: GameTarget;
  category?: EsharkCategory;
}

/** One summary row per script, for the Manage Scripts table — never scans or fills anything itself. */
export function buildScriptPackRows(
  scripts: readonly ScriptFile[],
  curatedSchemas: readonly CuratedActionSchema[],
  packs: readonly ScriptPack[] = [],
): ScriptPackRow[] {
  const packsById = new Map(packs.map((p) => [p.id, p]));
  return scripts.map((s) => {
    const candidates = candidatesOf(s);
    const row: ScriptPackRow = {
      scriptId: s.id,
      filename: s.filename,
      candidateCount: candidates.length,
      userFacingCandidateCount: candidates.filter((c) => !c.internal).length,
      internalCandidateCount: candidates.filter((c) => c.internal).length,
      hasSchema: curatedSchemas.some((cs) => cs.scriptId === s.id),
      target: effectiveScriptTarget(s, s.packId ? packsById.get(s.packId) : undefined),
    };
    if (s.relativePath) row.relativePath = s.relativePath;
    if (s.lastScan?.title) row.title = s.lastScan.title;
    if (s.category) row.category = s.category;
    return row;
  });
}

// --- Filter / search, for a growing script library --------------------------

export type ScriptLibraryFilter = 'all' | 'has-candidates' | 'needs-schema' | 'runnable';

/** `runnable` mirrors "has a curated schema attached" — the same condition Run Script's dropdown uses. */
export function filterScriptRows(rows: readonly ScriptPackRow[], filter: ScriptLibraryFilter): ScriptPackRow[] {
  switch (filter) {
    case 'has-candidates':
      return rows.filter((r) => r.candidateCount > 0);
    case 'needs-schema':
      return rows.filter((r) => !r.hasSchema);
    case 'runnable':
      return rows.filter((r) => r.hasSchema);
    case 'all':
    default:
      return rows.slice();
  }
}

/** Case-insensitive substring match against filename or detected title. */
export function searchScriptRows(rows: readonly ScriptPackRow[], query: string): ScriptPackRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows.slice();
  return rows.filter((r) => r.filename.toLowerCase().includes(q) || (r.title ?? '').toLowerCase().includes(q));
}
