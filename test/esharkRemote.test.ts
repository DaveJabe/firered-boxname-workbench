import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchEsharkFilesFrlg,
  ESHARK_GITHUB_REPO_URL,
  ESHARK_GITHUB_DEFAULT_REF,
} from '../src/data/esharkRemote.js';
import { collectScriptPackFiles } from '../src/core/scriptPack.js';

const TREE_URL = `https://api.github.com/repos/E-Sh4rk/EmeraldACE_web/git/trees/${ESHARK_GITHUB_DEFAULT_REF}?recursive=1`;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function textResponse(body: string, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => body,
    json: async () => {
      throw new Error('not json');
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchEsharkFilesFrlg — never fetches unless explicitly called', () => {
  it('does not touch the network just by being imported', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetchEsharkFilesFrlg — successful fetch', () => {
  it('imports only files under the detected files_frlg root, preserving rawText exactly', async () => {
    // Deliberately odd whitespace/line endings/trailing space — must survive untouched.
    const weirdText = 'widgetCount = 5\r\n@@\r\nPretendBodyLine   \n';
    const fetchMock = vi.fn(async (url: string) => {
      if (url === TREE_URL) {
        return jsonResponse({
          tree: [
            { path: 'files_frlg', type: 'tree' },
            { path: 'files_frlg/misc', type: 'tree' },
            { path: 'files_frlg/misc/Example.txt', type: 'blob' },
            { path: 'files_frlg/list.json', type: 'blob' },
            { path: 'README.md', type: 'blob' },
          ],
        });
      }
      if (url.includes('files_frlg/misc/Example.txt')) return textResponse(weirdText);
      if (url.includes('files_frlg/list.json')) return textResponse('{"Example.txt":"Example display name"}');
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchEsharkFilesFrlg();
    expect(result.root).toBe('files_frlg/');
    expect(result.sourceUrl).toBe(ESHARK_GITHUB_REPO_URL);
    expect(result.ref).toBe(ESHARK_GITHUB_DEFAULT_REF);

    const relativePaths = result.files.map((f) => f.relativePath).sort();
    expect(relativePaths).toEqual(['files_frlg/list.json', 'files_frlg/misc/Example.txt']);
    expect(relativePaths.some((p) => p.includes('README'))).toBe(false);

    const example = result.files.find((f) => f.relativePath === 'files_frlg/misc/Example.txt');
    expect(example?.text).toBe(weirdText);
  });

  it('feeds cleanly into the same collectScriptPackFiles pipeline local folder import uses', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === TREE_URL) {
        return jsonResponse({
          tree: [
            { path: 'files_frlg', type: 'tree' },
            { path: 'files_frlg/pkmn/TeachAnyMove.txt', type: 'blob' },
          ],
        });
      }
      return textResponse('moveSlot = 1\n@@\nPretendBodyLine');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchEsharkFilesFrlg();
    const collected = collectScriptPackFiles(result.files);
    expect(collected.scripts).toHaveLength(1);
    expect(collected.scripts[0].category).toBe('pkmn');
  });
});

describe('fetchEsharkFilesFrlg — non-fatal malformed list.json', () => {
  it('still imports .txt scripts when the fetched list.json is not valid JSON', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === TREE_URL) {
        return jsonResponse({
          tree: [
            { path: 'files_frlg', type: 'tree' },
            { path: 'files_frlg/misc/Example.txt', type: 'blob' },
            { path: 'files_frlg/list.json', type: 'blob' },
          ],
        });
      }
      if (url.includes('list.json')) return textResponse('not valid json {');
      return textResponse('widgetCount = 5\n@@\nPretendBodyLine');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchEsharkFilesFrlg();
    const collected = collectScriptPackFiles(result.files);
    expect(collected.scripts).toHaveLength(1);
    expect(collected.hasMetadataFile).toBe(true);
    expect(collected.metadataParseError).toBe(true);
  });
});

describe('fetchEsharkFilesFrlg — error handling', () => {
  it('rejects with kind "no-files-frlg" when the repository has no files_frlg folder', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ tree: [{ path: 'README.md', type: 'blob' }] })));
    await expect(fetchEsharkFilesFrlg()).rejects.toMatchObject({ kind: 'no-files-frlg' });
  });

  it('rejects with kind "zero-scripts" when files_frlg exists but has no .txt/list.json inside', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          tree: [
            { path: 'files_frlg', type: 'tree' },
            { path: 'files_frlg/readme.md', type: 'blob' },
          ],
        }),
      ),
    );
    await expect(fetchEsharkFilesFrlg()).rejects.toMatchObject({ kind: 'zero-scripts' });
  });

  it('rejects with kind "network" when fetch itself throws (offline)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(fetchEsharkFilesFrlg()).rejects.toMatchObject({ kind: 'network' });
  });

  it('rejects with kind "http-error" on a non-ok tree response (e.g. rate limited)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, false, 403)));
    await expect(fetchEsharkFilesFrlg()).rejects.toMatchObject({ kind: 'http-error' });
  });

  it('rejects with kind "bad-response" when the tree response is not shaped as expected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ notATree: true })));
    await expect(fetchEsharkFilesFrlg()).rejects.toMatchObject({ kind: 'bad-response' });
  });

  it('rejects with kind "http-error" when a raw file fetch fails after a good tree fetch', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === TREE_URL) {
        return jsonResponse({
          tree: [
            { path: 'files_frlg', type: 'tree' },
            { path: 'files_frlg/misc/Example.txt', type: 'blob' },
          ],
        });
      }
      return textResponse('', false, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchEsharkFilesFrlg()).rejects.toMatchObject({ kind: 'http-error' });
  });
});
