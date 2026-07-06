// EXPERIMENTAL, DEV-ONLY, LOCAL-ONLY. This module calls a locally-obtained,
// untracked copy of E-Sh4rk's compiled generator artifact — see
// docs/local-generator-poc.md for what that is, why it isn't committed, and
// how to set it up. Nothing here is imported by the main app's Run Script
// flow; it exists only behind the dev-only panel gated by the
// "fbw.enableLocalGeneratorPoc" localStorage flag (src/ui/localGeneratorPocPanel.ts).
//
// SAFETY CONTRACT:
// - Never fetches remote code. The only thing loaded is a well-known LOCAL
//   dev path (/local-eshark-generator/ace_js.bc.js) that a developer placed
//   there themselves, outside of version control.
// - Never evals arbitrary pasted text — filledScriptText/exitCompanionText
//   are passed through as plain string arguments to the generator's own
//   `aceGen.build`, never executed as code by this app.
// - Never mutates scripts — this module only reads the strings it's given.
// - Never runs automatically — only invoked when runLocalGeneratorPoc is
//   called directly, which only ever happens from an explicit button click
//   in the dev-only panel.
// - Fails gracefully (never throws past its own boundary) if the local
//   artifact is missing, if aceGen isn't exposed by it, or if aceGen.build
//   itself throws — every case is reported back as a normal result with
//   `errors` populated, not a rejected promise or an unhandled exception.

import type { GameTarget, ParsedBoxNameRow, TargetLanguage, TargetRevision } from '../core/types.js';
import { parseGeneratorOutput } from '../core/generatorOutputParser.js';
import type {
  LocalGeneratorWorkerBuildRequest,
  LocalGeneratorWorkerDetectRequest,
  LocalGeneratorWorkerResponse,
} from './localEsharkGeneratorProtocol.js';

/** Well-known local dev path — never fetched from a remote host, only ever a same-origin static file a developer placed under public/ themselves. */
export const LOCAL_GENERATOR_ARTIFACT_URL = '/local-eshark-generator/ace_js.bc.js';

const WORKER_TIMEOUT_MS = 15000;

export interface LocalGeneratorPocInput {
  filledScriptText: string;
  /** The shared exit-codes companion text (upstream files_frlg/exit.txt) — required for every script that declares `@@ exit = "..."`. */
  exitCompanionText: string;
  target: GameTarget;
  actionKey?: string;
  schemaId: string;
  scriptId?: string;
}

export type LocalGeneratorPocAdapterKind = 'local-untracked-eshark-poc';

export interface LocalGeneratorPocProvenance {
  adapterKind: LocalGeneratorPocAdapterKind;
  generatedAt: string;
  /** Human-readable description of the source — never the artifact's own content. */
  sourceLabel: string;
  /** The local dev path used — never the artifact's own content. */
  artifactPath: string;
}

export interface LocalGeneratorPocResult {
  rawGeneratorOutput: string | null;
  parsedBoxRows: readonly ParsedBoxNameRow[] | null;
  warnings: readonly string[];
  errors: readonly string[];
  provenance: LocalGeneratorPocProvenance;
}

/** Runs a request against the local generator worker. Overridable in tests so no real Worker/artifact is ever needed. */
export type LocalGeneratorWorkerRunner = (
  request: LocalGeneratorWorkerDetectRequest | LocalGeneratorWorkerBuildRequest,
) => Promise<LocalGeneratorWorkerResponse>;

function makeProvenance(): LocalGeneratorPocProvenance {
  return {
    adapterKind: 'local-untracked-eshark-poc',
    generatedAt: new Date().toISOString(),
    sourceLabel: 'Locally-obtained E-Sh4rk CodeGenerator artifact (untracked, never committed)',
    artifactPath: LOCAL_GENERATOR_ARTIFACT_URL,
  };
}

/** Maps this app's GameTarget onto the generator's own lang/game selector codes. Returns null for combinations the generator's reference UI doesn't offer (e.g. Korean, or Unknown fields). */
export function mapTargetToGeneratorCodes(target: GameTarget): { lang: string; game: string } | null {
  if (target.game !== 'FireRed' && target.game !== 'LeafGreen') return null;
  const lang = mapLanguageAndRevision(target.language, target.revision);
  if (!lang) return null;
  return { lang, game: target.game === 'FireRed' ? 'fr' : 'lg' };
}

