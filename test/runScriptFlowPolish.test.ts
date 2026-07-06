import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Source-text checks, matching this repo's established convention for
// asserting structural properties of the UI layer's render modules that
// aren't practical to unit-test in isolation (DOM-heavy render functions) —
// see test/attribution.test.ts and test/networkAudit.test.ts for precedent.
// Behavioral confirmation of what these checks guard happens via the
// project's manual Playwright verification, not here.

function readRepoFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
}

// Run Script's own render module (see src/ui/renderRunScript.ts) — split out
// of what used to be a single src/ui/app.ts in experiment/split-ui-app.
const RUN_SCRIPT_TS = readRepoFile('src/ui/renderRunScript.ts');
// The copy-* click handlers now live in src/ui/eventHandlers.ts, and share
// one flashCopyFeedback(el, ok, successText) helper (src/ui/copyFeedback.ts)
// instead of repeating the same three-line "flash and restore" pattern.
const EVENT_HANDLERS_TS = readRepoFile('src/ui/eventHandlers.ts');

describe('Run Script shows the 3-step workflow labels', () => {
  it('renders exactly three numbered step headings, in order', () => {
    const stepIndices = ['Step 1 of 3', 'Step 2 of 3', 'Step 3 of 3'].map((s) => RUN_SCRIPT_TS.indexOf(s));
    expect(stepIndices.every((i) => i !== -1)).toBe(true);
    expect(stepIndices[0]).toBeLessThan(stepIndices[1]);
    expect(stepIndices[1]).toBeLessThan(stepIndices[2]);
  });

  it('labels each step with its plain-language purpose, not internal terminology', () => {
    expect(RUN_SCRIPT_TS).toContain('Choose action');
    expect(RUN_SCRIPT_TS).toContain('Fill parameters');
    expect(RUN_SCRIPT_TS).toMatch(/Generate externally,?\s*then paste output back/);
  });
});

describe('Generator Input card appears only for scripts with an exit directive', () => {
  it('the card is only assembled when a script-derived exit name is defined', () => {
    // generatorInputCard's own gating condition, verbatim.
    expect(RUN_SCRIPT_TS).toContain('const generatorInputCard = filledOk && linkedScript && exitName !== undefined');
  });

  it('exitName itself comes from the script\'s own @@ exit directive, not a guess', () => {
    expect(RUN_SCRIPT_TS).toContain('const exitName = linkedScript ? extractExitDirectiveValue(linkedScript.rawText) : undefined;');
  });
});

describe('missing companion disables only companion-dependent actions', () => {
  it('"Copy exit companion" is disabled when the companion is not resolved', () => {
    const match = /<button class="btn" data-action="copy-exit-companion-text"\$\{resolved \? '' : ' disabled'\}/.exec(RUN_SCRIPT_TS);
    expect(match).not.toBeNull();
  });

  it('"Copy generator input bundle" is disabled when the companion is not resolved', () => {
    const match = /<button class="btn" data-action="copy-generator-input-bundle"\$\{resolved \? '' : ' disabled'\}/.exec(RUN_SCRIPT_TS);
    expect(match).not.toBeNull();
  });

  it('"Copy filled script" inside the Generator Input card carries no companion-status condition at all', () => {
    const cardFnStart = RUN_SCRIPT_TS.indexOf('function generatorInputSectionHtml(');
    const cardFnBody = RUN_SCRIPT_TS.slice(cardFnStart, RUN_SCRIPT_TS.indexOf('\n}', cardFnStart));
    const filledScriptButtonLine = cardFnBody.split('\n').find((l) => l.includes('data-action="copy-filled-script"'));
    expect(filledScriptButtonLine).toBeDefined();
    expect(filledScriptButtonLine).not.toContain('disabled');
  });

  it('the bundle-copy click handler also refuses to run when the companion is missing (not just a disabled attribute)', () => {
    expect(EVENT_HANDLERS_TS).toContain("if (exitResolution?.status === 'missing') break;");
  });
});

describe('external generator link is labeled external and never carries generated/user data', () => {
  it('opens in a new tab with noopener/noreferrer, and is clearly labeled as an external site', () => {
    const fnStart = RUN_SCRIPT_TS.indexOf('function externalGeneratorLinkHtml()');
    const fnBody = RUN_SCRIPT_TS.slice(fnStart, RUN_SCRIPT_TS.indexOf('\n}', fnStart));
    expect(fnBody).toContain('target="_blank"');
    expect(fnBody).toContain('rel="noopener noreferrer"');
    expect(fnBody).toMatch(/external site/i);
    expect(fnBody).toMatch(/not affiliated/i);
  });

  it('the link function takes no parameters, so it cannot embed any filled script, field value, or companion text in its URL', () => {
    expect(RUN_SCRIPT_TS).toContain('function externalGeneratorLinkHtml(): string {');
  });

  it('states plainly that nothing is sent to the external site automatically', () => {
    const fnStart = RUN_SCRIPT_TS.indexOf('function externalGeneratorLinkHtml()');
    const fnBody = RUN_SCRIPT_TS.slice(fnStart, RUN_SCRIPT_TS.indexOf('\n}', fnStart));
    expect(fnBody.toLowerCase()).toMatch(/nothing here sends|does not send|never sends/);
  });

  it('the URL points at a fixed, hardcoded upstream constant, never a template built from state', () => {
    expect(RUN_SCRIPT_TS).toMatch(/const ESHARK_GENERATOR_EXTERNAL_URL = 'https:\/\/e-sh4rk\.github\.io\/CodeGenerator\/[^']*';/);
  });
});

describe('copy feedback for the four named actions', () => {
  it.each([
    ['Copied filled script ✓', "flashCopyFeedback(el, ok, 'Copied filled script ✓')"],
    ['Copied exit companion ✓', "flashCopyFeedback(el, ok, 'Copied exit companion ✓')"],
    ['Copied generator input bundle ✓', "flashCopyFeedback(el, ok, 'Copied generator input bundle ✓')"],
    ['Copied box names ✓', "flashCopyFeedback(el, ok, 'Copied box names ✓')"],
  ])('%s feedback text is wired to a real copy handler', (_label, snippet) => {
    expect(EVENT_HANDLERS_TS).toContain(snippet);
  });

  it('"Copied box names" feedback covers both the compact and raw copy-all handlers', () => {
    const occurrences = EVENT_HANDLERS_TS.split("flashCopyFeedback(el, ok, 'Copied box names ✓')").length - 1;
    expect(occurrences).toBe(2);
  });
});
