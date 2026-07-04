import { describe, it, expect } from 'vitest';
import type { ProjectSummary } from '../src/data/storage.js';
import {
  defaultScreenForWorkspace,
  findReusableUntitledWorkspace,
  mostRecentWorkspace,
  SIDEBAR_SCREENS,
  ADVANCED_SCREENS,
  SCREEN_LABEL,
  type Screen,
} from '../src/ui/navigation.js';

describe('defaultScreenForWorkspace', () => {
  it('opens demo workspaces to Start', () => {
    expect(defaultScreenForWorkspace('demo')).toBe('start-here');
  });

  it('opens a workspace created via "Import a script" directly to Scripts', () => {
    expect(defaultScreenForWorkspace('import-script')).toBe('scripts');
  });

  it('opens a freshly created workspace to the Action Builder', () => {
    expect(defaultScreenForWorkspace('created')).toBe('actions');
  });

  it('opens an existing (recent) workspace to the Action Builder', () => {
    expect(defaultScreenForWorkspace('opened')).toBe('actions');
  });
});

describe('sidebar order and labels', () => {
  it('lists Start first and Notes last, matching the simplified workbench priority', () => {
    expect(SIDEBAR_SCREENS[0]).toBe('start-here');
    expect(SIDEBAR_SCREENS[SIDEBAR_SCREENS.length - 1]).toBe('notes');
  });

  it('places the primary tool loop (Action Builder, Scripts, Outputs, Export, Settings) ahead of the Advanced screens', () => {
    const idx = (s: Screen) => SIDEBAR_SCREENS.indexOf(s);
    expect(idx('actions')).toBeLessThan(idx('validation'));
    expect(idx('scripts')).toBeLessThan(idx('notes'));
    expect(idx('outputs')).toBeLessThan(idx('checklist'));
    expect(idx('report')).toBeLessThan(idx('notes'));
    expect(idx('settings')).toBeLessThan(idx('validation'));
  });

  it('includes every sidebar screen exactly once, with no duplicates', () => {
    expect(new Set(SIDEBAR_SCREENS).size).toBe(SIDEBAR_SCREENS.length);
  });

  it('labels renamed screens with the simplified workbench terms', () => {
    expect(SCREEN_LABEL.settings).toBe('Settings');
    expect(SCREEN_LABEL.outputs).toBe('Outputs');
    expect(SCREEN_LABEL.actions).toBe('Action Builder');
    expect(SCREEN_LABEL['start-here']).toBe('Start');
    expect(SCREEN_LABEL.scripts).toBe('Scripts');
    expect(SCREEN_LABEL.report).toBe('Export');
  });

  it('groups Validation, Checklist, and Notes as the Advanced screens, at the end of the sidebar', () => {
    expect(ADVANCED_SCREENS).toEqual(['validation', 'checklist', 'notes']);
    const nonAdvancedCount = SIDEBAR_SCREENS.length - ADVANCED_SCREENS.length;
    expect(SIDEBAR_SCREENS.slice(nonAdvancedCount)).toEqual(ADVANCED_SCREENS);
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
