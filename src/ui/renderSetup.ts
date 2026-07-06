// Setup / Manage Scripts screen — fetch/import scripts, scan them, review
// curated schemas and reviewed presets, and the Catalog Audit / Schema
// verification / Similar scripts panels. Extracted from app.ts as part of
// splitting the UI layer into smaller modules — no behavior change, same
// markup/data-action/data-bind wiring as before; only renderScripts() is
// used outside this module (by app.ts's render() dispatcher).

import type {
  Project,
  ScriptFile,
  ScriptScanResult,
  ScriptPack,
  VariableCandidate,
  DraftActionSchema,
  CuratedActionSchema,
  CuratedSchemaField,
  ReferenceCatalogId,
} from '../core/types.js';
import { escapeHtml, attr } from './dom.js';
import { opt, cap, targetSelectsHtml, lineNumberView, workspaceStatusStripHtml, unambiguousPresetMatch } from './viewModels.js';
import { state, nowIso, type SchemaEditorState } from './state.js';
import { numberLines } from '../core/normalize.js';
import { buildDraftActionSchema } from '../core/scriptScanner.js';
import { targetLabel } from '../core/gameTarget.js';
import {
  effectiveScriptTarget,
  summarizeBatchScan,
  buildScriptPackRows,
  filterScriptRows,
  searchScriptRows,
  type ScriptPackRow,
  type ScriptLibraryFilter,
} from '../core/scriptPack.js';
import { findMatchingPreset } from '../core/schemaPresets.js';
import { SCHEMA_PRESETS } from '../templates/schema-presets.js';
import { buildCompactScriptRows, type CompactScriptRow } from '../core/supportedScripts.js';
import { matchReviewedPresets } from '../core/reviewedSchemaPresets.js';
import { REVIEWED_SCHEMA_PRESETS } from '../templates/reviewed-schema-presets.js';
import { referenceEntryLabel } from '../core/referenceData.js';
import { REFERENCE_CATALOGS, REFERENCE_CATALOG_IDS, getReferenceCatalog } from '../reference/index.js';
import {
  buildCatalogGapAudit,
  groupCatalogAuditBySupportedAction,
  type FieldClassification,
  type StaleFieldFinding,
  type ActionVariantCatalogAudit,
} from '../core/catalogGapAudit.js';
import { ESHARK_GITHUB_REPO_URL } from '../data/esharkRemote.js';
import { isExitCompanionScript } from '../core/exitCompanion.js';
import {
  buildSupportedActionRegistry,
  type SupportedAction,
  type SupportedActionVariantStatus,
} from '../core/supportedActionRegistry.js';
import {
  verifySchemaReviewCase,
  summarizeVariantVerification,
  summarizePresetVerification,
  describeSchemaVerificationSetupError,
  type ActionVariantVerificationStatus,
  type SchemaReviewCaseBatchResult,
  type GeneratorInputReadiness,
} from '../core/schemaVerification.js';
import {
  computeSchemaShapeSignature,
  groupScriptsByShapeSignature,
  findSimilarScripts,
} from '../core/schemaFamily.js';
import {
  SOURCE_PROFILE_INFO,
  ESHARK_SETUP_NOTE,
  LOCAL_ESHARK_SOURCE_PROFILES,
  esharkSourceProfileLabel,
  type SourceProfile,
} from '../core/esharkSource.js';
import { collectKnownTargets, buildActionAvailabilityMatrix, type ActionAvailabilityDetail } from '../core/actionAvailability.js';

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
  // Exit-code companion files (e.g. exit.txt) are support material, never a
  // reviewed-preset candidate — see core/exitCompanion.ts.
  if (isExitCompanionScript(s)) return '';
  const matches = matchReviewedPresets(REVIEWED_SCHEMA_PRESETS, {
    filename: s.filename,
    title: s.lastScan?.title,
    category: s.category,
  });
  const candidates = matches.filter((m) => !project.curatedSchemas.some((cs) => cs.id === `${m.preset.id}-for-${s.id}`));
  if (candidates.length === 0) return '';

  const buttons = candidates
    .map((m) => {
      const verification = summarizePresetVerification(m.preset.id, project.schemaReviewCases);
      const verificationPill = verification === 'no-cases'
        ? ''
        : ` <span class="pill status-${verification === 'draft-cases' ? 'draft' : 'reviewed'}">${escapeHtml(verification)}</span>`;
      return `<button class="btn small primary" data-action="apply-reviewed-preset" data-id="${attr(s.id)}" data-preset="${attr(m.preset.id)}">Apply "${escapeHtml(m.preset.label)}"</button>${verificationPill}`;
    })
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
        ${isExitCompanionScript(s) ? '<span class="pill" title="Support material for the manual generator workflow — never an action script. See docs/local-generator-poc.md.">Support/companion file</span>' : ''}
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
    <div class="row">
      <button class="btn small" data-action="scan-all-in-pack" data-id="${attr(pack.id)}"${packScripts.length === 0 ? ' disabled' : ''}>${unscanned > 0 ? `Scan all scripts (${unscanned} unscanned)` : 'Re-scan all scripts'}</button>
      ${pack.sourceProfile === 'eshark-github' ? `<button class="btn small" data-action="delete-eshark-pack" data-id="${attr(pack.id)}">Delete fetched pack</button>` : ''}
    </div>
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
        <td>${escapeHtml(r.filename)}${r.isCompanionFile ? ' <span class="pill" title="Support material for the manual generator workflow — never an action script.">Support/companion file</span>' : ''}</td>
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

