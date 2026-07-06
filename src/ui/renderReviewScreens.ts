// Checklist, Notes, Validation, and Report/Export screens — the smaller
// "documentation mode" review screens. Extracted from app.ts as part of
// splitting the UI layer into smaller modules — no behavior change, same
// markup/data-action/data-bind wiring as before; only the four render*
// screen functions are used outside this module (by app.ts's render()
// dispatcher).

import type { ChecklistItem, Finding, TargetKind, Project } from '../core/types.js';
import { escapeHtml, attr } from './dom.js';
import { opt, cap } from './viewModels.js';
import { state } from './state.js';
import { computeReviewSummary, isReviewComplete, filterByState, type ChecklistFilter } from '../core/review.js';
import { groupBySeverity, groupByTarget, TARGET_LABELS } from '../core/findings.js';
import { countBySeverity } from '../core/validators.js';

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

export function renderChecklist(): string {
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

export function renderNotes(): string {
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

export function renderValidation(): string {
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

export function renderReport(): string {
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
