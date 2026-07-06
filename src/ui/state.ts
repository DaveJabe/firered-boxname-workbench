// The UI layer's single global mutable state object, its component-state
// shapes/factories, and the small mutators that transition schema-editor /
// review-case-editor state in response to a user action. Extracted from
// app.ts as part of splitting the UI layer into smaller modules — no
// behavior change: every render*.ts screen module and eventHandlers.ts reads
// and mutates the same `state` object by direct reference, exactly as
// before.
//
// `render` is exported as a mutable, reassignable binding rather than a
// fixed function: app.ts is the only module that knows how to dispatch to
// every screen (it imports every render*.ts module), so it calls
// setRenderer() once at startup with its own render() dispatcher. Every
// other module (this one's commit()/refreshSummaries(), eventHandlers.ts)
// only ever calls the current `render` — never the initial no-op — because
// app.ts's module-level setRenderer() call runs before init() is ever
// invoked (see main.ts).

import type {
  Project,
  ActionFieldValue,
  ScriptFile,
  CuratedActionSchema,
  CuratedSchemaField,
  CuratedSchemaStatus,
  FilledScriptResult,
  ParsedGeneratorOutput,
  ParsedBoxNameRow,
  GameTarget,
  ReferenceCatalogId,
  SchemaReviewCase,
} from '../core/types.js';
import type { ActionTemplate } from '../templates/action-templates.js';
import { coerceActionFieldValue } from '../core/actionInput.js';
import { toActionTemplateShape } from '../core/curatedSchemas.js';
import {
  getRunnableActionsForTarget,
  type SupportedAction,
} from '../core/supportedActionRegistry.js';
import { hashGeneratorOutput, buildManualPasteProvenance, type SchemaReviewCaseBatchResult } from '../core/schemaVerification.js';
import { candidateToDraftField, defaultIncludedCandidateNames } from '../core/schemaBuilder.js';
import { effectiveScriptTarget, type ScriptLibraryFilter } from '../core/scriptPack.js';
import { UNKNOWN_TARGET } from '../core/gameTarget.js';
import type { ChecklistFilter } from '../core/review.js';
import type { SourceProfile } from '../core/esharkSource.js';
import type { LocalGeneratorPocResult } from '../experimental/localEsharkGeneratorPoc.js';
import type { Screen } from './navigation.js';
import { putProject, listProjects, type ProjectSummary } from '../data/storage.js';
import { splitCommaList, parseOptInt } from './viewModels.js';

export interface PasteBackState {
  rawText: string;
  label: string;
  parsed: ParsedGeneratorOutput | null;
  savedBlockId: string | null;
}

/**
 * EXPERIMENTAL, DEV-ONLY state for the "Local generator POC" panel — see
 * docs/local-generator-poc.md. Never persisted to the project; reset on
 * every fresh workspace load same as actionBuilder/pasteBack.
 */
export interface LocalGeneratorPocPanelState {
  /** Manual paste of the shared exit-codes companion text (Task 6 — see docs/local-generator-poc.md's "Exit companion" section). */
  exitCompanionText: string;
  artifactStatus: 'unknown' | 'checking' | 'detected' | 'missing';
  running: boolean;
  lastResult: LocalGeneratorPocResult | null;
}

export function makeLocalGeneratorPocPanelState(): LocalGeneratorPocPanelState {
  return { exitCompanionText: '', artifactStatus: 'unknown', running: false, lastResult: null };
}

export interface ActionBuilderState {
  revisionLabel: string;
  /** Which supported action (actionKey) is selected in Run Script's action dropdown. */
  selectedActionKey: string;
  /** Which of the selected action's variants (a specific schema id) is selected/resolved. */
  curatedSchemaId: string;
  /** The game/language/revision to run against. Starts Unknown/Mixed — nothing defaults to "exact" against Unknown. */
  runTarget: GameTarget;
  values: Record<string, ActionFieldValue>;
  /** Result of the last "Preview filled script" click, if any. Never invokes a generator. */
  filledScript: FilledScriptResult | null;
  filledScriptSavedBlockId: string | null;
  /** Manual paste-back of output from the user's own external generator. */
  pasteBack: PasteBackState;
  /** Search/filter text per reference-select field key — narrows that field's dropdown options only. */
  referenceSearch: Record<string, string>;
}