/** One compact row's primary action: Run (ready), Apply preset (unambiguous match), or Review/Open details otherwise. */
function compactRowActionHtml(row: CompactScriptRow, project: Project): string {
  if (row.bucket === 'ready' && row.readySchemaId) {
    return `<button class="btn small" data-action="run-supported-script" data-id="${attr(row.readySchemaId)}">Run</button>`;
  }
  const script = project.scripts.find((s) => s.id === row.scriptId);
  const preset = script ? unambiguousPresetMatch(script, project) : undefined;
  if (preset) {
    return `<button class="btn small primary" data-action="apply-reviewed-preset" data-id="${attr(row.scriptId)}" data-preset="${attr(preset.id)}">Apply preset</button>`;
  }
  const label = row.schemaStatus === 'draft' ? 'Review' : 'Open details';
  return `<button class="btn small" data-action="open-script" data-id="${attr(row.scriptId)}">${label}</button>`;
}

function compactRowHtml(row: CompactScriptRow, project: Project): string {
  return `<tr>
    <td>${escapeHtml(row.title ?? row.filename)}</td>
    <td>${row.category ? escapeHtml(row.category) : '—'}</td>
    <td>${escapeHtml(targetLabel(row.target))}</td>
    <td>${row.candidateCount}</td>
    <td>${row.schemaStatus ? `<span class="pill status-${escapeHtml(row.schemaStatus)}">${escapeHtml(row.schemaStatus)}</span>` : '—'}</td>
    <td>${compactRowActionHtml(row, project)}</td>
  </tr>`;
}

const COMPACT_TABLE_HEAD = '<thead><tr><th>Script</th><th>Category</th><th>Target</th><th>Candidates</th><th>Status</th><th></th></tr></thead>';

/** Human-readable label for one action variant's status — never a raw enum value in the UI. */
function variantStatusLabel(status: SupportedActionVariantStatus): string {
  switch (status) {
    case 'ready': return 'Ready';
    case 'missing-script': return 'Missing script';
    case 'needs-review': return 'Needs review';
    case 'incompatible-target': return 'Target not set';
    case 'disabled': return 'Disabled';
  }
}

/** One action's per-variant breakdown — e.g. "FireRed EN 1.0: Ready", "LeafGreen EN 1.1: Missing script" — grouped under one card, never duplicated as separate top-level rows per target. */
function readyActionCardHtml(action: SupportedAction): string {
  const variantRows = action.variants
    .map((v) => {
      const pillClass = v.status === 'ready' ? 'reviewed' : v.status === 'disabled' ? 'disabled' : 'draft';
      const actionCell = v.status === 'ready'
        ? `<button class="btn small" data-action="run-supported-script" data-id="${attr(v.schemaId)}">Run</button>`
        : v.status === 'needs-review' && v.scriptId
          ? `<button class="btn small" data-action="open-script" data-id="${attr(v.scriptId)}">Review</button>`
          : '';
      return `<tr>
        <td>${escapeHtml(targetLabel(v.target))}</td>
        <td><span class="pill status-${pillClass}">${escapeHtml(variantStatusLabel(v.status))}</span></td>
        <td>${actionCell}</td>
      </tr>`;
    })
    .join('');
  return `<div class="card">
    <h4>${escapeHtml(action.label)}</h4>
    ${action.description ? `<p class="muted">${escapeHtml(action.description)}</p>` : ''}
    <table><thead><tr><th>Target variant</th><th>Status</th><th></th></tr></thead><tbody>${variantRows}</tbody></table>
  </div>`;
}

/**
 * Setup's default view: Ready actions (grouped by actionKey — every target
 * variant of the same action shown together, never duplicated as separate
 * top-level rows), Needs review, and Unsupported/no-field scripts, instead
 * of one giant scanner table. "Advanced: all scripts" (the full per-script
 * cards, raw text, directive/candidate tables, draft schema, JSON
 * export/import) lives in renderScripts()'s own details disclosure, not here.
 */
