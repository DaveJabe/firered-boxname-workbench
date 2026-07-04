// Local-only persistence. Uses IndexedDB in the browser. No network, ever.

import type {
  Project,
  ProjectStatus,
  GameMetadata,
  ChecklistItem,
  UserNote,
  ImportedTextBlock,
  TextSource,
  ValidationSettings,
  ValidationResult,
  Finding,
  FindingTarget,
} from '../core/types.js';
import { SOURCE_TYPES, SOURCE_SCHEMA_VERSION, SOURCE_FIELD_MAX } from '../core/sources.js';

const DB_NAME = 'firered-research-notebook';
const STORE = 'projects';
const DB_VERSION = 1;

export interface ProjectSummary {
  id: string;
  title: string;
  revisionLabel: string;
  status: ProjectStatus;
  updatedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export async function putProject(project: Project): Promise<void> {
  await tx('readwrite', (store) => store.put(project));
}

export async function getProject(id: string): Promise<Project | undefined> {
  const result = await tx<Project | undefined>('readonly', (store) => store.get(id));
  return result ?? undefined;
}

export async function deleteProject(id: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(id));
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await tx<Project[]>('readonly', (store) => store.getAll());
  return all
    .map((p) => ({
      id: p.id,
      title: p.metadata.projectTitle || '(untitled)',
      revisionLabel: p.metadata.revisionLabel,
      status: p.projectStatus,
      updatedAt: p.metadata.updatedAt,
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

// --- JSON export / import (local files only) --------------------------------

export function exportProjectJson(project: Project): string {
  return JSON.stringify(project, null, 2);
}

/**
 * Parse and DEEP-validate an imported project file, returning a well-formed
 * Project or throwing a clear, path-specific error.
 *
 * This validator only inspects structure and field types. It does NOT coerce,
 * transform, sanitize, or rewrite any user text: every string value is copied
 * through verbatim. The one accommodation is a backwards-compatible READ path
 * for the old `metadata.routeFamilyLabel` field, whose value is carried over
 * verbatim into the current `metadata.projectTitle` field.
 */
export function importProjectJson(text: string): Project {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  return parseProject(parsed);
}

// --- deep validation helpers (structure/type only) --------------------------

const MODES = ['documentation', 'checklist-review'] as const;
const STATUSES = ['draft', 'in-review', 'reviewed', 'exported'] as const;
const CHECK_STATES = ['unchecked', 'confirmed', 'not-applicable', 'needs-follow-up'] as const;
const COUNT_MODES = ['codepoints', 'utf16'] as const;
const SEVERITIES = ['info', 'warning', 'error'] as const;
const TARGET_KINDS = ['metadata', 'checklist', 'note', 'importedBlock'] as const;
const RULES = [
  'missing-field', 'empty-field', 'inconsistent-label', 'line-length', 'line-count',
  'unsupported-glyph', 'ambiguous-glyph', 'duplicate-item', 'incomplete-assumptions',
] as const;

function fail(msg: string): never {
  throw new Error(`Invalid project: ${msg}`);
}

function asObject(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(`${path} must be an object.`);
  return v as Record<string, unknown>;
}
function asString(v: unknown, path: string): string {
  if (typeof v !== 'string') fail(`${path} must be a string.`);
  return v;
}
function asOptString(v: unknown, path: string): string | undefined {
  return v === undefined ? undefined : asString(v, path);
}
function asStringMax(v: unknown, path: string, max: number): string {
  const s = asString(v, path);
  if (s.length > max) fail(`${path} must be at most ${max} characters.`);
  return s;
}
function asOptStringMax(v: unknown, path: string, max: number): string | undefined {
  return v === undefined ? undefined : asStringMax(v, path, max);
}
function asNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || Number.isNaN(v)) fail(`${path} must be a number.`);
  return v;
}
function asOptNumber(v: unknown, path: string): number | undefined {
  return v === undefined ? undefined : asNumber(v, path);
}
function asBoolean(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(`${path} must be a boolean.`);
  return v;
}
function asArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(`${path} must be an array.`);
  return v;
}
function asEnum<T extends string>(v: unknown, allowed: readonly T[], path: string): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    fail(`${path} must be one of: ${allowed.join(', ')}.`);
  }
  return v as T;
}

