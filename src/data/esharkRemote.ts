// The ONLY module in this app allowed to perform a network request — this
// is enforced by scripts/check-no-network.mjs, which allowlists exactly
// this file for `fetch` and asserts every URL literal in it targets only
// the fixed GitHub/E-Sh4rk constants below.
//
// SAFETY CONTRACT: fetchEsharkFilesFrlg() is called only from a direct,
// user-triggered click handler — never on app launch, on a timer, or in
// the background. It fetches exactly one thing: the read-only files_frlg
// script folder from the public E-Sh4rk/EmeraldACE_web GitHub repository.
// There is no exported way to fetch an arbitrary host, owner, repo, path,
// or ref — GITHUB_OWNER/GITHUB_REPO/DEFAULT_REF are fixed constants, never
// parameters. Fetched script text is returned exactly as received (decoded
// as UTF-8 text, never trimmed, normalized, or otherwise rewritten) and is
// never executed or evaluated — same as a locally-picked file, it is only
// ever treated as plain text for local import.

import { isRelevantPackFile, type CollectedFile } from '../core/scriptPack.js';
import { detectFilesFrlgRoot, isUnderFilesFrlgRoot } from '../core/esharkSource.js';

const GITHUB_OWNER = 'E-Sh4rk';
const GITHUB_REPO = 'EmeraldACE_web';
const DEFAULT_REF = 'main';

export const ESHARK_GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const ESHARK_GITHUB_DEFAULT_REF = DEFAULT_REF;

export type EsharkFetchErrorKind = 'network' | 'http-error' | 'bad-response' | 'no-files-frlg' | 'zero-scripts';

export class EsharkFetchError extends Error {
  readonly kind: EsharkFetchErrorKind;
  constructor(message: string, kind: EsharkFetchErrorKind) {
    super(message);
    this.name = 'EsharkFetchError';
    this.kind = kind;
  }
}

interface GitTreeEntry {
  path: string;
  type: string;
}

async function fetchJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  } catch {
    throw new EsharkFetchError('Could not reach GitHub — check your network connection and try again.', 'network');
  }
  if (!res.ok) throw new EsharkFetchError(`GitHub request failed (HTTP ${res.status}).`, 'http-error');
  try {
    return await res.json();
  } catch {
    throw new EsharkFetchError('GitHub returned a response that could not be parsed as JSON.', 'bad-response');
  }
}

async function fetchText(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new EsharkFetchError('Could not reach GitHub — check your network connection and try again.', 'network');
  }
  if (!res.ok) throw new EsharkFetchError(`GitHub request failed (HTTP ${res.status}).`, 'http-error');
  return res.text();
}

export interface EsharkRemoteFetchResult {
  /** Only the files under the detected files_frlg root, repo-root-relative (e.g. "files_frlg/misc/Example.txt"). */
  files: CollectedFile[];
  root: string;
  sourceUrl: string;
  ref: string;
}

/**
 * Fetches the files_frlg folder from the public E-Sh4rk/EmeraldACE_web
 * GitHub repository and returns its .txt scripts and list.json as plain
 * text, in the same CollectedFile[] shape a local folder import produces —
 * so it feeds the exact same downstream import pipeline. Only ever invoked
 * from a direct, user-triggered click; never called automatically.
 */
export async function fetchEsharkFilesFrlg(): Promise<EsharkRemoteFetchResult> {
  const treeUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/${DEFAULT_REF}?recursive=1`;
  const treeJson = await fetchJson(treeUrl);
  const rawTree = (treeJson as { tree?: unknown } | null)?.tree;
  if (!Array.isArray(rawTree)) {
    throw new EsharkFetchError('GitHub returned an unexpected response shape for the repository tree.', 'bad-response');
  }
  const entries = rawTree.filter(
    (e): e is GitTreeEntry =>
      e !== null && typeof e === 'object' && typeof (e as GitTreeEntry).path === 'string' && typeof (e as GitTreeEntry).type === 'string',
  );

  const root = detectFilesFrlgRoot(entries.map((e) => e.path));
  if (!root) {
    throw new EsharkFetchError('No files_frlg folder was found in that repository.', 'no-files-frlg');
  }

  const relevant = entries.filter((e) => e.type === 'blob' && isUnderFilesFrlgRoot(e.path, root) && isRelevantPackFile(e.path));
  if (relevant.length === 0) {
    throw new EsharkFetchError('The files_frlg folder was found, but it contains no .txt scripts.', 'zero-scripts');
  }

  const files: CollectedFile[] = [];
  for (const entry of relevant) {
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${DEFAULT_REF}/${entry.path}`;
    const text = await fetchText(rawUrl);
    files.push({ relativePath: entry.path, text });
  }

  return { files, root, sourceUrl: ESHARK_GITHUB_REPO_URL, ref: DEFAULT_REF };
}
