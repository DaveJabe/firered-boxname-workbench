import type {
  Project,
  ChecklistItem,
  UserNote,
  ImportedTextBlock,
  Finding,
  TargetKind,
  ActionFieldValue,
  ScriptFile,
  ScriptScanResult,
  ScriptPack,
  VariableCandidate,
  DraftActionSchema,
  CuratedActionSchema,
  CuratedSchemaField,
  CuratedSchemaStatus,
  FilledScriptResult,
  ParsedGeneratorOutput,
  GameTarget,
  EsharkCategory,
  EsharkSourceProfile,
  ReferenceCatalogId,
} from '../core/types.js';
import { createProject } from '../core/factory.js';
import { buildValidationResult, countBySeverity } from '../core/validators.js';
import { computeReviewSummary, isReviewComplete, filterByState, type ChecklistFilter } from '../core/review.js';
import { groupBySeverity, groupByTarget, TARGET_LABELS } from '../core/findings.js';
import { numberLines } from '../core/normalize.js';
import { SOURCE_TYPE_LABELS, SOURCE_SCHEMA_VERSION, SELECTABLE_SOURCE_TYPES, SOURCE_FIELD_MAX } from '../core/sources.js';
import { renderReportHtml } from '../report/report.js';
import { TEMPLATES } from '../templates/checklist-templates.js';
import type { ActionField, ActionTemplate } from '../templates/action-templates.js';
import { defaultActionValues, coerceActionFieldValue } from '../core/actionInput.js';
import { scanScript, buildDraftActionSchema } from '../core/scriptScanner.js';
import {
  toActionTemplateShape,
  isSchemaSelectable,
  supportsRevision,
  upsertCuratedSchema,
  defaultRunnableSchemas,
  advancedRunnableSchemas,
  removeCuratedSchema,
  nextDuplicateSchemaId,
  duplicateCuratedSchema,
  detachCuratedSchema,
  countSavedOutputsUsingSchema,
} from '../core/curatedSchemas.js';
import { candidateToDraftField, validateDraftSchema, defaultIncludedCandidateNames } from '../core/schemaBuilder.js';
import { fillScriptFromSchema } from '../core/scriptFiller.js';
import { parseGeneratorOutput, formatCompactBoxNames, formatRawBoxLines } from '../core/generatorOutputParser.js';
import {
  collectScriptPackFiles,
  isRelevantPackFile,
  detectSourceFolderName,
  summarizeBatchScan,
  buildScriptPackRows,
  filterScriptRows,
  searchScriptRows,
  effectiveScriptTarget,
  type CollectedFile,
  type ScriptPackRow,
  type ScriptLibraryFilter,
} from '../core/scriptPack.js';
import { findMatchingPreset, applyPreset } from '../core/schemaPresets.js';
import { SCHEMA_PRESETS } from '../templates/schema-presets.js';
import { summarizeSupportedScripts } from '../core/supportedScripts.js';
import {
  matchReviewedPresets,
  buildCuratedSchemaFromPreset,
  buildReviewedPresetExport,
  serializeReviewedPresetForExport,
} from '../core/reviewedSchemaPresets.js';
import { REVIEWED_SCHEMA_PRESETS } from '../templates/reviewed-schema-presets.js';
import { referenceEntryLabel } from '../core/referenceData.js';
import { REFERENCE_CATALOGS, REFERENCE_CATALOG_IDS, getReferenceCatalog } from '../reference/index.js';
import {
  TARGET_GAMES,
  TARGET_LANGUAGES,
  TARGET_REVISIONS,
  UNKNOWN_TARGET,
  targetLabel,
  checkTargetCompatibility,
  isUnknownTarget,
} from '../core/gameTarget.js';
import {
  SOURCE_PROFILE_INFO,
  ESHARK_SETUP_NOTE,
  LOCAL_ESHARK_SOURCE_PROFILES,
  selectEsharkFiles,
  displayRootPath,
  parseEsharkListEntries,
  lookupEsharkListEntry,
  esharkSourceProfileLabel,
  type SourceProfile,
} from '../core/esharkSource.js';
import { fetchEsharkFilesFrlg, ESHARK_GITHUB_REPO_URL, EsharkFetchError } from '../data/esharkRemote.js';
import { DEMO_PROJECT_JSON } from '../fixtures/demoProject.js';
import {
  listProjects,
  getProject,
  putProject,
  deleteProject,
  exportProjectJson,
  importProjectJson,
  exportDraftActionSchemaJson,
  importCuratedActionSchemaJson,
  type ProjectSummary,
} from '../data/storage.js';
import { escapeHtml, attr, downloadText, openHtmlInNewTab, copyText } from './dom.js';
import {
  type Screen,
  SCREEN_LABEL,
  SIDEBAR_SCREENS,
  sidebarActiveScreen,
  defaultScreenForWorkspace,
  findReusableUntitledWorkspace,
  mostRecentWorkspace,
  type WorkspaceOrigin,
} from './navigation.js';

interface PasteBackState {
  rawText: string;
  label: string;
  parsed: ParsedGeneratorOutput | null;
  savedBlockId: string | null;
}

