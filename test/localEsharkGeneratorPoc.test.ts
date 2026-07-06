import { describe, it, expect, vi } from 'vitest';
import {
  runLocalGeneratorPoc,
  detectLocalGeneratorArtifact,
  mapTargetToGeneratorCodes,
  type LocalGeneratorWorkerRunner,
} from '../src/experimental/localEsharkGeneratorPoc.js';
import type { GameTarget } from '../src/core/types.js';
import type { LocalGeneratorWorkerResponse } from '../src/experimental/localEsharkGeneratorProtocol.js';

// All tests here mock the worker boundary — no real Worker, no real
// artifact, no real network. This exercises only this adapter's own pure
// logic: target mapping, error-message construction, and wiring the
// worker's response into parseGeneratorOutput.

const FIRERED_ENGLISH_11: GameTarget = { game: 'FireRed', language: 'English', revision: '1.1' };

const BASE_INPUT = {
  filledScriptText: 'level = 42\n@@\nmovs r0, {level} ?',
  exitCompanionText: '@@ filename = "GrabACEExit"\n@@\n; toy exit codes',
  target: FIRERED_ENGLISH_11,
  schemaId: 'toy-schema-id',
};

function mockRunner(response: LocalGeneratorWorkerResponse): LocalGeneratorWorkerRunner {
  return vi.fn().mockResolvedValue(response);
}

describe('mapTargetToGeneratorCodes', () => {
  it('maps FireRed/English/1.1 to fr/eng1', () => {
    expect(mapTargetToGeneratorCodes({ game: 'FireRed', language: 'English', revision: '1.1' })).toEqual({
      lang: 'eng1',
      game: 'fr',
    });
  });

  it('maps LeafGreen/English/1.0 to lg/eng0', () => {
    expect(mapTargetToGeneratorCodes({ game: 'LeafGreen', language: 'English', revision: '1.0' })).toEqual({
      lang: 'eng0',
      game: 'lg',
    });
  });

  it('maps Japanese revisions to jap1/jap0', () => {
    expect(mapTargetToGeneratorCodes({ game: 'FireRed', language: 'Japanese', revision: '1.1' })).toEqual({
      lang: 'jap1',
      game: 'fr',
    });
    expect(mapTargetToGeneratorCodes({ game: 'FireRed', language: 'Japanese', revision: '1.0' })).toEqual({
      lang: 'jap0',
      game: 'fr',
    });
  });

  it('maps Spanish/French/Italian/German to their single non-revision-specific code', () => {
    expect(mapTargetToGeneratorCodes({ game: 'FireRed', language: 'Spanish', revision: '1.1' })?.lang).toBe('spa');
    expect(mapTargetToGeneratorCodes({ game: 'FireRed', language: 'French', revision: '1.0' })?.lang).toBe('fra');
    expect(mapTargetToGeneratorCodes({ game: 'FireRed', language: 'Italian', revision: '1.1' })?.lang).toBe('ita');
    expect(mapTargetToGeneratorCodes({ game: 'FireRed', language: 'German', revision: '1.0' })?.lang).toBe('ger');
  });

  it('returns null for Korean, which the generator does not offer', () => {
    expect(mapTargetToGeneratorCodes({ game: 'FireRed', language: 'Korean', revision: '1.1' })).toBeNull();
  });

  it('returns null for an Unknown game, language, or revision', () => {
    expect(mapTargetToGeneratorCodes({ game: 'Unknown', language: 'English', revision: '1.1' })).toBeNull();
    expect(mapTargetToGeneratorCodes({ game: 'FireRed', language: 'Unknown', revision: '1.1' })).toBeNull();
    expect(mapTargetToGeneratorCodes({ game: 'FireRed', language: 'English', revision: 'Unknown' })).toBeNull();
  });
});

describe('runLocalGeneratorPoc — missing artifact', () => {
  it('returns a clear error and no output when the worker reports load-artifact failure', async () => {
    const runner = mockRunner({ kind: 'build', ok: false, stage: 'load-artifact', error: '404 Not Found' });
    const result = await runLocalGeneratorPoc(BASE_INPUT, runner);

    expect(result.rawGeneratorOutput).toBeNull();
    expect(result.parsedBoxRows).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('not found or failed to load');
    expect(result.errors[0]).toContain('404 Not Found');
    expect(result.provenance.adapterKind).toBe('local-untracked-eshark-poc');
  });
});

describe('runLocalGeneratorPoc — missing aceGen', () => {
  it('returns a clear, distinct error when the artifact loads but aceGen.build is absent', async () => {
    const runner = mockRunner({ kind: 'build', ok: false, stage: 'missing-acegen', error: 'no aceGen global' });
    const result = await runLocalGeneratorPoc(BASE_INPUT, runner);

    expect(result.rawGeneratorOutput).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('did not expose aceGen.build');
    expect(result.errors[0]).toContain('no aceGen global');
  });
});

