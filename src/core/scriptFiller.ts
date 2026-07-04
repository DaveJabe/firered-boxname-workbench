// Conservative script filler (manual generator workflow — no generator
// invocation).
//
// SAFETY CONTRACT: this module only ever replaces the VALUE portion of a
// simple `name = value` assignment line in a script's HEADER (strictly
// before the first `@@` line), and only for variables a CuratedActionSchema
// explicitly maps. It never touches body lines, never evaluates
// expressions, never infers a variable that isn't already a literal
// assignment line, and never assigns game-level meaning to any value — it
// only swaps one text token for another, preserving everything else in the
// line (leading whitespace, the variable name, spacing around `=`, and any
// trailing comment) byte-for-byte. It performs no file, process, or network
// I/O, and it does not invoke any generator: the result is text for a human
// to copy into their own external tool by hand.

import type { ActionFieldValue, CuratedActionSchema, FilledLineChange, FilledScriptResult } from './types.js';
import { splitLines } from './normalize.js';
import { findMarkerLineIndex } from './scriptScanner.js';
import { toActionTemplateShape } from './curatedSchemas.js';
import { missingRequiredActionFields } from './actionInput.js';

const ASSIGNMENT_LINE = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)([^;]*?)(\s*(?:;.*)?)$/;

function formatValue(type: string, value: ActionFieldValue): string {
  if (type === 'text') return `"${String(value).replace(/"/g, '\\"')}"`;
  if (type === 'checkbox') return value ? 'true' : 'false';
  return String(value); // number or select: bare token, no evaluation or escaping needed
}

function hasUsableValue(type: string, value: ActionFieldValue | undefined): value is ActionFieldValue {
  if (value === undefined) return false;
  if ((type === 'text' || type === 'select') && typeof value === 'string' && value.trim() === '') return false;
  return true;
}

/**
 * Fill a script's header with user-supplied values, per a curated schema's
 * variable mappings. Rejects (returns errors, no changes applied) when any
 * required value is missing, any mapped variable is duplicated across
 * fields, or any mapped variable can't be found before the `@@` marker.
 */
export function fillScriptFromSchema(
  scriptText: string,
  curatedSchema: CuratedActionSchema,
  userValues: Record<string, ActionFieldValue>,
): FilledScriptResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines = splitLines(scriptText);
  const markerIdx = findMarkerLineIndex(lines);
  const headerEnd = markerIdx === null ? lines.length : markerIdx;

  const variableUseCount = new Map<string, number>();
  for (const f of curatedSchema.fields) {
    variableUseCount.set(f.variableName, (variableUseCount.get(f.variableName) ?? 0) + 1);
  }
  for (const [variableName, count] of variableUseCount) {
    if (count > 1) errors.push(`Variable "${variableName}" is mapped by more than one field.`);
  }

  const template = toActionTemplateShape(curatedSchema);
  for (const field of missingRequiredActionFields(template, userValues)) {
    errors.push(`Missing required value for "${field.label}".`);
  }

  const lineIndicesByName = new Map<string, number[]>();
  for (let i = 0; i < headerEnd; i++) {
    const match = ASSIGNMENT_LINE.exec(lines[i]);
    if (!match) continue;
    const name = match[2];
    const arr = lineIndicesByName.get(name) ?? [];
    arr.push(i);
    lineIndicesByName.set(name, arr);
  }
  for (const f of curatedSchema.fields) {
    if (!lineIndicesByName.has(f.variableName)) {
      errors.push(`Mapped variable "${f.variableName}" was not found before the @@ marker.`);
    }
  }

  if (errors.length > 0) {
    return { originalScriptText: scriptText, filledScriptText: scriptText, changedLines: [], warnings, errors };
  }

  const changedLines: FilledLineChange[] = [];
  const outputLines = lines.slice();

  for (const field of curatedSchema.fields) {
    const value = userValues[field.key];
    if (!hasUsableValue(field.type, value)) {
      warnings.push(`No value provided for "${field.label}" — line left unchanged.`);
      continue;
    }
    for (const idx of lineIndicesByName.get(field.variableName) ?? []) {
      const match = ASSIGNMENT_LINE.exec(lines[idx])!;
      const [, leadingWs, name, equalsSpacing, , suffix] = match;
      const before = lines[idx];
      const after = `${leadingWs}${name}${equalsSpacing}${formatValue(field.type, value)}${suffix}`;
      if (after !== before) {
        outputLines[idx] = after;
        changedLines.push({ line: idx + 1, variableName: field.variableName, before, after });
      }
    }
  }

  return {
    originalScriptText: scriptText,
    filledScriptText: outputLines.join('\n'),
    changedLines,
    warnings,
    errors,
  };
}