function makePasteBackState(): PasteBackState {
  return { rawText: '', label: '', parsed: null, savedBlockId: null };
}

/** Placeholder used only before any workspace has loaded — always replaced by makeActionBuilderState(project). */
function makeEmptyActionBuilderState(): ActionBuilderState {
  return {
    revisionLabel: '',
    selectedActionKey: '',
    curatedSchemaId: '',
    runTarget: UNKNOWN_TARGET,
    values: {},
    filledScript: null,
    filledScriptSavedBlockId: null,
    pasteBack: makePasteBackState(),
    referenceSearch: {},
  };
}

/** Seed Run Script state for a workspace. Target starts Unknown/Mixed, so no schema is
 *  pre-selected yet — the user picks a target first, never a silent guess. */
export function makeActionBuilderState(project: Project): ActionBuilderState {
  return {
    revisionLabel: project.metadata.revisionLabel,
    selectedActionKey: '',
    curatedSchemaId: '',
    runTarget: UNKNOWN_TARGET,
    values: {},
    filledScript: null,
    filledScriptSavedBlockId: null,
    pasteBack: makePasteBackState(),
    referenceSearch: {},
  };
}

// --- Curated schema builder (Manage Scripts, seeded from a scan) ---------
//
// Lets the user turn selected scanner candidates into a CuratedActionSchema
// by hand, without writing JSON. This only builds a CuratedActionSchema
// object for Project.curatedSchemas — it never fills a script or invokes a
// generator itself.

export interface SchemaEditorState {
  scriptId: string;
  id: string;
  label: string;
  description: string;
  status: CuratedSchemaStatus;
  /** Stable action concept (e.g. "teach-any-move"), shared across target-specific schema variants. */
  actionKey: string;
  /** Which game/language/revision this schema variant targets. Seeded from the linked script's effective target. */
  target: GameTarget;
  /** Comma-separated for a single text input; parsed into an array on save. */
  supportedRevisionLabels: string;
  /** Candidate names (== initial variableName) currently included as fields. */
  included: Set<string>;
  /** Editable draft fields, keyed by the candidate name that seeded them. */
  fields: Map<string, CuratedSchemaField>;
  errors: string[];
  savedSchemaId: string | null;
}

export function openSchemaEditor(script: ScriptFile, project: Project): void {
  const candidates = script.lastScan?.candidates ?? [];
  const included = new Set(defaultIncludedCandidateNames(candidates));
  const fields = new Map<string, CuratedSchemaField>();
  for (const name of included) {
    const candidate = candidates.find((c) => c.name === name);
    if (candidate) fields.set(name, candidateToDraftField(candidate));
  }
  const pack = script.packId ? project.scriptPacks.find((pk) => pk.id === script.packId) : undefined;
  state.schemaEditor = {
    scriptId: script.id,
    id: script.filename.replace(/\.[^./]+$/, ''),
    label: '',
    description: '',
    status: 'draft',
    actionKey: '',
    target: effectiveScriptTarget(script, pack),
    supportedRevisionLabels: '',
    included,
    fields,
    errors: [],
    savedSchemaId: null,
  };
}

/**
 * Open the schema editor to edit an already-saved schema in place — seeded
 * from the schema's own fields/target/status rather than fresh scan
 * candidates. Because editor.id starts as the existing schema's id,
 * save-schema-from-editor's upsertCuratedSchema replaces it rather than
 * creating a new one. Requires the schema still have a linked script (the
 * editor's candidate tables are script-scoped); does nothing otherwise.
 */
