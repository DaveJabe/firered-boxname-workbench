// Fails a normal production build if a local, untracked, personally-obtained
// copy of E-Sh4rk's compiled generator artifact is present. See
// docs/local-generator-poc.md — that artifact has no license anywhere
// upstream, must never be committed, bundled, or deployed, and must never
// be something the app (or a build of it) silently depends on. Vite copies
// everything under public/ into dist/ verbatim, so "the artifact happens to
// be on disk" and "the artifact ends up in dist/" are the same risk.
//
// Default behavior is FAIL CLOSED: if any of the paths below exist, the
// build stops. The only way past this is the explicit, deliberately
// unwieldy FBW_ALLOW_LOCAL_GENERATOR_ARTIFACT=1 env var, meant for a
// developer's own private local experiments only — never for a build whose
// output might be shared, deployed, or published.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Relative to repo root. Checked for existence (file) or any content
// (directory) — an empty, merely-created directory is not itself a risk.
export const GUARDED_PATHS = ['public/local-eshark-generator/ace_js.bc.js', 'public/local-eshark-generator', '.external', '.local-generator'];

export const OVERRIDE_VAR = 'FBW_ALLOW_LOCAL_GENERATOR_ARTIFACT';

function hasContent(path) {
  if (!existsSync(path)) return false;
  const stat = statSync(path);
  if (stat.isFile()) return true;
  if (stat.isDirectory()) return readdirSync(path).length > 0;
  return false;
}

/**
 * Pure, root-injectable guard logic — never touches the real repo root
 * directly (that's only the CLI wrapper's job), so it's fully testable
 * against a throwaway temp directory instead of real disk state.
 * @param {string} root
 * @param {NodeJS.ProcessEnv} env
 */
export function evaluateLocalGeneratorArtifactGuard(root, env) {
  const found = GUARDED_PATHS.filter((rel) => hasContent(join(root, rel)));
  const overridden = env[OVERRIDE_VAR] === '1';
  // ok: safe to proceed (nothing found, or found-but-explicitly-overridden).
  const ok = found.length === 0 || overridden;
  return { found, overridden, ok };
}

function main() {
  const root = new URL('..', import.meta.url).pathname;
  const { found, overridden, ok } = evaluateLocalGeneratorArtifactGuard(root, process.env);

  if (found.length === 0) {
    console.log('OK: no local E-Sh4rk generator artifact present.');
    process.exit(0);
  }

  console.error(`Found local E-Sh4rk generator artifact path(s):\n${found.map((f) => `  - ${f}`).join('\n')}`);
  console.error('');
  console.error(
    'This artifact has no license anywhere upstream and must never be committed, bundled, or deployed — see docs/local-generator-poc.md.',
  );

  if (overridden) {
    console.error(`${OVERRIDE_VAR}=1 is set — proceeding anyway. This build's dist/ now contains that artifact. Never share, deploy, or publish it.`);
    process.exit(0);
  }

  console.error('');
  console.error(`Refusing to build. If this is a deliberate private local experiment, rerun with ${OVERRIDE_VAR}=1.`);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