/** Setup matrix cell label — collapses core/actionAvailability.ts's finer-grained detail into the four statuses this table shows. */
function actionAvailabilityCellLabel(detail: ActionAvailabilityDetail): { text: string; pillClass: string } {
  switch (detail.kind) {
    case 'ready':
      return { text: 'Ready', pillClass: 'reviewed' };
    case 'missing-companion':
      return { text: 'Missing companion', pillClass: 'draft' };
    case 'needs-review':
      return { text: 'Needs review', pillClass: 'draft' };
    case 'no-variant-for-target':
    case 'schema-script-mismatch':
      return { text: 'Not available', pillClass: 'disabled' };
  }
}

/**
 * Compact "Action availability by target" matrix — Setup only. Rows are
 * action labels, columns are every target found in the supported-action
 * registry, cells are one of Ready/Missing companion/Needs review/Not
 * available (core/actionAvailability.ts). Never shows schema/script ids or
 * per-field catalog-gap detail — that stays in Catalog Audit.
 */
function actionAvailabilityMatrixHtml(project: Project): string {
  const targets = collectKnownTargets(project);
  if (targets.length === 0) return '';
  const cells = buildActionAvailabilityMatrix(project, targets, nowIso);
  const actionKeys = [...new Set(cells.map((c) => c.actionKey))];
  const actionLabels = new Map(cells.map((c) => [c.actionKey, c.actionLabel]));
  const cellByActionTarget = new Map(cells.map((c) => [`${c.actionKey}::${targetLabel(c.target)}`, c]));

  const headerCells = targets.map((t) => `<th>${escapeHtml(targetLabel(t))}</th>`).join('');
  const bodyRows = actionKeys
    .map((actionKey) => {
      const rowCells = targets
        .map((t) => {
          const cell = cellByActionTarget.get(`${actionKey}::${targetLabel(t)}`);
          if (!cell) return '<td>—</td>';
          const { text, pillClass } = actionAvailabilityCellLabel(cell.detail);
          return `<td><span class="pill status-${pillClass}">${escapeHtml(text)}</span></td>`;
        })
        .join('');
      return `<tr><td>${escapeHtml(actionLabels.get(actionKey) ?? actionKey)}</td>${rowCells}</tr>`;
    })
    .join('');

  return `<details>
    <summary class="muted" style="cursor:pointer">Action availability by target <span class="pill">Setup only</span></summary>
    <div class="card">
      <p class="muted">Which actions are ready for which reviewed target — a quick cross-reference, not a new source of truth. Statuses mirror what's shown elsewhere in Setup.</p>
      <table><thead><tr><th>Action</th>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>
    </div>
  </details>`;
}

function compactCatalogHtml(project: Project): string {
  if (project.scripts.length === 0) return '';
  const registry = buildSupportedActionRegistry(project);
  const readyActions = registry.filter((a) => a.variants.some((v) => v.status === 'ready'));
  const scriptIdsInReadyActions = new Set(
    readyActions.flatMap((a) => a.variants.map((v) => v.scriptId).filter((id): id is string => Boolean(id))),
  );

  const rows = buildCompactScriptRows(project.scripts, project.curatedSchemas, project.scriptPacks);
  // Folds the old "disabled/incompatible target" bucket into Needs review — Setup only
  // distinguishes Ready actions / Needs review / Unsupported, plus Advanced for everything else.
  const needsReview = rows.filter((r) => (r.bucket === 'needs-review' || r.bucket === 'disabled-or-incompatible') && !scriptIdsInReadyActions.has(r.scriptId));
  const unsupported = rows.filter((r) => r.bucket === 'no-candidates');
  const supportFiles = rows.filter((r) => r.bucket === 'support-file');

  const hasUnambiguousPresetSomewhere = [...needsReview, ...unsupported].some(
    (r) => !!project.scripts.find((s) => s.id === r.scriptId) && unambiguousPresetMatch(project.scripts.find((s) => s.id === r.scriptId)!, project),
  );

  return `<div class="card">
    <h3>Supported actions</h3>
    <p class="muted">An action becomes "Ready" for a target once a reviewed schema with that exact target is attached to an existing script — apply a reviewed preset, or create and review a curated schema.</p>
    <div class="row filters" role="group" aria-label="Support status">
      <span class="chip">Ready actions: ${readyActions.length}</span>
      <span class="chip">Needs review: ${needsReview.length}</span>
      <span class="chip">Unsupported: ${unsupported.length}</span>
      ${supportFiles.length > 0 ? `<span class="chip" title="Exit-code companion files (e.g. exit.txt) — support material, not action scripts.">Support/companion files: ${supportFiles.length}</span>` : ''}
    </div>
    ${hasUnambiguousPresetSomewhere ? `<div class="row" style="margin:0.5rem 0"><button class="btn" data-action="apply-all-unambiguous-presets">Apply all unambiguous reviewed presets</button></div>` : ''}
    <h4>Ready actions</h4>
    ${readyActions.length > 0
      ? readyActions.map(readyActionCardHtml).join('')
      : '<p class="muted">No actions are ready yet. Apply a reviewed schema preset, or create/review a curated schema.</p>'}
    ${needsReview.length > 0
      ? `<h4>Needs review</h4><table>${COMPACT_TABLE_HEAD}<tbody>${needsReview.map((r) => compactRowHtml(r, project)).join('')}</tbody></table>`
      : ''}
    ${unsupported.length > 0
      ? `<h4>Unsupported (no candidate fields)</h4><table>${COMPACT_TABLE_HEAD}<tbody>${unsupported.map((r) => compactRowHtml(r, project)).join('')}</tbody></table>`
      : ''}
  </div>`;
}