export function openSchemaEditorForExisting(schema: CuratedActionSchema, project: Project): void {
  const script = schema.scriptId ? project.scripts.find((s) => s.id === schema.scriptId) : undefined;
  if (!script) return;
  const included = new Set(schema.fields.map((f) => f.variableName));
  const fields = new Map<string, CuratedSchemaField>();
  for (const f of schema.fields) fields.set(f.variableName, { ...f });
  state.schemaEditor = {
    scriptId: script.id,
    id: schema.id,
    label: schema.label,
    description: schema.description,
    status: schema.status,
    actionKey: schema.actionKey ?? '',
    target: schema.target,
    supportedRevisionLabels: schema.supportedRevisionLabels.join(', '),
    included,
    fields,
    errors: [],
    savedSchemaId: null,
  };
}

export function toggleSchemaCandidate(candidateName: string, included: boolean): void {
  const editor = state.schemaEditor;
  const p = state.project;
  if (!editor || !p) return;
  if (included) {
    if (!editor.fields.has(candidateName)) {
      const script = p.scripts.find((s) => s.id === editor.scriptId);
      const candidate = script?.lastScan?.candidates.find((c) => c.name === candidateName);
      if (candidate) editor.fields.set(candidateName, candidateToDraftField(candidate));
    }
    editor.included.add(candidateName);
  } else {
    editor.included.delete(candidateName);
    editor.fields.delete(candidateName);
  }
}

export function buildDraftSchemaFromEditor(editor: SchemaEditorState, script: ScriptFile): CuratedActionSchema {
  const fields = Array.from(editor.included)
    .map((name) => editor.fields.get(name))
    .filter((f): f is CuratedSchemaField => Boolean(f));
  const schema: CuratedActionSchema = {
    id: editor.id.trim(),
    label: editor.label.trim(),
    description: editor.description.trim(),
    target: editor.target,
    scriptId: script.id,
    scriptFilename: script.filename,
    supportedRevisionLabels: editor.supportedRevisionLabels.split(',').map((s) => s.trim()).filter(Boolean),
    fields,
    status: editor.status,
  };
  const actionKey = editor.actionKey.trim();
  if (actionKey) schema.actionKey = actionKey;
  return schema;
}

export function applySchemaEditorBinding(bind: string, value: string): void {
  const editor = state.schemaEditor;
  if (!editor) return;
  switch (bind) {
    case 'schema.id': editor.id = value; break;
    case 'schema.label': editor.label = value; break;
    case 'schema.description': editor.description = value; break;
    case 'schema.status': editor.status = value as CuratedSchemaStatus; break;
    case 'schema.actionKey': editor.actionKey = value; break;
    case 'schema.supportedRevisionLabels': editor.supportedRevisionLabels = value; break;
    case 'schema.target.game': editor.target = { ...editor.target, game: value as GameTarget['game'] }; break;
    case 'schema.target.language': editor.target = { ...editor.target, language: value as GameTarget['language'] }; break;
    case 'schema.target.revision': editor.target = { ...editor.target, revision: value as GameTarget['revision'] }; break;
    case 'schema.target.regionLabel': editor.target = { ...editor.target, regionLabel: value || undefined }; break;
    case 'schema.target.notes': editor.target = { ...editor.target, notes: value || undefined }; break;
  }
}

