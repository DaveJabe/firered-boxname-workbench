// Hand-written declaration for the plain-JS script of the same name, so
// test/localGeneratorArtifactGuard.test.ts can import it with types. The
// script itself stays dependency-free, directly `node`-runnable JS (not
// TypeScript) — see its own header comment for why (mirrors
// scripts/check-no-network.mjs's existing convention).
export declare const GUARDED_PATHS: readonly string[];
export declare const OVERRIDE_VAR: string;

export interface LocalGeneratorArtifactGuardResult {
  found: string[];
  overridden: boolean;
  ok: boolean;
}

export declare function evaluateLocalGeneratorArtifactGuard(
  root: string,
  env: Readonly<Record<string, string | undefined>>,
): LocalGeneratorArtifactGuardResult;
