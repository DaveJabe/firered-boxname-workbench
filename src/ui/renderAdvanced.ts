// Advanced, Landing (Workspaces), Orientation, Workspace Settings, and the
// dev-only Local Generator POC panel. Extracted from app.ts as part of
// splitting the UI layer into smaller modules — no behavior change, same
// markup/data-action/data-bind wiring as before; only the four render*
// screen functions are used outside this module (by app.ts's render()
// dispatcher).

import type { LocalGeneratorPocResult } from '../experimental/localEsharkGeneratorPoc.js';
import type { ProjectSummary } from '../data/storage.js';
import { escapeHtml, attr } from './dom.js';
import { opt } from './viewModels.js';
import { state, nowIso } from './state.js';
import { mostRecentWorkspace } from './navigation.js';
import { resolveExitCompanionForScript } from '../core/exitCompanion.js';

/** Reads the dev-only opt-in flag directly from localStorage on every render — no cached state, nothing to get out of sync. */
function isLocalGeneratorPocEnabled(): boolean {
  try {
    return window.localStorage.getItem('fbw.enableLocalGeneratorPoc') === 'true';
  } catch {
    return false;
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

export function renderLanding(): string {
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

export function renderStartHere(): string {
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

export function renderAdvanced(): string {
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
      <div class="card">
        <h3>About &amp; attribution</h3>
        <p class="muted">This app is an independent helper UI for working with public E-Sh4rk/EmeraldACE scripts — not affiliated with, endorsed by, or maintained by E-Sh4rk. E-Sh4rk's scripts and <a href="https://github.com/E-Sh4rk/CodeGenerator" target="_blank" rel="noopener noreferrer">CodeGenerator</a> remain the source of truth. Manual paste-back is the supported way to bring real generator output in.</p>
        <p class="muted">Sources: <a href="https://github.com/E-Sh4rk/EmeraldACE_web" target="_blank" rel="noopener noreferrer">E-Sh4rk/EmeraldACE_web</a> &middot; <a href="https://github.com/E-Sh4rk/CodeGenerator" target="_blank" rel="noopener noreferrer">E-Sh4rk/CodeGenerator</a></p>
        <p class="muted">See <code>docs/attribution.md</code> for the full statement.</p>
      </div>
    </div>
    ${isLocalGeneratorPocEnabled() ? renderLocalGeneratorPocPanel() : ''}`;
}

/**
 * EXPERIMENTAL, DEV-ONLY panel — see docs/local-generator-poc.md. Only
 * rendered when isLocalGeneratorPocEnabled() is true (an explicit
 * localStorage flag a developer sets from the browser console; there is no
 * in-app toggle). Reuses Run Script's own filled-script output — see
 * ActionBuilderState.filledScript — rather than a separate field-fill UI.
 */
function renderLocalGeneratorPocPanel(): string {
  const p = state.project;
  const ab = state.actionBuilder;
  const poc = state.localGeneratorPocPanel;

  // If the currently selected action's script resolves a companion, offer
  // to use it — the manual paste path (below) stays fully intact either
  // way; this is a convenience, never automatic, never required.
  const curatedForPoc = p?.curatedSchemas.find((s) => s.id === ab.curatedSchemaId);
  const linkedScriptForPoc = curatedForPoc?.scriptId ? p?.scripts.find((s) => s.id === curatedForPoc.scriptId) : undefined;
  const resolvedCompanion = p && linkedScriptForPoc
    ? resolveExitCompanionForScript(linkedScriptForPoc, p.scripts, p.scriptPacks, nowIso)
    : undefined;
  const useResolvedCompanionHtml = resolvedCompanion?.status === 'resolved'
    ? `<div class="row" style="margin-bottom:0.5rem">
        <button class="btn" data-action="use-resolved-exit-companion">Use resolved companion (${escapeHtml(resolvedCompanion.companionFilename ?? 'found')})</button>
      </div>`
    : '';

  const artifactStatusHtml =
    poc.artifactStatus === 'checking'
      ? '<p class="muted">Checking…</p>'
      : poc.artifactStatus === 'detected'
        ? '<p><span class="badge info">Detected</span> — local artifact loaded and exposed aceGen.build.</p>'
        : poc.artifactStatus === 'missing'
          ? '<p><span class="badge warning">Not found</span> — see docs/local-generator-poc.md for setup. Manual paste-back is unaffected.</p>'
          : '<p class="muted">Not checked yet.</p>';

  const hasFilledScript = !!ab.filledScript;
  const fillCard = hasFilledScript
    ? `<div class="card">
        <h4>Filled script (from Run Script)</h4>
        <p class="muted">Action: ${escapeHtml(ab.selectedActionKey || '(none)')} · schema: ${escapeHtml(ab.curatedSchemaId || '(none)')}</p>
        <pre>${escapeHtml(ab.filledScript!.filledScriptText)}</pre>
      </div>`
    : `<div class="card" style="border-color:#e0a458;background:#fffaf2">
        <p class="muted">No filled script yet. Go to Run Script, pick an action, fill its fields, and click "Preview filled script" first.</p>
        <button class="btn" data-action="nav" data-screen="actions">Go to Run Script</button>
      </div>`;

  return `<div class="card" style="border-color:#c9a4e0;background:#f8f3fc">
    <h3>Local generator POC <span class="pill">experimental &middot; dev-only &middot; local-only</span></h3>
    <p class="muted">Calls a locally-obtained, untracked copy of E-Sh4rk's compiled generator artifact. Never committed, never fetched remotely, never wired into the normal Run Script flow. See <code>docs/local-generator-poc.md</code>.</p>
    <div class="row">
      <button class="btn" data-action="check-local-generator-artifact"${poc.artifactStatus === 'checking' ? ' disabled' : ''}>Check for local artifact</button>
    </div>
    ${artifactStatusHtml}
    ${fillCard}
    <label for="poc-exit-companion">Exit companion text (paste the full upstream <code>files_frlg/exit.txt</code> contents, or use a resolved companion below if available)</label>
    ${useResolvedCompanionHtml}
    <textarea id="poc-exit-companion" data-bind="localGeneratorPoc.exitCompanionText" rows="6" placeholder="Required for scripts declaring @@ exit = &quot;...&quot; — see docs/local-generator-poc.md">${escapeHtml(poc.exitCompanionText)}</textarea>
    <div class="row">
      <button class="btn primary" data-action="run-local-generator-poc"${!hasFilledScript || poc.running ? ' disabled' : ''}>${poc.running ? 'Running…' : 'Run local generator POC'}</button>
    </div>
    ${poc.lastResult ? renderLocalGeneratorPocResult(poc.lastResult) : ''}
  </div>`;
}

function renderLocalGeneratorPocResult(result: LocalGeneratorPocResult): string {
  const errorsHtml = result.errors.length
    ? `<p><span class="badge error">Errors</span></p><ul>${result.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`
    : '';
  const warningsHtml = result.warnings.length
    ? `<p><span class="badge warning">Warnings</span></p><ul>${result.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`
    : '';
  const rawHtml = result.rawGeneratorOutput ? `<h4>Raw output</h4><pre>${escapeHtml(result.rawGeneratorOutput)}</pre>` : '';
  const rowsHtml =
    result.parsedBoxRows && result.parsedBoxRows.length > 0
      ? `<h4>Parsed Box N rows</h4><table><thead><tr><th>Box</th><th>Display</th><th>Compact</th></tr></thead><tbody>${result.parsedBoxRows
          .map(
            (r) =>
              `<tr><td>${r.boxNumber}</td><td>${escapeHtml(r.spacedDisplay)}</td><td>${r.compactText ? escapeHtml(r.compactText) : '—'}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : '';
  return `<div class="card">
    <h4>Result <span class="muted">(${escapeHtml(result.provenance.adapterKind)} &middot; ${escapeHtml(result.provenance.generatedAt)})</span></h4>
    ${errorsHtml}
    ${warningsHtml}
    ${rawHtml}
    ${rowsHtml}
  </div>`;
}

export function renderSettings(): string {
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