/** A variant's own catalog needs, as a short "variable → catalog" summary list. */
function catalogNeedsSummaryHtml(needs: readonly FieldClassification[]): string {
  if (needs.length === 0) return '<span class="muted">—</span>';
  return needs.map((n) => `${escapeHtml(n.variableName)} → ${escapeHtml(n.catalogId ?? '?')}`).join(', ');
}

/** A variant's own stale-field repair suggestions, each with its own "Repair" button (never applied without this explicit per-field confirm). */
function variantStaleFieldRepairsHtml(schemaId: string, repairs: readonly StaleFieldFinding[]): string {
  const visible = repairs.filter((f) => !state.catalogAuditIgnored.has(`stale:${f.schemaId}:${f.classification.variableName}`));
  if (visible.length === 0) return '<span class="muted">—</span>';
  return visible
    .map((f) => {
      const afterDescription = f.suggestedType === 'reference-select'
        ? `reference-select (${f.classification.catalogId})`
        : `select (${f.classification.boundedPresetId})`;
      return `${escapeHtml(f.classification.variableName)}: ${escapeHtml(f.currentType)} → ${escapeHtml(afterDescription)}
        <button class="btn small primary" data-action="repair-stale-field" data-id="${attr(schemaId)}" data-variable="${attr(f.classification.variableName)}">Repair</button>`;
    })
    .join('<br>');
}

const ACTION_VARIANT_AUDIT_TABLE_HEAD =
  '<thead><tr><th>Action</th><th>Target</th><th>Script</th><th>Schema id</th><th>Status</th><th>Catalog needs</th><th>Stale field repairs</th><th>Verification</th><th>Generator input</th></tr></thead>';

/** "Generator input" column — separate from filled-script verification (see schemaVerification.ts's describeGeneratorInputReadiness): whether this variant's exit-code companion (if it needs one at all) was found. */
function generatorInputReadinessBadgeHtml(readiness: GeneratorInputReadiness): string {
  if (readiness === 'not-applicable') return '<span class="muted">—</span>';
  if (readiness === 'ready') return '<span class="badge info">exit companion resolved</span>';
  return '<span class="badge warning">missing exit companion</span>';
}

/** One row for a supported-action variant's catalog audit — used both grouped (Ready supported actions) and flat (variants with gaps). */
function actionVariantAuditRowHtml(v: ActionVariantCatalogAudit): string {
  const statusPillClass = v.status === 'ready' ? 'reviewed' : v.status === 'disabled' ? 'disabled' : 'draft';
  return `<tr>
    <td>${escapeHtml(v.actionLabel)}</td>
    <td>${escapeHtml(targetLabel(v.target))}</td>
    <td>${v.scriptFilename ? escapeHtml(v.scriptFilename) : '—'}</td>
    <td><code>${escapeHtml(v.schemaId)}</code></td>
    <td><span class="pill status-${statusPillClass}">${escapeHtml(v.status)}</span></td>
    <td>${catalogNeedsSummaryHtml(v.catalogNeeds)}</td>
    <td>${variantStaleFieldRepairsHtml(v.schemaId, v.staleFieldRepairs)}</td>
    <td><span class="muted">${escapeHtml(v.verificationStatus)}</span></td>
    <td>${generatorInputReadinessBadgeHtml(v.generatorInputReadiness)}</td>
  </tr>`;
}

/**
 * Setup/Advanced-only "Catalog Audit" panel — grouped around the
 * supported-action/variant model (core/supportedActionRegistry.ts):
 * Ready supported actions, action variants with missing catalog coverage,
 * unsupported scripts, and unknown/manual-review fields. Built entirely
 * from already-known project data and the local reference-catalog/
 * bounded-preset registries — never fetches data, never invokes a
 * generator, never silently rewrites a schema. Never shown in Run Script.
 */
