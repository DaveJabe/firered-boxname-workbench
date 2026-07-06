import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  evaluateLocalGeneratorArtifactGuard,
  GUARDED_PATHS,
  OVERRIDE_VAR,
} from '../scripts/check-no-local-generator-artifact.mjs';
import { findArtifactPaths } from '../scripts/check-artifact-not-tracked.mjs';

// Every test here operates on a throwaway temp directory standing in for
// the repo root, never the real repo — this guard's whole job is reacting
// to disk state, so a hermetic fixture matters more than usual. The real
// artifact is never created, read, or required.

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fbw-artifact-guard-'));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('evaluateLocalGeneratorArtifactGuard — no artifact', () => {
  it('passes on an empty root with no guarded paths present', () => {
    const root = makeTempRoot();
    const result = evaluateLocalGeneratorArtifactGuard(root, {});
    expect(result.ok).toBe(true);
    expect(result.found).toEqual([]);
    expect(result.overridden).toBe(false);
  });

  it('passes when the guarded directories exist but are empty', () => {
    const root = makeTempRoot();
    mkdirSync(join(root, 'public/local-eshark-generator'), { recursive: true });
    mkdirSync(join(root, '.external'), { recursive: true });
    const result = evaluateLocalGeneratorArtifactGuard(root, {});
    expect(result.ok).toBe(true);
    expect(result.found).toEqual([]);
  });
});

describe('evaluateLocalGeneratorArtifactGuard — artifact present', () => {
  it('fails when ace_js.bc.js exists at the exact guarded path', () => {
    const root = makeTempRoot();
    mkdirSync(join(root, 'public/local-eshark-generator'), { recursive: true });
    writeFileSync(join(root, 'public/local-eshark-generator/ace_js.bc.js'), '// not the real artifact, just a toy fixture');

    const result = evaluateLocalGeneratorArtifactGuard(root, {});
    expect(result.ok).toBe(false);
    expect(result.overridden).toBe(false);
    expect(result.found).toContain('public/local-eshark-generator/ace_js.bc.js');
    expect(result.found).toContain('public/local-eshark-generator');
  });

  it('fails when .external/ has any content, regardless of filename', () => {
    const root = makeTempRoot();
    mkdirSync(join(root, '.external/CodeGenerator'), { recursive: true });
    writeFileSync(join(root, '.external/CodeGenerator/README.md'), 'toy fixture');

    const result = evaluateLocalGeneratorArtifactGuard(root, {});
    expect(result.ok).toBe(false);
    expect(result.found).toContain('.external');
  });

  it('fails when .local-generator/ has any content', () => {
    const root = makeTempRoot();
    mkdirSync(join(root, '.local-generator'), { recursive: true });
    writeFileSync(join(root, '.local-generator/whatever.txt'), 'toy fixture');

    const result = evaluateLocalGeneratorArtifactGuard(root, {});
    expect(result.ok).toBe(false);
    expect(result.found).toContain('.local-generator');
  });

  it('lists every guarded path that has content, not just the first one found', () => {
    const root = makeTempRoot();
    mkdirSync(join(root, 'public/local-eshark-generator'), { recursive: true });
    writeFileSync(join(root, 'public/local-eshark-generator/ace_js.bc.js'), 'toy');
    mkdirSync(join(root, '.local-generator'), { recursive: true });
    writeFileSync(join(root, '.local-generator/x'), 'toy');

    const result = evaluateLocalGeneratorArtifactGuard(root, {});
    expect(result.found).toEqual(expect.arrayContaining(['public/local-eshark-generator/ace_js.bc.js', 'public/local-eshark-generator', '.local-generator']));
  });
});

describe('evaluateLocalGeneratorArtifactGuard — explicit override', () => {
  it('passes when the artifact is present and FBW_ALLOW_LOCAL_GENERATOR_ARTIFACT=1 is set', () => {
    const root = makeTempRoot();
    mkdirSync(join(root, 'public/local-eshark-generator'), { recursive: true });
    writeFileSync(join(root, 'public/local-eshark-generator/ace_js.bc.js'), 'toy');

    const result = evaluateLocalGeneratorArtifactGuard(root, { [OVERRIDE_VAR]: '1' });
    expect(result.ok).toBe(true);
    expect(result.overridden).toBe(true);
    expect(result.found.length).toBeGreaterThan(0); // still reports what it found, just doesn't block
  });

  it('does not treat any other value as an override — only the exact string "1"', () => {
    const root = makeTempRoot();
    mkdirSync(join(root, 'public/local-eshark-generator'), { recursive: true });
    writeFileSync(join(root, 'public/local-eshark-generator/ace_js.bc.js'), 'toy');

    expect(evaluateLocalGeneratorArtifactGuard(root, { [OVERRIDE_VAR]: 'true' }).ok).toBe(false);
    expect(evaluateLocalGeneratorArtifactGuard(root, { [OVERRIDE_VAR]: 'yes' }).ok).toBe(false);
    expect(evaluateLocalGeneratorArtifactGuard(root, {}).ok).toBe(false);
  });

  it('the override has no effect when nothing is actually found (nothing to override)', () => {
    const root = makeTempRoot();
    const result = evaluateLocalGeneratorArtifactGuard(root, { [OVERRIDE_VAR]: '1' });
    expect(result.ok).toBe(true);
    expect(result.overridden).toBe(true);
    expect(result.found).toEqual([]);
  });
});

describe('GUARDED_PATHS', () => {
  it('covers exactly the four paths the task specified', () => {
    expect(GUARDED_PATHS).toEqual([
      'public/local-eshark-generator/ace_js.bc.js',
      'public/local-eshark-generator',
      '.external',
      '.local-generator',
    ]);
  });
});

describe('findArtifactPaths (tracked/staged detection)', () => {
  it('returns an empty list for a repo with no matching files', () => {
    expect(findArtifactPaths(['README.md', 'src/index.ts', 'package.json'])).toEqual([]);
  });

  it('matches ace_js.bc.js at any directory depth', () => {
    expect(findArtifactPaths(['public/local-eshark-generator/ace_js.bc.js'])).toEqual([
      'public/local-eshark-generator/ace_js.bc.js',
    ]);
    expect(findArtifactPaths(['ace_js.bc.js'])).toEqual(['ace_js.bc.js']);
    expect(findArtifactPaths(['some/nested/deep/path/ace_js.bc.js'])).toEqual(['some/nested/deep/path/ace_js.bc.js']);
  });

  it('does not match filenames that merely contain the artifact name as a substring', () => {
    expect(findArtifactPaths(['ace_js.bc.js.bak', 'notace_js.bc.js', 'ace_js.bc.js2'])).toEqual([]);
  });

  it('finds the artifact among a larger list of otherwise-unrelated tracked files', () => {
    const tracked = ['README.md', 'src/index.ts', 'public/local-eshark-generator/ace_js.bc.js', 'package.json'];
    expect(findArtifactPaths(tracked)).toEqual(['public/local-eshark-generator/ace_js.bc.js']);
  });
});
