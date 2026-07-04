// Pure helpers for the in-app curated schema builder (mock mode only).
//
// SAFETY CONTRACT: this module never executes, assembles, or fills a script,
// and never invokes a generator. It only maps a scanner VariableCandidate
// (already-extracted text) into a starting-point CuratedSchemaField, and
// validates a hand-edited draft before it is saved into
// Project.curatedSchemas. Every value it produces comes from the candidate
// or the user's own edits — nothing is invented.

import type {
  ActionFieldValue,
  CuratedActionSchema,
  CuratedSchemaField,
  CuratedSchemaStatus,
  Project,
  VariableCandidate,
} from './types.js';
import { isBlank } from './normalize.js';

const STATUSES: readonly CuratedSchemaStatus[] = ['draft', 'reviewed', 'disabled'];

function unquote(raw: string): string {
  const m = /^(["'])(.*)\1$/.exec(raw);
  return m ? m[2] : raw;
}

/** Split into camelCase/PascalCase/ACRONYM words, keeping runs of 2+ uppercase letters (e.g. "NPC") intact. */
const WORD_TOKEN = /[A-Z]+(?![a-z])|[A-Z][a-z]*|[a-z]+|[0-9]+/g;

/**
 * Turn a variable name into a readable label seed: `Move` -> "Move",
 * `MoveSlot` -> "Move slot", `NPC` -> "NPC". Acronym-like all-uppercase
 * words are preserved as-is; other words are lowercased except the very
 * first letter of the label. Purely cosmetic — the user can always edit it.
 */
function humanizeVariableName(name: string): string {
  const tokens = name.match(WORD_TOKEN);
  if (!tokens || tokens.length === 0) return name;
  return tokens
    .map((t, i) => {
      if (/^[A-Z]{2,}$/.test(t)) return t; // acronym — keep as-is
      const lower = t.toLowerCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(' ');
}

/** Guess a field's default value from its candidate's raw scanned text — never invented. */
function defaultValueFromRawValue(type: CuratedSchemaField['type'], rawValue: string): ActionFieldValue {
  const v = rawValue.trim();
  if (type === 'number') {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }
  if (type === 'checkbox') return /^true$/i.test(v);
  if (type === 'text') return unquote(v);
  return v; // select: the raw token itself becomes its one known option value.
}

/**
 * Turn one scanner candidate into a starting-point CuratedSchemaField. This
 * is only a seed for the schema builder UI — every value comes directly from
 * the candidate, and the caller is expected to let the user review/edit it
 * before it is saved.
 */
export function candidateToDraftField(candidate: VariableCandidate): CuratedSchemaField {
  const type: CuratedSchemaField['type'] = candidate.inferredType === 'unknown' ? 'text' : candidate.inferredType;
  const field: CuratedSchemaField = {
    key: candidate.name,
    label: humanizeVariableName(candidate.name),
    type,
    required: false,
    variableName: candidate.name,
    defaultValue: defaultValueFromRawValue(type, candidate.rawValue),
  };
  if (candidate.nearbyComment) field.helpText = candidate.nearbyComment;
  if (candidate.annotation) field.warnings = [`Scanner annotation: ${candidate.annotation}`];
  if (type === 'select') {
    const v = candidate.rawValue.trim();
    field.options = [{ value: v, label: v }];
  }
  return field;
}

/**
 * Validate a curated schema draft before saving. Returns every problem found
 * (not just the first), so the schema builder UI can show them all at once.
 * An empty array means the draft is ready to save. `project` is only used to
 * confirm the linked script still exists — nothing here reads or changes
 * script text.
 */
export function validateDraftSchema(draft: CuratedActionSchema, project: Project): string[] {
  const errors: string[] = [];
  if (isBlank(draft.id)) errors.push('Schema id is required.');
  if (isBlank(draft.label)) errors.push('Label is required.');
  if (draft.fields.length === 0) errors.push('Include at least one field.');
  if (!STATUSES.includes(draft.status)) errors.push('Status must be draft, reviewed, or disabled.');
  if (draft.scriptId && !project.scripts.some((s) => s.id === draft.scriptId)) {
    errors.push('Linked script was not found in this workspace.');
  }

  const keyCounts = new Map<string, number>();
  const variableCounts = new Map<string, number>();
  draft.fields.forEach((f, i) => {
    const label = `Field ${i + 1}${f.label ? ` ("${f.label}")` : ''}`;
    if (isBlank(f.key)) errors.push(`${label}: key is required.`);
    if (isBlank(f.label)) errors.push(`${label}: label is required.`);
    if (isBlank(f.variableName)) errors.push(`${label}: variable name is required.`);
    if (f.type === 'select' && (!f.options || f.options.length === 0)) {
      errors.push(`${label}: select fields need at least one option.`);
    }
    if (f.key) keyCounts.set(f.key, (keyCounts.get(f.key) ?? 0) + 1);
    if (f.variableName) variableCounts.set(f.variableName, (variableCounts.get(f.variableName) ?? 0) + 1);
  });
  for (const [key, count] of keyCounts) {
    if (count > 1) errors.push(`Field key "${key}" is used more than once.`);
  }
  for (const [variableName, count] of variableCounts) {
    if (count > 1) errors.push(`Variable "${variableName}" is mapped by more than one field.`);
  }

  return errors;
}
