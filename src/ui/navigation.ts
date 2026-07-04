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
  | 'notes'
  | 'advanced';

export const SCREEN_LABEL: Record<Screen, string> = {
  landing: 'FireRed BoxName Workbench',
  'start-here': 'Start',
  actions: 'Run Script',
  scripts: 'Manage Scripts',
  outputs: 'Outputs',
  validation: 'Validation',
  report: 'Export',
  settings: 'Workspace Settings',
  checklist: 'Checklist',
  notes: 'Notes',
  advanced: 'Advanced',
};

/**
 * Top-level sidebar tabs — the simple tool loop only: select a script/action
 * and run it (Run Script), see what's been saved (Outputs), manage local
 * scripts and curated schemas (Manage Scripts), and everything else
 * (Advanced). Workspace/project management, settings, validation, the
 * report, checklist, and notes all live behind Advanced — see
 * ADVANCED_SCREENS and sidebarActiveScreen.
 */
export const SIDEBAR_SCREENS: readonly Screen[] = ['actions', 'outputs', 'scripts', 'advanced'];

/**
 * Screens reachable only through the Advanced hub, not as their own sidebar
 * tab. `sidebarActiveScreen` maps all of these back to 'advanced' so the
 * Advanced tab stays highlighted while browsing any of them.
 */
export const ADVANCED_SCREENS: readonly Screen[] = [
  'start-here',
  'settings',
  'validation',
  'report',
  'checklist',
  'notes',
  'landing',
];

/** Which top-level sidebar tab should render as active for the given screen. */
export function sidebarActiveScreen(screen: Screen): Screen {
  return ADVANCED_SCREENS.includes(screen) ? 'advanced' : screen;
}

/** How a workspace came to be open, for choosing its default screen. */
export type WorkspaceOrigin = 'created' | 'demo' | 'import-script' | 'opened';

/**
 * Which screen a workspace should open to, based on how the user got there.
 * Demo workspaces land on the Advanced-only orientation screen; a workspace
 * created via "Import a script" lands directly in Manage Scripts; everything
 * else — a freshly created workspace, or opening an existing one — lands in
 * Run Script, the app's primary hub.
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
 * The single most recently updated workspace. Used both for the landing
 * screen's compact view and to silently reopen where the user left off on
 * app launch (see openDefaultWorkspace in app.ts) — the user should never
 * have to pick or configure a workspace before using the tool. Assumes
 * `summaries` is already most-recently-updated-first, matching listProjects().
 */
export function mostRecentWorkspace(summaries: readonly ProjectSummary[]): ProjectSummary | undefined {
  return summaries[0];
}
