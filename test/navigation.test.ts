import { describe, it, expect } from 'vitest';
import type { ProjectSummary } from '../src/data/storage.js';
import {
  defaultScreenForWorkspace,
  findReusableUntitledWorkspace,
  mostRecentWorkspace,
  sidebarActiveScreen,
  SIDEBAR_SCREENS,
  ADVANCED_SCREENS,
  SCREEN_LABEL,
  type Screen,
} from '../src/ui/navigation.js';

describe('defaultScreenForWorkspace', () => {
  it('opens demo workspaces to the (Advanced-only) orientation screen', () => {
    expect(defaultScreenForWorkspace('demo')).toBe('start-here');
  });

  it('opens a workspace created via "Import a script" directly to Manage Scripts', () => {
    expect(defaultScreenForWorkspace('import-script')).toBe('scripts');
  });

  it('opens a freshly created workspace to Run Script', () => {
    expect(defaultScreenForWorkspace('created')).toBe('actions');
  });

  it('opens an existing (recent) workspace to Run Script', () => {
    expect(defaultScreenForWorkspace('opened')).toBe('actions');
  });
});

describe('sidebar: four top-level tabs only', () => {
  it('is exactly Run Script, Outputs, Manage Scripts, Advanced, in that order', () => {
    expect(SIDEBAR_SCREENS).toEqual(['actions', 'outputs', 'scripts', 'advanced']);
  });

  it('includes every sidebar screen exactly once, with no duplicates', () => {
    expect(new Set(SIDEBAR_SCREENS).size).toBe(SIDEBAR_SCREENS.length);
  });

  it('labels the primary tabs with the simplified tool terms', () => {
    expect(SCREEN_LABEL.actions).toBe('Run Script');
    expect(SCREEN_LABEL.outputs).toBe('Outputs');
    expect(SCREEN_LABEL.scripts).toBe('Manage Scripts');
    expect(SCREEN_LABEL.advanced).toBe('Advanced');
  });

  it('labels the Advanced-only screens', () => {
    expect(SCREEN_LABEL.settings).toBe('Workspace Settings');
    expect(SCREEN_LABEL.report).toBe('Export');
    expect(SCREEN_LABEL.validation).toBe('Validation');
    expect(SCREEN_LABEL.checklist).toBe('Checklist');
    expect(SCREEN_LABEL.notes).toBe('Notes');
  });
});

describe('ADVANCED_SCREENS and sidebarActiveScreen', () => {
  it('lists every screen reachable only through the Advanced hub', () => {
    expect(ADVANCED_SCREENS).toEqual(['start-here', 'settings', 'validation', 'report', 'checklist', 'notes', 'landing']);
  });

  it('none of the Advanced-only screens are themselves a top-level sidebar tab', () => {
    for (const s of ADVANCED_SCREENS) expect(SIDEBAR_SCREENS).not.toContain(s);
  });

  it('maps every Advanced-only screen back to the Advanced tab, for highlighting', () => {
    for (const s of ADVANCED_SCREENS) expect(sidebarActiveScreen(s)).toBe('advanced');
  });

  it('maps each top-level screen to itself', () => {
    const topLevel: Screen[] = ['actions', 'outputs', 'scripts', 'advanced'];
    for (const s of topLevel) expect(sidebarActiveScreen(s)).toBe(s);
  });
});

function makeSummary(over: Partial<ProjectSummary> = {}): ProjectSummary {
  return { id: 's1', title: '(untitled)', revisionLabel: '', status: 'draft', updatedAt: '2026-01-01T00:00:00.000Z', ...over };
}

describe('findReusableUntitledWorkspace', () => {
  it('returns undefined when there are no workspaces at all', () => {
    expect(findReusableUntitledWorkspace([])).toBeUndefined();
  });

  it('returns undefined when every workspace has a real title', () => {
    const summaries = [makeSummary({ id: 'a', title: 'My project' })];
    expect(findReusableUntitledWorkspace(summaries)).toBeUndefined();
  });

  it('returns the first untitled workspace in most-recently-updated-first order', () => {
    const summaries = [
      makeSummary({ id: 'titled', title: 'My project', updatedAt: '2026-01-03T00:00:00.000Z' }),
      makeSummary({ id: 'untitled-newer', title: '(untitled)', updatedAt: '2026-01-02T00:00:00.000Z' }),
      makeSummary({ id: 'untitled-older', title: '(untitled)', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(findReusableUntitledWorkspace(summaries)?.id).toBe('untitled-newer');
  });
});

describe('mostRecentWorkspace', () => {
  it('returns undefined for an empty list', () => {
    expect(mostRecentWorkspace([])).toBeUndefined();
  });

  it('returns the first summary, matching listProjects()\'s most-recently-updated-first order', () => {
    const summaries = [makeSummary({ id: 'first' }), makeSummary({ id: 'second' })];
    expect(mostRecentWorkspace(summaries)?.id).toBe('first');
  });
});

describe('default launch workspace (used by app.ts openDefaultWorkspace on app load)', () => {
  it('picks the most recently updated workspace to silently reopen, regardless of title', () => {
    const summaries = [
      makeSummary({ id: 'my-titled-workspace', title: 'My workspace', updatedAt: '2026-01-02T00:00:00.000Z' }),
      makeSummary({ id: 'older-untitled', title: '(untitled)', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(mostRecentWorkspace(summaries)?.id).toBe('my-titled-workspace');
  });

  it('returns undefined when no workspace exists yet, signaling a fresh one should be created', () => {
    expect(mostRecentWorkspace([])).toBeUndefined();
  });
});