export function applySchemaFieldBinding(bind: string, candidateKey: string | undefined, value: string, checked: boolean | undefined): void {
  const editor = state.schemaEditor;
  if (!editor || !candidateKey) return;
  const field = editor.fields.get(candidateKey);
  if (!field) return;
  switch (bind) {
    case 'schema-field.key': field.key = value; break;
    case 'schema-field.label': field.label = value; break;
    case 'schema-field.type': {
      field.type = value as CuratedSchemaField['type'];
      // Falling back to number/text/select drops the now-meaningless catalog link.
      if (field.type !== 'reference-select') field.referenceCatalogId = undefined;
      break;
    }
    case 'schema-field.referenceCatalogId':
      field.referenceCatalogId = (value as ReferenceCatalogId) || undefined;
      break;
    case 'schema-field.required': field.required = checked ?? false; break;
    case 'schema-field.helpText': field.helpText = value || undefined; break;
    case 'schema-field.warningsText': {
      const lines = value.split('\n').map((l) => l.trim()).filter(Boolean);
      field.warnings = lines.length ? lines : undefined;
      break;
    }
    case 'schema-field.optionsText': {
      const options = value
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const [v, l] = line.split('|').map((s) => s.trim());
          return { value: v, label: l || v };
        });
      field.options = options.length ? options : undefined;
      break;
    }
    case 'schema-field.defaultValue':
      field.defaultValue = coerceActionFieldValue(field, value, checked);
      break;
    case 'schema-field.min': field.min = parseOptInt(value); break;
    case 'schema-field.max': field.max = parseOptInt(value); break;
  }
}

// --- Schema review case editor (Run Script "Save as schema review case") ---
//
// Lets a user turn a fill they've already tried (plus, optionally, output
// they pasted back) into a re-checkable SchemaReviewCase, without writing
// JSON by hand. Only ever builds a SchemaReviewCase object for
// Project.schemaReviewCases — verifying one later still only ever calls
// fillScriptFromSchema and the existing output parser (see
// core/schemaVerification.ts), never a generator.

export interface ReviewCaseEditorState {
  schemaId: string;
  /** The supported-action variant this case verifies — equal to schemaId in the current one-variant-per-schema model (see core/supportedActionRegistry.ts). */
  variantId: string;
  scriptId?: string;
  actionKey?: string;
  target: GameTarget;
  scriptFilename?: string;
  scriptRelativePath?: string;
  inputValues: Record<string, ActionFieldValue>;
  /** Comma-separated for a single text input; parsed into an array on save. */
  expectedChangedVariables: string;
  forbiddenChangedVariables: string;
  reviewerNote: string;
  rawGeneratorOutput?: string;
  parsedBoxRows?: readonly ParsedBoxNameRow[];
  savedCaseId: string | null;
}

/** Prefill a review case from what's already on screen: the schema, its linked script, the current fill, and any pasted/parsed output. */
export function openReviewCaseEditor(curated: CuratedActionSchema, script: ScriptFile | undefined, ab: ActionBuilderState): void {
  const changedVariables = ab.filledScript?.changedLines.map((c) => c.variableName) ?? [];
  const internalVariables = (script?.lastScan?.candidates ?? []).filter((c) => c.internal).map((c) => c.name);
  const editor: ReviewCaseEditorState = {
    schemaId: curated.id,
    variantId: curated.id,
    target: curated.target,
    inputValues: { ...ab.values },
    expectedChangedVariables: changedVariables.join(', '),
    forbiddenChangedVariables: internalVariables.join(', '),
    reviewerNote: '',
    savedCaseId: null,
  };
  if (curated.actionKey) editor.actionKey = curated.actionKey;
  if (script) {
    editor.scriptId = script.id;
    if (script.relativePath) editor.scriptRelativePath = script.relativePath;
  }
  if (curated.scriptFilename) editor.scriptFilename = curated.scriptFilename;
  if (ab.pasteBack.rawText) editor.rawGeneratorOutput = ab.pasteBack.rawText;
  if (ab.pasteBack.parsed) editor.parsedBoxRows = ab.pasteBack.parsed.rows;
  state.reviewCaseEditor = editor;
}

