import { describe, it, expect } from 'vitest';
import { DEMO_PROJECT_JSON } from '../src/fixtures/demoProject.js';
import { importProjectJson } from '../src/data/storage.js';
import { validateProject } from '../src/core/validators.js';

describe('demo project fixture', () => {
  it('passes deep import validation and has the expected shape', () => {
    const p = importProjectJson(DEMO_PROJECT_JSON);
    expect(p.metadata.game).toBe('FireRed');
    expect(p.metadata.projectTitle).toBe('Sample workbench');
    expect(p.checklist.length).toBeGreaterThan(0);
    expect(p.importedBlocks.length).toBeGreaterThan(0);
  });

  it('runs validators without throwing and leaves block text unchanged', () => {
    const p = importProjectJson(DEMO_PROJECT_JSON);
    const before = p.importedBlocks[0].rawText;
    const findings = validateProject(p);
    expect(Array.isArray(findings)).toBe(true);
    expect(p.importedBlocks[0].rawText).toBe(before);
  });
});