interface ActionBuilderState {
  revisionLabel: string;
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
function makeActionBuilderState(project: Project): ActionBuilderState {
  return {
    revisionLabel: project.metadata.revisionLabel,
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

interface SchemaEditorState {
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

function openSchemaEditor(script: ScriptFile, project: Project): void {
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
function openSchemaEditorForExisting(schema: CuratedActionSchema, project: Project): void {
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

function toggleSchemaCandidate(candidateName: string, included: boolean): void {
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

function buildDraftSchemaFromEditor(editor: SchemaEditorState, script: ScriptFile): CuratedActionSchema {
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

function applySchemaEditorBinding(bind: string, value: string): void {
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

function applySchemaFieldBinding(bind: string, candidateKey: string | undefined, value: string, checked: boolean | undefined): void {
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

/** Resolve Run Script's currently-selected curated schema to the common
 *  ActionTemplate shape the field renderer expects. Null only when no
 *  selectable curated schema exists at all — callers must not fill/generate then. */
/**
 * Resolve Run Script's currently-selected schema by id exactly — no fallback
 * to "first selectable." Which id counts as the sensible default for the
 * current target is decided explicitly by pickDefaultCuratedSchemaId,
 * called whenever the target or workspace changes; this never guesses.
 */
function resolveActionDefinition(
  ab: ActionBuilderState,
  project: Project,
): { template: ActionTemplate; curated: CuratedActionSchema } | null {
  const schema = project.curatedSchemas.find((s) => s.id === ab.curatedSchemaId && isSchemaSelectable(s));
  return schema ? { template: toActionTemplateShape(schema), curated: schema } : null;
}

/** The schema id Run Script should default to for this target: the current
 *  id if it's still a default-runnable match, else the first default match,
 *  else none (the empty state / advanced disclosure take over). */
function pickDefaultCuratedSchemaId(schemas: readonly CuratedActionSchema[], runTarget: GameTarget, currentId: string): string {
  const defaults = defaultRunnableSchemas(schemas, runTarget);
  if (defaults.some((s) => s.id === currentId)) return currentId;
  return defaults[0]?.id ?? '';
}

const state: {
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
  /** Landing screen: whether the full workspace list is expanded (vs. just the most recent one). */
  manageWorkspacesOpen: boolean;
  /** Manage Scripts: which script rows to show. */
  scriptsFilter: ScriptLibraryFilter;
  /** Manage Scripts: current search text (filename/title). */
  scriptsSearch: string;
  /** Manage Scripts: target metadata to apply to the next imported script folder. */
  pendingPackTarget: GameTarget;
  pendingPackTargetNotes: string;
  /** Manage Scripts: which folder layout to assume for the next imported script folder. */
  pendingSourceProfile: SourceProfile;
  /** Manage Scripts: whether the explicit GitHub fetch is in flight (disables the button, shows progress). */
  esharkFetchInProgress: boolean;
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
  manageWorkspacesOpen: false,
  scriptsFilter: 'all',
  scriptsSearch: '',
  pendingPackTarget: UNKNOWN_TARGET,
  pendingPackTargetNotes: '',
  pendingSourceProfile: 'generic',
  esharkFetchInProgress: false,
};

const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const readVal = (id: string): string => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
const readChecked = (id: string): boolean => (document.getElementById(id) as HTMLInputElement | null)?.checked ?? false;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

// --- persistence helpers ----------------------------------------------------

function commit(): void {
  if (state.project) {
    state.project.metadata.updatedAt = nowIso();
    void putProject(state.project);
  }
  render();
}

async function refreshSummaries(): Promise<void> {
  state.summaries = await listProjects();
  render();
}

// --- rendering --------------------------------------------------------------

const app = () => document.getElementById('app') as HTMLElement;

function opt(value: string, label: string, current: string): string {
  return `<option value="${attr(value)}"${value === current ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

/** Game/Language/Revision selects, reused by the schema editor, script-pack import, and Run Script. */
function targetSelectsHtml(bindPrefix: string, target: GameTarget, idPrefix: string): string {
  const gameOpts = TARGET_GAMES.map((g) => opt(g, g, target.game)).join('');
  const langOpts = TARGET_LANGUAGES.map((l) => opt(l, l, target.language)).join('');
  const revOpts = TARGET_REVISIONS.map((r) => opt(r, r, target.revision)).join('');
  return `<div class="grid2">
    <div><label for="${idPrefix}-game">Game</label><select id="${idPrefix}-game" data-bind="${bindPrefix}.game">${gameOpts}</select></div>
    <div><label for="${idPrefix}-lang">Language</label><select id="${idPrefix}-lang" data-bind="${bindPrefix}.language">${langOpts}</select></div>
  </div>
  <label for="${idPrefix}-rev">Revision</label>
  <select id="${idPrefix}-rev" data-bind="${bindPrefix}.revision">${revOpts}</select>`;
}

const SOURCE_PROFILE_OPTIONS: readonly SourceProfile[] = ['generic', ...LOCAL_ESHARK_SOURCE_PROFILES];

/** Source-profile selector for folder import, with a plain-language explanation of the selected option. */
function sourceProfileSelectHtml(): string {
  const profile = state.pendingSourceProfile;
  const options = SOURCE_PROFILE_OPTIONS.map(
    (p) => `<option value="${p}"${p === profile ? ' selected' : ''}>${escapeHtml(SOURCE_PROFILE_INFO[p].label)}</option>`,
  ).join('');
  const setupNote = profile !== 'generic'
    ? `<p class="muted" style="font-style:italic">${escapeHtml(ESHARK_SETUP_NOTE)}</p>`
    : '';
  return `<label for="pending-source-profile">Source</label>
  <select id="pending-source-profile" data-bind="pendingSourceProfile">${options}</select>
  <p class="muted">${escapeHtml(SOURCE_PROFILE_INFO[profile].description)}</p>
  ${setupNote}`;
}

function navRail(): string {
  if (!state.project) return '';
  const activeTab = sidebarActiveScreen(state.screen);
  const items = SIDEBAR_SCREENS
    .map((s) => {
      const active = activeTab === s;
      return `<button data-action="nav" data-screen="${s}" class="${active ? 'active' : ''}"${active ? ' aria-current="page"' : ''}>${escapeHtml(SCREEN_LABEL[s])}</button>`;
    })
    .join('');
  return `<nav class="rail" aria-label="Workspace sections">
    <h2>${escapeHtml(state.project.metadata.projectTitle || 'Untitled workspace')}</h2>
    ${items}
  </nav>`;
}

function topbar(): string {
  if (!state.project) return '';
  const m = state.project.metadata;
  return `<header class="topbar">
    <div class="tb-left">
      <strong>${escapeHtml(m.projectTitle || 'Untitled')}</strong>
      <span class="muted">Rev: ${escapeHtml(m.revisionLabel || '—')}</span>
      <span class="pill status-${state.project.projectStatus}">${escapeHtml(state.project.projectStatus)}</span>
    </div>
    <div class="tb-right">
      <span class="muted">${escapeHtml(SCREEN_LABEL[state.screen])}</span>
      <span class="saved" title="Every change is autosaved to this device (IndexedDB)">● Saved locally</span>
    </div>
  </header>`;
}

function layout(content: string): string {
  return `<a href="#main" class="skip">Skip to content</a>
    <div class="banner">Local &amp; reviewable — no hidden network calls, no hidden execution. Network access only occurs when you explicitly fetch E-Sh4rk scripts; no generator is run by fetching them. Existing local scripts/generators are the source of truth; this app prepares input, reviews output, and keeps provenance.</div>
    ${topbar()}
    <div class="shell">${navRail()}<main id="main" tabindex="-1">${content}</main></div>`;
}

function render(): void {
  let content = '';
  switch (state.screen) {
    case 'landing': content = renderLanding(); break;
    case 'start-here': content = renderStartHere(); break;
    case 'settings': content = renderSettings(); break;
    case 'actions': content = renderActions(); break;
    case 'scripts': content = renderScripts(); break;
    case 'checklist': content = renderChecklist(); break;
    case 'notes': content = renderNotes(); break;
    case 'outputs': content = renderOutputs(); break;
    case 'validation': content = renderValidation(); break;
    case 'report': content = renderReport(); break;
    case 'advanced': content = renderAdvanced(); break;
  }
  app().innerHTML = layout(content);

  // Post-render: flash and scroll to a jump target, if any.
  if (state.highlightRef) {
    const ref = state.highlightRef;
    state.highlightRef = null;
    const el = Array.from(app().querySelectorAll<HTMLElement>('[data-ref]')).find((e) => e.dataset.ref === ref);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('flash');
      window.setTimeout(() => el.classList.remove('flash'), 1500);
    }
  }
}

function workspaceRow(s: ProjectSummary): string {
  return `<div class="card row" style="justify-content:space-between">
    <div>
      <strong>${escapeHtml(s.title)}</strong>
      <div class="muted">Revision: ${escapeHtml(s.revisionLabel || '—')} · <span class="pill status-${escapeHtml(s.status)}">${escapeHtml(s.status)}</span> · updated ${escapeHtml(s.updatedAt.slice(0, 10))}</div>
    </div>
    <div class="row">
      <button class="btn" data-action="open" data-id="${attr(s.id)}">Open</button>
      <button class="btn danger" data-action="delete" data-id="${attr(s.id)}">Delete</button>
    </div>
  </div>`;
}

function renderLanding(): string {
  const recent = mostRecentWorkspace(state.summaries);
  const workspacesSectionHtml = state.manageWorkspacesOpen
    ? `<h3>All workspaces</h3>
       ${state.summaries.map(workspaceRow).join('') || '<div class="empty">No workspaces yet.</div>'}
       <button class="btn small" data-action="toggle-manage-workspaces">Hide workspace list</button>`
    : `${recent ? workspaceRow(recent) : ''}
       ${state.summaries.length > 0 ? `<button class="btn small" data-action="toggle-manage-workspaces">Manage workspaces (${state.summaries.length})</button>` : ''}`;

  return `<h1>FireRed BoxName Workbench</h1>
    <p class="muted">A local-first workbench for known FireRed box-name techniques. Choose an action, fill in its fields, and prepare reviewable output — all kept with provenance.</p>
    <div class="grid2">
      <div class="card">
        <h3>Start with an action</h3>
        <p class="muted">Choose a built-in or curated action and fill in its fields.</p>
        <button class="btn primary" data-action="start-with-action">Start with an action</button>
      </div>
      <div class="card">
        <h3>Import a script</h3>
        <p class="muted">Bring in a local .txt script, scan it, and build a curated schema.</p>
        <button class="btn primary" data-action="start-import-script">Import a script</button>
      </div>
    </div>
    <p class="muted"><button class="btn small" data-action="load-demo">Load demo workspace</button> &mdash; explore harmless sample data.</p>
    ${workspacesSectionHtml}
    <div class="row" style="margin-top:0.75rem">
      <button class="btn small" data-action="import-json">Import workspace (.json)</button>
      <input type="file" accept="application/json" data-action="import-file" id="import-file-input" style="display:none" aria-label="Import workspace JSON file" />
    </div>`;
}

function renderStartHere(): string {
  const p = state.project!;
  return `<h1>Orientation</h1>
    <p class="muted">A quick orientation for this workspace. Everything here stays local by default — no hidden network calls, nothing runs in the background. The one exception is the explicit "Fetch E-Sh4rk scripts from GitHub" button in Manage Scripts, which only ever runs when you click it.</p>
    <div class="grid2">
      <div class="card">
        <h3>Run Script</h3>
        <p class="muted">Select a script/action, fill in its fields, and prepare a mock or filled-script preview.</p>
        <button class="btn primary" data-action="nav" data-screen="actions">Go to Run Script</button>
      </div>
      <div class="card">
        <h3>Manage Scripts</h3>
        <p class="muted">Import your own local .txt scripts, scan them, and create curated schemas for Run Script to use.</p>
        <button class="btn" data-action="nav" data-screen="scripts">Go to Manage Scripts</button>
      </div>
    </div>
    <div class="card">
      <h3>This workspace so far</h3>
      <p class="muted">${p.scripts.length} script(s) · ${p.curatedSchemas.length} curated schema(s) · ${p.importedBlocks.length} saved output(s) · ${p.checklist.length} checklist item(s)</p>
    </div>
    <div class="card">
      <h3>Manual verification checklist — one script, end to end</h3>
      <p class="muted">A quick reference for walking a single real script through the whole workflow by hand. Not tracked or saved — just a reminder of the steps.</p>
      <ol>
        <li>Import script.</li>
        <li>Run scanner.</li>
        <li>Create curated schema.</li>
        <li>Confirm only intended user-facing fields are included.</li>
        <li>Fill fields.</li>
        <li>Preview filled script.</li>
        <li>Confirm only mapped assignment lines changed.</li>
        <li>Copy filled script to external generator manually.</li>
        <li>Paste generator output back.</li>
        <li>Confirm parsed Box rows.</li>
        <li>Save output.</li>
      </ol>
    </div>`;
}

function renderAdvanced(): string {
  return `<h1>Advanced</h1>
    <p class="muted">Workspace management and secondary tools — most day-to-day work happens in Run Script, Outputs, and Manage Scripts.</p>
    <div class="grid2">
      <div class="card">
        <h3>Workspace Settings</h3>
        <p class="muted">Workspace title, revision/language labels, mode, and status.</p>
        <button class="btn" data-action="nav" data-screen="settings">Go to Workspace Settings</button>
      </div>
      <div class="card">
        <h3>Workspaces</h3>
        <p class="muted">Switch to a different saved workspace, start a new one, load the demo workspace, or import/export a workspace file.</p>
        <button class="btn" data-action="nav" data-screen="landing">Go to Workspaces</button>
      </div>
      <div class="card">
        <h3>Validation</h3>
        <p class="muted">Check formatting (line length, glyphs, duplicates) against your settings.</p>
        <button class="btn" data-action="nav" data-screen="validation">Go to Validation</button>
      </div>
      <div class="card">
        <h3>Report / Export</h3>
        <p class="muted">Open a printable review report, or export the whole workspace as JSON.</p>
        <button class="btn" data-action="nav" data-screen="report">Go to Report / Export</button>
      </div>
      <div class="card">
        <h3>Checklist</h3>
        <p class="muted">Track review prompts and follow-ups.</p>
        <button class="btn" data-action="nav" data-screen="checklist">Go to Checklist</button>
      </div>
      <div class="card">
        <h3>Notes</h3>
        <p class="muted">Free-form notes for this workspace.</p>
        <button class="btn" data-action="nav" data-screen="notes">Go to Notes</button>
      </div>
      <div class="card">
        <h3>Orientation &amp; manual checklist</h3>
        <p class="muted">A quick overview, plus a step-by-step reference for walking one script through the whole workflow by hand.</p>
        <button class="btn" data-action="nav" data-screen="start-here">Go to Orientation</button>
      </div>
    </div>`;
}

function renderSettings(): string {
  const p = state.project!;
  const m = p.metadata;
  return `<h1>Workspace Settings</h1>
    <div class="card" data-ref="metadata">
      <label for="m-game">Game</label>
      <input type="text" id="m-game" value="FireRed" disabled aria-label="Game (locked to FireRed)" />
      <label for="m-title">Workspace title</label>
      <input type="text" id="m-title" data-bind="metadata.projectTitle" value="${attr(m.projectTitle)}" />
      <div class="grid2">
        <div>
          <label for="m-rev">Revision label *</label>
          <input type="text" id="m-rev" data-bind="metadata.revisionLabel" value="${attr(m.revisionLabel)}" />
        </div>
        <div>
          <label for="m-lang">Language label</label>
          <input type="text" id="m-lang" data-bind="metadata.languageLabel" value="${attr(m.languageLabel)}" />
        </div>
      </div>
      <div class="grid2">
        <div>
          <label for="m-mode">Mode</label>
          <select id="m-mode" data-bind="metadata.mode">${opt('documentation', 'Documentation', m.mode)}${opt('checklist-review', 'Checklist review', m.mode)}</select>
        </div>
        <div>
          <label for="m-status">Workspace status</label>
          <select id="m-status" data-bind="status">
            ${opt('draft', 'Draft', p.projectStatus)}${opt('in-review', 'In review', p.projectStatus)}${opt('reviewed', 'Reviewed', p.projectStatus)}${opt('exported', 'Exported', p.projectStatus)}
          </select>
        </div>
      </div>
    </div>`;
}

// --- Run Script (curated schemas only) --------------------------------------

function renderActionField(
  field: ActionField,
  values: Record<string, ActionFieldValue>,
  referenceSearch: Record<string, string> = {},
): string {
  const value = values[field.key];
  if (field.type === 'checkbox') {
    const checked = Boolean(value ?? field.defaultValue ?? false);
    return `<label class="row" style="margin-top:0.6rem"><input type="checkbox" data-bind="action.field" data-id="${attr(field.key)}" style="width:auto"${checked ? ' checked' : ''} /> &nbsp;${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>`;
  }
  const rangeHint = field.min !== undefined || field.max !== undefined
    ? ` <span class="muted">(${field.min ?? '—'}–${field.max ?? '—'})</span>`
    : '';
  const labelHtml = `<label>${escapeHtml(field.label)}${field.required ? ' *' : ''}${rangeHint}</label>`;
  if (field.type === 'select') {
    const current = String(value ?? field.options?.[0]?.value ?? '');
    const opts = (field.options ?? []).map((o) => opt(o.value, o.label, current)).join('');
    return `${labelHtml}<select data-bind="action.field" data-id="${attr(field.key)}" aria-label="${attr(field.label)}">${opts}</select>`;
  }
  if (field.type === 'reference-select') {
    return referenceSelectFieldHtml(field, value, labelHtml, referenceSearch[field.key] ?? '');
  }
  if (field.type === 'number') {
    const minMaxAttrs = `${field.min !== undefined ? ` min="${field.min}"` : ''}${field.max !== undefined ? ` max="${field.max}"` : ''}`;
    return `${labelHtml}<input type="number" data-bind="action.field" data-id="${attr(field.key)}" value="${attr(String(value ?? 0))}"${minMaxAttrs} aria-label="${attr(field.label)}" />`;
  }
  return `${labelHtml}<input type="text" data-bind="action.field" data-id="${attr(field.key)}" value="${attr(String(value ?? ''))}" placeholder="${attr(field.placeholder ?? '')}" aria-label="${attr(field.label)}" />`;
}

/**
 * A 'reference-select' field: a dropdown of local-catalog options (each
 * showing "Name — value"), narrowed by an optional search box. The stored/
 * filled value is always the numeric value only — never the display name.
 * If the field's current value isn't in the catalog (e.g. a partial
 * catalog doesn't cover it yet), it's still shown and kept selected rather
 * than silently swapped for the first catalog entry.
 */
function referenceSelectFieldHtml(
  field: ActionField,
  value: ActionFieldValue | undefined,
  labelHtml: string,
  searchText: string,
): string {
  const allOptions = field.options ?? [];
  const current = String(value ?? allOptions[0]?.value ?? '');
  const currentOption = allOptions.find((o) => o.value === current);
  const q = searchText.trim().toLowerCase();
  const filtered = q ? allOptions.filter((o) => o.label.toLowerCase().includes(q)) : allOptions;
  const visible = !q || filtered.some((o) => o.value === current) || !currentOption
    ? filtered
    : [currentOption, ...filtered];
  const fallbackOption = !currentOption && current !== ''
    ? `<option value="${attr(current)}" selected>${escapeHtml(current)} (not in local catalog)</option>`
    : '';
  const opts = visible.map((o) => opt(o.value, o.label, current)).join('');
  const noMatchesNote = q && filtered.length === 0
    ? `<p class="muted">No matches for "${escapeHtml(searchText.trim())}" — showing the current selection only.</p>`
    : '';
  return `${labelHtml}
    <input type="text" data-bind="action.field-search" data-id="${attr(field.key)}" value="${attr(searchText)}" placeholder="Search…" aria-label="Search ${attr(field.label)} options" style="margin-bottom:0.25rem" />
    <select data-bind="action.field" data-id="${attr(field.key)}" aria-label="${attr(field.label)}">${fallbackOption}${opts}</select>
    ${noMatchesNote}`;
}

function filledScriptSection(result: FilledScriptResult): string {
  if (result.errors.length > 0) {
    return `<div class="badge error" style="display:block;margin-top:0.5rem">${result.errors.map((e) => escapeHtml(e)).join('<br>')}</div>`;
  }
  const changeRows = result.changedLines
    .map(
      (c) => `<tr><td>${c.line}</td><td><code>${escapeHtml(c.variableName)}</code></td><td><code>${escapeHtml(c.before)}</code></td><td><code>${escapeHtml(c.after)}</code></td></tr>`,
    )
    .join('');
  const warningsHtml = result.warnings.length
    ? `<div class="badge warning" style="display:block;margin:0.5rem 0">${result.warnings.map((w) => escapeHtml(w)).join('<br>')}</div>`
    : '';
  return `<p class="muted">${result.changedLines.length} line(s) would change.</p>
    ${warningsHtml}
    ${result.changedLines.length
      ? `<table><thead><tr><th>Line</th><th>Variable</th><th>Before</th><th>After</th></tr></thead><tbody>${changeRows}</tbody></table>`
      : ''}
    <label>Filled script (read-only preview)</label>
    ${lineNumberView(result.filledScriptText)}
    <div class="row" style="margin-top:0.5rem">
      <button class="btn" data-action="copy-filled-script">Copy filled script</button>
      <button class="btn" data-action="save-filled-script">Save filled script as block</button>
    </div>`;
}

function parsedBoxNameSheet(parsed: ParsedGeneratorOutput): string {
  const warningsHtml = parsed.warnings.length
    ? `<div class="badge warning" style="display:block;margin:0.5rem 0">${parsed.warnings.map((w) => escapeHtml(w)).join('<br>')}</div>`
    : '';
  const tableHtml = parsed.rows.length
    ? `<div class="card" style="margin-top:0.5rem">
        <table><thead><tr><th>Box</th><th>Spaced display</th><th>Compact</th><th></th></tr></thead><tbody>${parsed.rows
          .map(
            (r, i) => `<tr>
              <td>Box ${r.boxNumber}</td>
              <td>${escapeHtml(r.spacedDisplay)}</td>
              <td>${r.compactText !== null ? `<code>${escapeHtml(r.compactText)}</code>` : '<span class="muted">—</span>'}</td>
              <td class="row nowrap">
                <button class="btn small" data-action="copy-parsed-compact" data-row="${i}"${r.compactText === null ? ' disabled' : ''}>Copy compact</button>
                <button class="btn small" data-action="copy-parsed-raw" data-row="${i}">Copy raw line</button>
              </td>
            </tr>`,
          )
          .join('')}</tbody></table>
        <div class="row" style="margin-top:0.5rem">
          <button class="btn" data-action="copy-all-compact">Copy all compact box names</button>
          <button class="btn" data-action="copy-all-raw-box-lines">Copy all raw box lines</button>
        </div>
      </div>`
    : '';
  return `${warningsHtml}${tableHtml}
    <details style="margin-top:0.5rem">
      <summary class="muted" style="cursor:pointer">Show full raw output</summary>
      ${lineNumberView(parsed.rawText)}
    </details>`;
}

function pasteBackCard(p: Project, ab: ActionBuilderState, actionLabel: string): string {
  const pb = ab.pasteBack;
  const preview = pb.parsed ? parsedBoxNameSheet(pb.parsed) : '';
  const saved = pb.savedBlockId && p.importedBlocks.some((b) => b.id === pb.savedBlockId)
    ? `<p class="muted">Saved &#10003; <button class="btn small" data-action="jump" data-kind="importedBlock" data-ref="${attr(pb.savedBlockId)}">View in Imported text</button></p>`
    : '';
  return `<div class="card">
    <h3>Paste generator output</h3>
    <p class="muted">This app does not run the generator. Paste output from your own local generator here — it is stored and shown exactly as pasted, never normalized, decoded, or transformed. The box-name sheet below shows only the "Box N:" lines it finds; everything else (command lines, "All commands", "Raw data") is ignored for display, but the full raw text is always kept.</p>
    <label for="pb-raw">Raw output</label>
    <textarea id="pb-raw" data-bind="pasteback.rawText" placeholder="Paste your generator's output here">${escapeHtml(pb.rawText)}</textarea>
    <label for="pb-label">Output label / notes</label>
    <input type="text" id="pb-label" data-bind="pasteback.label" value="${attr(pb.label)}" placeholder="e.g. ${attr(actionLabel)} — batch 1" />
    <div class="row" style="margin-top:0.5rem">
      <button class="btn" data-action="preview-pasted-output">Parse box names</button>
      <button class="btn" data-action="copy-pasted-output">Copy all raw output</button>
      <button class="btn primary" data-action="save-pasted-output">Save output to workspace</button>
    </div>
    ${preview}
    ${saved}
  </div>`;
}

function curatedFieldExtra(field: CuratedSchemaField | undefined): string {
  if (!field) return '';
  const warnings = (field.warnings ?? [])
    .map((w) => `<div class="muted">⚠ ${escapeHtml(w)}</div>`)
    .join('');
  const helpText = field.helpText ? `<div class="muted" style="margin:0.1rem 0 0.3rem">${escapeHtml(field.helpText)}</div>` : '';
  return `${helpText}${warnings}<details style="margin:0.1rem 0 0.5rem"><summary class="muted" style="cursor:pointer;font-size:0.85rem">Variable mapping</summary>
    <p class="muted">Maps to script variable <code>${escapeHtml(field.variableName)}</code></p>
  </details>`;
}

function advancedSchemaListHtml(schemas: readonly CuratedActionSchema[], runTarget: GameTarget): string {
  return schemas
    .map((s) => {
      const compat = checkTargetCompatibility(s.target, runTarget);
      const compatBadge = compat === 'unknown' ? 'warning' : 'error';
      const compatText = compat === 'unknown' ? 'Unknown/Mixed compatibility' : 'Different target';
      return `<div class="card" style="margin-top:0.4rem">
        <div class="row" style="justify-content:space-between">
          <div class="row">
            <strong>${escapeHtml(s.label)}</strong>
            <span class="pill status-${escapeHtml(s.status)}">${escapeHtml(s.status)}</span>
            <span class="badge ${compatBadge}">${compatText}</span>
            <span class="muted">${escapeHtml(targetLabel(s.target))}</span>
          </div>
          <button class="btn small" data-action="select-advanced-schema" data-id="${attr(s.id)}">Use this schema</button>
        </div>
      </div>`;
    })
    .join('');
}

function renderActions(): string {
  const p = state.project!;
  const ab = state.actionBuilder;
  const selectable = p.curatedSchemas.filter(isSchemaSelectable);

  if (selectable.length === 0) {
    return `<h1>Run Script</h1>
      <p class="muted">Select a script/action, fill in its fields, and prepare a filled script or box-name sheet for your own external generator to run.</p>
      <div class="card" style="border-color:#9fd3b4;background:#f3fbf6">
        <p class="muted">No scripts are ready yet. Import a script and create a schema first.</p>
        <button class="btn primary" data-action="nav" data-screen="scripts">Manage scripts</button>
      </div>`;
  }

  const defaultSchemas = defaultRunnableSchemas(p.curatedSchemas, ab.runTarget);
  const advancedSchemas = advancedRunnableSchemas(p.curatedSchemas, ab.runTarget);
  const resolved = resolveActionDefinition(ab, p);

  const targetCard = `<div class="card">
    <h3>Target</h3>
    <p class="muted">Only reviewed schemas that exactly match this target appear below by default — no silent fallback to a different target.</p>
    ${isUnknownTarget(ab.runTarget) ? '<p class="muted">Pick a game, language, and revision to see matching schemas.</p>' : ''}
    ${targetSelectsHtml('action.runTarget', ab.runTarget, 'run-target')}
  </div>`;

  const advancedDisclosure = advancedSchemas.length > 0
    ? `<details style="margin-top:0.5rem">
        <summary class="muted" style="cursor:pointer">Show ${advancedSchemas.length} other schema(s) (unreviewed or a different target)</summary>
        ${advancedSchemaListHtml(advancedSchemas, ab.runTarget)}
      </details>`
    : '';

  if (!resolved) {
    return `<h1>Run Script</h1>
      <p class="muted">Select a script/action, fill in its fields, and prepare a filled script or box-name sheet for your own external generator to run.</p>
      ${targetCard}
      <div class="card" style="border-color:#e0a458;background:#fffaf2">
        <p class="muted">No reviewed schema is available for this target.</p>
        ${advancedDisclosure}
      </div>`;
  }

  const { template, curated } = resolved;
  const isDefaultChoice = defaultSchemas.some((s) => s.id === curated.id);
  const schemaOpts = defaultSchemas.map((s) => opt(s.id, s.label, curated.id)).join('');
  const curatedByKey = new Map(curated.fields.map((f) => [f.key, f]));
  const fieldsHtml = template.fields.map((f) => renderActionField(f, ab.values, ab.referenceSearch) + curatedFieldExtra(curatedByKey.get(f.key))).join('');

  const curatedStatusLine = `<p class="muted">Status: <span class="pill status-${escapeHtml(curated.status)}">${escapeHtml(curated.status)}</span> · target: ${escapeHtml(targetLabel(curated.target))}${curated.scriptFilename ? ' · from ' + escapeHtml(curated.scriptFilename) : ''}${!supportsRevision(curated, ab.revisionLabel) ? ' · <span class="badge warning">not listed for this revision</span>' : ''}</p>`;

  const compatWarning = !isDefaultChoice
    ? `<p class="badge error" style="display:inline-block;margin-bottom:0.5rem">This schema was chosen explicitly from "other schemas" — its status or target does not exactly match your selected target. Review carefully before relying on it.</p>`
    : '';

  const schemaSelectorHtml = defaultSchemas.length > 0
    ? `<label for="ab-curated">Script</label><select id="ab-curated" data-bind="action.curatedSchemaId">${schemaOpts}</select>`
    : `<p class="muted">Using an explicitly-chosen schema outside the default list for this target (see "other schemas" above).</p>`;

  const linkedScript = curated.scriptId ? p.scripts.find((s) => s.id === curated.scriptId) : undefined;
  const filledScriptCard = linkedScript
    ? `<div class="card">
        <h3>Filled script <span class="pill">manual — no generator invoked</span></h3>
        <p class="muted">This app does not run the generator. Copy this script into your external generator.</p>
        <p class="muted">From: ${escapeHtml(linkedScript.filename)}</p>
        <button class="btn primary" data-action="preview-filled-script">Preview filled script</button>
        ${ab.filledScript ? filledScriptSection(ab.filledScript) : ''}
      </div>`
    : '';

  return `<h1>Run Script</h1>
    <p class="muted">Select a script/action, fill in its fields, and prepare a filled script or box-name sheet for your own external generator to run.</p>
    ${targetCard}
    <div class="card">
      <label for="ab-revision">Revision label</label>
      <input type="text" id="ab-revision" data-bind="action.revisionLabel" value="${attr(ab.revisionLabel)}" placeholder="e.g. Rev 1 (documentation only)" />
      ${schemaSelectorHtml}
      ${curatedStatusLine}
      ${compatWarning}
      <p class="muted">${escapeHtml(curated.description)}</p>
      ${fieldsHtml}
    </div>
    ${advancedDisclosure}
    ${filledScriptCard}
    ${pasteBackCard(p, ab, template.label)}`;
}

// --- Manage Scripts (developer-only, informational) --------------------------

function candidateRow(c: ScriptScanResult['candidates'][number]): string {
  const confBadge = c.confidence === 'high' ? 'info' : c.confidence === 'medium' ? 'warning' : 'error';
  return `<tr${c.internal ? ' class="muted"' : ''}>
    <td>${escapeHtml(c.name)}</td>
    <td><code>${escapeHtml(c.rawValue)}</code></td>
    <td>${c.nearbyComment ? escapeHtml(c.nearbyComment) : '—'}</td>
    <td>${c.annotation ? escapeHtml(c.annotation) : '—'}</td>
    <td>${escapeHtml(c.inferredType)}</td>
    <td><span class="badge ${confBadge}">${escapeHtml(c.confidence)}</span></td>
    <td>${c.internal ? '<span class="badge warning">Internal/helper</span>' : 'User-facing'}</td>
  </tr>`;
}

function directiveSummary(scan: ScriptScanResult): string {
  const shortcuts: string[] = [];
  if (scan.title) shortcuts.push(`Title: ${escapeHtml(scan.title)}`);
  if (scan.author) shortcuts.push(`Author: ${escapeHtml(scan.author)}`);
  if (scan.exit) shortcuts.push(`Exit: ${escapeHtml(scan.exit)}`);
  if (scan.directives.length === 0) return '';
  const rows = scan.directives
    .map((d) => `<tr><td><code>${escapeHtml(d.key)}</code></td><td>${escapeHtml(d.rawValue)}</td><td>${d.line}</td></tr>`)
    .join('');
  return `<h3>Script directives <span class="pill">metadata only, not schema fields</span></h3>
    ${shortcuts.length ? `<p class="muted">${shortcuts.join(' · ')}</p>` : ''}
    <details>
      <summary class="muted" style="cursor:pointer">Show all ${scan.directives.length} directive line(s)</summary>
      <table><thead><tr><th>Key</th><th>Value</th><th>Line</th></tr></thead><tbody>${rows}</tbody></table>
    </details>`;
}

function draftSchemaList(schema: DraftActionSchema): string {
  const items = schema.fields
    .map(
      (f) => `<li><strong>${escapeHtml(f.label)}</strong> — ${escapeHtml(f.inferredType)} (${escapeHtml(f.confidence)})${f.notes ? ' · ' + escapeHtml(f.notes) : ''}</li>`,
    )
    .join('');
  return `<ul>${items || '<li class="muted">No candidate fields to draft.</li>'}</ul>`;
}

function curatedSchemaFieldRow(f: CuratedSchemaField, candidatesByName: Map<string, VariableCandidate>): string {
  const cand = candidatesByName.get(f.variableName);
  const warnings = (f.warnings ?? []).map((w) => escapeHtml(w)).join('; ');
  return `<tr>
    <td>${escapeHtml(f.label)}</td>
    <td>${escapeHtml(f.type)}</td>
    <td>${f.required ? 'required' : 'optional'}</td>
    <td><code>${escapeHtml(f.variableName)}</code></td>
    <td>${cand ? `<code>${escapeHtml(cand.rawValue)}</code> (${escapeHtml(cand.inferredType)}, ${escapeHtml(cand.confidence)})` : '<span class="muted">no matching scan candidate</span>'}</td>
    <td>${f.helpText ? escapeHtml(f.helpText) : '—'}</td>
    <td>${warnings ? `<span class="badge warning">${warnings}</span>` : '—'}</td>
  </tr>`;
}

function renderCuratedSchemaCard(schema: CuratedActionSchema, candidates: readonly VariableCandidate[]): string {
  const candidatesByName = new Map(candidates.map((c) => [c.name, c]));
  const rows = schema.fields.map((f) => curatedSchemaFieldRow(f, candidatesByName)).join('');
  const idAttr = attr(schema.id);
  const statusButtons = (['draft', 'reviewed', 'disabled'] as const)
    .filter((s) => s !== schema.status)
    .map((s) => `<button class="btn small" data-action="set-schema-status" data-id="${idAttr}" data-status="${s}">Mark as ${s}</button>`)
    .join('');
  return `<div class="card ext-tool">
    <div class="row" style="justify-content:space-between">
      <div class="row">
        <strong>${escapeHtml(schema.label)}</strong>
        <span class="pill">${escapeHtml(targetLabel(schema.target))}</span>
        ${schema.actionKey ? `<span class="muted">action: <code>${escapeHtml(schema.actionKey)}</code></span>` : ''}
      </div>
      <span class="pill status-${escapeHtml(schema.status)}">${escapeHtml(schema.status)}</span>
    </div>
    <p class="muted">${escapeHtml(schema.description)}</p>
    ${schema.supportedRevisionLabels.length ? `<p class="muted">Supported revisions: ${schema.supportedRevisionLabels.map((r) => escapeHtml(r)).join(', ')}</p>` : ''}
    <table><thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Variable</th><th>Scan candidate</th><th>Help</th><th>Warnings</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="row" style="margin-top:0.5rem;flex-wrap:wrap">
      ${schema.scriptId ? `<button class="btn small" data-action="edit-curated-schema" data-id="${idAttr}">Edit schema</button>` : ''}
      <button class="btn small" data-action="duplicate-curated-schema" data-id="${idAttr}">Duplicate schema</button>
      ${schema.scriptId ? `<button class="btn small" data-action="detach-curated-schema" data-id="${idAttr}">Detach from this script</button>` : ''}
      ${statusButtons}
      <button class="btn small" data-action="export-reviewed-preset" data-id="${idAttr}">Export as reviewed preset</button>
      <button class="btn danger small" data-action="delete-curated-schema" data-id="${idAttr}">Delete schema</button>
    </div>
  </div>`;
}

function schemaCandidateRow(c: VariableCandidate, editor: SchemaEditorState): string {
  const included = editor.included.has(c.name);
  const confBadge = c.confidence === 'high' ? 'info' : c.confidence === 'medium' ? 'warning' : 'error';
  return `<tr>
    <td><input type="checkbox" data-bind="schema-candidate.include" data-id="${attr(c.name)}"${included ? ' checked' : ''} aria-label="Include ${attr(c.name)} in schema" /></td>
    <td>${escapeHtml(c.name)}</td>
    <td><code>${escapeHtml(c.rawValue)}</code></td>
    <td>${escapeHtml(c.inferredType)}</td>
    <td><span class="badge ${confBadge}">${escapeHtml(c.confidence)}</span></td>
    <td>${c.nearbyComment ? escapeHtml(c.nearbyComment) : '—'}</td>
    <td>${c.annotation ? escapeHtml(c.annotation) : '—'}</td>
  </tr>`;
}

/** A few catalog entries plus its label/size/partial status — shown in the schema editor so the reviewer can sanity-check the catalog before relying on it. */
function referenceCatalogPreviewHtml(catalogId: ReferenceCatalogId | undefined): string {
  if (!catalogId) return '<p class="muted">Choose a catalog above to preview a few entries.</p>';
  const catalog = getReferenceCatalog(catalogId);
  if (!catalog) return '<p class="badge error" style="display:inline-block">Unknown catalog id — no data registered for it.</p>';
  const preview = catalog.entries.slice(0, 5).map((e) => `<li>${escapeHtml(referenceEntryLabel(e))}</li>`).join('');
  return `<p class="muted">${escapeHtml(catalog.label)}${catalog.partial ? ' — partial catalog, not the full range' : ''} (${catalog.entries.length} entries). Preview:</p>
    <ul class="muted">${preview}</ul>`;
}

function schemaFieldEditor(candidateName: string, field: CuratedSchemaField): string {
  const idAttr = attr(candidateName);
  const optionsText = (field.options ?? []).map((o) => `${o.value} | ${o.label}`).join('\n');
  const warningsText = (field.warnings ?? []).join('\n');
  const typeOpts = (['text', 'number', 'select', 'checkbox', 'reference-select'] as const)
    .map((t) => opt(t, t === 'reference-select' ? 'Reference select' : cap(t), field.type))
    .join('');
  const isReferenceSelect = field.type === 'reference-select';
  const catalogOpts = REFERENCE_CATALOG_IDS
    .map((cid) => opt(cid, `${REFERENCE_CATALOGS[cid].label}${REFERENCE_CATALOGS[cid].partial ? ' (partial)' : ''}`, field.referenceCatalogId ?? ''))
    .join('');
  const referenceSectionHtml = isReferenceSelect
    ? `<p class="badge info" style="display:inline-block">Backed by a local reference catalog — display names come from static, checked-in data, not a live lookup.</p>
      <label>Reference catalog</label>
      <select data-bind="schema-field.referenceCatalogId" data-id="${idAttr}"><option value="">— choose a catalog —</option>${catalogOpts}</select>
      ${referenceCatalogPreviewHtml(field.referenceCatalogId)}`
    : '';
  return `<div class="card ext-tool">
    <div class="row" style="justify-content:space-between">
      <strong>${escapeHtml(field.label || field.key)}</strong>
      <span class="muted">maps to script variable <code>${escapeHtml(field.variableName)}</code></span>
    </div>
    <div class="grid2">
      <div><label>Field key</label><input type="text" data-bind="schema-field.key" data-id="${idAttr}" value="${attr(field.key)}" /></div>
      <div><label>Label</label><input type="text" data-bind="schema-field.label" data-id="${idAttr}" value="${attr(field.label)}" /></div>
    </div>
    <div class="grid2">
      <div><label>Type</label><select data-bind="schema-field.type" data-id="${idAttr}">${typeOpts}</select></div>
      <div><label class="row" style="margin-top:1.4rem"><input type="checkbox" data-bind="schema-field.required" data-id="${idAttr}" style="width:auto"${field.required ? ' checked' : ''} /> &nbsp;Required</label></div>
    </div>
    ${referenceSectionHtml}
    <label>Help text</label>
    <input type="text" data-bind="schema-field.helpText" data-id="${idAttr}" value="${attr(field.helpText ?? '')}" placeholder="Optional user-facing help text" />
    <label>Default value${isReferenceSelect ? ' (numeric — the value a script/generator expects, not the display name)' : ''}</label>
    <input type="text" data-bind="schema-field.defaultValue" data-id="${idAttr}" value="${attr(String(field.defaultValue ?? ''))}" />
    ${!isReferenceSelect ? `<label>Options — one per line, "value | label" (only used when type is Select)</label>
    <textarea data-bind="schema-field.optionsText" data-id="${idAttr}" placeholder="option-a | Example option A">${escapeHtml(optionsText)}</textarea>` : ''}
    <label>Min / Max — optional, only used when type is Number</label>
    <div class="grid2">
      <div><input type="text" data-bind="schema-field.min" data-id="${idAttr}" value="${attr(String(field.min ?? ''))}" placeholder="Min" /></div>
      <div><input type="text" data-bind="schema-field.max" data-id="${idAttr}" value="${attr(String(field.max ?? ''))}" placeholder="Max" /></div>
    </div>
    <label>Warnings — one per line (optional)</label>
    <textarea data-bind="schema-field.warningsText" data-id="${idAttr}">${escapeHtml(warningsText)}</textarea>
    ${field.inputHint ? `<p class="muted">Input hint: <code>${escapeHtml(field.inputHint)}</code>${isReferenceSelect ? '' : ' (informational only — no reference catalog matched this hint)'}</p>` : ''}
    <div class="row" style="margin-top:0.5rem">
      <button class="btn danger small" data-action="toggle-schema-candidate-off" data-id="${idAttr}">Remove field</button>
    </div>
  </div>`;
}

/** Non-interactive: mirrors renderActionField's look with no data-bind wiring — cannot fill scripts or generate output. */
function renderPreviewField(field: CuratedSchemaField): string {
  const value = field.defaultValue;
  if (field.type === 'checkbox') {
    return `<label class="row" style="margin-top:0.6rem"><input type="checkbox" disabled style="width:auto"${value ? ' checked' : ''} /> &nbsp;${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>`;
  }
  const rangeHint = field.min !== undefined || field.max !== undefined
    ? ` <span class="muted">(${field.min ?? '—'}–${field.max ?? '—'})</span>`
    : '';
  const labelHtml = `<label>${escapeHtml(field.label)}${field.required ? ' *' : ''}${rangeHint}</label>`;
  if (field.type === 'select') {
    const opts = (field.options ?? [])
      .map((o) => `<option${o.value === value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`)
      .join('');
    return `${labelHtml}<select disabled>${opts}</select>`;
  }
  if (field.type === 'number') {
    const minMaxAttrs = `${field.min !== undefined ? ` min="${field.min}"` : ''}${field.max !== undefined ? ` max="${field.max}"` : ''}`;
    return `${labelHtml}<input type="number" disabled value="${attr(String(value ?? 0))}"${minMaxAttrs} />`;
  }
  return `${labelHtml}<input type="text" disabled value="${attr(String(value ?? ''))}" placeholder="${attr(field.helpText ?? '')}" />`;
}

function renderSchemaEditor(script: ScriptFile, scan: ScriptScanResult): string {
  const editor = state.schemaEditor;
  if (!editor || editor.scriptId !== script.id) return '';

  const userFacing = scan.candidates.filter((c) => !c.internal);
  const internalCandidates = scan.candidates.filter((c) => c.internal);
  const userRows = userFacing.map((c) => schemaCandidateRow(c, editor)).join('');
  const internalRows = internalCandidates.map((c) => schemaCandidateRow(c, editor)).join('');
  const candidateTableHead = '<thead><tr><th>Include</th><th>Name</th><th>Value</th><th>Inferred type</th><th>Confidence</th><th>Nearby comment</th><th>Annotation</th></tr></thead>';
  const includedNames = Array.from(editor.included);
  const includedFieldsHtml = includedNames
    .map((name) => {
      const field = editor.fields.get(name);
      return field ? schemaFieldEditor(name, field) : '';
    })
    .join('');
  const previewFields = includedNames
    .map((name) => editor.fields.get(name))
    .filter((f): f is CuratedSchemaField => Boolean(f));
  const previewHtml = previewFields.length
    ? previewFields.map(renderPreviewField).join('')
    : '<div class="empty">Include at least one field to preview the Run Script form.</div>';
  const errorsHtml = editor.errors.length
    ? `<div class="badge error" style="display:block;margin:0.5rem 0">${editor.errors.map((e) => escapeHtml(e)).join('<br>')}</div>`
    : '';
  const savedHtml = editor.savedSchemaId
    ? `<p class="muted">Saved &#10003; this curated schema is now selectable in Run Script.</p>`
    : '';
  const statusOpts = (['draft', 'reviewed', 'disabled'] as const).map((s) => opt(s, cap(s), editor.status)).join('');

  return `<div class="card" style="border-color:#2563eb66;background:#f5f8ff">
    <div class="row" style="justify-content:space-between">
      <h3>Create curated schema from scan</h3>
      <button class="btn small" data-action="close-schema-editor">Close</button>
    </div>
    <div class="grid2">
      <div><label>Schema id</label><input type="text" data-bind="schema.id" value="${attr(editor.id)}" /></div>
      <div><label>Label</label><input type="text" data-bind="schema.label" value="${attr(editor.label)}" /></div>
    </div>
    <label>Description</label>
    <input type="text" data-bind="schema.description" value="${attr(editor.description)}" />
    <div class="grid2">
      <div><label>Status</label><select data-bind="schema.status">${statusOpts}</select></div>
      <div><label>Action key (optional — stable concept shared across target variants, e.g. "teach-any-move")</label><input type="text" data-bind="schema.actionKey" value="${attr(editor.actionKey)}" /></div>
    </div>
    <label>Supported revision labels (comma-separated, optional — free-text, distinct from the game/language/revision target below)</label>
    <input type="text" data-bind="schema.supportedRevisionLabels" value="${attr(editor.supportedRevisionLabels)}" />
    <h3>Target compatibility</h3>
    <p class="muted">Which game/language/revision this schema variant is for. Unknown/Mixed is fine for a draft, but a reviewed schema needs an explicit target.</p>
    ${targetSelectsHtml('schema.target', editor.target, 'schema-target')}
    <p class="muted">Linked script: ${escapeHtml(script.filename)} (<code>${escapeHtml(script.id)}</code>)</p>

    <h3>Likely user-facing candidates</h3>
    ${userFacing.length
      ? `<table>${candidateTableHead}<tbody>${userRows}</tbody></table>`
      : '<div class="empty">No likely user-facing candidates found before the @@ marker.</div>'}

    ${internalCandidates.length
      ? `<h3>Internal / helper candidates <span class="pill">not recommended for schema fields</span></h3>
        <p class="muted">These follow a "do not modify" comment in the script header, or otherwise look like computed/internal values rather than user input. They're shown for transparency and left unchecked by default.</p>
        <table class="muted">${candidateTableHead}<tbody>${internalRows}</tbody></table>`
      : ''}

    <h3>Included fields</h3>
    ${includedFieldsHtml || '<div class="empty">No fields included yet — check candidates above to include them.</div>'}

    <h3>Preview Run Script fields</h3>
    <p class="muted">Preview only — does not fill scripts or generate output.</p>
    <div class="card">${previewHtml}</div>

    ${errorsHtml}
    ${savedHtml}
    <div class="row" style="margin-top:0.75rem">
      <button class="btn primary" data-action="save-schema-from-editor">Save curated schema</button>
    </div>
  </div>`;
}

function renderScanResult(script: ScriptFile, scan: ScriptScanResult, project: Project): string {
  const header = scan.sections.find((s) => s.kind === 'header');
  const body = scan.sections.find((s) => s.kind === 'body');
  const rows = scan.candidates.map(candidateRow).join('');
  const schema = buildDraftActionSchema(script, scan, nowIso);
  const attachedSchemas = project.curatedSchemas.filter((s) => s.scriptId === script.id);
  const attachedHtml = attachedSchemas.map((s) => renderCuratedSchemaCard(s, scan.candidates)).join('');
  return `<div class="card" style="border-color:#e0a458;background:#fffaf2">
    <p class="muted">Scanned ${escapeHtml(scan.scannedAt)} · marker line: ${scan.markerLine ?? 'not found'}</p>
    <p class="muted">Header: ${header ? numberLines(header.text).length : 0} line(s) · Body: ${body ? numberLines(body.text).length : 0} line(s)</p>
    ${directiveSummary(scan)}
    ${scan.candidates.length
      ? `<table><thead><tr><th>Name</th><th>Value</th><th>Nearby comment</th><th>Annotation</th><th>Inferred type</th><th>Confidence</th><th>Scope</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<div class="empty">No candidate variables found before the @@ marker.</div>'}
    <h3>Draft action schema</h3>
    <p class="badge warning" style="display:inline-block">Scanner output is a draft. Review manually before creating an action template.</p>
    ${draftSchemaList(schema)}
    <div class="row" style="margin-top:0.5rem">
      <button class="btn small" data-action="export-draft-schema" data-id="${attr(script.id)}">Export draft schema (.json)</button>
      <button class="btn small" data-action="attach-curated-schema" data-id="${attr(script.id)}">Attach curated schema (.json)</button>
      <input type="file" accept="application/json" data-action="curated-schema-file" data-id="${attr(script.id)}" id="curated-schema-input-${attr(script.id)}" style="display:none" aria-label="Attach curated action schema JSON" />
      <button class="btn small" data-action="create-schema-from-scan" data-id="${attr(script.id)}">Create curated schema from scan</button>
    </div>
    ${renderSchemaEditor(script, scan)}
    <h3>Curated schemas for this script</h3>
    ${attachedHtml || '<div class="empty">No curated schemas attached yet.</div>'}
  </div>`;
}

/**
 * "Reviewed schema preset available" — distinct from presetSuggestionHtml
 * below: these are the built-in, human-reviewed presets, so applying one
 * keeps its 'reviewed' status. Every match still requires an explicit
 * per-preset button click; when more than one preset matches, each gets
 * its own labeled button rather than picking one automatically.
 */
function reviewedPresetSuggestionHtml(s: ScriptFile, project: Project): string {
  const matches = matchReviewedPresets(REVIEWED_SCHEMA_PRESETS, {
    filename: s.filename,
    title: s.lastScan?.title,
    category: s.category,
  });
  const candidates = matches.filter((m) => !project.curatedSchemas.some((cs) => cs.id === `${m.preset.id}-for-${s.id}`));
  if (candidates.length === 0) return '';

  const buttons = candidates
    .map(
      (m) =>
        `<button class="btn small primary" data-action="apply-reviewed-preset" data-id="${attr(s.id)}" data-preset="${attr(m.preset.id)}">Apply "${escapeHtml(m.preset.label)}"</button>`,
    )
    .join(' ');
  const heading = candidates.length === 1
    ? `Reviewed schema preset available: ${escapeHtml(candidates[0].preset.label)}`
    : `${candidates.length} reviewed schema presets could apply — choose one:`;

  return `<div class="badge info" style="display:block;margin:0.4rem 0">
    ${heading}
    <div class="row" style="margin-top:0.4rem">${buttons}</div>
  </div>`;
}

function presetSuggestionHtml(s: ScriptFile, project: Project): string {
  const preset = findMatchingPreset(SCHEMA_PRESETS, { filename: s.filename, title: s.lastScan?.title });
  if (!preset) return '';
  const alreadyApplied = project.curatedSchemas.some((cs) => cs.id === `${preset.id}-for-${s.id}`);
  if (alreadyApplied) return '';
  return `<div class="badge info" style="display:block;margin:0.4rem 0">
    Suggested schema available: ${escapeHtml(preset.label)}
    <button class="btn small" data-action="apply-schema-preset" data-id="${attr(s.id)}" data-preset="${attr(preset.id)}">Apply preset (still needs review)</button>
  </div>`;
}

function renderScriptCard(s: ScriptFile, project: Project): string {
  const lineCount = numberLines(s.rawText).length;
  const pack = s.packId ? project.scriptPacks.find((pk) => pk.id === s.packId) : undefined;
  const effectiveTarget = effectiveScriptTarget(s, pack);
  return `<div class="card" data-ref="${attr(s.id)}">
    <div class="row" style="justify-content:space-between">
      <div class="row">
        <strong>${escapeHtml(s.filename)}</strong>
        ${s.displayName ? `<span class="muted">"${escapeHtml(s.displayName)}"</span>` : ''}
        <span class="muted">${lineCount} line${lineCount === 1 ? '' : 's'}${s.relativePath ? ' · ' + escapeHtml(s.relativePath) : ''} · imported ${escapeHtml(s.importedAt)}</span>
        <span class="pill">${escapeHtml(targetLabel(effectiveTarget))}</span>
        ${s.category ? `<span class="pill">${escapeHtml(s.category)}</span>` : ''}
      </div>
      <div class="row">
        <button class="btn small" data-action="run-scan" data-id="${attr(s.id)}">Run scanner</button>
        <button class="btn danger small" data-action="remove-script" data-id="${attr(s.id)}" aria-label="Delete script">Delete</button>
      </div>
    </div>
    <label>Notes</label>
    <input type="text" data-bind="script.notes" data-id="${attr(s.id)}" value="${attr(s.notes ?? '')}" placeholder="Optional notes about this script" aria-label="Script notes" />
    ${reviewedPresetSuggestionHtml(s, project)}
    ${presetSuggestionHtml(s, project)}
    <label>Script text (read-only, stored verbatim)</label>
    ${lineNumberView(s.rawText)}
    ${s.lastScan ? renderScanResult(s, s.lastScan, project) : ''}
  </div>`;
}

function batchScanSummaryCard(summary: ReturnType<typeof summarizeBatchScan>): string {
  return `<div class="card summary" role="group" aria-label="Batch scan summary">
    <div class="stat"><div class="num">${summary.totalScripts}</div><div class="lbl">Total scripts</div></div>
    <div class="stat"><div class="num">${summary.scannedScripts}</div><div class="lbl">Scanned</div></div>
    <div class="stat"><div class="num">${summary.scriptsWithUserFacingCandidates}</div><div class="lbl">With user-facing candidates</div></div>
    <div class="stat"><div class="num">${summary.scriptsWithNoCandidates}</div><div class="lbl">No candidates</div></div>
    <div class="stat"><div class="num">${summary.scriptsWithDirectives}</div><div class="lbl">With directives</div></div>
    <div class="stat"><div class="num">${summary.scriptsWithInternalCandidates}</div><div class="lbl">With internal/helper candidates</div></div>
  </div>`;
}

function scriptPackCard(pack: ScriptPack, scripts: readonly ScriptFile[]): string {
  const packScripts = scripts.filter((s) => s.packId === pack.id);
  const unscanned = packScripts.filter((s) => !s.lastScan).length;
  const esharkInfo = pack.sourceProfile
    ? `<p class="muted">
        Source: ${escapeHtml(esharkSourceProfileLabel(pack.sourceProfile))}${pack.detectedRootPath ? ` · detected at "${escapeHtml(pack.detectedRootPath)}"` : ''}
        · list.json ${pack.hasListJson ? 'found' : 'not found'}
        ${pack.categoriesDetected && pack.categoriesDetected.length > 0 ? '· categories: ' + pack.categoriesDetected.map(escapeHtml).join(', ') : ''}
        ${pack.sourceUrl ? `· fetched from ${escapeHtml(pack.sourceUrl)}${pack.sourceRef ? ` @ ${escapeHtml(pack.sourceRef)}` : ''}` : ''}
        ${pack.fetchedAt ? `· fetched ${escapeHtml(pack.fetchedAt)}` : ''}
      </p>`
    : '';
  return `<div class="card ext-tool">
    <div class="row" style="justify-content:space-between">
      <div class="row">
        <strong>${escapeHtml(pack.name)}</strong>
        <span class="pill">${escapeHtml(targetLabel(pack.defaultTarget))}</span>
      </div>
      <span class="muted">${packScripts.length} script(s)${pack.sourceFolderName ? ' · from folder "' + escapeHtml(pack.sourceFolderName) + '"' : ''} · imported ${escapeHtml(pack.importedAt)}</span>
    </div>
    ${esharkInfo}
    ${pack.targetNotes ? `<p class="muted">${escapeHtml(pack.targetNotes)}</p>` : ''}
    <button class="btn small" data-action="scan-all-in-pack" data-id="${attr(pack.id)}"${packScripts.length === 0 ? ' disabled' : ''}>${unscanned > 0 ? `Scan all scripts (${unscanned} unscanned)` : 'Re-scan all scripts'}</button>
  </div>`;
}

function scriptLibraryFilterBar(): string {
  const filters: [ScriptLibraryFilter, string][] = [
    ['all', 'All'],
    ['has-candidates', 'Has candidates'],
    ['needs-schema', 'Needs schema'],
    ['runnable', 'Runnable'],
  ];
  const chips = filters
    .map(([v, l]) => {
      const active = state.scriptsFilter === v;
      return `<button class="chip${active ? ' active' : ''}" data-action="set-scripts-filter" data-filter="${v}" aria-pressed="${active}">${l}</button>`;
    })
    .join('');
  return `<div class="row filters" role="group" aria-label="Filter scripts">${chips}</div>`;
}

function scriptSummaryTable(rows: ScriptPackRow[]): string {
  if (rows.length === 0) return '<div class="empty">No scripts match this filter/search.</div>';
  const trs = rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.filename)}</td>
        <td>${r.relativePath ? escapeHtml(r.relativePath) : '—'}</td>
        <td>${r.title ? escapeHtml(r.title) : '—'}</td>
        <td>${escapeHtml(targetLabel(r.target))}</td>
        <td>${r.category ? escapeHtml(r.category) : '—'}</td>
        <td>${r.candidateCount}</td>
        <td>${r.userFacingCandidateCount}</td>
        <td>${r.internalCandidateCount}</td>
        <td>${r.hasSchema ? 'Yes' : 'No'}</td>
        <td><button class="btn small" data-action="open-script" data-id="${attr(r.scriptId)}">Open</button></td>
      </tr>`,
    )
    .join('');
  return `<table><thead><tr><th>Filename</th><th>Relative path</th><th>Title</th><th>Target</th><th>Category</th><th>Candidates</th><th>User-facing</th><th>Internal/helper</th><th>Schema attached</th><th></th></tr></thead><tbody>${trs}</tbody></table>`;
}

function supportedScriptsHtml(project: Project): string {
  if (project.scripts.length === 0) return '';
  const summary = summarizeSupportedScripts(project.scripts, project.curatedSchemas);

  const readyRows = summary.ready
    .map(
      ({ script, schema }) => `<tr>
        <td>${escapeHtml(schema.label)}</td>
        <td>${escapeHtml(script.filename)}</td>
        <td>${escapeHtml(targetLabel(schema.target))}</td>
        <td>${schema.fields.length}</td>
        <td><span class="pill status-${escapeHtml(schema.status)}">${escapeHtml(schema.status)}</span></td>
        <td><button class="btn small" data-action="run-supported-script" data-id="${attr(schema.id)}">Run</button></td>
      </tr>`,
    )
    .join('');

  return `<div class="card">
    <h3>Supported scripts</h3>
    <p class="muted">A script is "Ready" once a reviewed schema with an explicit target is attached to it — apply a reviewed preset, or create and review a curated schema.</p>
    <div class="row filters" role="group" aria-label="Support status">
      <span class="chip">Ready: ${summary.ready.length}</span>
      <span class="chip">Needs review: ${summary.needsReview.length}</span>
      <span class="chip">No candidate fields: ${summary.noCandidates.length}</span>
      <span class="chip">Disabled/incompatible target: ${summary.disabledOrIncompatible.length}</span>
    </div>
    ${summary.ready.length > 0
      ? `<table><thead><tr><th>Action</th><th>Script</th><th>Target</th><th>Fields</th><th>Status</th><th></th></tr></thead><tbody>${readyRows}</tbody></table>`
      : '<p class="muted">No scripts are ready to run for this target yet. Apply a reviewed schema preset below, or create/review a curated schema, then match Run Script\'s target.</p>'}
  </div>`;
}

function renderScripts(): string {
  const p = state.project!;
  const allRows = buildScriptPackRows(p.scripts, p.curatedSchemas, p.scriptPacks);
  const filteredRows = searchScriptRows(filterScriptRows(allRows, state.scriptsFilter), state.scriptsSearch);
  const visibleIds = new Set(filteredRows.map((r) => r.scriptId));
  const visibleScripts = p.scripts.filter((s) => visibleIds.has(s.id));
  const scriptCards = visibleScripts.map((s) => renderScriptCard(s, p)).join('');
  const packCards = p.scriptPacks.map((pack) => scriptPackCard(pack, p.scripts)).join('');

  const emptyStateHtml = p.scripts.length === 0
    ? `<div class="card" style="border-color:#9fd3b4;background:#f3fbf6">
        <p class="muted">Fetch E-Sh4rk scripts from GitHub below, or import a local .txt script/folder. The scanner reads them as plain text and helps you create curated schemas.</p>
      </div>`
    : '';

  const managementHtml = p.scripts.length > 0
    ? `${batchScanSummaryCard(summarizeBatchScan(p.scripts))}
      ${packCards}
      ${scriptLibraryFilterBar()}
      <input type="text" data-bind="scripts.search" value="${attr(state.scriptsSearch)}" placeholder="Search by filename or title" aria-label="Search scripts" style="margin:0.5rem 0" />
      ${scriptSummaryTable(filteredRows)}`
    : '';

  const cardsHtml = scriptCards || (p.scripts.length > 0 ? '<div class="empty">No scripts match this filter/search.</div>' : '<div class="empty">No scripts imported yet.</div>');

  const unattachedSchemas = p.curatedSchemas.filter((s) => !s.scriptId);
  const unattachedHtml = unattachedSchemas.length > 0
    ? `<div class="card">
        <h3>Unattached schemas <span class="pill">detached from any script</span></h3>
        <p class="muted">These schemas still exist in this workspace and are still selectable in Run Script if reviewed, but no longer point at a specific script — re-import the script and edit a duplicate to reattach.</p>
        ${unattachedSchemas.map((s) => renderCuratedSchemaCard(s, [])).join('')}
      </div>`
    : '';

  return `<h1>Manage Scripts <span class="pill">developer-only, informational</span></h1>
    <p class="muted">The recommended path is to fetch E-Sh4rk scripts from GitHub, review or apply a reviewed schema preset, then run them from Run Script. The scanner never executes, assembles, or generates anything — it only reports draft candidates for you to review.</p>
    ${emptyStateHtml}
    ${supportedScriptsHtml(p)}
    <div class="card">
      <h3>Fetch E-Sh4rk scripts from GitHub <span class="pill">recommended</span></h3>
      <p class="muted">
        This performs a network request to GitHub, and only when you click the button below —
        nothing is fetched automatically, on launch, or in the background. Fetched files are
        imported as plain text; no generator is run by fetching scripts, and fetched scripts are
        stored locally afterward.
      </p>
      <p class="muted">Source: <code>${escapeHtml(ESHARK_GITHUB_REPO_URL)}</code> (public, read-only) — <code>files_frlg/</code> only.</p>
      <p class="muted">Set the target for the fetched scripts — leave Unknown/Mixed if you're not sure. Each script can override this individually later.</p>
      ${targetSelectsHtml('pendingPackTarget', state.pendingPackTarget, 'pending-pack-target-github')}
      <label for="pending-pack-target-notes-github">Target notes (optional)</label>
      <input type="text" id="pending-pack-target-notes-github" data-bind="pendingPackTargetNotes" value="${attr(state.pendingPackTargetNotes)}" placeholder="e.g. source, caveats" />
      <div class="row" style="margin-top:0.5rem">
        <button class="btn primary" data-action="fetch-eshark-github"${state.esharkFetchInProgress ? ' disabled' : ''}>${state.esharkFetchInProgress ? 'Fetching from GitHub…' : 'Fetch E-Sh4rk scripts from GitHub'}</button>
      </div>
    </div>
    ${managementHtml}
    ${cardsHtml}
    ${unattachedHtml}
    <details>
      <summary class="muted" style="cursor:pointer">Advanced / manual import — for offline use or a pinned local copy</summary>
      <p class="muted">Fetching from GitHub above is the recommended way to get E-Sh4rk scripts. Use local import only if you're offline, want a specific pinned copy, or are working with scripts that aren't on GitHub.</p>
      <div class="card">
        <h3>Import a script</h3>
        <button class="btn" data-action="import-script">Import script (.txt)</button>
        <input type="file" accept=".txt,text/plain" data-action="script-file" id="script-file-input" style="display:none" aria-label="Import script file" />
      </div>
      <div class="card">
        <h3>Import script folder</h3>
        ${sourceProfileSelectHtml()}
        <p class="muted">Set the target for scripts in the next folder you import — leave Unknown/Mixed if you're not sure, or the folder mixes targets. Each script can override this individually later.</p>
        ${targetSelectsHtml('pendingPackTarget', state.pendingPackTarget, 'pending-pack-target')}
        <label for="pending-pack-target-notes">Target notes (optional)</label>
        <input type="text" id="pending-pack-target-notes" data-bind="pendingPackTargetNotes" value="${attr(state.pendingPackTargetNotes)}" placeholder="e.g. source, caveats" />
        <div class="row" style="margin-top:0.5rem">
          <button class="btn" data-action="import-script-folder">Import script folder</button>
        </div>
        <input type="file" webkitdirectory multiple data-action="script-folder-file" id="script-folder-input" style="display:none" aria-label="Import script folder" />
      </div>
    </details>`;
}

function stateSelect(item: ChecklistItem): string {
  return `<select data-bind="checklist.state" data-id="${attr(item.id)}" aria-label="Review state for: ${attr(item.prompt)}">
    ${opt('unchecked', 'Unchecked', item.state)}${opt('confirmed', 'Confirmed', item.state)}${opt('not-applicable', 'Not applicable', item.state)}${opt('needs-follow-up', 'Needs follow-up', item.state)}
  </select>`;
}

function summaryCard(s: ReturnType<typeof computeReviewSummary>): string {
  return `<div class="card summary" role="group" aria-label="Checklist summary">
    <div class="stat"><div class="num">${s.totalItems}</div><div class="lbl">Total</div></div>
    <div class="stat"><div class="num">${s.confirmed}</div><div class="lbl">Confirmed</div></div>
    <div class="stat"><div class="num">${s.needsFollowUp}</div><div class="lbl">Needs follow-up</div></div>
    <div class="stat"><div class="num ${s.requiredOutstanding ? 'warn' : ''}">${s.requiredOutstanding}</div><div class="lbl">Unchecked required</div></div>
  </div>`;
}

function checklistFilterBar(): string {
  const filters: [ChecklistFilter, string][] = [
    ['all', 'All'], ['unchecked', 'Unchecked'], ['confirmed', 'Confirmed'],
    ['not-applicable', 'Not applicable'], ['needs-follow-up', 'Needs follow-up'],
  ];
  const chips = filters
    .map(([v, l]) => {
      const active = state.checklistFilter === v;
      return `<button class="chip${active ? ' active' : ''}" data-action="set-filter" data-filter="${v}" aria-pressed="${active}">${l}</button>`;
    })
    .join('');
  return `<div class="row filters" role="group" aria-label="Filter checklist by state">${chips}</div>`;
}

function renderChecklist(): string {
  const p = state.project!;
  const summary = computeReviewSummary(p);
  const visible = filterByState(p.checklist, state.checklistFilter);

  const byCat = new Map<string, ChecklistItem[]>();
  for (const it of visible) {
    const arr = byCat.get(it.category) ?? [];
    arr.push(it);
    byCat.set(it.category, arr);
  }
  let groups = '';
  for (const [cat, items] of byCat) {
    groups += `<h3>${escapeHtml(cat)}</h3>`;
    groups += items
      .map(
        (it) => `<div class="card" data-ref="${attr(it.id)}">
          <div class="row" style="justify-content:space-between">
            <strong>${escapeHtml(it.prompt)}${it.required ? ' <span class="pill">required</span>' : ''}</strong>
            <div class="row">${stateSelect(it)}<button class="btn danger" data-action="remove-checklist" data-id="${attr(it.id)}" aria-label="Remove item">Remove</button></div>
          </div>
          <label for="cl-note-${attr(it.id)}">Note</label>
          <textarea id="cl-note-${attr(it.id)}" class="prose" data-bind="checklist.note" data-id="${attr(it.id)}" placeholder="Optional reviewer note">${escapeHtml(it.note)}</textarea>
        </div>`,
      )
      .join('');
  }
  const body = p.checklist.length === 0
    ? '<div class="empty">No checklist items.</div>'
    : (groups || '<div class="empty">No items match this filter.</div>');

  return `<h1>Checklist</h1>
    ${summaryCard(summary)}
    ${checklistFilterBar()}
    ${body}
    <div class="card">
      <h3>Add your own review prompt</h3>
      <div class="grid2">
        <div><label for="ci-prompt">Prompt</label><input type="text" id="ci-prompt" placeholder="A question to review" /></div>
        <div><label for="ci-category">Category</label><input type="text" id="ci-category" placeholder="e.g. Review" /></div>
      </div>
      <label class="row" style="margin-top:0.5rem"><input type="checkbox" id="ci-required" style="width:auto" /> &nbsp;Required</label>
      <div style="margin-top:0.5rem"><button class="btn" data-action="add-checklist">Add item</button></div>
    </div>`;
}

function renderNotes(): string {
  const p = state.project!;
  const notes = p.notes.slice().sort((a, b) => a.order - b.order);
  const list = notes
    .map(
      (n) => `<div class="card" data-ref="${attr(n.id)}">
        <div class="row" style="justify-content:space-between">
          <input type="text" data-bind="note.sectionTitle" data-id="${attr(n.id)}" value="${attr(n.sectionTitle)}" placeholder="Section title" aria-label="Section title" style="max-width:70%" />
          <button class="btn danger" data-action="remove-note" data-id="${attr(n.id)}" aria-label="Remove note">Remove</button>
        </div>
        <textarea class="prose" data-bind="note.body" data-id="${attr(n.id)}" placeholder="Your notes (Markdown-style plain text)" aria-label="Note body">${escapeHtml(n.body)}</textarea>
      </div>`,
    )
    .join('');
  return `<h1>Notes</h1>
    ${list || '<div class="empty">No notes yet.</div>'}
    <div class="card">
      <h3>Add a note section</h3>
      <label for="nn-title">Title</label>
      <input type="text" id="nn-title" placeholder="Section title" />
      <label for="nn-body">Body</label>
      <textarea class="prose" id="nn-body" placeholder="Your notes"></textarea>
      <div style="margin-top:0.5rem"><button class="btn" data-action="add-note">Add note</button></div>
    </div>`;
}

function lineNumberView(text: string): string {
  const rows = numberLines(text)
    .map((l) => `<tr><td class="ln" aria-hidden="true">${l.n}</td><td class="lc"><span>${escapeHtml(l.text)}</span></td></tr>`)
    .join('');
  return `<div class="linebox"><table class="lines"><tbody>${rows}</tbody></table></div>`;
}

function sourceTypeSelect(b: ImportedTextBlock): string {
  const opts = SELECTABLE_SOURCE_TYPES.map((t) => opt(t, SOURCE_TYPE_LABELS[t], b.source.type)).join('');
  return `<select data-bind="source.type" data-id="${attr(b.id)}" aria-label="Source type">${opts}</select>`;
}

function externalToolFields(b: ImportedTextBlock): string {
  const s = b.source;
  return `<div class="card ext-tool">
    <p class="muted"><strong>This app does not run external tools. Paste or import text manually.</strong> The fields below only document the tool for provenance; they are never executed, fetched, or parsed.</p>
    <div class="grid2">
      <div><label>Tool name</label><input type="text" data-bind="source.toolName" data-id="${attr(b.id)}" value="${attr(s.toolName ?? '')}" aria-label="Tool name" maxlength="${SOURCE_FIELD_MAX.toolName}" /></div>
      <div><label>Tool version</label><input type="text" data-bind="source.toolVersion" data-id="${attr(b.id)}" value="${attr(s.toolVersion ?? '')}" aria-label="Tool version" maxlength="${SOURCE_FIELD_MAX.toolVersion}" /></div>
    </div>
    <label>Tool URL (documentation only — the app does not open or fetch it)</label>
    <input type="text" data-bind="source.toolUrl" data-id="${attr(b.id)}" value="${attr(s.toolUrl ?? '')}" aria-label="Tool URL" maxlength="${SOURCE_FIELD_MAX.toolUrl}" />
    <label>Invocation notes</label>
    <textarea class="prose" data-bind="source.invocationNotes" data-id="${attr(b.id)}" placeholder="How the tool was run, for your records (not executed)" aria-label="Invocation notes" maxlength="${SOURCE_FIELD_MAX.invocationNotes}">${escapeHtml(s.invocationNotes ?? '')}</textarea>
  </div>`;
}

function renderBlock(b: ImportedTextBlock): string {
  const collapsed = state.collapsed.has(b.id);
  const editing = state.blockEdit.has(b.id) || b.rawText === '';
  const lineCount = numberLines(b.rawText).length;

  const s = b.source;
  const provLine = `Source: <strong>${escapeHtml(SOURCE_TYPE_LABELS[s.type])}</strong> · imported ${escapeHtml(s.importedAt)}${s.filename ? ' · file: ' + escapeHtml(s.filename) : ''}${s.actionLabel ? ' · action: ' + escapeHtml(s.actionLabel) : ''}${s.generatedBy ? ' · generated by ' + escapeHtml(s.generatedBy) : ''}`;

  const bodyInner = collapsed
    ? ''
    : `<div class="prov"><span class="muted">${provLine}</span></div>
      <div class="grid2">
        <div><label>Source type</label>${sourceTypeSelect(b)}</div>
        <div><label>Source label</label><input type="text" data-bind="source.label" data-id="${attr(b.id)}" value="${attr(s.label)}" aria-label="Source label" maxlength="${SOURCE_FIELD_MAX.label}" /></div>
      </div>
      <label>Source notes</label>
      <input type="text" data-bind="source.notes" data-id="${attr(b.id)}" value="${attr(s.notes ?? '')}" placeholder="Optional notes about the source" aria-label="Source notes" maxlength="${SOURCE_FIELD_MAX.notes}" />
      ${s.type === 'external-local-tool' ? externalToolFields(b) : ''}
      <div class="grid2">
        <div><label>Category label</label><input type="text" data-bind="block.categoryLabel" data-id="${attr(b.id)}" value="${attr(b.categoryLabel)}" aria-label="Category label" /></div>
        <div><label>Revision label</label><input type="text" data-bind="block.revisionLabel" data-id="${attr(b.id)}" value="${attr(b.revisionLabel)}" aria-label="Revision label" /></div>
      </div>
      <label>Block notes</label>
      <input type="text" data-bind="block.notes" data-id="${attr(b.id)}" value="${attr(b.notes)}" placeholder="Optional notes about this block" aria-label="Block notes" />
      <label>Imported text (stored verbatim)</label>
      ${editing
        ? `<textarea data-bind="block.rawText" data-id="${attr(b.id)}" placeholder="Paste pre-existing text here" aria-label="Imported text">${escapeHtml(b.rawText)}</textarea>`
        : lineNumberView(b.rawText)}`;

  return `<div class="card block" data-ref="${attr(b.id)}">
    <div class="row block-head" style="justify-content:space-between">
      <div class="row">
        <button class="icon" data-action="toggle-collapse" data-id="${attr(b.id)}" aria-expanded="${!collapsed}" aria-label="${collapsed ? 'Expand block' : 'Collapse block'}">${collapsed ? '▸' : '▾'}</button>
        <input type="text" data-bind="block.title" data-id="${attr(b.id)}" value="${attr(b.title)}" placeholder="Block title" aria-label="Block title" style="min-width:16rem" />
        <span class="pill">${escapeHtml(SOURCE_TYPE_LABELS[s.type])}</span>
        <span class="muted">${lineCount} line${lineCount === 1 ? '' : 's'}</span>
      </div>
      <div class="row">
        <button class="btn small" data-action="toggle-edit" data-id="${attr(b.id)}">${editing ? 'Done' : 'Edit'}</button>
        <button class="btn small" data-action="copy-block" data-id="${attr(b.id)}" aria-label="Copy raw text">Copy raw</button>
        <button class="btn danger small" data-action="remove-block" data-id="${attr(b.id)}" aria-label="Remove block">Remove</button>
      </div>
    </div>
    ${bodyInner}
  </div>`;
}

function renderOutputs(): string {
  const p = state.project!;
  const blocks = p.importedBlocks.map(renderBlock).join('');
  return `<h1>Outputs</h1>
    <p class="muted">Text is stored exactly as pasted or loaded. It is never modified or generated; line numbers are display-only and the "Copy raw" button copies the stored text verbatim.</p>
    ${blocks || '<div class="empty">Saved filled scripts and pasted generator output will appear here.</div>'}
    <div class="card">
      <h3>Add a block</h3>
      <div class="grid2">
        <div><label for="nb-title">Title</label><input type="text" id="nb-title" placeholder="Block title" /></div>
        <div><label for="nb-category">Category label</label><input type="text" id="nb-category" /></div>
      </div>
      <label for="nb-text">Text</label>
      <textarea id="nb-text" placeholder="Paste pre-existing text"></textarea>
      <div class="row" style="margin-top:0.5rem">
        <button class="btn" data-action="add-block">Add block</button>
        <button class="btn" data-action="load-block">Load .txt file as block</button>
        <input type="file" accept=".txt,text/plain" data-action="block-file" id="block-file-input" style="display:none" aria-label="Load text file as block" />
      </div>
    </div>`;
}

function targetExists(p: Project, f: Finding): boolean {
  const { kind, refId } = f.target;
  if (kind === 'metadata') return true;
  if (!refId) return false;
  if (kind === 'checklist') return p.checklist.some((i) => i.id === refId);
  if (kind === 'note') return p.notes.some((n) => n.id === refId);
  if (kind === 'importedBlock') return p.importedBlocks.some((b) => b.id === refId);
  return false;
}

function findingRow(p: Project, f: Finding): string {
  const loc = `${escapeHtml(TARGET_LABELS[f.target.kind])}${f.target.line ? ` · line ${f.target.line}` : ''}${f.target.column ? `, col ${f.target.column}` : ''}`;
  const jump = targetExists(p, f)
    ? `<button class="btn small" data-action="jump" data-kind="${f.target.kind}"${f.target.refId ? ` data-ref="${attr(f.target.refId)}"` : ''} aria-label="Go to source of this finding">Go to</button>`
    : '';
  return `<tr class="sev-${f.severity}">
    <td><span class="badge ${f.severity}">${f.severity}</span></td>
    <td>${escapeHtml(f.rule)}</td>
    <td>${loc}</td>
    <td>${escapeHtml(f.message)}</td>
    <td><label class="row nowrap"><input type="checkbox" data-bind="finding.ack" data-id="${attr(f.id)}" style="width:auto"${f.acknowledged ? ' checked' : ''} aria-label="Acknowledge finding" /> ack</label></td>
    <td>${jump}</td>
  </tr>`;
}

function findingsTable(p: Project, findings: Finding[]): string {
  return `<table><thead><tr><th>Severity</th><th>Rule</th><th>Location</th><th>Message</th><th>Ack</th><th></th></tr></thead>
    <tbody>${findings.map((f) => findingRow(p, f)).join('')}</tbody></table>`;
}

function findingsSection(p: Project): string {
  const findings = p.latestValidation?.findings ?? [];
  if (findings.length === 0) return '<div class="empty">No findings yet. Run validation to check formatting.</div>';

  const counts = countBySeverity(findings);
  const ranAt = p.latestValidation?.runAt.slice(0, 19).replace('T', ' ') ?? '';
  const groupToggle = `<div class="row filters" role="group" aria-label="Group findings by">
    <span class="muted">Group by:</span>
    <button class="chip${state.findingGroup === 'severity' ? ' active' : ''}" data-action="set-finding-group" data-group="severity" aria-pressed="${state.findingGroup === 'severity'}">Severity</button>
    <button class="chip${state.findingGroup === 'target' ? ' active' : ''}" data-action="set-finding-group" data-group="target" aria-pressed="${state.findingGroup === 'target'}">Target</button>
  </div>`;

  const groups = state.findingGroup === 'target' ? groupByTarget(findings) : groupBySeverity(findings);
  const sections = groups
    .map((g) => {
      const heading = state.findingGroup === 'target'
        ? `${TARGET_LABELS[g.key as TargetKind]} (${g.findings.length})`
        : `${cap(g.key)} — ${g.findings.length}`;
      return `<h3>${heading}</h3>${findingsTable(p, g.findings)}`;
    })
    .join('');

  return `<p class="muted">${counts.error} error(s), ${counts.warning} warning(s), ${counts.info} info · run at ${escapeHtml(ranAt)}</p>
    ${groupToggle}
    ${sections}`;
}

function renderValidation(): string {
  const p = state.project!;
  const s = p.settings;
  return `<h1>Validation</h1>
    <div class="card">
      <h3>Settings</h3>
      <div class="grid2">
        <div><label for="v-maxlen">Max line length</label><input type="number" id="v-maxlen" data-bind="settings.maxLineLength" value="${attr(String(s.maxLineLength))}" /></div>
        <div><label for="v-count">Character count mode</label><select id="v-count" data-bind="settings.countMode">${opt('codepoints', 'Code points', s.countMode)}${opt('utf16', 'UTF-16 units', s.countMode)}</select></div>
      </div>
      <div class="grid2">
        <div><label for="v-min">Expected min lines (optional)</label><input type="number" id="v-min" data-bind="settings.expectedLineMin" value="${attr(s.expectedLineMin === undefined ? '' : String(s.expectedLineMin))}" /></div>
        <div><label for="v-max">Expected max lines (optional)</label><input type="number" id="v-max" data-bind="settings.expectedLineMax" value="${attr(s.expectedLineMax === undefined ? '' : String(s.expectedLineMax))}" /></div>
      </div>
      <label for="v-glyphs">Allowed display glyphs (optional; empty = printable ASCII)</label>
      <input type="text" id="v-glyphs" data-bind="settings.allowedGlyphs" value="${attr(s.allowedGlyphs ?? '')}" placeholder="Paste the exact set of characters you consider displayable" />
      <div class="row" style="margin-top:0.75rem">
        <button class="btn primary" data-action="run-validation">Run validation</button>
        <button class="btn" data-action="clear-validation">Clear findings</button>
      </div>
    </div>
    ${findingsSection(p)}`;
}

function renderReport(): string {
  const p = state.project!;
  const complete = isReviewComplete(p);
  const summary = computeReviewSummary(p);
  return `<h1>Export</h1>
    <div class="card">
      <p>${complete ? '<span class="pill">review complete</span>' : '<span class="badge error">review incomplete</span> — required items or follow-ups remain; the report will be watermarked.'}</p>
      <p class="muted">${summary.confirmed}/${summary.totalItems} confirmed · ${p.importedBlocks.length} imported block(s) · ${p.notes.length} note section(s) · ${(p.latestValidation?.findings.length ?? 0)} validation finding(s)</p>
      <div class="row">
        <button class="btn primary" data-action="open-report">Open printable report</button>
        <button class="btn" data-action="export-json">Export workspace (.json)</button>
      </div>
      <p class="muted" style="margin-top:0.5rem">The printable report opens in a new tab. Use your browser's <strong>Print / Save as PDF</strong> command to save it. Everything stays on this device.</p>
    </div>`;
}

// --- event handling ---------------------------------------------------------

async function loadProject(id: string): Promise<void> {
  const p = await getProject(id);
  if (p) {
    state.project = p;
    state.screen = defaultScreenForWorkspace('opened');
    resetViewState(p);
    render();
  }
}

function resetViewState(project: Project): void {
  state.checklistFilter = 'all';
  state.findingGroup = 'severity';
  state.collapsed.clear();
  state.blockEdit.clear();
  state.highlightRef = null;
  state.actionBuilder = makeActionBuilderState(project);
  state.schemaEditor = null;
  state.scriptsFilter = 'all';
  state.scriptsSearch = '';
  state.pendingPackTarget = UNKNOWN_TARGET;
  state.pendingPackTargetNotes = '';
  state.pendingSourceProfile = 'generic';
  state.esharkFetchInProgress = false;
}

/**
 * Take the user straight into a workspace for a primary action — the user is
 * never asked to fill in a title/revision/language first. Reuses the most
 * recently updated untitled workspace if one already exists, rather than
 * creating a new blank workspace every time; only creates one when none do.
 * They can fill in metadata later via Advanced -> Workspace Settings.
 */
async function startNewWorkspace(origin: WorkspaceOrigin): Promise<void> {
  const reusable = findReusableUntitledWorkspace(state.summaries);
  const project = reusable
    ? await getProject(reusable.id)
    : createProject(
        { revisionLabel: '', languageLabel: '', projectTitle: '', mode: 'documentation', templateKey: TEMPLATES[0].key },
        uid,
        nowIso,
      );
  if (!project) return; // reusable was deleted concurrently — vanishingly unlikely
  if (!reusable) await putProject(project);
  state.project = project;
  state.screen = defaultScreenForWorkspace(origin);
  resetViewState(project);
  await refreshSummaries();
}

/**
 * On app launch: silently reopen the most recently used workspace, or
 * create a fresh blank one if none exist yet, and land on Run Script. The
 * user should never have to pick or configure a workspace before using the
 * tool — full workspace management still lives under Advanced -> Workspaces.
 */
async function openDefaultWorkspace(): Promise<void> {
  const recent = mostRecentWorkspace(state.summaries);
  let project: Project | undefined;
  try {
    project = recent ? await getProject(recent.id) : undefined;
  } catch {
    // A stored workspace that genuinely can't be migrated (e.g. corrupted)
    // must never block the app from rendering at all — fall through and
    // start a fresh one instead of leaving the screen blank.
    project = undefined;
  }
  if (!project) {
    project = createProject(
      { revisionLabel: '', languageLabel: '', projectTitle: '', mode: 'documentation', templateKey: TEMPLATES[0].key },
      uid,
      nowIso,
    );
    await putProject(project);
    state.summaries = await listProjects();
  }
  state.project = project;
  state.screen = 'actions';
  resetViewState(project);
}

function jumpTo(kind: TargetKind, ref: string | undefined): void {
  switch (kind) {
    case 'metadata': state.screen = 'settings'; break;
    case 'checklist': state.screen = 'checklist'; state.checklistFilter = 'all'; break;
    case 'note': state.screen = 'notes'; break;
    case 'importedBlock': state.screen = 'outputs'; if (ref) state.collapsed.delete(ref); break;
  }
  if (ref) state.highlightRef = ref;
  render();
}

async function handleClick(e: Event): Promise<void> {
  const el = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;
  const p = state.project;

  switch (action) {
    case 'nav': {
      const screen = el.dataset.screen as Screen;
      if (screen === 'landing') state.manageWorkspacesOpen = false;
      state.screen = screen;
      render();
      break;
    }
    case 'start-with-action':
      await startNewWorkspace('created');
      break;
    case 'start-import-script':
      await startNewWorkspace('import-script');
      break;
    case 'toggle-manage-workspaces':
      state.manageWorkspacesOpen = !state.manageWorkspacesOpen;
      render();
      break;
    case 'load-demo': {
      const demo = importProjectJson(DEMO_PROJECT_JSON);
      demo.id = uid();
      const now = nowIso();
      demo.metadata.createdAt = now;
      demo.metadata.updatedAt = now;
      await putProject(demo);
      state.project = demo;
      state.screen = defaultScreenForWorkspace('demo');
      resetViewState(demo);
      await refreshSummaries();
      break;
    }
    case 'open':
      if (id) await loadProject(id);
      break;
    case 'delete':
      if (id && window.confirm('Delete this workspace? This cannot be undone.')) {
        await deleteProject(id);
        await refreshSummaries();
      }
      break;
    case 'import-json':
      (document.getElementById('import-file-input') as HTMLInputElement | null)?.click();
      break;
    case 'set-filter':
      state.checklistFilter = (el.dataset.filter as ChecklistFilter) ?? 'all';
      render();
      break;
    case 'set-finding-group':
      state.findingGroup = el.dataset.group === 'target' ? 'target' : 'severity';
      render();
      break;
    case 'jump':
      jumpTo(el.dataset.kind as TargetKind, el.dataset.ref);
      break;
    case 'toggle-collapse':
      if (id) {
        if (state.collapsed.has(id)) state.collapsed.delete(id);
        else state.collapsed.add(id);
        render();
      }
      break;
    case 'toggle-edit':
      if (id) {
        if (state.blockEdit.has(id)) state.blockEdit.delete(id);
        else state.blockEdit.add(id);
        render();
      }
      break;
    case 'copy-block': {
      if (!p || !id) break;
      const b = p.importedBlocks.find((x) => x.id === id);
      if (!b) break;
      const ok = await copyText(b.rawText);
      const orig = el.textContent;
      el.textContent = ok ? 'Copied ✓' : 'Copy failed';
      window.setTimeout(() => { el.textContent = orig; }, 1200);
      break;
    }
    case 'select-advanced-schema': {
      if (!p || !id) break;
      const ab = state.actionBuilder;
      ab.curatedSchemaId = id;
      const resolved = resolveActionDefinition(ab, p);
      ab.values = resolved ? defaultActionValues(resolved.template) : {};
      resetGeneratedOutput(ab);
      render();
      break;
    }
    case 'run-supported-script': {
      if (!p || !id) break;
      const schema = p.curatedSchemas.find((s) => s.id === id);
      if (!schema) break;
      const ab = state.actionBuilder;
      ab.runTarget = schema.target;
      ab.curatedSchemaId = schema.id;
      const resolved = resolveActionDefinition(ab, p);
      ab.values = resolved ? defaultActionValues(resolved.template) : {};
      resetGeneratedOutput(ab);
      state.screen = 'actions';
      render();
      break;
    }
    case 'preview-filled-script': {
      if (!p) break;
      const ab = state.actionBuilder;
      const resolved = resolveActionDefinition(ab, p);
      const script = resolved?.curated.scriptId ? p.scripts.find((s) => s.id === resolved.curated.scriptId) : undefined;
      if (!resolved || !script) break;
      ab.filledScript = fillScriptFromSchema(script.rawText, resolved.curated, ab.values);
      ab.filledScriptSavedBlockId = null;
      render();
      break;
    }
    case 'copy-filled-script': {
      const ab = state.actionBuilder;
      if (!ab.filledScript || ab.filledScript.errors.length > 0) break;
      const ok = await copyText(ab.filledScript.filledScriptText);
      const orig = el.textContent;
      el.textContent = ok ? 'Copied ✓' : 'Copy failed';
      window.setTimeout(() => { el.textContent = orig; }, 1200);
      break;
    }
    case 'save-filled-script': {
      if (!p) break;
      const ab = state.actionBuilder;
      const resolved = resolveActionDefinition(ab, p);
      if (!resolved || !ab.filledScript || ab.filledScript.errors.length > 0 || !resolved.curated.scriptId) break;
      const { template, curated } = resolved;
      const script = p.scripts.find((s) => s.id === curated.scriptId);
      const now = nowIso();
      const block: ImportedTextBlock = {
        id: uid(),
        title: `${template.label} — filled script`,
        categoryLabel: 'Filled script',
        revisionLabel: ab.revisionLabel,
        rawText: ab.filledScript.filledScriptText,
        notes: '',
        source: {
          type: 'filled-script',
          label: 'Filled script (this app)',
          importedAt: now,
          schemaVersion: SOURCE_SCHEMA_VERSION,
          actionId: template.id,
          actionLabel: template.label,
          generatedBy: 'manual script filler',
          scriptId: curated.scriptId,
          filename: script?.filename,
        },
      };
      p.importedBlocks.push(block);
      ab.filledScriptSavedBlockId = block.id;
      commit();
      break;
    }
    case 'preview-pasted-output': {
      const ab = state.actionBuilder;
      ab.pasteBack.parsed = parseGeneratorOutput(ab.pasteBack.rawText);
      render();
      break;
    }
    case 'copy-parsed-compact': {
      const ab = state.actionBuilder;
      const idx = Number(el.dataset.row);
      const row = ab.pasteBack.parsed?.rows[idx];
      if (!row || row.compactText === null) break;
      const ok = await copyText(row.compactText);
      const orig = el.textContent;
      el.textContent = ok ? 'Copied ✓' : 'Copy failed';
      window.setTimeout(() => { el.textContent = orig; }, 1200);
      break;
    }
    case 'copy-parsed-raw': {
      const ab = state.actionBuilder;
      const idx = Number(el.dataset.row);
      const row = ab.pasteBack.parsed?.rows[idx];
      if (!row) break;
      const ok = await copyText(row.rawLine);
      const orig = el.textContent;
      el.textContent = ok ? 'Copied ✓' : 'Copy failed';
      window.setTimeout(() => { el.textContent = orig; }, 1200);
      break;
    }
    case 'copy-all-compact': {
      const ab = state.actionBuilder;
      if (!ab.pasteBack.parsed) break;
      const ok = await copyText(formatCompactBoxNames(ab.pasteBack.parsed.rows));
      const orig = el.textContent;
      el.textContent = ok ? 'Copied ✓' : 'Copy failed';
      window.setTimeout(() => { el.textContent = orig; }, 1200);
      break;
    }
    case 'copy-all-raw-box-lines': {
      const ab = state.actionBuilder;
      if (!ab.pasteBack.parsed) break;
      const ok = await copyText(formatRawBoxLines(ab.pasteBack.parsed.rows));
      const orig = el.textContent;
      el.textContent = ok ? 'Copied ✓' : 'Copy failed';
      window.setTimeout(() => { el.textContent = orig; }, 1200);
      break;
    }
    case 'copy-pasted-output': {
      const ab = state.actionBuilder;
      const ok = await copyText(ab.pasteBack.rawText);
      const orig = el.textContent;
      el.textContent = ok ? 'Copied ✓' : 'Copy failed';
      window.setTimeout(() => { el.textContent = orig; }, 1200);
      break;
    }
    case 'save-pasted-output': {
      if (!p) break;
      const ab = state.actionBuilder;
      const pb = ab.pasteBack;
      if (!pb.rawText) break;
      const resolved = resolveActionDefinition(ab, p);
      if (!resolved) break;
      const { template, curated } = resolved;
      const linkedScript = curated.scriptId ? p.scripts.find((s) => s.id === curated.scriptId) : undefined;
      const now = nowIso();
      const block: ImportedTextBlock = {
        id: uid(),
        title: pb.label.trim() || `${template.label} — manual generator output`,
        categoryLabel: 'Manual generator output',
        revisionLabel: ab.revisionLabel,
        rawText: pb.rawText,
        notes: '',
        source: {
          type: 'external-local-tool',
          label: 'Manual external generator output',
          importedAt: now,
          schemaVersion: SOURCE_SCHEMA_VERSION,
          actionId: template.id,
          actionLabel: template.label,
          generatedBy: 'manual external generator',
          scriptId: linkedScript?.id,
          filename: linkedScript?.filename,
        },
      };
      p.importedBlocks.push(block);
      pb.savedBlockId = block.id;
      commit();
      break;
    }
    case 'import-script':
      (document.getElementById('script-file-input') as HTMLInputElement | null)?.click();
      break;
    case 'import-script-folder':
      (document.getElementById('script-folder-input') as HTMLInputElement | null)?.click();
      break;
    case 'fetch-eshark-github':
      void handleFetchEsharkGithub();
      break;
    case 'remove-script':
      if (p && id) {
        p.scripts = p.scripts.filter((s) => s.id !== id);
        for (const pack of p.scriptPacks) pack.scriptIds = pack.scriptIds.filter((sid) => sid !== id);
        commit();
      }
      break;
    case 'run-scan': {
      if (!p || !id) break;
      const script = p.scripts.find((s) => s.id === id);
      if (!script) break;
      script.lastScan = scanScript(script, nowIso);
      commit();
      break;
    }
    case 'scan-all-in-pack': {
      if (!p || !id) break;
      for (const s of p.scripts.filter((s) => s.packId === id)) s.lastScan = scanScript(s, nowIso);
      commit();
      break;
    }
    case 'set-scripts-filter':
      state.scriptsFilter = (el.dataset.filter as ScriptLibraryFilter) ?? 'all';
      render();
      break;
    case 'open-script':
      if (id) {
        state.scriptsFilter = 'all';
        state.scriptsSearch = '';
        state.highlightRef = id;
      }
      render();
      break;
    case 'apply-schema-preset': {
      if (!p || !id) break;
      const presetId = el.dataset.preset;
      const script = p.scripts.find((s) => s.id === id);
      const preset = SCHEMA_PRESETS.find((pr) => pr.id === presetId);
      if (!script || !preset) break;
      upsertCuratedSchema(p.curatedSchemas, applyPreset(preset, script));
      commit();
      break;
    }
    case 'apply-reviewed-preset': {
      if (!p || !id) break;
      const presetId = el.dataset.preset;
      const script = p.scripts.find((s) => s.id === id);
      const preset = REVIEWED_SCHEMA_PRESETS.find((pr) => pr.id === presetId);
      if (!script || !preset) break;
      upsertCuratedSchema(p.curatedSchemas, buildCuratedSchemaFromPreset(preset, script));
      commit();
      break;
    }
    case 'export-draft-schema': {
      if (!p || !id) break;
      const script = p.scripts.find((s) => s.id === id);
      if (!script || !script.lastScan) break;
      const schema = buildDraftActionSchema(script, script.lastScan, nowIso);
      const base = script.filename.replace(/\.txt$/i, '') || 'script';
      downloadText(`${base}-draft-schema.json`, exportDraftActionSchemaJson(schema), 'application/json');
      break;
    }
    case 'export-reviewed-preset': {
      if (!p || !id) break;
      const schema = p.curatedSchemas.find((s) => s.id === id);
      if (!schema) break;
      const script = schema.scriptId ? p.scripts.find((s) => s.id === schema.scriptId) : undefined;
      const scriptFilename = schema.scriptFilename ?? script?.filename;
      if (!scriptFilename) {
        window.alert('This schema has no linked script filename to match against — attach it to a script first.');
        break;
      }
      const reviewerNote = window.prompt('Optional reviewer note (leave blank to skip):', '') ?? undefined;
      const preset = buildReviewedPresetExport({
        schema,
        scriptFilename,
        scriptTitle: script?.lastScan?.title,
        category: script?.category,
        reviewerNote: reviewerNote && reviewerNote.trim() ? reviewerNote.trim() : undefined,
        reviewedAt: nowIso(),
      });
      const base = preset.id || 'reviewed-preset';
      downloadText(`${base}.json`, serializeReviewedPresetForExport(preset), 'application/json');
      break;
    }
    case 'edit-curated-schema': {
      if (!p || !id) break;
      const schema = p.curatedSchemas.find((s) => s.id === id);
      if (!schema) break;
      openSchemaEditorForExisting(schema, p);
      render();
      break;
    }
    case 'duplicate-curated-schema': {
      if (!p || !id) break;
      const schema = p.curatedSchemas.find((s) => s.id === id);
      if (!schema) break;
      const newId = nextDuplicateSchemaId(schema.id, p.curatedSchemas.map((s) => s.id));
      upsertCuratedSchema(p.curatedSchemas, duplicateCuratedSchema(schema, newId));
      commit();
      break;
    }
    case 'detach-curated-schema': {
      if (!p || !id) break;
      const schema = p.curatedSchemas.find((s) => s.id === id);
      if (!schema) break;
      upsertCuratedSchema(p.curatedSchemas, detachCuratedSchema(schema));
      commit();
      break;
    }
    case 'set-schema-status': {
      if (!p || !id) break;
      const schema = p.curatedSchemas.find((s) => s.id === id);
      const status = el.dataset.status as CuratedSchemaStatus | undefined;
      if (!schema || !status) break;
      schema.status = status;
      commit();
      break;
    }
    case 'delete-curated-schema': {
      if (!p || !id) break;
      const schema = p.curatedSchemas.find((s) => s.id === id);
      if (!schema) break;
      const usageCount = countSavedOutputsUsingSchema(p.importedBlocks, schema.id);
      const usageWarning = usageCount > 0
        ? `\n\nNote: ${usageCount} saved output(s) were generated using this schema. They will not be deleted or altered, but you may want to review them.`
        : '';
      const confirmed = window.confirm(
        `Delete this curated schema? This does not delete the script file or saved outputs.${usageWarning}`,
      );
      if (!confirmed) break;
      removeCuratedSchema(p.curatedSchemas, schema.id);
      if (state.schemaEditor?.id === schema.id) state.schemaEditor = null;
      commit();
      break;
    }
    case 'attach-curated-schema':
      if (id) (document.getElementById(`curated-schema-input-${id}`) as HTMLInputElement | null)?.click();
      break;
    case 'create-schema-from-scan': {
      if (!p || !id) break;
      const script = p.scripts.find((s) => s.id === id);
      if (script) openSchemaEditor(script, p);
      render();
      break;
    }
    case 'close-schema-editor':
      state.schemaEditor = null;
      render();
      break;
    case 'toggle-schema-candidate-off':
      if (id) {
        toggleSchemaCandidate(id, false);
        render();
      }
      break;
    case 'save-schema-from-editor': {
      if (!p) break;
      const editor = state.schemaEditor;
      if (!editor) break;
      const script = p.scripts.find((s) => s.id === editor.scriptId);
      if (!script) break;
      const draft = buildDraftSchemaFromEditor(editor, script);
      const errors = validateDraftSchema(draft, p);
      editor.errors = errors;
      if (errors.length > 0) {
        render();
        break;
      }
      upsertCuratedSchema(p.curatedSchemas, draft);
      editor.savedSchemaId = draft.id;
      commit();
      break;
    }
    case 'add-checklist': {
      if (!p) break;
      const prompt = readVal('ci-prompt').trim();
      if (!prompt) break;
      const item: ChecklistItem = {
        id: uid(),
        prompt,
        category: readVal('ci-category').trim() || 'Custom',
        state: 'unchecked',
        note: '',
        required: readChecked('ci-required'),
      };
      p.checklist.push(item);
      commit();
      break;
    }
    case 'remove-checklist':
      if (p && id) {
        p.checklist = p.checklist.filter((i) => i.id !== id);
        commit();
      }
      break;
    case 'add-note': {
      if (!p) break;
      const note: UserNote = {
        id: uid(),
        sectionTitle: readVal('nn-title').trim(),
        body: readVal('nn-body'),
        order: p.notes.length,
      };
      p.notes.push(note);
      commit();
      break;
    }
    case 'remove-note':
      if (p && id) {
        p.notes = p.notes.filter((n) => n.id !== id);
        commit();
      }
      break;
    case 'add-block': {
      if (!p) break;
      const now = nowIso();
      const block: ImportedTextBlock = {
        id: uid(),
        title: readVal('nb-title').trim(),
        categoryLabel: readVal('nb-category').trim(),
        revisionLabel: p.metadata.revisionLabel,
        rawText: readVal('nb-text'),
        notes: '',
        source: { type: 'manual-paste', label: 'Manual paste', importedAt: now, schemaVersion: SOURCE_SCHEMA_VERSION },
      };
      p.importedBlocks.push(block);
      commit();
      break;
    }
    case 'load-block':
      (document.getElementById('block-file-input') as HTMLInputElement | null)?.click();
      break;
    case 'remove-block':
      if (p && id) {
        p.importedBlocks = p.importedBlocks.filter((b) => b.id !== id);
        state.collapsed.delete(id);
        state.blockEdit.delete(id);
        commit();
      }
      break;
    case 'run-validation':
      if (p) {
        p.latestValidation = buildValidationResult(p, nowIso());
        if (p.projectStatus === 'draft') p.projectStatus = 'in-review';
        commit();
      }
      break;
    case 'clear-validation':
      if (p) {
        p.latestValidation = null;
        commit();
      }
      break;
    case 'open-report':
      if (p) openHtmlInNewTab(renderReportHtml(p, nowIso()));
      break;
    case 'export-json':
      if (p) downloadText(`${p.metadata.projectTitle || 'project'}.json`, exportProjectJson(p), 'application/json');
      break;
  }
}

async function handleChange(e: Event): Promise<void> {
  const t = e.target as HTMLElement;
  const action = t.dataset.action;
  if (action === 'import-file') {
    await handleImportFile(t as HTMLInputElement);
    return;
  }
  if (action === 'block-file') {
    await handleBlockFile(t as HTMLInputElement);
    return;
  }
  if (action === 'script-file') {
    await handleScriptFile(t as HTMLInputElement);
    return;
  }
  if (action === 'script-folder-file') {
    await handleScriptFolderFile(t as HTMLInputElement);
    return;
  }
  if (action === 'curated-schema-file') {
    await handleCuratedSchemaFile(t as HTMLInputElement);
    return;
  }
  const bind = t.dataset.bind;
  if (!bind) return;
  const id = t.dataset.id;
  const input = t as HTMLInputElement;
  const value = input.value;
  const checked = input.type === 'checkbox' ? input.checked : undefined;
  if (bind.startsWith('action.')) {
    applyActionBinding(bind, id, value, checked);
    render();
    return;
  }
  if (bind.startsWith('pasteback.')) {
    applyPasteBackBinding(bind, value);
    render();
    return;
  }
  if (bind === 'schema-candidate.include') {
    toggleSchemaCandidate(id ?? '', checked ?? false);
    render();
    return;
  }
  if (bind.startsWith('schema-field.')) {
    applySchemaFieldBinding(bind, id, value, checked);
    render();
    return;
  }
  if (bind.startsWith('schema.')) {
    applySchemaEditorBinding(bind, value);
    render();
    return;
  }
  if (bind === 'scripts.search') {
    state.scriptsSearch = value;
    render();
    return;
  }
  if (bind === 'pendingPackTarget.game') {
    state.pendingPackTarget = { ...state.pendingPackTarget, game: value as GameTarget['game'] };
    render();
    return;
  }
  if (bind === 'pendingPackTarget.language') {
    state.pendingPackTarget = { ...state.pendingPackTarget, language: value as GameTarget['language'] };
    render();
    return;
  }
  if (bind === 'pendingPackTarget.revision') {
    state.pendingPackTarget = { ...state.pendingPackTarget, revision: value as GameTarget['revision'] };
    render();
    return;
  }
  if (bind === 'pendingPackTargetNotes') {
    state.pendingPackTargetNotes = value;
    render();
    return;
  }
  if (bind === 'pendingSourceProfile') {
    state.pendingSourceProfile = value as SourceProfile;
    render();
    return;
  }
  applyBinding(bind, id, value, checked);
}

function resetGeneratedOutput(ab: ActionBuilderState): void {
  ab.filledScript = null;
  ab.filledScriptSavedBlockId = null;
}

/** After the run target changes: keep the current schema selected only if it's
 *  still a default match for the new target, else fall back to the first
 *  default match (or none) — never silently keep an incompatible selection. */
function onRunTargetChanged(ab: ActionBuilderState, project: Project | null): void {
  if (!project) return;
  ab.curatedSchemaId = pickDefaultCuratedSchemaId(project.curatedSchemas, ab.runTarget, ab.curatedSchemaId);
  const resolved = resolveActionDefinition(ab, project);
  ab.values = resolved ? defaultActionValues(resolved.template) : {};
  resetGeneratedOutput(ab);
}

function applyActionBinding(bind: string, id: string | undefined, value: string, checked: boolean | undefined): void {
  const ab = state.actionBuilder;
  const project = state.project;
  switch (bind) {
    case 'action.revisionLabel':
      ab.revisionLabel = value;
      break;
    case 'action.curatedSchemaId': {
      ab.curatedSchemaId = value;
      if (project) {
        const resolved = resolveActionDefinition(ab, project);
        if (resolved) ab.values = defaultActionValues(resolved.template);
      }
      resetGeneratedOutput(ab);
      break;
    }
    case 'action.runTarget.game':
      ab.runTarget = { ...ab.runTarget, game: value as GameTarget['game'] };
      onRunTargetChanged(ab, project);
      break;
    case 'action.runTarget.language':
      ab.runTarget = { ...ab.runTarget, language: value as GameTarget['language'] };
      onRunTargetChanged(ab, project);
      break;
    case 'action.runTarget.revision':
      ab.runTarget = { ...ab.runTarget, revision: value as GameTarget['revision'] };
      onRunTargetChanged(ab, project);
      break;
    case 'action.field': {
      if (!id || !project) break;
      const resolved = resolveActionDefinition(ab, project);
      if (!resolved) break;
      const field = resolved.template.fields.find((f) => f.key === id);
      if (!field) break;
      ab.values[id] = coerceActionFieldValue(field, value, checked);
      break;
    }
    case 'action.field-search':
      if (id) ab.referenceSearch[id] = value;
      break;
  }
}

function applyPasteBackBinding(bind: string, value: string): void {
  const pb = state.actionBuilder.pasteBack;
  switch (bind) {
    case 'pasteback.rawText':
      pb.rawText = value;
      pb.parsed = null;
      pb.savedBlockId = null;
      break;
    case 'pasteback.label':
      pb.label = value;
      break;
  }
}

function applyBinding(bind: string, id: string | undefined, value: string, checked: boolean | undefined): void {
  const p = state.project;
  if (!p) return;
  switch (bind) {
    case 'metadata.revisionLabel': p.metadata.revisionLabel = value; break;
    case 'metadata.languageLabel': p.metadata.languageLabel = value; break;
    case 'metadata.projectTitle': p.metadata.projectTitle = value; break;
    case 'metadata.mode': p.metadata.mode = value as Project['metadata']['mode']; break;
    case 'status': p.projectStatus = value as Project['projectStatus']; break;
    case 'checklist.state': {
      const it = p.checklist.find((i) => i.id === id);
      if (it) it.state = value as ChecklistItem['state'];
      break;
    }
    case 'checklist.note': {
      const it = p.checklist.find((i) => i.id === id);
      if (it) it.note = value;
      break;
    }
    case 'note.sectionTitle': {
      const n = p.notes.find((x) => x.id === id);
      if (n) n.sectionTitle = value;
      break;
    }
    case 'note.body': {
      const n = p.notes.find((x) => x.id === id);
      if (n) n.body = value;
      break;
    }
    case 'script.notes': setScript(id, (s) => (s.notes = value)); break;
    case 'block.title': setBlock(id, (b) => (b.title = value)); break;
    case 'block.categoryLabel': setBlock(id, (b) => (b.categoryLabel = value)); break;
    case 'block.revisionLabel': setBlock(id, (b) => (b.revisionLabel = value)); break;
    case 'block.notes': setBlock(id, (b) => (b.notes = value)); break;
    case 'block.rawText': setBlock(id, (b) => (b.rawText = value)); break;
    case 'source.type': setBlock(id, (b) => (b.source.type = value as ImportedTextBlock['source']['type'])); break;
    case 'source.label': setBlock(id, (b) => (b.source.label = value)); break;
    case 'source.notes': setBlock(id, (b) => (b.source.notes = value)); break;
    case 'source.toolName': setBlock(id, (b) => (b.source.toolName = value)); break;
    case 'source.toolVersion': setBlock(id, (b) => (b.source.toolVersion = value)); break;
    case 'source.toolUrl': setBlock(id, (b) => (b.source.toolUrl = value)); break;
    case 'source.invocationNotes': setBlock(id, (b) => (b.source.invocationNotes = value)); break;
    case 'settings.maxLineLength': {
      const n = parseInt(value, 10);
      if (!Number.isNaN(n) && n > 0) p.settings.maxLineLength = n;
      break;
    }
    case 'settings.countMode': p.settings.countMode = value === 'utf16' ? 'utf16' : 'codepoints'; break;
    case 'settings.expectedLineMin': p.settings.expectedLineMin = parseOptInt(value); break;
    case 'settings.expectedLineMax': p.settings.expectedLineMax = parseOptInt(value); break;
    case 'settings.allowedGlyphs': p.settings.allowedGlyphs = value; break;
    case 'finding.ack': {
      const f = p.latestValidation?.findings.find((x) => x.id === id);
      if (f) f.acknowledged = checked ?? false;
      break;
    }
  }
  commit();
}

function setBlock(id: string | undefined, fn: (b: ImportedTextBlock) => void): void {
  const b = state.project?.importedBlocks.find((x) => x.id === id);
  if (b) fn(b);
}

function setScript(id: string | undefined, fn: (s: ScriptFile) => void): void {
  const s = state.project?.scripts.find((x) => x.id === id);
  if (s) fn(s);
}

function parseOptInt(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

async function handleImportFile(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const text = await readFileText(file);
    const project = importProjectJson(text);
    await putProject(project);
    await refreshSummaries();
    window.alert('Workspace imported.');
  } catch (err) {
    window.alert(`Import failed: ${(err as Error).message}`);
  }
}

async function handleBlockFile(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  input.value = '';
  const p = state.project;
  if (!file || !p) return;
  const text = await readFileText(file);
  const now = nowIso();
  p.importedBlocks.push({
    id: uid(),
    title: file.name,
    categoryLabel: '',
    revisionLabel: p.metadata.revisionLabel,
    rawText: text,
    notes: '',
    source: { type: 'file-import', label: file.name, importedAt: now, filename: file.name, schemaVersion: SOURCE_SCHEMA_VERSION },
  });
  commit();
}

async function handleScriptFile(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  input.value = '';
  const p = state.project;
  if (!file || !p) return;
  const text = await readFileText(file);
  const script: ScriptFile = { id: uid(), filename: file.name, rawText: text, importedAt: nowIso() };
  p.scripts.push(script);
  commit();
}

/** Reads only .txt scripts and recognized metadata files (e.g. list.json) out
 *  of a directory-picker selection — never fetched, never executed, no
 *  particular folder layout required. */
interface EsharkPackSource {
  sourceProfile: EsharkSourceProfile;
  packName: string;
  detectedRootPath: string;
  sourceUrl?: string;
  sourceRef?: string;
  fetchedAt?: string;
}

/**
 * Shared by local E-Sh4rk folder import and the GitHub fetch: turns
 * already-root-filtered CollectedFile[] into ScriptFile[] (pushed onto the
 * project) plus one ScriptPack carrying E-Sh4rk source metadata. Returns
 * null when no .txt scripts were found among the given files — callers
 * decide how to report that. Never mutates rawText.
 */
function importEsharkFiles(
  p: Project,
  filesUnderRoot: readonly CollectedFile[],
  source: EsharkPackSource,
): { scriptCount: number; hasMetadataFile: boolean; metadataParseError: boolean } | null {
  const { scripts, metadata, hasMetadataFile, metadataParseError } = collectScriptPackFiles(filesUnderRoot);
  if (scripts.length === 0) return null;
  const listEntries = parseEsharkListEntries(metadata);

  const now = nowIso();
  const packId = uid();
  const scriptIds: string[] = [];
  const categoriesDetected = new Set<EsharkCategory>();
  for (const cs of scripts) {
    const scriptId = uid();
    scriptIds.push(scriptId);
    const scriptFile: ScriptFile = {
      id: scriptId,
      filename: cs.filename,
      rawText: cs.rawText,
      importedAt: now,
      relativePath: cs.relativePath,
      packId,
    };
    if (cs.category) {
      scriptFile.category = cs.category;
      categoriesDetected.add(cs.category);
    }
    const listEntry = lookupEsharkListEntry(listEntries, cs.filename);
    if (listEntry?.displayName) scriptFile.displayName = listEntry.displayName;
    p.scripts.push(scriptFile);
  }

  const pack: ScriptPack = {
    id: packId,
    name: source.packName,
    importedAt: now,
    defaultTarget: state.pendingPackTarget,
    scriptIds,
    sourceProfile: source.sourceProfile,
    detectedRootPath: source.detectedRootPath,
    hasListJson: hasMetadataFile,
    categoriesDetected: Array.from(categoriesDetected).sort(),
  };
  const targetNotes = state.pendingPackTargetNotes.trim();
  if (targetNotes) pack.targetNotes = targetNotes;
  if (source.sourceUrl) pack.sourceUrl = source.sourceUrl;
  if (source.sourceRef) pack.sourceRef = source.sourceRef;
  if (source.fetchedAt) pack.fetchedAt = source.fetchedAt;
  p.scriptPacks.push(pack);

  return { scriptCount: scripts.length, hasMetadataFile, metadataParseError };
}

async function handleScriptFolderFile(input: HTMLInputElement): Promise<void> {
  const files = Array.from(input.files ?? []);
  input.value = '';
  const p = state.project;
  if (!files.length || !p) return;

  const allCollected: CollectedFile[] = [];
  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.name;
    if (!isRelevantPackFile(relativePath)) continue;
    const text = await readFileText(file);
    allCollected.push({ relativePath, text });
  }

  const profile = state.pendingSourceProfile;

  if (profile !== 'generic') {
    const selection = selectEsharkFiles(allCollected);
    if (!selection) {
      window.alert(
        'No files_frlg folder was found in that selection. Select the files_frlg folder itself, or a folder that contains it (like the offline app or repo folder), then try again.',
      );
      return;
    }
    const sourceFolderName = detectSourceFolderName(selection.files);
    const imported = importEsharkFiles(p, selection.files, {
      sourceProfile: profile,
      packName: sourceFolderName ?? `Script pack (${nowIso().slice(0, 10)})`,
      detectedRootPath: displayRootPath(selection.root),
    });
    if (!imported) {
      window.alert('No .txt scripts found in that folder.');
      return;
    }
    commit();
    if (imported.hasMetadataFile && imported.metadataParseError) {
      window.alert('list.json was found but could not be parsed as JSON — it was ignored. Scripts still imported normally.');
    }
    return;
  }

  const { scripts } = collectScriptPackFiles(allCollected);
  if (scripts.length === 0) {
    window.alert('No .txt scripts found in that folder.');
    return;
  }

  const now = nowIso();
  const packId = uid();
  const scriptIds: string[] = [];
  for (const cs of scripts) {
    const scriptId = uid();
    scriptIds.push(scriptId);
    const scriptFile: ScriptFile = {
      id: scriptId,
      filename: cs.filename,
      rawText: cs.rawText,
      importedAt: now,
      relativePath: cs.relativePath,
      packId,
    };
    p.scripts.push(scriptFile);
  }
  const sourceFolderName = detectSourceFolderName(allCollected);
  const pack: ScriptPack = {
    id: packId,
    name: sourceFolderName ?? `Script pack (${now.slice(0, 10)})`,
    importedAt: now,
    defaultTarget: state.pendingPackTarget,
    scriptIds,
  };
  if (sourceFolderName) pack.sourceFolderName = sourceFolderName;
  const targetNotes = state.pendingPackTargetNotes.trim();
  if (targetNotes) pack.targetNotes = targetNotes;
  p.scriptPacks.push(pack);
  commit();
}

/**
 * The one function in the UI layer allowed to trigger a network request —
 * and only ever from this exact click handler, never from render() or app
 * init. Fetches read-only script text from GitHub and feeds it through the
 * same importEsharkFiles() pipeline as a local E-Sh4rk folder import.
 */
async function handleFetchEsharkGithub(): Promise<void> {
  const p = state.project;
  if (!p || state.esharkFetchInProgress) return;
  state.esharkFetchInProgress = true;
  render();

  try {
    const result = await fetchEsharkFilesFrlg();
    state.esharkFetchInProgress = false;
    const imported = importEsharkFiles(p, result.files, {
      sourceProfile: 'eshark-github',
      packName: `E-Sh4rk scripts (GitHub @ ${result.ref})`,
      detectedRootPath: displayRootPath(result.root),
      sourceUrl: result.sourceUrl,
      sourceRef: result.ref,
      fetchedAt: nowIso(),
    });
    if (!imported) {
      render();
      window.alert('No .txt scripts were found in the fetched files_frlg folder.');
      return;
    }
    commit();
    if (imported.hasMetadataFile && imported.metadataParseError) {
      window.alert('list.json was found but could not be parsed as JSON — it was ignored. Scripts still imported normally.');
    }
    window.alert(
      `Fetched ${imported.scriptCount} script(s) from GitHub. No generator was run — scripts were imported as plain text and stored locally.`,
    );
  } catch (err) {
    state.esharkFetchInProgress = false;
    render();
    window.alert(err instanceof EsharkFetchError ? `Fetch failed: ${err.message}` : 'Fetch failed: could not reach GitHub.');
  }
}

async function handleCuratedSchemaFile(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  const scriptId = input.dataset.id;
  input.value = '';
  const p = state.project;
  if (!file || !p || !scriptId) return;
  const script = p.scripts.find((s) => s.id === scriptId);
  if (!script) return;
  try {
    const text = await readFileText(file);
    const schema = importCuratedActionSchemaJson(text);
    // Attaching from a specific script always scopes the schema to it,
    // regardless of what scriptId/scriptFilename the JSON itself carried.
    schema.scriptId = script.id;
    schema.scriptFilename = script.filename;
    upsertCuratedSchema(p.curatedSchemas, schema);
    commit();
  } catch (err) {
    window.alert(`Curated schema import failed: ${(err as Error).message}`);
  }
}

export async function init(): Promise<void> {
  const root = app();
  root.addEventListener('click', (e) => void handleClick(e));
  root.addEventListener('change', (e) => void handleChange(e));
  state.summaries = await listProjects();
  await openDefaultWorkspace();
  render();
}
