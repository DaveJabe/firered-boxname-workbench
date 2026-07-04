// Read-only checklist templates.
//
// These are neutral REVIEW PROMPTS only — questions a researcher asks about how
// their own documentation was recorded and reviewed. They contain no operational
// values and the app never edits them at runtime; the user instantiates copies.

import type { ChecklistItem, ChecklistState } from '../core/types.js';

export interface TemplateItem {
  templateKey: string;
  category: string;
  prompt: string;
  required: boolean;
}

export interface ChecklistTemplate {
  key: string;
  title: string;
  description: string;
  items: readonly TemplateItem[];
}

const FIRERED_SETUP: ChecklistTemplate = {
  key: 'firered-setup-review',
  title: 'FireRed setup documentation review',
  description:
    'Confirms that metadata, sources, assumptions, and formatting have been recorded and reviewed before a project is considered complete.',
  items: [
    { templateKey: 'meta-revision', category: 'Metadata', required: true, prompt: 'Revision label is recorded and matches the source material.' },
    { templateKey: 'meta-language', category: 'Metadata', required: false, prompt: 'Language label is recorded.' },
    { templateKey: 'meta-title', category: 'Metadata', required: false, prompt: 'A descriptive project title is set.' },
    { templateKey: 'src-titles', category: 'Sources', required: true, prompt: 'Every imported text block has a descriptive title.' },
    { templateKey: 'src-provenance', category: 'Sources', required: false, prompt: 'The origin of each imported block is noted (where the text came from).' },
    { templateKey: 'src-revision-match', category: 'Sources', required: false, prompt: 'Each imported block\'s revision label matches the project revision.' },
    { templateKey: 'assume-written', category: 'Assumptions', required: true, prompt: 'Setup assumptions are written down in plain language.' },
    { templateKey: 'assume-risks', category: 'Assumptions', required: false, prompt: 'Known risks and caveats are documented alongside the assumptions.' },
    { templateKey: 'assume-unknowns', category: 'Assumptions', required: false, prompt: 'Open questions / unknowns are listed explicitly.' },
    { templateKey: 'fmt-validated', category: 'Formatting', required: false, prompt: 'Formatting validation has been run and findings reviewed.' },
    { templateKey: 'fmt-glyphs', category: 'Formatting', required: false, prompt: 'Any flagged look-alike or unsupported display characters have been checked.' },
    { templateKey: 'review-second', category: 'Review', required: false, prompt: 'A second reviewer has read the notes (or this is explicitly a solo review).' },
  ],
};

export const TEMPLATES: readonly ChecklistTemplate[] = Object.freeze([FIRERED_SETUP]);

export function getTemplate(key: string): ChecklistTemplate | undefined {
  return TEMPLATES.find((t) => t.key === key);
}

/** Turn a template into fresh, editable checklist items with new ids. */
export function instantiateTemplate(key: string, makeId: () => string): ChecklistItem[] {
  const template = getTemplate(key);
  if (!template) return [];
  const initial: ChecklistState = 'unchecked';
  return template.items.map((it) => ({
    id: makeId(),
    templateKey: it.templateKey,
    prompt: it.prompt,
    category: it.category,
    state: initial,
    note: '',
    required: it.required,
  }));
}
