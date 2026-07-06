// The UI shell: page layout (banner/topbar/nav rail), the render() dispatcher
// that picks which screen to draw, and init() — the app's one entry point,
// wiring up delegated click/change listeners and opening the default
// workspace. Split out of what used to be a single ~4300-line file (see
// state.ts, viewModels.ts, copyFeedback.ts, eventHandlers.ts, and the
// render*.ts screen modules) — no behavior change from that split.

import { escapeHtml } from './dom.js';
import { state, setRenderer } from './state.js';
import { SCREEN_LABEL, SIDEBAR_SCREENS, sidebarActiveScreen } from './navigation.js';
import { handleClick, handleChange, openDefaultWorkspace } from './eventHandlers.js';
import { listProjects } from '../data/storage.js';
import { renderLanding, renderStartHere, renderSettings, renderAdvanced } from './renderAdvanced.js';
import { renderActions } from './renderRunScript.js';
import { renderScripts } from './renderSetup.js';
import { renderOutputs } from './renderSavedOutputs.js';
import { renderChecklist, renderNotes, renderValidation, renderReport } from './renderReviewScreens.js';

const app = () => document.getElementById('app') as HTMLElement;

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

setRenderer(render);

export async function init(): Promise<void> {
  const root = app();
  root.addEventListener('click', (e) => void handleClick(e));
  root.addEventListener('change', (e) => void handleChange(e));
  // 'toggle' doesn't bubble, so this only fires via the capture phase — kept
  // in sync here (not through render()) so a manual open/close survives the
  // next unrelated re-render, which otherwise rebuilds this <details> from
  // scratch and would silently re-close it.
  root.addEventListener(
    'toggle',
    (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'scripts-advanced-details') state.scriptsAdvancedOpen = (el as HTMLDetailsElement).open;
      if (el.id === 'catalog-audit-details') state.catalogAuditOpen = (el as HTMLDetailsElement).open;
    },
    true,
  );
  state.summaries = await listProjects();
  await openDefaultWorkspace();
  render();
}
