// Run Script screen — choose a supported action, fill its curated-schema
// fields, preview the filled script, and paste generator output back.
// Extracted from app.ts as part of splitting the UI layer into smaller
// modules — no behavior change, same markup/data-action/data-bind wiring as
// before; only renderActions() is used outside this module (by app.ts's
// render() dispatcher).

import type {
  ActionFieldValue,
  FilledScriptResult,
  ExitCompanionResolution,
  ParsedGeneratorOutput,
  Project,
  CuratedSchemaField,
  CuratedActionSchema,
  GameTarget,
} from '../core/types.js';
import type { ActionField } from '../templates/action-templates.js';
import { escapeHtml, attr } from './dom.js';
import { opt, lineNumberView, workspaceStatusStripHtml, targetSelectsHtml } from './viewModels.js';
import { state, nowIso, type ActionBuilderState } from './state.js';
import { targetLabel, isUnknownTarget } from '../core/gameTarget.js';
import {
  getRunnableActionsForTarget,
  type SupportedAction,
  type SupportedActionVariant,
} from '../core/supportedActionRegistry.js';
import { summarizeVariantVerification, describeGeneratorInputReadiness } from '../core/schemaVerification.js';
import { toActionTemplateShape, isSchemaSelectable, supportsRevision } from '../core/curatedSchemas.js';
import { extractExitDirectiveValue } from '../core/scriptScanner.js';
import { resolveExitCompanionForScript } from '../core/exitCompanion.js';
import { summarizeActionAvailabilityForTarget, targetsWithReadyActions } from '../core/actionAvailability.js';

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

/** The live E-Sh4rk generator's FRLG page — a plain link, never fetched or executed by this app. See docs/attribution.md. */
const ESHARK_GENERATOR_EXTERNAL_URL = 'https://e-sh4rk.github.io/CodeGenerator/index_frlg.html';

/**
 * "Open E-Sh4rk generator" affordance — a plain new-tab link, always shown
 * once a script is linked and filled (regardless of whether it has an exit
 * directive). Never passes any of this app's data to it automatically —
 * copy/paste stays the explicit, manual step. See docs/attribution.md for
 * the independence disclaimer this echoes.
 */
function externalGeneratorLinkHtml(): string {
  return `<div class="card">
    <p class="muted">
      <a href="${ESHARK_GENERATOR_EXTERNAL_URL}" target="_blank" rel="noopener noreferrer">Open E-Sh4rk generator (FRLG) ↗</a>
      <span class="pill">external site</span>
    </p>
    <p class="muted">Opens in a new tab. This is E-Sh4rk's own site, not part of this app and not affiliated with it — nothing here sends your filled script, exit companion, or field values to it automatically. Copy/paste them in yourself.</p>
  </div>`;
}

/**
 * Compact "Generator input" section — shown only when the linked script has
 * an @@ exit directive (see core/exitCompanion.ts). Deliberately minimal:
 * copy buttons and a resolved/missing status line, never a second copy of
 * the main action form. Manual instruction only — this app never invokes a
 * generator; see docs/attribution.md.
 */
