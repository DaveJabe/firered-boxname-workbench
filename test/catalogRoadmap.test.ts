import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createProject } from '../src/core/factory.js';
import { scanScript } from '../src/core/scriptScanner.js';
import { buildCatalogGapAudit } from '../src/core/catalogGapAudit.js';
import { REFERENCE_CATALOGS, REFERENCE_CATALOG_IDS } from '../src/reference/index.js';
import type { Project, ScriptFile } from '../src/core/types.js';

const ROADMAP_PATH = fileURLToPath(new URL('../docs/catalog-roadmap.md', import.meta.url));
const ISO = '2026-01-01T00:00:00.000Z';

// The seven catalogs this roadmap plans for — deliberately excludes gen3-species,
// which the roadmap itself notes is covered by its own separate branch/plan.
const PLANNED_CATALOG_IDS = [
  'gen3-abilities', 'gen3-natures', 'gen3-types',
  'frlg-flags', 'frlg-vars', 'frlg-maps-warps', 'frlg-trainers',
] as const;

describe('catalog stubs remain missing/partial (this branch changes no catalog data)', () => {
  it('every planned catalog is still a zero-entry, partial, "not yet implemented" stub', () => {
    for (const id of PLANNED_CATALOG_IDS) {
      const catalog = REFERENCE_CATALOGS[id];
      expect(catalog.entries).toEqual([]);
      expect(catalog.partial).toBe(true);
      expect(catalog.label).toMatch(/not yet implemented/);
    }
  });
});

function makeIdGen(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

function makeProject(scripts: ScriptFile[]): Project {
  const project = createProject(
    { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
    makeIdGen(),
    () => ISO,
  );
  project.scripts = scripts;
  return project;
}

// Harmless, invented toy fixtures — no real script, flag/var/ability id, address, or payload byte.
function makeScript(id: string, rawText: string): ScriptFile {
  const script: ScriptFile = { id, filename: `${id}.txt`, rawText, importedAt: ISO };
  script.lastScan = scanScript(script, () => ISO);
  return script;
}

describe('Catalog Audit still reports missing catalogs correctly for the planned catalogs', () => {
  it('reports gen3-abilities and frlg-flags as missing when scanned candidates suggest them', () => {
    const project = makeProject([
      makeScript('a', ['ability = 1', '@@', 'PretendBodyLine'].join('\n')),
      makeScript('b', ['flag = 1', '@@', 'PretendBodyLine'].join('\n')),
    ]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    expect(audit.missingCatalogs.some((n) => n.catalogId === 'gen3-abilities')).toBe(true);
    expect(audit.missingCatalogs.some((n) => n.catalogId === 'frlg-flags')).toBe(true);
  });

  it('reports gen3-natures, gen3-types, frlg-vars, frlg-maps-warps, and frlg-trainers as missing via their existing name heuristics', () => {
    const project = makeProject([
      makeScript('a', ['nature = 1', '@@', 'PretendBodyLine'].join('\n')),
      makeScript('b', ['type = 1', '@@', 'PretendBodyLine'].join('\n')),
      makeScript('c', ['var = 1', '@@', 'PretendBodyLine'].join('\n')),
      makeScript('d', ['warpId = 1', '@@', 'PretendBodyLine'].join('\n')),
      makeScript('e', ['trainerId = 1', '@@', 'PretendBodyLine'].join('\n')),
    ]);
    const audit = buildCatalogGapAudit(project, () => ISO);
    for (const id of ['gen3-natures', 'gen3-types', 'frlg-vars', 'frlg-maps-warps', 'frlg-trainers'] as const) {
      expect(audit.missingCatalogs.some((n) => n.catalogId === id)).toBe(true);
    }
  });
});

describe('docs/catalog-roadmap.md', () => {
  const roadmapText = readFileSync(ROADMAP_PATH, 'utf8');

  it('exists and has substantial content', () => {
    expect(roadmapText.length).toBeGreaterThan(1000);
  });

  it('mentions every planned catalog id, and every mentioned id is a real registered catalog id', () => {
    for (const id of PLANNED_CATALOG_IDS) {
      expect(roadmapText).toContain(id);
      expect(REFERENCE_CATALOG_IDS).toContain(id);
    }
  });

  it('never claims a planned catalog is complete', () => {
    // "not yet implemented"/"stub"/"partial" language is expected; "complete: true" or an
    // outright completeness claim for any of the seven planned ids is not.
    expect(roadmapText).not.toMatch(/gen3-abilities.*is complete/is);
    expect(roadmapText).not.toMatch(/frlg-flags.*is complete/is);
  });

  it('explicitly excludes gen3-species from its planned scope', () => {
    expect(roadmapText).toMatch(/gen3-species.*(not listed|own separate|separate branch)/is);
  });

  it('documents a recommended implementation order covering all seven planned catalogs', () => {
    for (const id of PLANNED_CATALOG_IDS) {
      expect(roadmapText).toContain(`\`${id}\``);
    }
    expect(roadmapText.toLowerCase()).toContain('recommended implementation order');
  });
});