function mapLanguageAndRevision(language: TargetLanguage, revision: TargetRevision): string | null {
  const isKnownRevision = revision === '1.0' || revision === '1.1';
  if (!isKnownRevision) return null;
  switch (language) {
    case 'English':
      return revision === '1.0' ? 'eng0' : 'eng1';
    case 'Japanese':
      return revision === '1.0' ? 'jap0' : 'jap1';
    case 'Spanish':
      return 'spa';
    case 'French':
      return 'fra';
    case 'Italian':
      return 'ita';
    case 'German':
      return 'ger';
    // Korean and Unknown aren't offered by the generator's own #lang selector.
    default:
      return null;
  }
}

function describeBuildFailure(response: Extract<LocalGeneratorWorkerResponse, { kind: 'build'; ok: false }>): string {
  switch (response.stage) {
    case 'load-artifact':
      return `Local generator artifact not found or failed to load at ${LOCAL_GENERATOR_ARTIFACT_URL}. See docs/local-generator-poc.md for setup instructions. (${response.error})`;
    case 'missing-acegen':
      return `Local artifact loaded but did not expose aceGen.build. (${response.error})`;
    case 'build-threw':
      return `The generator threw while running: ${response.error}`;
  }
}

function runWorkerForReal(request: LocalGeneratorWorkerDetectRequest | LocalGeneratorWorkerBuildRequest): Promise<LocalGeneratorWorkerResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    // Plain static asset, not processed by Vite's TS/module transform — see
    // public/local-generator-poc-worker.js's own header comment for why.
    const worker = new Worker('/local-generator-poc-worker.js');

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate();
      reject(new Error('Local generator worker timed out.'));
    }, WORKER_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<LocalGeneratorWorkerResponse>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      resolve(event.data);
    };

    worker.onerror = (event: ErrorEvent) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(event.message || 'Local generator worker failed to start.'));
    };

    worker.postMessage(request);
  });
}

/** Pings the worker to check whether the local artifact is present and exposes aceGen.build, without running any script. */
export async function detectLocalGeneratorArtifact(runWorker: LocalGeneratorWorkerRunner = runWorkerForReal): Promise<boolean> {
  try {
    const response = await runWorker({ kind: 'detect', artifactUrl: LOCAL_GENERATOR_ARTIFACT_URL });
    return response.kind === 'detect' && response.ok;
  } catch {
    return false;
  }
}

export async function runLocalGeneratorPoc(
  input: LocalGeneratorPocInput,
  runWorker: LocalGeneratorWorkerRunner = runWorkerForReal,
): Promise<LocalGeneratorPocResult> {
  const provenance = makeProvenance();
  const warnings: string[] = [];
  const errors: string[] = [];

  const codes = mapTargetToGeneratorCodes(input.target);
  if (!codes) {
    errors.push(
      `Target ${input.target.game}/${input.target.language}/${input.target.revision} is not supported by the E-Sh4rk generator's language/game selectors.`,
    );
    return { rawGeneratorOutput: null, parsedBoxRows: null, warnings, errors, provenance };
  }

  if (!input.exitCompanionText.trim()) {
    warnings.push(
      'No exit companion text was provided — the generator will likely fail to resolve this script\'s "@@ exit" reference.',
    );
  }

  let response: LocalGeneratorWorkerResponse;
  try {
    response = await runWorker({
      kind: 'build',
      artifactUrl: LOCAL_GENERATOR_ARTIFACT_URL,
      lang: codes.lang,
      game: codes.game,
      code: input.filledScriptText,
      exitCodes: input.exitCompanionText,
    });
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { rawGeneratorOutput: null, parsedBoxRows: null, warnings, errors, provenance };
  }

  if (response.kind !== 'build') {
    errors.push('Unexpected response kind from local generator worker.');
    return { rawGeneratorOutput: null, parsedBoxRows: null, warnings, errors, provenance };
  }

  if (!response.ok) {
    errors.push(describeBuildFailure(response));
    return { rawGeneratorOutput: null, parsedBoxRows: null, warnings, errors, provenance };
  }

  const parsed = parseGeneratorOutput(response.logText);
  warnings.push(...parsed.warnings);

  return {
    rawGeneratorOutput: parsed.rawText,
    parsedBoxRows: parsed.rows,
    warnings,
    errors,
    provenance,
  };
}