export function buildReviewCaseFromEditor(editor: ReviewCaseEditorState, id: string, now: string): SchemaReviewCase {
  const reviewCase: SchemaReviewCase = {
    id,
    schemaId: editor.schemaId,
    variantId: editor.variantId,
    target: editor.target,
    createdAt: now,
    inputValues: editor.inputValues,
    expectedChangedVariables: splitCommaList(editor.expectedChangedVariables),
    forbiddenChangedVariables: splitCommaList(editor.forbiddenChangedVariables),
    status: 'draft',
  };
  if (editor.actionKey) reviewCase.actionKey = editor.actionKey;
  if (editor.scriptId) reviewCase.scriptId = editor.scriptId;
  if (editor.scriptFilename) reviewCase.scriptFilename = editor.scriptFilename;
  if (editor.scriptRelativePath) reviewCase.scriptRelativePath = editor.scriptRelativePath;
  const reviewerNote = editor.reviewerNote.trim();
  if (reviewerNote) reviewCase.reviewerNote = reviewerNote;
  if (editor.rawGeneratorOutput) {
    reviewCase.rawGeneratorOutput = editor.rawGeneratorOutput;
    reviewCase.generatorOutputHash = hashGeneratorOutput(editor.rawGeneratorOutput);
    reviewCase.outputProvenance = buildManualPasteProvenance(now);
  }
  if (editor.parsedBoxRows) reviewCase.parsedBoxRows = editor.parsedBoxRows;
  return reviewCase;
}

export function applyReviewCaseEditorBinding(bind: string, value: string): void {
  const editor = state.reviewCaseEditor;
  if (!editor) return;
  switch (bind) {
    case 'reviewcase.expectedChangedVariables': editor.expectedChangedVariables = value; break;
    case 'reviewcase.forbiddenChangedVariables': editor.forbiddenChangedVariables = value; break;
    case 'reviewcase.reviewerNote': editor.reviewerNote = value; break;
  }
}

/**
 * Resolve Run Script's currently-selected schema by id exactly — no fallback
 * to "first selectable." Only ever resolves to a schema that's a ready,
 * exact-target-matching variant of some supported action for the current
 * target (see getRunnableActionsForTarget) — draft, disabled, detached,
 * scriptless, fieldless, Unknown-target, or different-target schemas never
 * resolve here. Which action/variant id counts as the sensible default is
 * decided explicitly whenever the target or workspace changes (see
 * onRunTargetChanged) or the action/variant selector changes (see
 * applyActionBinding); this never guesses at render time.
 */
export function resolveActionDefinition(
  ab: ActionBuilderState,
  project: Project,
): { template: ActionTemplate; curated: CuratedActionSchema } | null {
  for (const action of getRunnableActionsForTarget(project, ab.runTarget)) {
    const variant = action.variants.find((v) => v.schemaId === ab.curatedSchemaId);
    if (variant) {
      const schema = project.curatedSchemas.find((s) => s.id === variant.schemaId)!;
      return { template: toActionTemplateShape(schema), curated: schema };
    }
  }
  return null;
}

/** The action/variant Run Script should default to for this target: the
 *  current selection if it's still a ready, exact-target match, else the
 *  first runnable action's first variant, else none (the empty state
 *  takes over). Never a silent guess. */
export function pickDefaultActionSelection(
  actions: readonly SupportedAction[],
  currentActionKey: string,
  currentSchemaId: string,
): { actionKey: string; schemaId: string } {
  const currentAction = actions.find((a) => a.actionKey === currentActionKey);
  const currentVariant = currentAction?.variants.find((v) => v.schemaId === currentSchemaId);
  if (currentAction && currentVariant) return { actionKey: currentActionKey, schemaId: currentSchemaId };
  const firstAction = actions[0];
  if (!firstAction) return { actionKey: '', schemaId: '' };
  return { actionKey: firstAction.actionKey, schemaId: firstAction.variants[0]!.schemaId };
}

