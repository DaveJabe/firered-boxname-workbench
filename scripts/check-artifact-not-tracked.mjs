// Fails if E-Sh4rk's compiled generator artifact (ace_js.bc.js) is tracked
// or staged in git, at any path. A belt-and-suspenders check alongside
// .gitignore and the build guard (check-no-local-generator-artifact.mjs):
// .gitignore stops a plain `git add .` from picking it up, but doesn't stop
// a deliberate or accidental `git add -f`. See docs/local-generator-poc.md.
//
// This project has no existing pre-commit/pre-push hook framework (no
// husky, no simple-git-hooks) — this script doesn't add one either. It's a
// plain, dependency-free check runnable manually (`npm run
// guard:artifact-not-tracked`) or wired into a hook a developer opts into
// themselves (see .githooks/pre-commit and docs/local-generator-poc.md for
// the one-time `git config core.hooksPath .githooks` opt-in).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ARTIFACT_BASENAME = 'ace_js.bc.js';

/**
 * Pure filter — never calls git itself, so it's fully testable with plain
 * arrays instead of a real git repository.
 * @param {readonly string[]} paths
 */
export function findArtifactPaths(paths) {
  return paths.filter((p) => p === ARTIFACT_BASENAME || p.endsWith(`/${ARTIFACT_BASENAME}`));
}

function gitListTrackedFiles() {
  try {
    return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function gitListStagedFiles() {
  try {
    return execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function main() {
  const tracked = findArtifactPaths(gitListTrackedFiles());
  const staged = findArtifactPaths(gitListStagedFiles());
  const all = [...new Set([...tracked, ...staged])];

  if (all.length === 0) {
    console.log('OK: the local E-Sh4rk generator artifact is not tracked or staged.');
    process.exit(0);
  }

  console.error(`Refusing to commit: ${ARTIFACT_BASENAME} is tracked or staged in git:\n${all.map((f) => `  - ${f}`).join('\n')}`);
  console.error(
    'This artifact has no license anywhere upstream and must never be committed — see docs/local-generator-poc.md. Unstage/untrack it (e.g. `git restore --staged <path>`) before committing.',
  );
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