describe('runLocalGeneratorPoc — generator throws', () => {
  it('captures a thrown aceGen.build error rather than rejecting', async () => {
    const runner = mockRunner({ kind: 'build', ok: false, stage: 'build-threw', error: 'Invalid headers.' });
    const result = await runLocalGeneratorPoc(BASE_INPUT, runner);

    expect(result.rawGeneratorOutput).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('threw while running');
    expect(result.errors[0]).toContain('Invalid headers.');
  });

  it('captures a rejected worker promise (e.g. a timeout) as an error, not an unhandled rejection', async () => {
    const runner: LocalGeneratorWorkerRunner = vi.fn().mockRejectedValue(new Error('Local generator worker timed out.'));
    const result = await runLocalGeneratorPoc(BASE_INPUT, runner);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('timed out');
  });
});

describe('runLocalGeneratorPoc — success', () => {
  it('parses a successful mocked aceGen.build output into rawGeneratorOutput and parsedBoxRows', async () => {
    const logText = [
      'Box  1: T O Y N A M E 1   [TOYNAME1]',
      'Box  2: T O Y N A M E 2   [TOYNAME2]',
      '',
      'All commands (with exit code and fillers):',
      'MOV r0, #0x0',
    ].join('\n');
    const runner = mockRunner({ kind: 'build', ok: true, logText });
    const result = await runLocalGeneratorPoc(BASE_INPUT, runner);

    expect(result.errors).toHaveLength(0);
    expect(result.rawGeneratorOutput).toBe(logText);
    expect(result.parsedBoxRows).toHaveLength(2);
    expect(result.parsedBoxRows?.[0]).toMatchObject({ boxNumber: 1, compactText: 'TOYNAME1' });
    expect(result.parsedBoxRows?.[1]).toMatchObject({ boxNumber: 2, compactText: 'TOYNAME2' });
    expect(result.provenance.artifactPath).toBe('/local-eshark-generator/ace_js.bc.js');
  });

  it('passes the mapped lang/game codes and the given script/exit text to the worker request', async () => {
    const runner = mockRunner({ kind: 'build', ok: true, logText: 'Box 1: A [A]' });
    await runLocalGeneratorPoc(BASE_INPUT, runner);

    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'build',
        lang: 'eng1',
        game: 'fr',
        code: BASE_INPUT.filledScriptText,
        exitCodes: BASE_INPUT.exitCompanionText,
      }),
    );
  });

  it('warns, but does not error, when exit companion text is blank', async () => {
    const runner = mockRunner({ kind: 'build', ok: true, logText: 'Box 1: A [A]' });
    const result = await runLocalGeneratorPoc({ ...BASE_INPUT, exitCompanionText: '   ' }, runner);

    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('exit'))).toBe(true);
  });

  it('errors without calling the worker at all for an unsupported target', async () => {
    const runner = mockRunner({ kind: 'build', ok: true, logText: 'Box 1: A [A]' });
    const result = await runLocalGeneratorPoc({ ...BASE_INPUT, target: { game: 'FireRed', language: 'Korean', revision: '1.1' } }, runner);

    expect(runner).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('not supported');
  });
});

describe('detectLocalGeneratorArtifact', () => {
  it('returns true when the worker reports the artifact detected', async () => {
    const runner = mockRunner({ kind: 'detect', ok: true });
    expect(await detectLocalGeneratorArtifact(runner)).toBe(true);
  });

  it('returns false when the worker reports the artifact missing', async () => {
    const runner = mockRunner({ kind: 'detect', ok: false, error: 'not found' });
    expect(await detectLocalGeneratorArtifact(runner)).toBe(false);
  });

  it('returns false (never throws) when the worker call rejects', async () => {
    const runner: LocalGeneratorWorkerRunner = vi.fn().mockRejectedValue(new Error('boom'));
    expect(await detectLocalGeneratorArtifact(runner)).toBe(false);
  });
});

describe('no remote fetch is attempted', () => {
  it('never calls global fetch while running the adapter', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('fetch should never be called by this adapter');
    });
    try {
      const runner = mockRunner({ kind: 'build', ok: true, logText: 'Box 1: A [A]' });
      await runLocalGeneratorPoc(BASE_INPUT, runner);
      await detectLocalGeneratorArtifact(runner);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('manual paste-back is unaffected', () => {
  it('does not import or touch generatorOutputParser beyond calling the existing pure parseGeneratorOutput', async () => {
    // A regression guard, not a functional test: this experimental adapter
    // must reuse the existing parser as-is rather than reimplementing or
    // forking box-row parsing logic for its own output.
    const { parseGeneratorOutput } = await import('../src/core/generatorOutputParser.js');
    const runner = mockRunner({ kind: 'build', ok: true, logText: 'Box 1: A [A]' });
    const result = await runLocalGeneratorPoc(BASE_INPUT, runner);
    const directParse = parseGeneratorOutput('Box 1: A [A]');
    expect(result.parsedBoxRows).toEqual(directParse.rows);
  });
});
