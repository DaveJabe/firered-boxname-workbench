import type {
  Project,
  ChecklistItem,
  UserNote,
  ImportedTextBlock,
  Finding,
  TargetKind,
  ActionFieldValue,
  ActionInput,
  MockGeneratedOutput,
  ScriptFile,
  ScriptScanResult,
  VariableCandidate,
  DraftActionSchema,
  CuratedActionSchema,
  CuratedSchemaField,
  FilledScriptResult,
  ParsedGeneratorOutput,
} from '../core/types.js';
import { createProject } from '../core/factory.js';
import { buildValidationResult, countBySeverity } from '../core/validators.js';
import { computeReviewSummary, isReviewComplete, filterByState, type ChecklistFilter } from '../core/review.js';
import { groupBySeverity, groupByTarget, TARGET_LABELS } from '../core/findings.js';
import { numberLines } from '../core/normalize.js';
import { SOURCE_TYPE_LABELS, SOURCE_SCHEMA_VERSION, SELECTABLE_SOURCE_TYPES, SOURCE_FIELD_MAX } from '../core/sources.js';
import { renderReportHtml } from '../report/report.js';
import { TEMPLATES } from '../templates/checklist-templates.js';
import { ACTION_TEMPLATES, getActionTemplate, type ActionField, type ActionTemplate } from '../templates/action-templates.js';
import { defaultActionValues, coerceActionFieldValue, missingRequiredActionFields } from '../core/actionInput.js';
import { MockGeneratorAdapter } from '../core/generatorAdapter.js';
import { formatBoxNameSheetText } from '../core/boxNameSheet.js';
import { scanScript, buildDraftActionSchema } from '../core/scriptScanner.js';
import { toActionTemplateShape, isSchemaSelectable, resolveCuratedSchema, supportsRevision } from '../core/curatedSchemas.js';
import { fillScriptFromSchema } from '../core/scriptFiller.js';
import { parseGeneratorOutput, formatCompactBoxNames, formatRawBoxLines } from '../core/generatorOutputParser.js';
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
import { type Screen, SCREEN_LABEL, SIDEBAR_SCREENS, defaultScreenForWorkspace, type WorkspaceOrigin } from './navigation.js';

interface PasteBackState {
  rawText: string;
  label: string;
  parsed: ParsedGeneratorOutput | null;
  savedBlockId: string | null;
}

interface ActionBuilderState {
  revisionLabel: string;
  /** Whether fields come from the built-in mock catalog or a curated schema — mock mode either way. */
  source: 'builtin' | 'curated';
  templateId: string;
  curatedSchemaId: string;
  values: Record<string, ActionFieldValue>;
  output: MockGeneratedOutput | null;
  savedBlockId: string | null;
  attemptedGenerate: boolean;
  /** Result of the last "Preview filled script" click, if any. Never invokes a generator. */
  filledScript: FilledScriptResult | null;
  filledScriptSavedBlockId: string | null;
  /** Manual paste-back of output from the user's own external generator. */
  pasteBack: PasteBackState;
}

function makePasteBackState(): PasteBackState {
  return { rawText: '', label: '', parsed: null, savedBlockId: null };
}

function makeActionBuilderState(revisionLabel: string): ActionBuilderState {
  const template = ACTION_TEMPLATES[0];
  return {
    revisionLabel,
    source: 'builtin',
    templateId: template.id,
    curatedSchemaId: '',
    values: defaultActionValues(template),
    output: null,
    savedBlockId: null,
    attemptedGenerate: false,
    filledScript: null,
    filledScriptSavedBlockId: null,
    pasteBack: makePasteBackState(),
  };
}

/** Resolve the Action Builder's currently-selected field source to a common
 *  ActionTemplate shape, whichever it came from. `curatedUnavailable` is true
 *  only when curated mode is selected but no selectable schema exists — in
 *  that case `template` is a harmless fallback and must not be used to generate. */
