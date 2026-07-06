import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Source-text checks, matching test/attribution.test.ts and
// test/runScriptFlowPolish.test.ts's established precedent for asserting
// structural properties of the UI layer's DOM-heavy render functions.

function readRepoFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
}

// Run Script's own render module (see src/ui/renderRunScript.ts) and Setup's
// (see src/ui/renderSetup.ts) — split out of what used to be a single
// src/ui/app.ts in experiment/split-ui-app.
const RUN_SCRIPT_TS = readRepoFile('src/ui/renderRunScript.ts');
const SETUP_TS = readRepoFile('src/ui/renderSetup.ts');

describe('Run Script does not expose schema/script ids', () => {
  it('the empty-state helper never renders a raw id, only labels/counts', () => {
    const fnStart = RUN_SCRIPT_TS.indexOf('function runScriptEmptyStateHtml(');
    const fnBody = RUN_SCRIPT_TS.slice(fnStart, RUN_SCRIPT_TS.indexOf('\n}', fnStart));
    expect(fnBody).not.toMatch(/schema\.id|curated\.id|scriptId\}/);
  });

  it('the status line reads target/filename/readiness only, no schema id interpolation', () => {
    const lineStart = RUN_SCRIPT_TS.indexOf('const statusLine = `<p class="muted">Target:');
    expect(lineStart).toBeGreaterThan(-1);
    const line = RUN_SCRIPT_TS.slice(lineStart, RUN_SCRIPT_TS.indexOf('`;', lineStart));
    expect(line).not.toContain('curated.id');
    expect(line).not.toContain('.scriptId}');
  });
});

describe('Setup availability matrix shows readiness by target', () => {
  it('is rendered as its own labeled, Setup-only disclosure', () => {
    expect(SETUP_TS).toContain('function actionAvailabilityMatrixHtml(project: Project): string {');
    const fnStart = SETUP_TS.indexOf('function actionAvailabilityMatrixHtml(');
    const fnBody = SETUP_TS.slice(fnStart, SETUP_TS.indexOf('\n}', fnStart));
    expect(fnBody).toContain('Action availability by target');
    expect(fnBody).toContain('Setup only');
  });

  it('collapses to exactly the four documented cell labels', () => {
    const fnStart = SETUP_TS.indexOf('function actionAvailabilityCellLabel(');
    const fnBody = SETUP_TS.slice(fnStart, SETUP_TS.indexOf('\n}', fnStart));
    expect(fnBody).toContain("text: 'Ready'");
    expect(fnBody).toContain("text: 'Missing companion'");
    expect(fnBody).toContain("text: 'Needs review'");
    expect(fnBody).toContain("text: 'Not available'");
  });

  it('is wired into the Setup screen (renderScripts), not Run Script', () => {
    expect(SETUP_TS).toContain('${actionAvailabilityMatrixHtml(p)}');
  });
});

describe('action cards avoid Catalog Audit details', () => {
  it('the enhanced status line shows a plain-language readiness badge, not a raw ActionAvailabilityDetail/catalog-gap value', () => {
    const lineStart = RUN_SCRIPT_TS.indexOf('const readinessBadge =');
    const line = RUN_SCRIPT_TS.slice(lineStart, RUN_SCRIPT_TS.indexOf(';\n', lineStart) + 1);
    expect(line).toMatch(/generator input ready|missing exit companion/);
    expect(line).not.toContain('hasCatalogGaps');
  });
});
