import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Source-text checks, matching this repo's established convention for
// asserting structural properties of src/ui/app.ts that aren't practical to
// unit-test in isolation (DOM-heavy render functions) — see
// test/attribution.test.ts and test/networkAudit.test.ts for precedent.
// Behavioral confirmation of what these checks guard happens via the
// project's manual Playwright verification, not here.

function readRepoFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
}

const APP_TS = readRepoFile('src/ui/app.ts');

describe('Run Script shows the 3-step workflow labels', () => {
  it('renders exactly three numbered step headings, in order', () => {
    const stepIndices = ['Step 1 of 3', 'Step 2 of 3', 'Step 3 of 3'].map((s) => APP_TS.indexOf(s));
    expect(stepIndices.every((i) => i !== -1)).toBe(true);
    expect(stepIndices[0]).toBeLessThan(stepIndices[1]);
    expect(stepIndices[1]).toBeLessThan(stepIndices[2]);
  });

  it('labels each step with its plain-language purpose, not internal terminology', () => {
    expect(APP_TS).toContain('Choose action');
    expect(APP_TS).toContain('Fill parameters');
    expect(APP_TS).toMatch(/Generate externally,?\s*then paste output back/);
  });
});

describe('Generator Input card appears only for scripts with an exit directive', () => {
  it('the card is only assembled when a script-derived exit name is defined', () => {
    // generatorInputCard's own gating condition, verbatim.
    expect(APP_TS).toContain('const generatorInputCard = filledOk && linkedScript && exitName !== undefined');
  });

  it('exitName itself comes from the script\'s own @@ exit directive, not a guess', () => {
    expect(APP_TS).toContain('const exitName = linkedScript ? extractExitDirectiveValue(linkedScript.rawText) : undefined;');
  });
});

describe('missing companion disables only companion-dependent actions', () => {
  it('"Copy exit companion" is disabled when the companion is not resolved', () => {
    const match = /<button class="btn" data-action="copy-exit-companion-text"\$\{resolved \? '' : ' disabled'\}/.exec(APP_TS);
    expect(match).not.toBeNull();
  });

  it('"Copy generator input bundle" is disabled when the companion is not resolved', () => {
    const match = /<button class="btn" data-action="copy-generator-input-bundle"\$\{resolved \? '' : ' disabled'\}/.exec(APP_TS);
    expect(match).not.toBeNull();
  });

  it('"Copy filled script" inside the Generator Input card carries no companion-status condition at all', () => {
    const cardFnStart = APP_TS.indexOf('function generatorInputSectionHtml(');
    const cardFnBody = APP_TS.slice(cardFnStart, APP_TS.indexOf('\n}', cardFnStart));
    const filledScriptButtonLine = cardFnBody.split('\n').find((l) => l.includes('data-action="copy-filled-script"'));
    expect(filledScriptButtonLine).toBeDefined();
    expect(filledScriptButtonLine).not.toContain('disabled');
  });

  it('the bundle-copy click handler also refuses to run when the companion is missing (not just a disabled attribute)', () => {
    expect(APP_TS).toContain("if (exitResolution?.status === 'missing') break;");
  });
});

describe('external generator link is labeled external and never carries generated/user data', () => {
  it('opens in a new tab with noopener/noreferrer, and is clearly labeled as an external site', () => {
    const fnStart = APP_TS.indexOf('function externalGeneratorLinkHtml()');
    const fnBody = APP_TS.slice(fnStart, APP_TS.indexOf('\n}', fnStart));
    expect(fnBody).toContain('target="_blank"');
    expect(fnBody).toContain('rel="noopener noreferrer"');
    expect(fnBody).toMatch(/external site/i);
    expect(fnBody).toMatch(/not affiliated/i);
  });

  it('the link function takes no parameters, so it cannot embed any filled script, field value, or companion text in its URL', () => {
    expect(APP_TS).toContain('function externalGeneratorLinkHtml(): string {');
  });

  it('states plainly that nothing is sent to the external site automatically', () => {
    const fnStart = APP_TS.indexOf('function externalGeneratorLinkHtml()');
    const fnBody = APP_TS.slice(fnStart, APP_TS.indexOf('\n}', fnStart));
    expect(fnBody.toLowerCase()).toMatch(/nothing here sends|does not send|never sends/);
  });

  it('the URL points at a fixed, hardcoded upstream constant, never a template built from state', () => {
    expect(APP_TS).toMatch(/const ESHARK_GENERATOR_EXTERNAL_URL = 'https:\/\/e-sh4rk\.github\.io\/CodeGenerator\/[^']*';/);
  });
});

describe('copy feedback for the four named actions', () => {
  it.each([
    ['Copied filled script ✓', "el.textContent = ok ? 'Copied filled script ✓'"],
    ['Copied exit companion ✓', "el.textContent = ok ? 'Copied exit companion ✓'"],
    ['Copied generator input bundle ✓', "el.textContent = ok ? 'Copied generator input bundle ✓'"],
    ['Copied box names ✓', "el.textContent = ok ? 'Copied box names ✓'"],
  ])('%s feedback text is wired to a real copy handler', (_label, snippet) => {
    expect(APP_TS).toContain(snippet);
  });

  it('"Copied box names" feedback covers both the compact and raw copy-all handlers', () => {
    const occurrences = APP_TS.split("el.textContent = ok ? 'Copied box names ✓'").length - 1;
    expect(occurrences).toBe(2);
  });
});