function resolveActionDefinition(
  ab: ActionBuilderState,
  project: Project,
): { template: ActionTemplate; curated: CuratedActionSchema | null; curatedUnavailable: boolean } {
  if (ab.source === 'curated') {
    const schema = resolveCuratedSchema(project.curatedSchemas, ab.curatedSchemaId);
    if (schema) return { template: toActionTemplateShape(schema), curated: schema, curatedUnavailable: false };
    return { template: ACTION_TEMPLATES[0], curated: null, curatedUnavailable: true };
  }
  const t = getActionTemplate(ab.templateId) ?? ACTION_TEMPLATES[0];
  return { template: t, curated: null, curatedUnavailable: false };
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
} = {
  screen: 'landing',
  summaries: [],
  project: null,
  checklistFilter: 'all',
  findingGroup: 'severity',
  collapsed: new Set(),
  blockEdit: new Set(),
  highlightRef: null,
  actionBuilder: makeActionBuilderState(''),
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

function navRail(): string {
  if (!state.project) return '';
  const items = SIDEBAR_SCREENS
    .map((s) => {
      const active = state.screen === s;
      return `<button data-action="nav" data-screen="${s}" class="${active ? 'active' : ''}"${active ? ' aria-current="page"' : ''}>${escapeHtml(SCREEN_LABEL[s])}</button>`;
    })
    .join('');
  return `<nav class="rail" aria-label="Workspace sections">
    <button data-action="go-landing">&larr; Recent workspaces</button>
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
    <div class="banner">Local &amp; reviewable — no network calls, no hidden execution. Existing local scripts/generators are the source of truth; this app prepares input, reviews output, and keeps provenance.</div>
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

function renderLanding(): string {
  const recentCards =
    state.summaries.length === 0
      ? '<div class="empty">No recent workspaces yet. Start with an action, import a script, or load the demo workspace above.</div>'
      : state.summaries
          .map(
            (s) => `<div class="card row" style="justify-content:space-between">
              <div>
                <strong>${escapeHtml(s.title)}</strong>
                <div class="muted">Revision: ${escapeHtml(s.revisionLabel || '—')} · <span class="pill status-${escapeHtml(s.status)}">${escapeHtml(s.status)}</span> · updated ${escapeHtml(s.updatedAt.slice(0, 10))}</div>
              </div>
              <div class="row">
                <button class="btn" data-action="open" data-id="${attr(s.id)}">Open</button>
                <button class="btn danger" data-action="delete" data-id="${attr(s.id)}">Delete</button>
              </div>
            </div>`,
          )
          .join('');
  return `<h1>FireRed BoxName Workbench</h1>
    <p class="muted">A local-first workbench for known FireRed box-name techniques. Choose an action, fill in its fields, and prepare reviewable output — all kept with provenance.</p>
    <div class="grid2">
      <div class="card">
        <h3>Start with an action</h3>
        <p class="muted">Choose a built-in or curated action and fill fields.</p>
        <button class="btn primary" data-action="start-with-action">Start with an action</button>
      </div>
      <div class="card">
        <h3>Import a script</h3>
        <p class="muted">Bring in a local .txt script, scan it, and attach a schema.</p>
        <button class="btn primary" data-action="start-import-script">Import a script</button>
      </div>
      <div class="card">
        <h3>Load demo workspace</h3>
        <p class="muted">Explore harmless sample data.</p>
        <button class="btn" data-action="load-demo">Load demo workspace</button>
      </div>
      <div class="card">
        <h3>Open recent workspace</h3>
        <p class="muted">Continue previous work.</p>
        <button class="btn" data-action="scroll-to-recent">Open recent workspace</button>
      </div>
    </div>
    <h3 id="recent-workspaces">Recent workspaces</h3>
    ${recentCards}
    <div class="row" style="margin-top:0.75rem">
      <button class="btn small" data-action="import-json">Import workspace (.json)</button>
      <input type="file" accept="application/json" data-action="import-file" id="import-file-input" style="display:none" aria-label="Import workspace JSON file" />
    </div>`;
}

function renderStartHere(): string {
  const p = state.project!;
  return `<h1>Start Here</h1>
    <p class="muted">A quick orientation for this workspace. Everything here stays local — no network calls, nothing runs in the background.</p>
    <div class="grid2">
      <div class="card">
        <h3>Action Builder</h3>
        <p class="muted">Choose a built-in or curated action, fill in its fields, and prepare a mock or filled-script preview.</p>
        <button class="btn primary" data-action="nav" data-screen="actions">Go to Action Builder</button>
      </div>
      <div class="card">
        <h3>Script Library</h3>
        <p class="muted">Import your own local .txt scripts, scan them, and attach curated schemas for the Action Builder to use.</p>
        <button class="btn" data-action="nav" data-screen="scripts">Go to Script Library</button>
      </div>
    </div>
    <div class="card">
      <h3>This workspace so far</h3>
      <p class="muted">${p.scripts.length} script(s) · ${p.curatedSchemas.length} curated schema(s) · ${p.importedBlocks.length} saved output(s) · ${p.checklist.length} checklist item(s)</p>
    </div>`;
}

function renderSettings(): string {
  const p = state.project!;
  const m = p.metadata;
  return `<h1>Settings</h1>
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

// --- Action Builder (Phase 1: mock output only) -----------------------------

function renderActionField(field: ActionField, values: Record<string, ActionFieldValue>): string {
  const value = values[field.key];
  if (field.type === 'checkbox') {
    const checked = Boolean(value ?? field.defaultValue ?? false);
    return `<label class="row" style="margin-top:0.6rem"><input type="checkbox" data-bind="action.field" data-id="${attr(field.key)}" style="width:auto"${checked ? ' checked' : ''} /> &nbsp;${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>`;
  }
  const labelHtml = `<label>${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>`;
  if (field.type === 'select') {
    const current = String(value ?? field.options?.[0]?.value ?? '');
    const opts = (field.options ?? []).map((o) => opt(o.value, o.label, current)).join('');
    return `${labelHtml}<select data-bind="action.field" data-id="${attr(field.key)}" aria-label="${attr(field.label)}">${opts}</select>`;
  }
  if (field.type === 'number') {
    return `${labelHtml}<input type="number" data-bind="action.field" data-id="${attr(field.key)}" value="${attr(String(value ?? 0))}" aria-label="${attr(field.label)}" />`;
  }
  return `${labelHtml}<input type="text" data-bind="action.field" data-id="${attr(field.key)}" value="${attr(String(value ?? ''))}" placeholder="${attr(field.placeholder ?? '')}" aria-label="${attr(field.label)}" />`;
}

function boxNameSheet(p: Project, output: MockGeneratedOutput, savedBlockId: string | null): string {
  const rows = output.rows
    .map(
      (r, i) => `<tr>
        <td>${escapeHtml(r.boxLabel)}</td>
        <td>${escapeHtml(r.rowLabel)}</td>
        <td><code>${escapeHtml(r.text)}</code></td>
        <td><button class="btn small" data-action="copy-box-row" data-row="${i}">Copy row</button></td>
      </tr>`,
    )
    .join('');
  const saved = savedBlockId && p.importedBlocks.some((b) => b.id === savedBlockId)
    ? `<p class="muted">Saved &#10003; <button class="btn small" data-action="jump" data-kind="importedBlock" data-ref="${attr(savedBlockId)}">View in Imported text</button></p>`
    : '';
  return `<div class="card" data-ref="mock-sheet">
    <p class="badge warning" style="font-size:0.8rem">MOCK OUTPUT — placeholder only, not a real generator result</p>
    <p class="muted">Action: ${escapeHtml(output.actionLabel)} · Revision: ${escapeHtml(output.revisionLabel || '—')} · Generated ${escapeHtml(output.generatedAt)}</p>
    <table><thead><tr><th>Box</th><th>Row</th><th>Box name</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <div class="row" style="margin-top:0.5rem">
      <button class="btn" data-action="copy-all-box-rows">Copy all</button>
      <button class="btn primary" data-action="save-mock-output">Save to workspace</button>
    </div>
    ${saved}
  </div>`;
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
      <button class="btn" data-action="preview-pasted-output">Preview box-name sheet</button>
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
  return `<div class="muted" style="margin:0.1rem 0 0.5rem">
    maps to script variable <code>${escapeHtml(field.variableName)}</code>${field.helpText ? ' · ' + escapeHtml(field.helpText) : ''}
  </div>${warnings}`;
}

function renderCuratedSchemaSourceField(project: Project, curated: CuratedActionSchema | null): string {
  const selectable = project.curatedSchemas.filter(isSchemaSelectable);
  if (selectable.length === 0) {
    return `<p class="muted">No curated schemas yet. <button class="btn small" data-action="nav" data-screen="scripts">Go to Script Library</button></p>`;
  }
  const currentId = curated?.id ?? selectable[0].id;
  const opts = selectable.map((s) => opt(s.id, `${s.label} (${s.status})`, currentId)).join('');
  return `<label for="ab-curated">Curated schema</label><select id="ab-curated" data-bind="action.curatedSchemaId">${opts}</select>`;
}

function renderActions(): string {
  const p = state.project!;
  const ab = state.actionBuilder;
  const { template, curated, curatedUnavailable } = resolveActionDefinition(ab, p);
  const templateOpts = ACTION_TEMPLATES.map((t) => opt(t.id, t.label, template.id)).join('');
  const sourceOpts = `${opt('builtin', 'Built-in mock template', ab.source)}${opt('curated', 'Curated schema (Script Library)', ab.source)}`;

  const missing = ab.attemptedGenerate && !curatedUnavailable ? missingRequiredActionFields(template, ab.values) : [];
  const curatedByKey = new Map((curated?.fields ?? []).map((f) => [f.key, f]));
  const fieldsHtml = curatedUnavailable
    ? ''
    : template.fields.map((f) => renderActionField(f, ab.values) + curatedFieldExtra(curatedByKey.get(f.key))).join('');
  const errorHtml = missing.length
    ? `<p class="badge error" style="display:inline-block;margin-top:0.5rem">Missing required: ${missing.map((f) => escapeHtml(f.label)).join(', ')}</p>`
    : '';
  const sheetHtml = ab.output ? boxNameSheet(p, ab.output, ab.savedBlockId) : '';

  const curatedStatusLine = curated
    ? `<p class="muted">Status: <span class="pill status-${escapeHtml(curated.status)}">${escapeHtml(curated.status)}</span>${curated.scriptFilename ? ' · from ' + escapeHtml(curated.scriptFilename) : ''}${!supportsRevision(curated, ab.revisionLabel) ? ' · <span class="badge warning">not listed for this revision</span>' : ''}</p>`
    : '';

  const linkedScript = curated?.scriptId ? p.scripts.find((s) => s.id === curated.scriptId) : undefined;
  const filledScriptCard = linkedScript
    ? `<div class="card">
        <h3>Preview filled script <span class="pill">manual — no generator invoked</span></h3>
        <p class="muted">This app does not run the generator. Copy this filled script and paste it into your own local generator.</p>
        <p class="muted">From: ${escapeHtml(linkedScript.filename)}</p>
        <button class="btn" data-action="preview-filled-script">Preview filled script</button>
        ${ab.filledScript ? filledScriptSection(ab.filledScript) : ''}
      </div>`
    : '';

  const emptyStateHtml = p.curatedSchemas.length === 0
    ? `<div class="card" style="border-color:#9fd3b4;background:#f3fbf6">
        <p class="muted">New here? Choose a built-in template below to try the Action Builder immediately, or <button class="btn small" data-action="nav" data-screen="scripts">import a script</button> if you want to use your own script.</p>
      </div>`
    : '';

  return `<h1>Action Builder <span class="pill">mock / non-operational</span></h1>
    <p class="muted">Choose a known action template or a curated schema, fill in its fields, and generate a mock box-name sheet. Output here is always a fixed placeholder — no real generator is connected in this phase.</p>
    ${emptyStateHtml}
    <div class="card">
      <div class="grid2">
        <div>
          <label for="ab-revision">Revision label</label>
          <input type="text" id="ab-revision" data-bind="action.revisionLabel" value="${attr(ab.revisionLabel)}" placeholder="e.g. Rev 1 (documentation only)" />
        </div>
        <div>
          <label for="ab-source">Field source</label>
          <select id="ab-source" data-bind="action.source">${sourceOpts}</select>
        </div>
      </div>
      ${ab.source === 'builtin'
        ? `<label for="ab-template">Action template</label><select id="ab-template" data-bind="action.templateId">${templateOpts}</select>`
        : renderCuratedSchemaSourceField(p, curated)}
      ${curatedStatusLine}
      ${curatedUnavailable ? '' : `<p class="muted">${escapeHtml(template.description)}</p>`}
      ${fieldsHtml}
      ${errorHtml}
      <div class="row" style="margin-top:0.75rem">
        <button class="btn primary" data-action="generate-mock-sheet"${curatedUnavailable ? ' disabled' : ''}>Generate mock sheet</button>
      </div>
    </div>
    ${sheetHtml}
    ${filledScriptCard}
    ${pasteBackCard(p, ab, template.label)}`;
}

// --- Script Library (developer-only, informational) -------------------------

function candidateRow(c: ScriptScanResult['candidates'][number]): string {
  const confBadge = c.confidence === 'high' ? 'info' : c.confidence === 'medium' ? 'warning' : 'error';
  return `<tr>
    <td>${escapeHtml(c.name)}</td>
    <td><code>${escapeHtml(c.rawValue)}</code></td>
    <td>${c.nearbyComment ? escapeHtml(c.nearbyComment) : '—'}</td>
    <td>${c.annotation ? escapeHtml(c.annotation) : '—'}</td>
    <td>${escapeHtml(c.inferredType)}</td>
    <td><span class="badge ${confBadge}">${escapeHtml(c.confidence)}</span></td>
  </tr>`;
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
  return `<div class="card ext-tool">
    <div class="row" style="justify-content:space-between">
      <strong>${escapeHtml(schema.label)}</strong>
      <span class="pill status-${escapeHtml(schema.status)}">${escapeHtml(schema.status)}</span>
    </div>
    <p class="muted">${escapeHtml(schema.description)}</p>
    ${schema.supportedRevisionLabels.length ? `<p class="muted">Supported revisions: ${schema.supportedRevisionLabels.map((r) => escapeHtml(r)).join(', ')}</p>` : ''}
    <table><thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Variable</th><th>Scan candidate</th><th>Help</th><th>Warnings</th></tr></thead><tbody>${rows}</tbody></table>
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
    ${scan.candidates.length
      ? `<table><thead><tr><th>Name</th><th>Value</th><th>Nearby comment</th><th>Annotation</th><th>Inferred type</th><th>Confidence</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<div class="empty">No candidate variables found before the @@ marker.</div>'}
    <h3>Draft action schema</h3>
    <p class="badge warning" style="display:inline-block">Scanner output is a draft. Review manually before creating an action template.</p>
    ${draftSchemaList(schema)}
    <div class="row" style="margin-top:0.5rem">
      <button class="btn small" data-action="export-draft-schema" data-id="${attr(script.id)}">Export draft schema (.json)</button>
      <button class="btn small" data-action="attach-curated-schema" data-id="${attr(script.id)}">Attach curated schema (.json)</button>
      <input type="file" accept="application/json" data-action="curated-schema-file" data-id="${attr(script.id)}" id="curated-schema-input-${attr(script.id)}" style="display:none" aria-label="Attach curated action schema JSON" />
    </div>
    <h3>Curated schemas for this script</h3>
    ${attachedHtml || '<div class="empty">No curated schemas attached yet.</div>'}
  </div>`;
}

function renderScriptCard(s: ScriptFile, project: Project): string {
  const lineCount = numberLines(s.rawText).length;
  return `<div class="card" data-ref="${attr(s.id)}">
    <div class="row" style="justify-content:space-between">
      <div class="row">
        <strong>${escapeHtml(s.filename)}</strong>
        <span class="muted">${lineCount} line${lineCount === 1 ? '' : 's'} · imported ${escapeHtml(s.importedAt)}</span>
      </div>
      <div class="row">
        <button class="btn small" data-action="run-scan" data-id="${attr(s.id)}">Run scanner</button>
        <button class="btn danger small" data-action="remove-script" data-id="${attr(s.id)}" aria-label="Delete script">Delete</button>
      </div>
    </div>
    <label>Notes</label>
    <input type="text" data-bind="script.notes" data-id="${attr(s.id)}" value="${attr(s.notes ?? '')}" placeholder="Optional notes about this script" aria-label="Script notes" />
    <label>Script text (read-only, stored verbatim)</label>
    ${lineNumberView(s.rawText)}
    ${s.lastScan ? renderScanResult(s, s.lastScan, project) : ''}
  </div>`;
}

function renderScripts(): string {
  const p = state.project!;
  const scripts = p.scripts.map((s) => renderScriptCard(s, p)).join('');
  const emptyStateHtml = p.scripts.length === 0
    ? `<div class="card" style="border-color:#9fd3b4;background:#f3fbf6">
        <p class="muted">Import a local .txt script, run the scanner to find candidate fields, attach a curated schema describing what each field means, then switch to the Action Builder and select that curated schema to use it.</p>
      </div>`
    : '';
  return `<h1>Script Library <span class="pill">developer-only, informational</span></h1>
    <p class="muted">Import local .txt action scripts to inspect them as plain text. The scanner never executes, assembles, or generates anything — it only reports draft candidates for you to review.</p>
    ${emptyStateHtml}
    ${scripts || '<div class="empty">No scripts imported yet.</div>'}
    <div class="card">
      <h3>Import a script</h3>
      <button class="btn" data-action="import-script">Import script (.txt)</button>
      <input type="file" accept=".txt,text/plain" data-action="script-file" id="script-file-input" style="display:none" aria-label="Import script file" />
    </div>`;
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
  return `<h1>Saved Outputs</h1>
    <p class="muted">Text is stored exactly as pasted or loaded. It is never modified or generated; line numbers are display-only and the "Copy raw" button copies the stored text verbatim.</p>
    ${blocks || '<div class="empty">No saved outputs yet.</div>'}
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
  return `<h1>Report &amp; export</h1>
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
    resetViewState(p.metadata.revisionLabel);
    render();
  }
}

function resetViewState(revisionLabel: string = ''): void {
  state.checklistFilter = 'all';
  state.findingGroup = 'severity';
  state.collapsed.clear();
  state.blockEdit.clear();
  state.highlightRef = null;
  state.actionBuilder = makeActionBuilderState(revisionLabel);
}

/**
 * Silently create a fresh workspace with blank metadata — the user is never
 * asked to fill in a title/revision/language before using the Action
 * Builder or Script Library. They can fill those in later via Settings.
 */
async function startNewWorkspace(origin: WorkspaceOrigin): Promise<void> {
  const project = createProject(
    { revisionLabel: '', languageLabel: '', projectTitle: '', mode: 'documentation', templateKey: TEMPLATES[0].key },
    uid,
    nowIso,
  );
  await putProject(project);
  state.project = project;
  state.screen = defaultScreenForWorkspace(origin);
  resetViewState(project.metadata.revisionLabel);
  await refreshSummaries();
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
    case 'nav':
      state.screen = el.dataset.screen as Screen;
      render();
      break;
    case 'go-landing':
      state.project = null;
      state.screen = 'landing';
      resetViewState();
      await refreshSummaries();
      break;
    case 'start-with-action':
      await startNewWorkspace('created');
      break;
    case 'start-import-script':
      await startNewWorkspace('import-script');
      break;
    case 'scroll-to-recent':
      document.getElementById('recent-workspaces')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      resetViewState(demo.metadata.revisionLabel);
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
    case 'generate-mock-sheet': {
      if (!p) break;
      const ab = state.actionBuilder;
      const { template, curatedUnavailable } = resolveActionDefinition(ab, p);
      if (curatedUnavailable) break;
      ab.attemptedGenerate = true;
      const missing = missingRequiredActionFields(template, ab.values);
      if (missing.length > 0) {
        render();
        break;
      }
      const input: ActionInput = { actionId: template.id, revisionLabel: ab.revisionLabel, values: { ...ab.values } };
      ab.output = MockGeneratorAdapter.generate(template, input, nowIso);
      ab.savedBlockId = null;
      render();
      break;
    }
    case 'copy-box-row': {
      const ab = state.actionBuilder;
      const idx = Number(el.dataset.row);
      const row = ab.output?.rows[idx];
      if (!row) break;
      const ok = await copyText(row.text);
      const orig = el.textContent;
      el.textContent = ok ? 'Copied ✓' : 'Copy failed';
      window.setTimeout(() => { el.textContent = orig; }, 1200);
      break;
    }
    case 'copy-all-box-rows': {
      const ab = state.actionBuilder;
      if (!ab.output) break;
      const ok = await copyText(formatBoxNameSheetText(ab.output));
      const orig = el.textContent;
      el.textContent = ok ? 'Copied ✓' : 'Copy failed';
      window.setTimeout(() => { el.textContent = orig; }, 1200);
      break;
    }
    case 'save-mock-output': {
      if (!p) break;
      const ab = state.actionBuilder;
      if (!ab.output) break;
      const now = nowIso();
      const block: ImportedTextBlock = {
        id: uid(),
        title: `${ab.output.actionLabel} — mock output`,
        categoryLabel: 'Mock output',
        revisionLabel: ab.output.revisionLabel,
        rawText: formatBoxNameSheetText(ab.output),
        notes: '',
        source: {
          type: 'mock-output',
          label: 'Mock generator output',
          importedAt: now,
          schemaVersion: SOURCE_SCHEMA_VERSION,
          actionId: ab.output.actionId,
          actionLabel: ab.output.actionLabel,
          generatedBy: 'mock-generator-adapter',
        },
      };
      p.importedBlocks.push(block);
      ab.savedBlockId = block.id;
      commit();
      break;
    }
    case 'preview-filled-script': {
      if (!p) break;
      const ab = state.actionBuilder;
      const { curated } = resolveActionDefinition(ab, p);
      const script = curated?.scriptId ? p.scripts.find((s) => s.id === curated.scriptId) : undefined;
      if (!curated || !script) break;
      ab.filledScript = fillScriptFromSchema(script.rawText, curated, ab.values);
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
      const { template, curated } = resolveActionDefinition(ab, p);
      if (!ab.filledScript || ab.filledScript.errors.length > 0 || !curated?.scriptId) break;
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
      const { template, curated } = resolveActionDefinition(ab, p);
      const linkedScript = curated?.scriptId ? p.scripts.find((s) => s.id === curated.scriptId) : undefined;
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
    case 'remove-script':
      if (p && id) {
        p.scripts = p.scripts.filter((s) => s.id !== id);
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
    case 'export-draft-schema': {
      if (!p || !id) break;
      const script = p.scripts.find((s) => s.id === id);
      if (!script || !script.lastScan) break;
      const schema = buildDraftActionSchema(script, script.lastScan, nowIso);
      const base = script.filename.replace(/\.txt$/i, '') || 'script';
      downloadText(`${base}-draft-schema.json`, exportDraftActionSchemaJson(schema), 'application/json');
      break;
    }
    case 'attach-curated-schema':
      if (id) (document.getElementById(`curated-schema-input-${id}`) as HTMLInputElement | null)?.click();
      break;
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
  applyBinding(bind, id, value, checked);
}

function resetGeneratedOutput(ab: ActionBuilderState): void {
  ab.output = null;
  ab.savedBlockId = null;
  ab.attemptedGenerate = false;
  ab.filledScript = null;
  ab.filledScriptSavedBlockId = null;
}

function applyActionBinding(bind: string, id: string | undefined, value: string, checked: boolean | undefined): void {
  const ab = state.actionBuilder;
  const project = state.project;
  switch (bind) {
    case 'action.revisionLabel':
      ab.revisionLabel = value;
      break;
    case 'action.source': {
      ab.source = value === 'curated' ? 'curated' : 'builtin';
      if (project) {
        const resolved = resolveActionDefinition(ab, project);
        if (resolved.curated) ab.curatedSchemaId = resolved.curated.id;
        ab.values = defaultActionValues(resolved.template);
      }
      resetGeneratedOutput(ab);
      break;
    }
    case 'action.templateId': {
      const template = getActionTemplate(value) ?? ACTION_TEMPLATES[0];
      ab.templateId = template.id;
      ab.values = defaultActionValues(template);
      resetGeneratedOutput(ab);
      break;
    }
    case 'action.curatedSchemaId': {
      ab.curatedSchemaId = value;
      if (project) {
        const resolved = resolveActionDefinition(ab, project);
        ab.values = defaultActionValues(resolved.template);
      }
      resetGeneratedOutput(ab);
      break;
    }
    case 'action.field': {
      if (!id || !project) break;
      const { template } = resolveActionDefinition(ab, project);
      const field = template.fields.find((f) => f.key === id);
      if (!field) break;
      ab.values[id] = coerceActionFieldValue(field, value, checked);
      break;
    }
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
    const idx = p.curatedSchemas.findIndex((s) => s.id === schema.id);
    if (idx >= 0) p.curatedSchemas[idx] = schema;
    else p.curatedSchemas.push(schema);
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
  render();
}
