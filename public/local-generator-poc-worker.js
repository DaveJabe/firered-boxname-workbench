// EXPERIMENTAL, DEV-ONLY. Classic Web Worker, served as a static asset (not
// processed by Vite's TS/module transform) so it can safely use
// importScripts() to load a local, untracked, personally-obtained copy of
// E-Sh4rk's compiled generator artifact — see docs/local-generator-poc.md.
//
// This file holds no third-party code itself: it only calls into a global
// `aceGen` that may or may not exist, depending on whether that local
// artifact is present at the well-known dev path. Never imported by the
// main app; only loaded by src/experimental/localEsharkGeneratorPoc.ts,
// itself never wired into the Run Script flow.
//
// Plain JavaScript, not TypeScript: a TypeScript version loaded via
// `new Worker(new URL('./x.ts', import.meta.url))` gets served by Vite's
// dev server with an appended `export {}` marker (even with zero exports
// of its own), which is a syntax error in a classic (non-module) Worker.
// Switching to a module Worker instead hit a second problem: Vite's
// dev-mode import-analysis rewrites any `import()` call — even one with
// `/* @vite-ignore */` on a runtime string variable — which broke loading
// the artifact. A plain static file under public/ sidesteps both: it is
// never transformed by Vite in dev or in a production build, so the same
// file behaves identically in both. See localEsharkGeneratorProtocol.ts
// for the (TypeScript, main-thread-side) type shapes this message
// protocol mirrors.

function loadArtifact(artifactUrl) {
  try {
    importScripts(artifactUrl);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function getAceGen() {
  return self.aceGen;
}

self.onmessage = (event) => {
  const request = event.data;

  if (request.kind === 'detect') {
    const loaded = loadArtifact(request.artifactUrl);
    if (!loaded.ok) {
      self.postMessage({ kind: 'detect', ok: false, error: loaded.error });
      return;
    }
    const aceGen = getAceGen();
    if (!aceGen || typeof aceGen.build !== 'function') {
      self.postMessage({ kind: 'detect', ok: false, error: 'Artifact loaded but aceGen.build was not found.' });
      return;
    }
    self.postMessage({ kind: 'detect', ok: true });
    return;
  }

  const loaded = loadArtifact(request.artifactUrl);
  if (!loaded.ok) {
    self.postMessage({ kind: 'build', ok: false, stage: 'load-artifact', error: loaded.error });
    return;
  }

  const aceGen = getAceGen();
  if (!aceGen || typeof aceGen.build !== 'function') {
    self.postMessage({
      kind: 'build',
      ok: false,
      stage: 'missing-acegen',
      error: 'The local artifact loaded, but aceGen.build was not found on it.',
    });
    return;
  }

  try {
    const [, logText] = aceGen.build(request.lang, request.game, request.code, request.exitCodes);
    self.postMessage({ kind: 'build', ok: true, logText });
  } catch (err) {
    self.postMessage({
      kind: 'build',
      ok: false,
      stage: 'build-threw',
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
