// Pure navigation/workspace-labeling helpers — no DOM, directly unit-testable.
// This module only decides which screens exist, how the sidebar orders them,
// and which screen/workspace a primary action should open; it holds no
// workspace data of its own.

import type { ProjectSummary } from '../data/storage.js';

export type Screen =
  | 'landing'
  | 'start-here'
  | 'actions'
  | 'scripts'
  | 'outputs'
  | 'validation'
  | 'report'
  | 'settings'
  | 'checklist'
  | 'notes';

export const SCREEN_LABEL: Record<Screen, string> = {
  landing: 'FireRed BoxName Workbench',
  'start-here': 'Start',
  actions: 'Action Builder',
  scripts: 'Scripts',
  outputs: 'Outputs',
  validation: 'Validation',
  report: 'Export',
  settings: 'Settings',
  checklist: 'Checklist',
  notes: 'Notes',
};

/**
 * Sidebar tab order for an open workspace: the primary tool loop first
 * (Start, Action Builder, Scripts, Outputs, Export, Settings), then the
 * lower-priority notebook-era screens (Validation, Checklist, Notes) below
 * a visual "Advanced" separator — see ADVANCED_SCREENS.
 */
export const SIDEBAR_SCREENS: readonly Screen[] = [
  'start-here',
  'actions',
  'scripts',
  'outputs',
  'report',
  'settings',
  'validation',
  'checklist',
  'notes',
];

/** Lower-priority screens shown below a visual separator in the sidebar. */
export const ADVANCED_SCREENS: readonly Screen[] = ['validation', 'checklist', 'notes'];

/** How a workspace came to be open, for choosing its default screen. */
export type WorkspaceOrigin = 'created' | 'demo' | 'import-script' | 'opened';

/**
 * Which screen a workspace should open to, based on how the user got there.
 * Demo workspaces land on Start (orientation); a workspace created via
 * "Import a script" lands directly in Scripts; everything else — a freshly
 * created workspace, or opening an existing one — lands in the Action
 * Builder, the app's primary hub.
 */
export function defaultScreenForWorkspace(origin: WorkspaceOrigin): Screen {
  switch (origin) {
    case 'demo':
      return 'start-here';
    case 'import-script':
      return 'scripts';
    case 'created':
    case 'opened':
      return 'actions';
  }
}

/** A summary's title as stored when the workspace has no user-given title. */
const UNTITLED_LABEL = '(untitled)';

/**
 * The most recently updated untitled workspace, if any — so clicking a
 * primary action ("Start with an action" / "Import a script") reuses a
 * blank workspace instead of creating a new one every time. Assumes
 * `summaries` is already most-recently-updated-first, matching listProjects().
 */
export function findReusableUntitledWorkspace(
  summaries: readonly ProjectSummary[],
): ProjectSummary | undefined {
  return summaries.find((s) => s.title === UNTITLED_LABEL);
}

/**
 * The single most recently updated workspace, for the landing screen's
 * compact view. Assumes `summaries` is already most-recently-updated-first.
 */
export function mostRecentWorkspace(summaries: readonly ProjectSummary[]): ProjectSummary | undefined {
  return summaries[0];
}
