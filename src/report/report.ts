// Renders a self-contained, printable HTML report from a project.
// All user- and script-provided text is HTML-escaped and shown verbatim;
// nothing is silently transformed.

import type { Project, Finding, ReviewSummary, ImportedTextBlock } from '../core/types.js';
import { computeReviewSummary, isReviewComplete } from '../core/review.js';
import { countBySeverity } from '../core/validators.js';
import { groupBySeverity, TARGET_LABELS } from '../core/findings.js';
import { SOURCE_TYPE_LABELS } from '../core/sources.js';
import { parseGeneratorOutput } from '../core/generatorOutputParser.js';

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

/**
 * For manually pasted-back generator output (external-local-tool blocks),
 * show the parsed "Box N:" rows — spaced display and compact bracket text
 * shown separately — alongside any parser warnings. Shown only when at
 * least one row was found; the full raw text is always kept in the block's
 * verbatim <pre> section regardless.
 */
function parsedBoxNameSection(block: ImportedTextBlock): string {
  if (block.source.type !== 'external-local-tool') return '';
  const parsed = parseGeneratorOutput(block.rawText);
  if (parsed.rows.length === 0) return '';
  const rows = parsed.rows
    .map(
      (r) => `<tr>
        <td>Box ${r.boxNumber}</td>
        <td>${esc(r.spacedDisplay)}</td>
        <td>${r.compactText !== null ? esc(r.compactText) : '—'}</td>
      </tr>`,
    )
    .join('\n');
  const warnings = parsed.warnings.length
    ? `<p class="muted">${parsed.warnings.map((w) => esc(w)).join('<br>')}</p>`
    : '';
  return `<h4>Parsed box-name rows</h4>
    <table class="findings">
      <thead><tr><th>Box</th><th>Spaced display</th><th>Compact</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${warnings}`;
}

function summaryTable(s: ReviewSummary): string {
  return `<table class="kv">
    <tr><th>Checklist items</th><td>${s.totalItems}</td></tr>
    <tr><th>Confirmed</th><td>${s.confirmed}</td></tr>
    <tr><th>Not applicable</th><td>${s.notApplicable}</td></tr>
    <tr><th>Needs follow-up</th><td>${s.needsFollowUp}</td></tr>
    <tr><th>Required outstanding</th><td>${s.requiredOutstanding}</td></tr>
  </table>`;
}

