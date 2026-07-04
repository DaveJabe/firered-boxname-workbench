// Pure helpers for locating a local E-Sh4rk `files_frlg` script folder inside
// a folder-picker selection, and for reading its optional `list.json` as
// informational display metadata.
//
// SAFETY CONTRACT: everything here only inspects already-provided relative
// paths and text. No file, process, or network I/O; nothing here fetches
// from GitHub or anywhere else. `list.json` is parsed as JSON for display
// purposes only — its content is never executed, never invoked, and never
// fed into scanning/filling/generation. Script rawText is never modified.

import type { EsharkCategory, EsharkSourceProfile } from './types.js';
import type { CollectedFile } from './scriptPack.js';

export const ESHARK_SOURCE_PROFILES: readonly EsharkSourceProfile[] = ['eshark-files-frlg', 'eshark-offline-app'];

/** The folder-import source profile the user picks; 'generic' means no special layout is assumed. */
export type SourceProfile = 'generic' | EsharkSourceProfile;

export const ESHARK_CATEGORIES: readonly EsharkCategory[] = ['misc', 'pkmn', 'rng'];

export function isEsharkCategory(v: string): v is EsharkCategory {
  return (ESHARK_CATEGORIES as readonly string[]).includes(v);
}

export interface SourceProfileInfo {
  label: string;
  /** Plain-language explanation shown next to the selector. */
  description: string;
}

export const SOURCE_PROFILE_INFO: Record<SourceProfile, SourceProfileInfo> = {
  generic: {
    label: 'Generic script folder',
    description: 'Import scripts from any local folder. No particular layout is required.',
  },
  'eshark-files-frlg': {
    label: 'E-Sh4rk files_frlg folder',
    description:
      'Select the local files_frlg folder itself, from an E-Sh4rk script checkout. Only the scripts inside it are imported.',
  },
  'eshark-offline-app': {
    label: 'E-Sh4rk CodeGeneratorOffline app folder',
    description:
      "Select the local offline generator's app folder (or the whole cloned repo folder) — this app looks inside it for the files_frlg folder and imports only what's there.",
  },
};

export const ESHARK_SETUP_NOTE =
  'To use E-Sh4rk scripts, download or clone the E-Sh4rk script repository/offline generator locally, ' +
  'then select the local files_frlg folder or the offline app folder. This app does not fetch scripts from the internet.';

function normalizePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/');
}

/**
 * Finds the `files_frlg` folder inside a set of relative paths from a
 * folder-picker selection, regardless of whether the user selected that
 * folder directly, a repo-root/offline-app folder that contains it
 * somewhere inside, or an already-nested path. Returns the path prefix up
 * to and including `files_frlg/` (e.g. "files_frlg/" or
 * "EmeraldACE_web-main/files_frlg/"), or undefined if no path contains it.
 */
export function detectFilesFrlgRoot(relativePaths: readonly string[]): string | undefined {
  for (const raw of relativePaths) {
    const segments = normalizePath(raw).split('/');
    const idx = segments.findIndex((s) => s.toLowerCase() === 'files_frlg');
    if (idx !== -1) return segments.slice(0, idx + 1).join('/') + '/';
  }
  return undefined;
}

/** True if a relative path falls under the given detected files_frlg root. */
export function isUnderFilesFrlgRoot(relativePath: string, root: string): boolean {
  return normalizePath(relativePath).startsWith(root);
}

/** Strips a trailing slash for storage/display (e.g. "files_frlg/" -> "files_frlg"). */
export function displayRootPath(root: string): string {
  return root.replace(/\/$/, '');
}

export interface EsharkFolderSelection {
  /** Path prefix through and including "files_frlg/", e.g. "files_frlg/" or "EmeraldACE_web-main/files_frlg/". */
  root: string;
  /** Only the files from the input that fall under root — everything else is dropped. */
  files: CollectedFile[];
}

/**
 * The single entry point folder import uses for the E-Sh4rk source
 * profiles: finds the files_frlg root among a folder-picker selection, then
 * keeps only the files under it. Returns undefined when no files_frlg
 * folder is found anywhere in the selection.
 */
export function selectEsharkFiles(files: readonly CollectedFile[]): EsharkFolderSelection | undefined {
  const root = detectFilesFrlgRoot(files.map((f) => f.relativePath));
  if (!root) return undefined;
  return { root, files: files.filter((f) => isUnderFilesFrlgRoot(f.relativePath, root)) };
}

export interface EsharkListEntry {
  displayName?: string;
  category?: string;
}

/**
 * Best-effort, read-only interpretation of an E-Sh4rk `list.json` manifest.
 * The real-world schema of this file isn't pinned down here — this only
 * recognizes a couple of common "manifest" shapes (a flat map of filename
 * to display name or to a {name, category} object, or a list of
 * {file, name, category} entries) well enough to enhance display names and
 * categories. Any other shape simply yields no enhancements: it is never
 * required, and a missing or malformed list.json never blocks import.
 */
export function parseEsharkListEntries(raw: unknown): ReadonlyMap<string, EsharkListEntry> {
  const out = new Map<string, EsharkListEntry>();
  if (raw === null || typeof raw !== 'object') return out;

  const addEntry = (key: unknown, value: unknown): void => {
    if (typeof key !== 'string' || !key) return;
    const k = key.toLowerCase();
    if (typeof value === 'string') {
      out.set(k, { displayName: value });
      return;
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const v = value as Record<string, unknown>;
      const entry: EsharkListEntry = {};
      const name = v.name ?? v.label ?? v.title;
      if (typeof name === 'string') entry.displayName = name;
      if (typeof v.category === 'string') entry.category = v.category;
      if (entry.displayName !== undefined || entry.category !== undefined) out.set(k, entry);
    }
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item !== null && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        const file = o.file ?? o.filename;
        if (typeof file === 'string') addEntry(file, o);
      }
    }
  } else {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      addEntry(key, value);
    }
  }
  return out;
}

/** Looks up a list.json entry by filename, with or without the .txt extension. */
export function lookupEsharkListEntry(
  entries: ReadonlyMap<string, EsharkListEntry>,
  filename: string,
): EsharkListEntry | undefined {
  const lower = filename.toLowerCase();
  return entries.get(lower) ?? entries.get(lower.replace(/\.txt$/, ''));
}