function parseMetadata(v: unknown): GameMetadata {
  const o = asObject(v, 'metadata');
  if (o.schemaVersion !== 1) fail('metadata.schemaVersion must be 1.');
  if (o.game !== 'FireRed') fail('metadata.game must be "FireRed".');

  // Backwards-compatible read: accept old routeFamilyLabel as projectTitle.
  let projectTitle: string;
  if (o.projectTitle !== undefined) {
    projectTitle = asString(o.projectTitle, 'metadata.projectTitle');
  } else if (o.routeFamilyLabel !== undefined) {
    projectTitle = asString(o.routeFamilyLabel, 'metadata.routeFamilyLabel');
  } else {
    fail('metadata.projectTitle must be a string.');
  }

  return {
    schemaVersion: 1,
    game: 'FireRed',
    revisionLabel: asString(o.revisionLabel, 'metadata.revisionLabel'),
    languageLabel: asString(o.languageLabel, 'metadata.languageLabel'),
    projectTitle,
    mode: asEnum(o.mode, MODES, 'metadata.mode'),
    createdAt: asString(o.createdAt, 'metadata.createdAt'),
    updatedAt: asString(o.updatedAt, 'metadata.updatedAt'),
  };
}

function parseChecklistItem(v: unknown, i: number): ChecklistItem {
  const o = asObject(v, `checklist[${i}]`);
  const item: ChecklistItem = {
    id: asString(o.id, `checklist[${i}].id`),
    prompt: asString(o.prompt, `checklist[${i}].prompt`),
    category: asString(o.category, `checklist[${i}].category`),
    state: asEnum(o.state, CHECK_STATES, `checklist[${i}].state`),
    note: asString(o.note, `checklist[${i}].note`),
    required: asBoolean(o.required, `checklist[${i}].required`),
  };
  const templateKey = asOptString(o.templateKey, `checklist[${i}].templateKey`);
  if (templateKey !== undefined) item.templateKey = templateKey;
  return item;
}

function parseNote(v: unknown, i: number): UserNote {
  const o = asObject(v, `notes[${i}]`);
  return {
    id: asString(o.id, `notes[${i}].id`),
    sectionTitle: asString(o.sectionTitle, `notes[${i}].sectionTitle`),
    body: asString(o.body, `notes[${i}].body`),
    order: asNumber(o.order, `notes[${i}].order`),
  };
}

function parseBlock(v: unknown, i: number): ImportedTextBlock {
  const path = `importedBlocks[${i}]`;
  const o = asObject(v, path);
  return {
    id: asString(o.id, `${path}.id`),
    title: asString(o.title, `${path}.title`),
    categoryLabel: asString(o.categoryLabel, `${path}.categoryLabel`),
    revisionLabel: asString(o.revisionLabel, `${path}.revisionLabel`),
    rawText: asString(o.rawText, `${path}.rawText`),
    notes: asString(o.notes, `${path}.notes`),
    source: o.source !== undefined ? parseSource(o.source, path) : legacySource(o, path),
  };
}

function parseSource(v: unknown, path: string): TextSource {
  const p = `${path}.source`;
  const o = asObject(v, p);
  const src: TextSource = {
    type: asEnum(o.type, SOURCE_TYPES, `${p}.type`),
    label: asStringMax(o.label, `${p}.label`, SOURCE_FIELD_MAX.label),
    importedAt: asString(o.importedAt, `${p}.importedAt`),
    schemaVersion: asNumber(o.schemaVersion, `${p}.schemaVersion`),
  };
  const filename = asOptString(o.filename, `${p}.filename`);
  if (filename !== undefined) src.filename = filename;
  const notes = asOptStringMax(o.notes, `${p}.notes`, SOURCE_FIELD_MAX.notes);
  if (notes !== undefined) src.notes = notes;
  // External-local-tool documentation fields (strings only; never executed/parsed).
  const toolName = asOptStringMax(o.toolName, `${p}.toolName`, SOURCE_FIELD_MAX.toolName);
  if (toolName !== undefined) src.toolName = toolName;
  const toolVersion = asOptStringMax(o.toolVersion, `${p}.toolVersion`, SOURCE_FIELD_MAX.toolVersion);
  if (toolVersion !== undefined) src.toolVersion = toolVersion;
  const toolUrl = asOptStringMax(o.toolUrl, `${p}.toolUrl`, SOURCE_FIELD_MAX.toolUrl);
  if (toolUrl !== undefined) src.toolUrl = toolUrl;
  const invocationNotes = asOptStringMax(o.invocationNotes, `${p}.invocationNotes`, SOURCE_FIELD_MAX.invocationNotes);
  if (invocationNotes !== undefined) src.invocationNotes = invocationNotes;
  return src;
}

