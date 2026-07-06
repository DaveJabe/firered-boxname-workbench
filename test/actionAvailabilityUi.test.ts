import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Source-text checks, matching test/attribution.test.ts and
// test/runScriptFlowPolish.test.ts's established precedent for asserting
// structural properties of src/ui/app.ts's DOM-heavy render functions.

function readRepoFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
}

const APP_TS = readRepoFile('src/ui/app.ts');

describe('Run Script does not expose schema/script ids', () => {
  it('the empty-state helper never renders a raw id, only labels/counts', () => {
    const fnStart = APP_TS.indexOf('function runScriptEmptyStateHtml(');
    const fnBody = APP_TS.slice(fnStart, APP_TS.indexOf('\n}', fnStart));
    expect(fnBody).not.toMatch(/schema\.id|curated\.id|scriptId\}/);
  });

  it('the status line reads target/filename/readiness only, no schema id interpolation', () => {
    const lineStart = APP_TS.indexOf('const statusLine = `<p class="muted">Target:');
    expect(lineStart).toBeGreaterThan(-1);
    const line = APP_TS.slice(lineStart, APP_TS.indexOf('`;', lineStart));
    expect(line).not.toContain('curated.id');
    expect(line).not.toContain('.scriptId}');
  });
});

describe('Setup availability matrix shows readiness by target', () => {
  it('is rendered as its own labeled, Setup-only disclosure', () => {
    expect(APP_TS).toContain('function actionAvailabilityMatrixHtml(project: Project): string {');
    const fnStart = APP_TS.indexOf('function actionAvailabilityMatrixHtml(');
    const fnBody = APP_TS.slice(fnStart, APP_TS.indexOf('\n}', fnStart));
    expect(fnBody).toContain('Action availability by target');
    expect(fnBody).toContain('Setup only');
  });

  it('collapses to exactly the four documented cell labels', () => {
    const fnStart = APP_TS.indexOf('function actionAvailabilityCellLabel(');
    const fnBody = APP_TS.slice(fnStart, APP_TS.indexOf('\n}', fnStart));
    expect(fnBody).toContain("text: 'Ready'");
    expect(fnBody).toContain("text: 'Missing companion'");
    expect(fnBody).toContain("text: 'Needs review'");
    expect(fnBody).toContain("text: 'Not available'");
  });

  it('is wired into the Setup screen (renderScripts), not Run Script', () => {
    expect(APP_TS).toContain('${actionAvailabilityMatrixHtml(p)}');
  });
});

describe('action cards avoid Catalog Audit details', () => {
  it('the enhanced status line shows a plain-language readiness badge, not a raw ActionAvailabilityDetail/catalog-gap value', () => {
    const lineStart = APP_TS.indexOf('const readinessBadge =');
    const line = APP_TS.slice(lineStart, APP_TS.indexOf(';\n', lineStart) + 1);
    expect(line).toMatch(/generator input ready|missing exit companion/);
    expect(line).not.toContain('hasCatalogGaps');
  });
});