function catalogAuditPanelHtml(project: Project): string {
  const audit = buildCatalogGapAudit(project, nowIso);
  const grouped = groupCatalogAuditBySupportedAction(project, audit, nowIso);
  const ignored = state.catalogAuditIgnored;

  const readyActionsHtml = grouped.readyActions
    .map(
      (group) => `<div class="card ext-tool">
        <h5>${escapeHtml(group.actionLabel)}</h5>
        <table>${ACTION_VARIANT_AUDIT_TABLE_HEAD}<tbody>${group.variants.map(actionVariantAuditRowHtml).join('')}</tbody></table>
      </div>`,
    )
    .join('');

  const variantsWithGapsRows = grouped.variantsWithGaps.map(actionVariantAuditRowHtml).join('');

  const unsupportedScriptsRows = grouped.unsupportedScripts
    .filter((s) => !ignored.has(`unsupported:${s.scriptId}`))
    .map(
      (s) => `<tr>
        <td>${escapeHtml(s.scriptFilename)}</td>
        <td>${catalogNeedsSummaryHtml(s.catalogNeeds)}</td>
        <td>
          <button class="btn small" data-action="open-script" data-id="${attr(s.scriptId)}">Open script review</button>
          <button class="btn small" data-action="ignore-catalog-finding" data-id="unsupported:${attr(s.scriptId)}">Mark ignored</button>
        </td>
      </tr>`,
    )
    .join('');

  const unknownFieldsRows = grouped.unknownFields
    .filter((f) => !ignored.has(`unknown:${f.scriptId}:${f.variableName}`))
    .map((f) => {
      const key = `unknown:${f.scriptId}:${f.variableName}`;
      return `<tr>
        <td>${escapeHtml(f.scriptFilename ?? f.scriptId ?? '—')}</td>
        <td>${escapeHtml(f.variableName)}</td>
        <td>${escapeHtml(f.reason)}</td>
        <td>
          ${f.scriptId ? `<button class="btn small" data-action="open-script" data-id="${attr(f.scriptId)}">Open script review</button>` : ''}
          <button class="btn small" data-action="ignore-catalog-finding" data-id="${attr(key)}">Mark ignored</button>
        </td>
      </tr>`;
    })
    .join('');

  const blockedByExitCompanionRows = grouped.actionsBlockedByMissingExitCompanion.map(actionVariantAuditRowHtml).join('');

  return `<details id="catalog-audit-details"${state.catalogAuditOpen ? ' open' : ''}>
    <summary class="muted" style="cursor:pointer">Catalog Audit <span class="pill">Setup/Advanced only</span></summary>
    <div class="card">
      <p class="muted">A data-driven, review-prioritization report — never a claim of semantic correctness, never a silent rewrite. Generated ${escapeHtml(audit.generatedAt)} from ${audit.scannedScriptCount}/${audit.scriptCount} scanned scripts.</p>
      <div class="row" style="margin-bottom:0.5rem">
        <button class="btn" data-action="export-catalog-audit">Export audit JSON</button>
      </div>

      <h4>Ready supported actions</h4>
      ${readyActionsHtml || '<p class="muted">No supported actions are ready yet.</p>'}

      <h4>Actions blocked by missing exit companion</h4>
      <p class="muted">These variants' scripts declare an <code>@@ exit = "..."</code> directive whose companion text hasn't been found among imported scripts yet — see docs/local-generator-poc.md and Run Script's "Generator input" section. A fillable/"ready" variant can still appear here: filling and this are separate concerns.</p>
      ${blockedByExitCompanionRows
        ? `<table>${ACTION_VARIANT_AUDIT_TABLE_HEAD}<tbody>${blockedByExitCompanionRows}</tbody></table>`
        : '<p class="muted">No variant is currently blocked by a missing exit companion.</p>'}

      <h4>Action variants with missing catalog coverage</h4>
      ${variantsWithGapsRows
        ? `<table>${ACTION_VARIANT_AUDIT_TABLE_HEAD}<tbody>${variantsWithGapsRows}</tbody></table>`
        : '<p class="muted">No action variant currently has a catalog need or stale field.</p>'}

      <h4>Unsupported scripts</h4>
      ${unsupportedScriptsRows
        ? `<table><thead><tr><th>Script</th><th>Catalog needs</th><th></th></tr></thead><tbody>${unsupportedScriptsRows}</tbody></table>`
        : '<p class="muted">Every script has a curated schema attached.</p>'}

      <h4>Unknown / manual-review fields</h4>
      ${unknownFieldsRows
        ? `<table><thead><tr><th>Script</th><th>Variable</th><th>Reason</th><th></th></tr></thead><tbody>${unknownFieldsRows}</tbody></table>`
        : '<p class="muted">No unrecognized fields right now.</p>'}
    </div>
  </details>`;
}

// --- Setup: Schema verification panel, grouped by supported action variant --