export const state: {
  screen: Screen;
  summaries: ProjectSummary[];
  project: Project | null;
  checklistFilter: ChecklistFilter;
  findingGroup: 'severity' | 'target';
  collapsed: Set<string>;
  blockEdit: Set<string>;
  highlightRef: string | null;
  actionBuilder: ActionBuilderState;
  schemaEditor: SchemaEditorState | null;
  /** Run Script "Save as schema review case" — see openReviewCaseEditor. */
  reviewCaseEditor: ReviewCaseEditorState | null;
  /** Setup "Schema verification": which schema's review cases are currently expanded, if any. */
  reviewCasesDetailSchemaId: string | null;
  /** Setup "Schema verification": the last "Run all verification cases" result, if any has been run this session (not persisted to the project). */
  batchVerificationResult: SchemaReviewCaseBatchResult | null;
  /** Setup "Similar scripts": which script's shape-family detail is currently expanded, if any. */
  familyDetailScriptId: string | null;
  /** Landing screen: whether the full workspace list is expanded (vs. just the most recent one). */
  manageWorkspacesOpen: boolean;
  /** Manage Scripts: which script rows to show. */
  scriptsFilter: ScriptLibraryFilter;
  /** Manage Scripts: current search text (filename/title). */
  scriptsSearch: string;
  /**
   * Manage Scripts: whether the "Advanced: all scripts" disclosure should
   * render open. Since render() replaces the whole screen's innerHTML on
   * every call, a plain HTML `open` attribute can't rely on the browser's
   * own toggled state surviving past the next re-render — this flag is the
   * persistent source of truth, kept in sync with the user's own
   * clicks via a native 'toggle' event listener (see init() in app.ts).
   */
  scriptsAdvancedOpen: boolean;
  /** Setup "Catalog Audit" disclosure — same persisted-open-state pattern as scriptsAdvancedOpen. */
  catalogAuditOpen: boolean;
  /** Setup "Catalog Audit": finding keys the user has explicitly marked ignored/manual-only this session (not persisted to the project). */
  catalogAuditIgnored: Set<string>;
  /** Manage Scripts: target metadata to apply to the next imported script folder. */
  pendingPackTarget: GameTarget;
  pendingPackTargetNotes: string;
  /** Manage Scripts: which folder layout to assume for the next imported script folder. */
  pendingSourceProfile: SourceProfile;
  /** Manage Scripts: whether the explicit GitHub fetch is in flight (disables the button, shows progress). */
  esharkFetchInProgress: boolean;
  /** EXPERIMENTAL, DEV-ONLY — see docs/local-generator-poc.md. */
  localGeneratorPocPanel: LocalGeneratorPocPanelState;
} = {
  screen: 'actions',
  summaries: [],
  project: null,
  checklistFilter: 'all',
  findingGroup: 'severity',
  collapsed: new Set(),
  blockEdit: new Set(),
  highlightRef: null,
  actionBuilder: makeEmptyActionBuilderState(),
  schemaEditor: null,
  reviewCaseEditor: null,
  reviewCasesDetailSchemaId: null,
  batchVerificationResult: null,
  familyDetailScriptId: null,
  manageWorkspacesOpen: false,
  scriptsFilter: 'all',
  scriptsSearch: '',
  scriptsAdvancedOpen: false,
  catalogAuditOpen: false,
  catalogAuditIgnored: new Set(),
  pendingPackTarget: UNKNOWN_TARGET,
  pendingPackTargetNotes: '',
  pendingSourceProfile: 'generic',
  esharkFetchInProgress: false,
  localGeneratorPocPanel: makeLocalGeneratorPocPanelState(),
};

export const uid = (): string => crypto.randomUUID();
export const nowIso = (): string => new Date().toISOString();

// --- render/persistence wiring -----------------------------------------------
//
// app.ts is the only module that can build the actual render() dispatcher
// (it imports every render*.ts screen module), so it calls setRenderer()
// once at startup. Every other module always calls the live `render`
// binding below — never a stale copy — since ESM `import { render }`
// bindings are live references, not snapshots.

export let render: () => void = () => {};

export function setRenderer(fn: () => void): void {
  render = fn;
}

export function commit(): void {
  if (state.project) {
    state.project.metadata.updatedAt = nowIso();
    void putProject(state.project);
  }
  render();
}

export async function refreshSummaries(): Promise<void> {
  state.summaries = await listProjects();
  render();
}