/** Migrate a legacy block (top-level importedAt / sourceFilename, no `source`) to
 *  a default TextSource. Values are carried over verbatim; nothing is transformed. */
function legacySource(o: Record<string, unknown>, path: string): TextSource {
  const importedAt = asString(o.importedAt, `${path}.importedAt`);
  const filename = asOptString(o.sourceFilename, `${path}.sourceFilename`);
  const src: TextSource = {
    type: filename !== undefined ? 'file-import' : 'manual-paste',
    label: filename ?? 'Imported text',
    importedAt,
    schemaVersion: SOURCE_SCHEMA_VERSION,
  };
  if (filename !== undefined) src.filename = filename;
  return src;
}

function parseSettings(v: unknown): ValidationSettings {
  const o = asObject(v, 'settings');
  const settings: ValidationSettings = {
    maxLineLength: asNumber(o.maxLineLength, 'settings.maxLineLength'),
    countMode: asEnum(o.countMode, COUNT_MODES, 'settings.countMode'),
  };
  const min = asOptNumber(o.expectedLineMin, 'settings.expectedLineMin');
  if (min !== undefined) settings.expectedLineMin = min;
  const max = asOptNumber(o.expectedLineMax, 'settings.expectedLineMax');
  if (max !== undefined) settings.expectedLineMax = max;
  const allowed = asOptString(o.allowedGlyphs, 'settings.allowedGlyphs');
  if (allowed !== undefined) settings.allowedGlyphs = allowed;
  return settings;
}

function parseFinding(v: unknown, i: number): Finding {
  const o = asObject(v, `findings[${i}]`);
  const t = asObject(o.target, `findings[${i}].target`);
  const target: FindingTarget = { kind: asEnum(t.kind, TARGET_KINDS, `findings[${i}].target.kind`) };
  const refId = asOptString(t.refId, `findings[${i}].target.refId`);
  if (refId !== undefined) target.refId = refId;
  const line = asOptNumber(t.line, `findings[${i}].target.line`);
  if (line !== undefined) target.line = line;
  const column = asOptNumber(t.column, `findings[${i}].target.column`);
  if (column !== undefined) target.column = column;

  const finding: Finding = {
    id: asString(o.id, `findings[${i}].id`),
    rule: asEnum(o.rule, RULES, `findings[${i}].rule`),
    severity: asEnum(o.severity, SEVERITIES, `findings[${i}].severity`),
    target,
    message: asString(o.message, `findings[${i}].message`),
    acknowledged: asBoolean(o.acknowledged, `findings[${i}].acknowledged`),
  };
  const ackNote = asOptString(o.ackNote, `findings[${i}].ackNote`);
  if (ackNote !== undefined) finding.ackNote = ackNote;
  return finding;
}

function parseLatestValidation(v: unknown): ValidationResult | null {
  if (v === undefined || v === null) return null;
  const o = asObject(v, 'latestValidation');
  return {
    runAt: asString(o.runAt, 'latestValidation.runAt'),
    findings: asArray(o.findings, 'latestValidation.findings').map(parseFinding),
  };
}

function parseProject(v: unknown): Project {
  const o = asObject(v, 'root');
  if (o.schemaVersion !== 1) fail('schemaVersion must be 1.');
  return {
    schemaVersion: 1,
    id: asString(o.id, 'id'),
    metadata: parseMetadata(o.metadata),
    checklist: asArray(o.checklist, 'checklist').map(parseChecklistItem),
    notes: asArray(o.notes, 'notes').map(parseNote),
    importedBlocks: asArray(o.importedBlocks, 'importedBlocks').map(parseBlock),
    settings: parseSettings(o.settings),
    latestValidation: parseLatestValidation(o.latestValidation),
    projectStatus: asEnum(o.projectStatus, STATUSES, 'projectStatus'),
  };
}
