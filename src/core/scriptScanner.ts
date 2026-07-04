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
  ScriptFile,
  ScriptScanResult,
  ScriptSection,
  VariableCandidate,
} from './types.js';
import { splitLines } from './normalize.js';

const MARKER = '@@';
const ASSIGNMENT = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]*?)\s*(?:;\s*(.*))?$/;
const COMMENT_LINE = /^\s*(?:;|#|\/\/)\s*(.*)$/;
const ANNOTATION = /@input:([a-zA-Z0-9_]+)/;

/** 0-based index of the first line containing the `@@` marker, or null.
 *  Exported so other modules (e.g. the script filler) agree on exactly
 *  where the header/body boundary is. */
export function findMarkerLineIndex(lines: string[]): number | null {
  const idx = lines.findIndex((l) => l.includes(MARKER));
  return idx === -1 ? null : idx;
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
  for (let i = 0; i < headerLines.length; i++) {
    const match = ASSIGNMENT.exec(headerLines[i]);
    if (!match) continue;
    const [, name, rawValue, trailingComment] = match;

    const precedingLine = i > 0 ? headerLines[i - 1] : undefined;
    const precedingComment = precedingLine ? COMMENT_LINE.exec(precedingLine)?.[1] : undefined;
    const nearbyComment = nonEmpty(trailingComment) ?? nonEmpty(precedingComment);

    const annotationMatch = ANNOTATION.exec(`${trailingComment ?? ''} ${precedingComment ?? ''}`);
    const annotation = annotationMatch ? `@input:${annotationMatch[1]}` : undefined;

    const inferredType = inferFieldType(rawValue);
    const candidate: VariableCandidate = {
      name,
      rawValue: rawValue.trim(),
      line: i + 1,
      inferredType,
      confidence: inferConfidence(Boolean(annotation), inferredType),
    };
    if (nearbyComment !== undefined) candidate.nearbyComment = nearbyComment;
    if (annotation !== undefined) candidate.annotation = annotation;
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

  return {
    scriptId: script.id,
    scannedAt: nowIso(),
    markerLine: markerIdx === null ? null : markerIdx + 1,
    sections,
    candidates: scanHeaderCandidates(headerLines),
  };
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
    const notes = [c.nearbyComment, c.annotation].filter((s): s is string => Boolean(s)).join(' — ');
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