function findingsSection(findings: Finding[]): string {
  if (findings.length === 0) return '<p class="muted">No validation findings.</p>';
  const counts = countBySeverity(findings);
  const sections = groupBySeverity(findings)
    .map((g) => {
      const rows = g.findings
        .map(
          (f) => `<tr class="sev-${f.severity}">
        <td>${esc(f.rule)}</td>
        <td>${esc(TARGET_LABELS[f.target.kind])}${f.target.line ? ` · line ${f.target.line}` : ''}${f.target.column ? `, col ${f.target.column}` : ''}</td>
        <td>${esc(f.message)}${f.acknowledged ? ` <em>(acknowledged${f.ackNote ? ': ' + esc(f.ackNote) : ''})</em>` : ''}</td>
      </tr>`,
        )
        .join('\n');
      return `<h3>${cap(g.key)} — ${g.findings.length}</h3>
    <table class="findings">
      <thead><tr><th>Rule</th><th>Location</th><th>Message</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
    })
    .join('\n');
  return `<p class="muted">${counts.error} error(s), ${counts.warning} warning(s), ${counts.info} info.</p>
    ${sections}`;
}

export function renderReportHtml(project: Project, exportedAtIso: string): string {
  const m = project.metadata;
  const summary = computeReviewSummary(project);
  const complete = isReviewComplete(project);
  const findings = project.latestValidation?.findings ?? [];

  const checklistRows = project.checklist
    .map(
      (i) => `<tr>
        <td>${esc(i.category)}</td>
        <td>${esc(i.prompt)}${i.required ? ' <span class="req">(required)</span>' : ''}</td>
        <td>${esc(i.state)}</td>
        <td>${esc(i.note)}</td>
      </tr>`,
    )
    .join('\n');

  const notesHtml = project.notes
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((n) => `<section><h3>${esc(n.sectionTitle || '(untitled section)')}</h3><pre class="note">${esc(n.body)}</pre></section>`)
    .join('\n');

  const blocksHtml = project.importedBlocks
    .map((b) => {
      const s = b.source;
      const prov = `Source: ${esc(SOURCE_TYPE_LABELS[s.type])} · ${esc(s.label || '—')} · imported ${esc(s.importedAt)}${s.filename ? ' · file: ' + esc(s.filename) : ''}`;
      const toolLine = s.toolName || s.toolVersion
        ? `<p class="muted">Tool: ${esc(s.toolName || '—')}${s.toolVersion ? ' · version ' + esc(s.toolVersion) : ''}</p>`
        : '';
      // Tool URL is shown as escaped text only; the report never links or fetches it.
      const urlLine = s.toolUrl ? `<p class="muted">Tool URL: ${esc(s.toolUrl)}</p>` : '';
      const invLine = s.invocationNotes ? `<p class="muted">Invocation notes: ${esc(s.invocationNotes)}</p>` : '';
      const actionLine = s.actionId || s.actionLabel || s.generatedBy || s.scriptId
        ? `<p class="muted">Action: ${esc(s.actionLabel || s.actionId || '—')}${s.generatedBy ? ' · generated by ' + esc(s.generatedBy) : ''}${s.scriptId ? ' · script: ' + esc(s.scriptId) : ''}</p>`
        : '';
      return `<section class="block">
        <h3>${esc(b.title || '(untitled block)')}</h3>
        <p class="muted">category: ${esc(b.categoryLabel || '—')} · revision: ${esc(b.revisionLabel || '—')}</p>
        <p class="muted">${prov}</p>
        ${s.notes ? `<p class="muted">Source notes: ${esc(s.notes)}</p>` : ''}
        ${toolLine}${urlLine}${invLine}${actionLine}
        ${b.notes ? `<p>${esc(b.notes)}</p>` : ''}
        ${parsedBoxNameSection(b)}
        <pre class="imported">${esc(b.rawText)}</pre>
      </section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:" />
<title>FireRed BoxName Workbench — ${esc(m.projectTitle || 'Report')}</title>
<style>
  :root { color-scheme: light; }
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; color: #1a1a1a; margin: 2rem; }
  h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; border-bottom: 1px solid #ccc; padding-bottom: 0.25rem; }
  h3 { font-size: 1rem; margin-bottom: 0.25rem; }
  .banner { background: #fff4e5; border: 1px solid #e0a458; border-radius: 6px; padding: 0.5rem 0.75rem; margin: 0.5rem 0 1rem; font-weight: 600; }
  .watermark { color: #b23; font-weight: 700; letter-spacing: 0.05em; }
  table { border-collapse: collapse; width: 100%; margin: 0.5rem 0; }
  th, td { border: 1px solid #ddd; padding: 0.35rem 0.5rem; text-align: left; vertical-align: top; }
  table.kv { width: auto; }
  table.kv th { background: #f6f6f6; }
  .muted { color: #666; }
  .req { color: #b23; font-size: 0.85em; }
  pre { background: #f7f7f7; border: 1px solid #e2e2e2; border-radius: 4px; padding: 0.5rem; white-space: pre-wrap; word-break: break-word; }
  tr.sev-error td { background: #fdecea; }
  tr.sev-warning td { background: #fff8e1; }
  .toolbar { margin: 1rem 0; }
  @media print { .toolbar { display: none; } }
</style></head>
<body>
  <div class="banner">Local &amp; reviewable — this report contains user-recorded notes, imported text, and provenance. No network calls were made to produce it.</div>
  <div class="toolbar">Use your browser's Print / Save as PDF command to print this report.</div>

  <h1>${esc(m.projectTitle || 'Untitled project')}</h1>
  <p class="muted">Game: ${esc(m.game)} · Revision: ${esc(m.revisionLabel || '—')} · Language: ${esc(m.languageLabel || '—')} · Mode: ${esc(m.mode)}</p>
  <p class="muted">Status: ${esc(project.projectStatus)} · Exported: ${esc(exportedAtIso)}</p>
  ${complete ? '' : '<p class="watermark">DRAFT — REVIEW INCOMPLETE</p>'}

  <h2>Review summary</h2>
  ${summaryTable(summary)}

  <h2>Checklist</h2>
  <table><thead><tr><th>Category</th><th>Prompt</th><th>State</th><th>Note</th></tr></thead>
  <tbody>${checklistRows || '<tr><td colspan="4" class="muted">No checklist items.</td></tr>'}</tbody></table>

  <h2>Notes</h2>
  ${notesHtml || '<p class="muted">No notes.</p>'}

  <h2>Imported text blocks</h2>
  ${blocksHtml || '<p class="muted">No imported blocks.</p>'}

  <h2>Validation findings</h2>
  ${findingsSection(findings)}
</body></html>`;
}
