import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Source-text checks, not DOM/UI tests — matches this repo's existing
// convention for asserting properties of files that aren't otherwise
// unit-testable in isolation (see test/networkAudit.test.ts, which reads
// scripts/check-no-network.mjs's own source the same way).

function readRepoFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
}

const DISCLAIMER_DOCS = ['README.md', 'docs/attribution.md', 'docs/local-generator-poc.md'];

describe('attribution/disclaimer text exists in docs', () => {
  it.each(DISCLAIMER_DOCS)('%s states this project is not affiliated with, endorsed by, or maintained by E-Sh4rk', (path) => {
    const text = readRepoFile(path);
    // [\s*]* tolerates markdown bold markers/line-wrapping between words (e.g. "endorsed by, or\nmaintained**").
    expect(text).toMatch(/not affiliated with,?[\s*]*endorsed by,?[\s*]*or[\s*]*maintained by E-Sh4rk/i);
  });

  it('docs/attribution.md links to the E-Sh4rk/EmeraldACE_web, CodeGenerator, and CodeGeneratorOffline repositories', () => {
    const text = readRepoFile('docs/attribution.md');
    expect(text).toContain('github.com/E-Sh4rk/EmeraldACE_web');
    expect(text).toContain('github.com/E-Sh4rk/CodeGenerator');
    expect(text).toContain('github.com/E-Sh4rk/CodeGeneratorOffline');
  });

  it('docs/attribution.md states E-Sh4rk\'s scripts/CodeGenerator remain the source of truth', () => {
    const text = readRepoFile('docs/attribution.md');
    expect(text).toMatch(/source of truth/i);
  });

  it('docs/attribution.md states manual paste-back remains supported', () => {
    const text = readRepoFile('docs/attribution.md');
    expect(text.toLowerCase()).toContain('manual paste-back');
  });

  it('docs/attribution.md states the local generator POC is private/local only and requires a user-provided untracked artifact', () => {
    const text = readRepoFile('docs/attribution.md');
    expect(text.toLowerCase()).toMatch(/user-provided,?\s*untracked/);
  });

  it('docs/attribution.md does not reference any upstream logo or image asset', () => {
    const text = readRepoFile('docs/attribution.md');
    expect(text).not.toMatch(/<img/i);
    expect(text).not.toMatch(/\.(png|jpg|jpeg|svg|gif)/i);
  });
});

describe('app does not imply official E-Sh4rk affiliation', () => {
  it('src/ui/renderAdvanced.ts\'s About/attribution card states independence and links only to plain-text repo URLs, no image/logo tags', () => {
    const text = readRepoFile('src/ui/renderAdvanced.ts');
    const aboutCardMatch = /<h3>About &amp; attribution<\/h3>[\s\S]*?<\/div>/.exec(text);
    expect(aboutCardMatch).not.toBeNull();
    const card = aboutCardMatch![0];
    expect(card).toMatch(/not affiliated with/i);
    expect(card).not.toMatch(/<img/i);
  });

  it('README.md does not use wording that could be read as claiming to be the official E-Sh4rk tool', () => {
    const text = readRepoFile('README.md');
    expect(text).not.toMatch(/official E-Sh4rk/i);
    expect(text).not.toMatch(/the E-Sh4rk (app|tool|generator UI)\b/i);
  });

  it('docs/attribution.md explicitly states this app is not the official E-Sh4rk UI', () => {
    const text = readRepoFile('docs/attribution.md');
    expect(text).toMatch(/not the official E-Sh4rk UI/i);
  });
});

describe('local generator POC remains gated and optional', () => {
  it('the dev-only panel is still gated by the exact fbw.enableLocalGeneratorPoc localStorage check', () => {
    const text = readRepoFile('src/ui/renderAdvanced.ts');
    expect(text).toContain("window.localStorage.getItem('fbw.enableLocalGeneratorPoc') === 'true'");
  });

  it('the panel render call is still conditioned on isLocalGeneratorPocEnabled()', () => {
    const text = readRepoFile('src/ui/renderAdvanced.ts');
    expect(text).toMatch(/isLocalGeneratorPocEnabled\(\)\s*\?\s*renderLocalGeneratorPocPanel\(\)\s*:\s*''/);
  });

  it('running the local generator POC still requires an explicit button click, not an automatic call', () => {
    const renderText = readRepoFile('src/ui/renderAdvanced.ts');
    const handlerText = readRepoFile('src/ui/eventHandlers.ts');
    expect(renderText).toContain('data-action="run-local-generator-poc"');
    // The only call site is the click-handler case body itself — an
    // assignment inside the async handleClick switch, never a bare
    // top-level or render()-time invocation.
    const callSites = handlerText.match(/\brunLocalGeneratorPoc\(/g) ?? [];
    expect(callSites).toHaveLength(1);
    expect(handlerText).toContain('poc.lastResult = await runLocalGeneratorPoc(');
  });
});
