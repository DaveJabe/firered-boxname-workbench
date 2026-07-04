// Local script scanner (developer-only, informational).
//
// SAFETY CONTRACT: every function in this module reads script text as TEXT
// ONLY, using plain regex pattern matching over lines. It never executes,
// assembles, interprets, or transforms the script; it performs no file,
// process, or network I/O and never shells out. Its output is a heuristic,
// best-effort DRAFT for a human to review before manually building a real
// action template — never a live template, and never real generator input
// or output. It does not mutate the ScriptFile it is given.

import type {
  CandidateConfidence,
  DraftActionField,
  DraftActionSchema,
  InferredFieldKind,
  ScriptDirective,
  ScriptFile,
  ScriptScanResult,
  ScriptSection,
  VariableCandidate,
} from './types.js';
import { splitLines } from './normalize.js';

const ASSIGNMENT = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
/** A `@key = value` or `@@key = value` header directive — one or two leading `@`s followed by more content.
 *  Distinct from the bare `@@` marker line, which has no `= value` at all. */
const DIRECTIVE = /^\s*@{1,2}\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
const COMMENT_LINE = /^\s*(?:;|#|\/\/)\s*(.*)$/;
const ANNOTATION = /@input:([a-zA-Z0-9_]+)/;
/** A `@input:xxx` tag appearing directly after a value with no semicolon, e.g. `Move = 325 @input:move`.
 *  Exported so the script filler can preserve it as trailing content too, rather than swallowing it as part of the value. */
export const INLINE_ANNOTATION = /(?:^|\s)(@input:[a-zA-Z0-9_]+)\s*$/;
/** A preceding full-line comment marking following header assignments as internal/helper, not user-facing. */
const DO_NOT_MODIFY = /do\s*not\s*modify|don'?t\s*modify|do\s*not\s*(?:edit|change)/i;

/** Only a line whose trimmed text is exactly "@@" is the header/body separator.
 *  A directive line like `@@ author = "..."` is NOT the separator — it has
 *  more content after the `@@` and belongs to the header, not the boundary.
 *  Exported so other modules (e.g. the script filler) agree on exactly
 *  where the header/body boundary is. */
export function findMarkerLineIndex(lines: string[]): number | null {
  const idx = lines.findIndex((l) => l.trim() === '@@');
  return idx === -1 ? null : idx;
}

function unquote(v: string): string {
  const m = /^(["'])(.*)\1$/.exec(v.trim());
  return m ? m[2] : v.trim();
}

/** Every recognized `@key = value` / `@@key = value` header directive line, in order. */
function scanDirectives(headerLines: string[]): ScriptDirective[] {
  const directives: ScriptDirective[] = [];
  headerLines.forEach((line, i) => {
    const m = DIRECTIVE.exec(line);
    if (!m) return;
    directives.push({ key: m[1], rawValue: m[2].trim(), line: i + 1 });
  });
  return directives;
}

function directiveValue(directives: ScriptDirective[], key: string): string | undefined {
  const d = directives.find((d) => d.key.toLowerCase() === key);
  return d ? unquote(d.rawValue) : undefined;
}

/** Rough, heuristic guess at a field's shape from its raw assigned value only. */
function inferFieldType(rawValue: string): InferredFieldKind {
  const v = rawValue.trim();
  if (/^-?\d+$/.test(v)) return 'number';
  if (/^(true|false)$/i.test(v)) return 'checkbox';
  if (/^(["']).*\1$/.test(v)) return 'text';
  if (/^[A-Z][A-Z0-9_]*$/.test(v)) return 'select';
  return 'unknown';
}

function inferConfidence(hasAnnotation: boolean, inferredType: InferredFieldKind): CandidateConfidence {
  if (hasAnnotation && inferredType !== 'unknown') return 'high';
  if (hasAnnotation || inferredType !== 'unknown') return 'medium';
  return 'low';
}

function nonEmpty(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function scanHeaderCandidates(headerLines: string[]): VariableCandidate[] {
  const candidates: VariableCandidate[] = [];
  let internal = false;

  for (let i = 0; i < headerLines.length; i++) {
    const line = headerLines[i];
    if (DIRECTIVE.test(line)) continue; // directive line — handled by scanDirectives, never a candidate

    const fullLineComment = COMMENT_LINE.exec(line)?.[1];
    if (fullLineComment !== undefined) {
      if (DO_NOT_MODIFY.test(fullLineComment)) internal = true;
      continue; // comment-only line, never a candidate
    }

    const match = ASSIGNMENT.exec(line);
    if (!match) continue;
    const [, name, rest] = match;

    // Split off a trailing `; comment` first, then an inline `@input:xxx`
    // tag that may follow the value directly with no semicolon at all
    // (e.g. `Move = 325 @input:move`).
    const semiIdx = rest.indexOf(';');
    const rawValuePart = semiIdx === -1 ? rest : rest.slice(0, semiIdx);
    const trailingComment = semiIdx === -1 ? undefined : rest.slice(semiIdx + 1);

    const inlineMatch = INLINE_ANNOTATION.exec(rawValuePart);
    const inlineAnnotation = inlineMatch?.[1];
    const rawValue = (inlineMatch ? rawValuePart.slice(0, inlineMatch.index) : rawValuePart).trim();

    const precedingLine = i > 0 ? headerLines[i - 1] : undefined;
    const precedingComment = precedingLine ? COMMENT_LINE.exec(precedingLine)?.[1] : undefined;
    const nearbyComment = nonEmpty(trailingComment) ?? nonEmpty(precedingComment);

    const annotationMatch = inlineAnnotation
      ? undefined
      : ANNOTATION.exec(`${trailingComment ?? ''} ${precedingComment ?? ''}`);
    const inputHint = inlineAnnotation
      ? /^@input:(.+)$/.exec(inlineAnnotation)?.[1]
      : annotationMatch?.[1];
    const annotation = inlineAnnotation ?? (annotationMatch ? `@input:${annotationMatch[1]}` : undefined);

    const inferredType = inferFieldType(rawValue);
    const candidate: VariableCandidate = {
      name,
      rawValue,
      line: i + 1,
      inferredType,
      confidence: inferConfidence(Boolean(annotation), inferredType),
      internal,
    };
    if (nearbyComment !== undefined) candidate.nearbyComment = nearbyComment;
    if (annotation !== undefined) candidate.annotation = annotation;
    if (inputHint !== undefined) candidate.inputHint = inputHint;
    candidates.push(candidate);
  }
  return candidates;
}

/** Scan a ScriptFile's rawText as plain text. Never executes or transforms it. */
export function scanScript(script: ScriptFile, nowIso: () => string): ScriptScanResult {
  const lines = splitLines(script.rawText);
  const markerIdx = findMarkerLineIndex(lines);

  let sections: ScriptSection[];
  let headerLines: string[];
  if (markerIdx === null) {
    headerLines = [];
    sections = [{ kind: 'body', startLine: 1, endLine: lines.length, text: lines.join('\n') }];
  } else {
    headerLines = lines.slice(0, markerIdx);
    const bodyLines = lines.slice(markerIdx + 1);
    sections = [
      { kind: 'header', startLine: 1, endLine: markerIdx, text: headerLines.join('\n') },
      { kind: 'body', startLine: markerIdx + 2, endLine: lines.length, text: bodyLines.join('\n') },
    ];
  }

  const directives = scanDirectives(headerLines);
  const result: ScriptScanResult = {
    scriptId: script.id,
    scannedAt: nowIso(),
    markerLine: markerIdx === null ? null : markerIdx + 1,
    sections,
    candidates: scanHeaderCandidates(headerLines),
    directives,
  };
  const title = directiveValue(directives, 'title');
  const author = directiveValue(directives, 'author');
  const exit = directiveValue(directives, 'exit');
  if (title !== undefined) result.title = title;
  if (author !== undefined) result.author = author;
  if (exit !== undefined) result.exit = exit;
  return result;
}

/** Build an informational draft schema from a scan. Always isDraft: true. */
export function buildDraftActionSchema(
  script: ScriptFile,
  scan: ScriptScanResult,
  nowIso: () => string,
): DraftActionSchema {
  const fields: DraftActionField[] = scan.candidates.map((c) => {
    const field: DraftActionField = {
      key: c.name,
      label: c.name,
      inferredType: c.inferredType,
      confidence: c.confidence,
      sourceLine: c.line,
    };
    const notes = [c.internal ? 'internal/helper — not user-facing' : undefined, c.nearbyComment, c.annotation]
      .filter((s): s is string => Boolean(s))
      .join(' — ');
    if (notes.length > 0) field.notes = notes;
    return field;
  });

  return {
    scriptId: script.id,
    scriptFilename: script.filename,
    generatedAt: nowIso(),
    fields,
    isDraft: true,
  };
}