function variantVerificationStatusLabel(status: ActionVariantVerificationStatus): string {
  switch (status) {
    case 'no-cases': return 'No cases';
    case 'draft-cases': return 'Draft cases';
    case 'passing': return 'Passing';
    case 'failing': return 'Failing';
    case 'accepted': return 'Accepted manually';
    case 'not-available': return 'Not available';
  }
}

function variantVerificationPillClass(status: ActionVariantVerificationStatus): string {
  switch (status) {
    case 'passing':
    case 'accepted':
      return 'reviewed';
    case 'failing':
    case 'not-available':
      return 'disabled';
    case 'no-cases':
    case 'draft-cases':
      return 'draft';
  }
}

/** Every saved review case for one schema/variant, with a live re-check per case and per-case actions. */
function reviewCasesDetailHtml(project: Project, schemaId: string): string {
  const schema = project.curatedSchemas.find((s) => s.id === schemaId);
  if (!schema) return '';
  const setupError = describeSchemaVerificationSetupError(schema, project);
  const cases = project.schemaReviewCases.filter((c) => c.schemaId === schemaId);
  const rows = cases
    .map((reviewCase) => {
      const live = verifySchemaReviewCase(project, schema, reviewCase);
      const liveCell = `<span class="pill status-${live.status === 'passing' ? 'reviewed' : 'disabled'}">${escapeHtml(live.status)}</span>${live.errors.length ? `<div class="muted">${live.errors.map(escapeHtml).join('<br>')}</div>` : ''}`;
      return `<tr>
        <td>${reviewCase.reviewerNote ? escapeHtml(reviewCase.reviewerNote) : escapeHtml(reviewCase.id)}</td>
        <td><span class="pill status-${reviewCase.status === 'accepted' || reviewCase.status === 'passing' ? 'reviewed' : reviewCase.status === 'failing' ? 'disabled' : 'draft'}">${escapeHtml(reviewCase.status)}</span></td>
        <td>${liveCell}</td>
        <td>
          <button class="btn small" data-action="run-review-case" data-id="${attr(reviewCase.id)}">Run</button>
          ${reviewCase.status !== 'accepted' ? `<button class="btn small" data-action="accept-review-case" data-id="${attr(reviewCase.id)}">Mark accepted</button>` : ''}
          <button class="btn small" data-action="export-review-case" data-id="${attr(reviewCase.id)}">Export</button>
          <button class="btn danger small" data-action="delete-review-case" data-id="${attr(reviewCase.id)}">Delete</button>
        </td>
      </tr>`;
    })
    .join('');
  return `<div class="card">
    <h4>Review cases for "${escapeHtml(schema.label)}"</h4>
    ${setupError ? `<p class="muted">⚠ ${escapeHtml(setupError)}</p>` : ''}
    ${cases.length > 0
      ? `<table><thead><tr><th>Case</th><th>Stored status</th><th>Live re-check</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="muted">No review cases saved yet — fill and preview this schema/variant in Run Script, then "Save as schema review case."</p>'}
  </div>`;
}

/**
 * Setup's "Schema verification" panel: every supported-action variant
 * (core/supportedActionRegistry.ts), grouped by action, with its case count
 * and live verification status. Verifying only ever re-fills a script and
 * re-parses pasted text (core/schemaVerification.ts) — it never invokes a
 * generator. Setup/admin only — Run Script never shows this panel.
 */
function variantVerificationPanelHtml(project: Project): string {
  const registry = buildSupportedActionRegistry(project);
  const variantRows = registry.flatMap((action) => action.variants.map((variant) => ({ action, variant })));
  if (variantRows.length === 0) return '';
  const rows = variantRows
    .map(({ action, variant }) => {
      const schema = project.curatedSchemas.find((s) => s.id === variant.schemaId);
      if (!schema) return '';
      const summary = summarizeVariantVerification(schema, project, project.schemaReviewCases);
      return `<tr>
        <td>${escapeHtml(action.label)}</td>
        <td>${escapeHtml(targetLabel(variant.target))}</td>
        <td>${variant.scriptFilename ? escapeHtml(variant.scriptFilename) : '—'}</td>
        <td>${summary.caseCount}</td>
        <td><span class="pill status-${variantVerificationPillClass(summary.status)}">${escapeHtml(variantVerificationStatusLabel(summary.status))}</span></td>
        <td>
          ${summary.caseCount > 0 ? `<button class="btn small" data-action="run-schema-verification" data-id="${attr(schema.id)}">Run verification</button>` : ''}
          <button class="btn small" data-action="goto-run-script-for-schema" data-id="${attr(schema.id)}">Add review case</button>
          <button class="btn small" data-action="view-review-cases" data-id="${attr(schema.id)}">View cases</button>
        </td>
      </tr>`;
    })
    .join('');
  const detail = state.reviewCasesDetailSchemaId ? reviewCasesDetailHtml(project, state.reviewCasesDetailSchemaId) : '';
  return `<div class="card">
    <h3>Schema verification <span class="pill">Setup only</span></h3>
    <p class="muted">Re-check a supported action variant against saved examples instead of re-reviewing it line by line. "Add review case" takes you to Run Script to fill/preview/paste-back and save one. "Not available" means this variant can't be verified right now (detached/missing script/disabled/draft-only) — fix that in Setup first.</p>
    <table><thead><tr><th>Action</th><th>Target</th><th>Script</th><th>Cases</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    ${detail}
    <div class="row" style="margin-top:0.5rem">
      <button class="btn primary" data-action="run-all-schema-verification">Run all verification cases</button>
    </div>
    ${batchVerificationResultHtml(state.batchVerificationResult)}
  </div>`;
}

/**
 * Setup's "Run all verification cases" result: a summary line, then a
 * failure report for anything that came back "failing" — action label,
 * target, schema id, script filename, the first few error messages, and a
 * button straight to that script's review. Purely a display of the last
 * batch run stored in state.batchVerificationResult; running again
 * replaces it, nothing here mutates a review case on its own.
 */
function batchVerificationResultHtml(batch: SchemaReviewCaseBatchResult | null): string {
  if (!batch) return '';
  const s = batch.summary;
  const missingCompanionCount = batch.results.filter((r) => r.generatorInputReadiness === 'missing-exit-companion').length;
  const summaryHtml = `<p class="muted">
    Total: ${s.total} · Passing: ${s.passing} · Failing: ${s.failing} · Not available: ${s.notAvailable} · Accepted manually: ${s.accepted} · Draft: ${s.draft}
    ${missingCompanionCount > 0 ? ` · <span class="badge warning">Generator input readiness: incomplete (${missingCompanionCount} missing exit companion)</span>` : ''}
  </p>`;

  const missingCompanionRows = batch.results
    .filter((r) => r.generatorInputReadiness === 'missing-exit-companion')
    .map(
      (r) => `<tr>
        <td>${r.actionLabel ? escapeHtml(r.actionLabel) : '<span class="muted">—</span>'}</td>
        <td>${r.target ? escapeHtml(targetLabel(r.target)) : '—'}</td>
        <td>${r.scriptFilename ? escapeHtml(r.scriptFilename) : '—'}</td>
        <td><span class="muted">filled-script verification: ${escapeHtml(r.status)}</span> · <span class="badge warning">generator input readiness: incomplete, missing exit companion</span></td>
        <td>${r.scriptId ? `<button class="btn small" data-action="open-script" data-id="${attr(r.scriptId)}">Open script review</button>` : ''}</td>
      </tr>`,
    )
    .join('');
  const missingCompanionHtml = missingCompanionRows
    ? `<h4>Generator input readiness: incomplete</h4>
       <p class="muted">These cases' filled-script verification status is unaffected — this is a separate readiness signal for the manual generator step. See docs/local-generator-poc.md.</p>
       <table><thead><tr><th>Action</th><th>Target</th><th>Script</th><th>Readiness</th><th></th></tr></thead><tbody>${missingCompanionRows}</tbody></table>`
    : '';

  const failures = batch.results.filter((r) => r.status === 'failing');
  if (failures.length === 0) {
    return `<div class="card">${summaryHtml}<p class="muted">No failing cases.</p>${missingCompanionHtml}</div>`;
  }

  const failureRows = failures
    .map((r) => {
      const errors = r.verification?.errors ?? [];
      const firstFew = errors.slice(0, 3).map((e) => escapeHtml(e)).join('<br>');
      const more = errors.length > 3 ? `<div class="muted">…and ${errors.length - 3} more</div>` : '';
      return `<tr>
        <td>${r.actionLabel ? escapeHtml(r.actionLabel) : '<span class="muted">—</span>'}</td>
        <td>${r.target ? escapeHtml(targetLabel(r.target)) : '—'}</td>
        <td><code>${r.schemaId ? escapeHtml(r.schemaId) : '—'}</code></td>
        <td>${r.scriptFilename ? escapeHtml(r.scriptFilename) : '—'}</td>
        <td>${firstFew || '<span class="muted">—</span>'}${more}</td>
        <td>${r.scriptId ? `<button class="btn small" data-action="open-script" data-id="${attr(r.scriptId)}">Open script review</button>` : ''}</td>
      </tr>`;
    })
    .join('');

  return `<div class="card">
    ${summaryHtml}
    <h4>Failing cases</h4>
    <table><thead><tr><th>Action</th><th>Target</th><th>Schema id</th><th>Script</th><th>Errors</th><th></th></tr></thead><tbody>${failureRows}</tbody></table>
    ${missingCompanionHtml}
  </div>`;
}

// --- Setup: schema family / similar-scripts panel ---------------------------

/** One family's member scripts, each with its own schema status and (for scriptless members) an "Apply schema pattern cautiously" action. */
function familyDetailHtml(project: Project, scriptId: string): string {
  const script = project.scripts.find((s) => s.id === scriptId);
  if (!script) return '';
  const similar = findSimilarScripts(script, project.scripts);
  const signature = computeSchemaShapeSignature(script);
  if (!signature) return '';
  const reviewedInFamily = [script, ...similar]
    .map((s) => project.curatedSchemas.find((cs) => cs.scriptId === s.id && cs.status === 'reviewed'))
    .find((s): s is CuratedActionSchema => Boolean(s));

  const memberRows = [script, ...similar]
    .map((s) => {
      const attached = project.curatedSchemas.find((cs) => cs.scriptId === s.id);
      const statusCell = attached
        ? `<span class="pill status-${escapeHtml(attached.status)}">${escapeHtml(attached.status)}</span>`
        : '<span class="muted">no schema</span>';
      const applyBtn = !attached && reviewedInFamily
        ? `<button class="btn small primary" data-action="apply-schema-pattern" data-id="${attr(s.id)}" data-schema="${attr(reviewedInFamily.id)}">Apply schema pattern cautiously</button>`
        : '';
      return `<tr>
        <td>${escapeHtml(s.filename)}</td>
        <td>${statusCell}</td>
        <td>${applyBtn}</td>
      </tr>`;
    })
    .join('');

  return `<div class="card">
    <h4>Same candidate shape as ${escapeHtml(script.filename)}</h4>
    <p class="muted">
      ${signature.fieldCount} user-facing field(s)${signature.userFacingNames.length ? ': ' + signature.userFacingNames.map(escapeHtml).join(', ') : ''}${signature.inputHints.length ? ' · hints: ' + signature.inputHints.map(escapeHtml).join(', ') : ''}.
      A shared shape is a review-prioritization hint only — it is never a claim that these scripts do the same thing. Applying a pattern always creates a new draft that still needs its own review.
    </p>
    <table><thead><tr><th>Script</th><th>Schema status</th><th></th></tr></thead><tbody>${memberRows}</tbody></table>
  </div>`;
}

/**
 * Setup's "Similar scripts" panel: scripts grouped by candidate shape
 * (core/schemaFamily.ts), so a reviewer can prioritize scripts that look
 * alike instead of reviewing hundreds of scripts one at a time. Only shows
 * families with 2+ members — a family of one has nothing to compare
 * against. Never claims semantic correctness, and never marks anything
 * reviewed automatically.
 */
function similarScriptsPanelHtml(project: Project): string {
  const families = groupScriptsByShapeSignature(project.scripts).filter((f) => f.scripts.length > 1 && f.signature.fieldCount > 0);
  if (families.length === 0) return '';
  const rows = families
    .map((family) => {
      const first = family.scripts[0]!;
      const names = family.signature.userFacingNames.length ? family.signature.userFacingNames.map(escapeHtml).join(', ') : '—';
      return `<tr>
        <td>${names}</td>
        <td>${family.signature.fieldCount}</td>
        <td>${family.scripts.length}</td>
        <td><button class="btn small" data-action="view-similar-scripts" data-id="${attr(first.id)}">Same candidate shape</button></td>
      </tr>`;
    })
    .join('');
  const detail = state.familyDetailScriptId ? familyDetailHtml(project, state.familyDetailScriptId) : '';
  return `<div class="card">
    <h3>Similar scripts <span class="pill">Setup only</span></h3>
    <p class="muted">Scripts grouped by candidate shape (variable names, @input hints, field count) — a review-prioritization tool, not a claim that similarly-shaped scripts do the same thing.</p>
    <table><thead><tr><th>Candidate names</th><th>Fields</th><th>Scripts</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    ${detail}
  </div>`;
}

export function renderScripts(): string {
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

  return `<h1>Setup <span class="pill">Manage Scripts</span></h1>
    ${workspaceStatusStripHtml(p)}
    <p class="muted">Fetch/update scripts, scan them, and apply or review schemas here — then run supported actions from Run Script.</p>
    ${emptyStateHtml}
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
    ${compactCatalogHtml(p)}
    ${actionAvailabilityMatrixHtml(p)}
    ${variantVerificationPanelHtml(p)}
    ${similarScriptsPanelHtml(p)}
    ${unattachedHtml}
    <details id="scripts-advanced-details"${state.scriptsAdvancedOpen ? ' open' : ''}>
      <summary class="muted" style="cursor:pointer">Advanced: all scripts (raw text, scanner details, JSON export/import)</summary>
      ${managementHtml}
      ${cardsHtml}
    </details>
    ${catalogAuditPanelHtml(p)}
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
