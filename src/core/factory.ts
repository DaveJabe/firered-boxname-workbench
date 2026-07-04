import type { Mode, Project } from './types.js';
import { DEFAULT_VALIDATION_SETTINGS } from './types.js';
import { instantiateTemplate } from '../templates/checklist-templates.js';

export interface NewProjectInput {
  revisionLabel: string;
  languageLabel: string;
  projectTitle: string;
  mode: Mode;
  templateKey: string;
}

/** Build a fresh project. Clock and id generator are injected so this stays pure-ish
 *  and testable — no direct Date.now() / random calls inside the core. */
export function createProject(
  input: NewProjectInput,
  makeId: () => string,
  nowIso: () => string,
): Project {
  const now = nowIso();
  return {
    schemaVersion: 1,
    id: makeId(),
    metadata: {
      schemaVersion: 1,
      game: 'FireRed',
      revisionLabel: input.revisionLabel,
      languageLabel: input.languageLabel,
      projectTitle: input.projectTitle,
      mode: input.mode,
      createdAt: now,
      updatedAt: now,
    },
    checklist: instantiateTemplate(input.templateKey, makeId),
    notes: [],
    importedBlocks: [],
    settings: { ...DEFAULT_VALIDATION_SETTINGS },
    latestValidation: null,
    projectStatus: 'draft',
  };
}