function generatorInputSectionHtml(exitName: string, resolution: ExitCompanionResolution): string {
  const resolved = resolution.status === 'resolved';
  const exitStatusHtml = resolved
    ? `<span class="badge info">resolved${resolution.companionFilename ? ` — from ${escapeHtml(resolution.companionFilename)}` : ''}</span>`
    : `<span class="badge warning">companion not found</span>`;
  const missingWarningHtml = resolved
    ? ''
    : `<p class="muted"><span class="badge warning">Missing exit companion</span> — the filled script can still be copied, but the exit code text this action needs (<code>${escapeHtml(exitName)}</code>) wasn't found among imported scripts. Fetch/import it (see Setup), or paste it in manually in the dev-only local generator POC if you're using that.</p>`;
  return `<div class="card" style="border-color:#9fd3b4;background:#f3fbf6">
    <h3>Generator input <span class="pill">manual — no generator invoked</span></h3>
    <p class="muted">Filled script: <span class="badge info">ready</span></p>
    <p class="muted">Exit: <code>${escapeHtml(exitName)}</code> — ${exitStatusHtml}</p>
    ${missingWarningHtml}
    <div class="row">
      <button class="btn" data-action="copy-filled-script">Copy filled script</button>
      <button class="btn" data-action="copy-exit-name">Copy exit name</button>
      <button class="btn" data-action="copy-exit-companion-text"${resolved ? '' : ' disabled'}>Copy exit companion</button>
      <button class="btn" data-action="copy-generator-input-bundle"${resolved ? '' : ' disabled'} title="${resolved ? '' : 'Needs a resolved exit companion first'}">Copy generator input bundle</button>
    </div>
    <p class="muted">Use the filled script and matching exit code together in your own external E-Sh4rk generator (the source of truth for its output), then paste the result back below.</p>
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

/**
 * Lower ranks sort first — a soft preference for a better-verified variant
 * when more than one ready variant shares an action+target (a rare edge
 * case). Never excludes anything: every ready variant still appears, just
 * possibly reordered.
 */
function variantVerificationRank(project: Project, variant: SupportedActionVariant): number {
  const schema = project.curatedSchemas.find((s) => s.id === variant.schemaId);
  if (!schema) return 2;
  const summary = summarizeVariantVerification(schema, project, project.schemaReviewCases);
  switch (summary.status) {
    case 'accepted': return 0;
    case 'passing': return 1;
    case 'no-cases': return 2;
    case 'draft-cases': return 3;
    case 'not-available': return 4;
    case 'failing': return 5;
  }
}

/** Action dropdown options, grouped into <optgroup>s by category (files_frlg subfolder), "Other" for uncategorized actions. */
function actionOptGroupsHtml(actions: readonly SupportedAction[], selectedActionKey: string): string {
  const byCategory = new Map<string, SupportedAction[]>();
  for (const action of actions) {
    const key = action.category ?? 'Other';
    const group = byCategory.get(key);
    if (group) group.push(action);
    else byCategory.set(key, [action]);
  }
  return Array.from(byCategory.entries())
    .map(([category, group]) => {
      const opts = group.map((a) => opt(a.actionKey, a.label, selectedActionKey)).join('');
      return `<optgroup label="${attr(category)}">${opts}</optgroup>`;
    })
    .join('');
}

/**
 * Run Script's "Save as schema review case" card — a Setup-facing action
 * that lives here only because this is where a fill/preview/paste-back
 * naturally happens. The saved case itself is only ever viewed, refined,
 * and re-run from Setup's "Schema verification" panel, not here.
 */
function reviewCaseSectionHtml(curated: CuratedActionSchema): string {
  const editor = state.reviewCaseEditor;
  if (!editor || editor.schemaId !== curated.id) {
    return `<div class="card">
      <h3>Schema verification <span class="pill">Setup</span></h3>
      <p class="muted">Save this fill (and any pasted output above) as a repeatable check for this schema — refine it and run verification later from Setup.</p>
      <button class="btn" data-action="open-review-case-editor">Save as schema review case</button>
    </div>`;
  }

  const savedNote = editor.savedCaseId
    ? `<p class="muted">Saved &#10003; refine and run it from Setup's "Schema verification" panel.</p>`
    : '';
  return `<div class="card" style="border-color:#2563eb66;background:#f5f8ff">
    <div class="row" style="justify-content:space-between">
      <h3>Save as schema review case</h3>
      <button class="btn small" data-action="cancel-review-case-editor">Close</button>
    </div>
    <p class="muted">Target: ${escapeHtml(targetLabel(editor.target))}${editor.scriptFilename ? ' · from ' + escapeHtml(editor.scriptFilename) : ''}</p>
    <label for="rc-expected">Expected changed variables (comma-separated)</label>
    <input type="text" id="rc-expected" data-bind="reviewcase.expectedChangedVariables" value="${attr(editor.expectedChangedVariables)}" />
    <label for="rc-forbidden">Forbidden changed variables (comma-separated)</label>
    <input type="text" id="rc-forbidden" data-bind="reviewcase.forbiddenChangedVariables" value="${attr(editor.forbiddenChangedVariables)}" />
    <p class="muted">Forbidden defaults to this script's internal/helper candidates, when known — edit freely.</p>
    <label for="rc-note">Reviewer note (optional)</label>
    <textarea id="rc-note" data-bind="reviewcase.reviewerNote" placeholder="What did you check, and why does this example prove it?">${escapeHtml(editor.reviewerNote)}</textarea>
    ${editor.rawGeneratorOutput ? `<p class="muted">Includes the pasted generator output above as a drift-detection snapshot.</p>` : `<p class="muted">No generator output pasted above yet — this case will only check the filled script's changed variables.</p>`}
    <div class="row" style="margin-top:0.5rem">
      <button class="btn primary" data-action="save-review-case-from-editor">Save review case</button>
    </div>
    ${savedNote}
  </div>`;
}

/**
 * Run Script's "no runnable action for this target" empty state — explains
 * WHY (using core/actionAvailability.ts, never scanner internals), and
 * points at nearby targets that do have ready actions, so a user isn't
 * left guessing whether to fetch/review more or just pick a different
 * target. Never shows schema/script ids or Catalog Audit detail.
 */
function runScriptEmptyStateHtml(project: Project, target: GameTarget): string {
  const availability = summarizeActionAvailabilityForTarget(project, target, nowIso);
  const reasons: string[] = [];
  if (availability.missingNoReviewedVariant > 0) {
    reasons.push(`${availability.missingNoReviewedVariant} action(s) have no reviewed variant for this exact target yet`);
  }
  if (availability.needsReview > 0) {
    reasons.push(`${availability.needsReview} action(s) have a variant for this target still awaiting review`);
  }
  if (availability.blockedBySchemaScriptMismatch > 0) {
    reasons.push(`${availability.blockedBySchemaScriptMismatch} action(s) have a variant for this target that isn't usable right now (disabled, detached, or missing its script)`);
  }
  if (availability.blockedByMissingCompanion > 0) {
    reasons.push(`${availability.blockedByMissingCompanion} action(s) are otherwise ready but missing their exit companion`);
  }
  const reasonHtml = reasons.length
    ? `<p class="muted">Why: ${reasons.map((r) => escapeHtml(r)).join('; ')}.</p>`
    : `<p class="muted">No action in this workspace has been reviewed for this target yet.</p>`;

  const nearby = targetsWithReadyActions(project, target, nowIso).slice(0, 5);
  const nearbyHtml = nearby.length
    ? `<p class="muted">Targets with ready actions right now:</p>
       <ul>${nearby.map((n) => `<li>${escapeHtml(targetLabel(n.target))} — ${n.readyActions} ready action${n.readyActions === 1 ? '' : 's'}</li>`).join('')}</ul>`
    : `<p class="muted">No target in this workspace has a ready action yet.</p>`;

  return `<div class="card" style="border-color:#e0a458;background:#fffaf2">
    <p class="muted">No supported action is ready for <strong>${escapeHtml(targetLabel(target))}</strong> yet.</p>
    ${reasonHtml}
    ${nearbyHtml}
    <button class="btn" data-action="nav" data-screen="scripts">Go to Setup to review a schema or apply a reviewed preset</button>
  </div>`;
}

