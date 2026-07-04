import { describe, it, expect } from 'vitest';
import { defaultScreenForWorkspace, SIDEBAR_SCREENS, SCREEN_LABEL, type Screen } from '../src/ui/navigation.js';

describe('defaultScreenForWorkspace', () => {
  it('opens demo workspaces to Start Here', () => {
    expect(defaultScreenForWorkspace('demo')).toBe('start-here');
  });

  it('opens a workspace created via "Import a script" directly to the Script Library', () => {
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
  it('lists Start Here first and Notes last, matching the simplified workbench priority', () => {
    expect(SIDEBAR_SCREENS[0]).toBe('start-here');
    expect(SIDEBAR_SCREENS[SIDEBAR_SCREENS.length - 1]).toBe('notes');
  });

  it('places Action Builder and Script Library ahead of Checklist and Notes', () => {
    const idx = (s: Screen) => SIDEBAR_SCREENS.indexOf(s);
    expect(idx('actions')).toBeLessThan(idx('checklist'));
    expect(idx('scripts')).toBeLessThan(idx('notes'));
    expect(idx('actions')).toBeLessThan(idx('settings'));
  });

  it('includes every sidebar screen exactly once, with no duplicates', () => {
    expect(new Set(SIDEBAR_SCREENS).size).toBe(SIDEBAR_SCREENS.length);
  });

  it('labels renamed screens with the simplified workbench terms', () => {
    expect(SCREEN_LABEL.settings).toBe('Settings');
    expect(SCREEN_LABEL.outputs).toBe('Saved Outputs');
    expect(SCREEN_LABEL.actions).toBe('Action Builder');
    expect(SCREEN_LABEL['start-here']).toBe('Start Here');
  });
});
