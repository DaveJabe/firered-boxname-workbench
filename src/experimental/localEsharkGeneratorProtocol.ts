// Type-only message protocol between localEsharkGeneratorPoc.ts (main
// thread, TypeScript) and public/local-generator-poc-worker.js (worker
// thread, plain JavaScript — see that file's header comment for why it
// isn't TypeScript). This file documents the shape the plain-JS worker
// must match by hand; it isn't (and can't be) imported by that worker
// itself, only by the main-thread adapter. See docs/local-generator-poc.md.

export interface LocalGeneratorWorkerDetectRequest {
  kind: 'detect';
  artifactUrl: string;
}

export interface LocalGeneratorWorkerBuildRequest {
  kind: 'build';
  artifactUrl: string;
  lang: string;
  game: string;
  code: string;
  exitCodes: string;
}

export type LocalGeneratorWorkerRequest = LocalGeneratorWorkerDetectRequest | LocalGeneratorWorkerBuildRequest;

export type LocalGeneratorWorkerFailureStage = 'load-artifact' | 'missing-acegen' | 'build-threw';

export type LocalGeneratorWorkerResponse =
  | { kind: 'detect'; ok: true }
  | { kind: 'detect'; ok: false; error: string }
  | { kind: 'build'; ok: true; logText: string }
  | { kind: 'build'; ok: false; stage: LocalGeneratorWorkerFailureStage; error: string };