export function renderActions(): string {
  const p = state.project!;
  const ab = state.actionBuilder;
  const selectable = p.curatedSchemas.filter(isSchemaSelectable);

  const introLine = '<p class="muted">Three steps: choose an action, fill its parameters, then generate the result yourself in the external E-Sh4rk generator and paste it back in.</p>';

  if (selectable.length === 0) {
    return `<h1>Run Script</h1>
      ${workspaceStatusStripHtml(p)}
      ${introLine}
      <div class="card" style="border-color:#9fd3b4;background:#f3fbf6">
        <h3>Get started</h3>
        <p class="muted">This workspace doesn't have any supported actions yet:</p>
        <ol>
          <li>Fetch E-Sh4rk scripts from GitHub (or import your own in Manage Scripts).</li>
          <li>Apply a reviewed preset, or scan a script and review a curated schema yourself.</li>
          <li>Come back here — Run Script will show it as a supported action.</li>
        </ol>
        <div class="row">
          <button class="btn primary" data-action="nav" data-screen="scripts">Fetch scripts</button>
          <button class="btn" data-action="nav" data-screen="scripts">Review schemas</button>
          <button class="btn" data-action="nav" data-screen="scripts">Manage scripts</button>
        </div>
      </div>`;
  }

  const targetCard = `<div class="card">
    <h3>Target</h3>
    <p class="muted">Only supported actions with a reviewed, ready variant for this exact target appear below — no silent fallback to a different target.</p>
    ${isUnknownTarget(ab.runTarget) ? '<p class="muted">Pick a game, language, and revision to see supported actions.</p>' : ''}
    ${targetSelectsHtml('action.runTarget', ab.runTarget, 'run-target')}
  </div>`;

  const runnableActions = getRunnableActionsForTarget(p, ab.runTarget);

  if (runnableActions.length === 0) {
    return `<h1>Run Script</h1>
      ${workspaceStatusStripHtml(p)}
      ${introLine}
      <h2>Step 1 of 3 <span class="pill">Choose action</span></h2>
      ${targetCard}
      ${runScriptEmptyStateHtml(p, ab.runTarget)}`;
  }

  const selectedAction = runnableActions.find((a) => a.actionKey === ab.selectedActionKey) ?? runnableActions[0]!;
  // A soft preference only — when more than one ready variant shares this
  // action+target, a better-verified one sorts first as the default, but
  // every ready variant still appears in the picker below.
  const rankedVariants = [...selectedAction.variants].sort((a, b) => variantVerificationRank(p, a) - variantVerificationRank(p, b));
  const selectedVariant = rankedVariants.find((v) => v.schemaId === ab.curatedSchemaId) ?? rankedVariants[0]!;
  const curated = p.curatedSchemas.find((s) => s.id === selectedVariant.schemaId)!;
  const template = toActionTemplateShape(curated);

  const actionSelectorHtml = `<label for="ab-action">Action</label><select id="ab-action" data-bind="action.selectedActionKey">${actionOptGroupsHtml(runnableActions, selectedAction.actionKey)}</select>`;

  const variantPickerHtml = rankedVariants.length > 1
    ? `<label for="ab-variant">Target variant</label>
       <select id="ab-variant" data-bind="action.curatedSchemaId">${rankedVariants.map((v) => opt(v.schemaId, targetLabel(v.target), selectedVariant.schemaId)).join('')}</select>`
    : '';

  const curatedByKey = new Map(curated.fields.map((f) => [f.key, f]));
  const fieldsHtml = template.fields.map((f) => renderActionField(f, ab.values, ab.referenceSearch) + curatedFieldExtra(curatedByKey.get(f.key))).join('');

  // Concise target-compatibility + generator-input-readiness line — no
  // schema/script ids, no Catalog Audit detail (see core/actionAvailability.ts).
  const generatorInputReadiness = describeGeneratorInputReadiness(curated, p, nowIso).status;
  const readinessBadge = generatorInputReadiness === 'missing-exit-companion'
    ? ' · <span class="badge warning">generator input: missing exit companion</span>'
    : generatorInputReadiness === 'ready'
      ? ' · <span class="badge info">generator input ready</span>'
      : '';
  const statusLine = `<p class="muted">Target: ${escapeHtml(targetLabel(selectedVariant.target))}${selectedVariant.scriptFilename ? ' · from ' + escapeHtml(selectedVariant.scriptFilename) : ''}${!supportsRevision(curated, ab.revisionLabel) ? ' · <span class="badge warning">not listed for this revision</span>' : ''}${readinessBadge}</p>`;

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

  // Compact "Generator input" section — only once a script is linked,
  // successfully filled (no errors), and declares an @@ exit directive;
  // nothing extra otherwise. See core/exitCompanion.ts and
  // docs/local-generator-poc.md.
  const filledOk = ab.filledScript && ab.filledScript.errors.length === 0 ? ab.filledScript : undefined;
  const exitName = linkedScript ? extractExitDirectiveValue(linkedScript.rawText) : undefined;
  const generatorInputCard = filledOk && linkedScript && exitName !== undefined
    ? generatorInputSectionHtml(exitName, resolveExitCompanionForScript(linkedScript, p.scripts, p.scriptPacks, nowIso))
    : '';

  // "Open E-Sh4rk generator" — always available once a script is linked,
  // whether or not it needs an exit companion (see Task 3 in this branch's
  // spec / docs/attribution.md).
  const externalGeneratorCard = linkedScript ? externalGeneratorLinkHtml() : '';

  return `<h1>Run Script</h1>
    ${workspaceStatusStripHtml(p)}
    ${introLine}
    <h2>Step 1 of 3 <span class="pill">Choose action</span></h2>
    ${targetCard}
    <div class="card">
      <label for="ab-revision">Revision label</label>
      <input type="text" id="ab-revision" data-bind="action.revisionLabel" value="${attr(ab.revisionLabel)}" placeholder="e.g. Rev 1 (documentation only)" />
      ${actionSelectorHtml}
      ${variantPickerHtml}
      ${statusLine}
    </div>
    <h2>Step 2 of 3 <span class="pill">Fill parameters</span></h2>
    <div class="card">
      <p class="muted">${escapeHtml(curated.description)}</p>
      ${fieldsHtml}
    </div>
    <h2>Step 3 of 3 <span class="pill">Generate externally, then paste output back</span></h2>
    ${filledScriptCard}
    ${generatorInputCard}
    ${externalGeneratorCard}
    ${pasteBackCard(p, ab, template.label)}
    ${reviewCaseSectionHtml(curated)}`;
}
