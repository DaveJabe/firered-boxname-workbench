// Pure navigation/workspace-labeling helpers — no DOM, directly unit-testable.
// This module only decides which screens exist, how the sidebar orders them,
// and which screen a workspace should open to; it holds no workspace data.

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
  'start-here': 'Start Here',
  actions: 'Action Builder',
  scripts: 'Script Library',
  outputs: 'Saved Outputs',
  validation: 'Validation',
  report: 'Report',
  settings: 'Settings',
  checklist: 'Checklist',
  notes: 'Notes',
};

/**
 * Sidebar tab order for an open workspace, most-used first: the primary
 * workbench loop (Start Here, Action Builder, Script Library, Saved
 * Outputs, Validation, Report) before the secondary/administrative screens
 * (Settings, Checklist, Notes).
 */
export const SIDEBAR_SCREENS: readonly Screen[] = [
  'start-here',
  'actions',
  'scripts',
  'outputs',
  'validation',
  'report',
  'settings',
  'checklist',
  'notes',
];

/** How a workspace came to be open, for choosing its default screen. */
export type WorkspaceOrigin = 'created' | 'demo' | 'import-script' | 'opened';

/**
 * Which screen a workspace should open to, based on how the user got there.
 * Demo workspaces land on Start Here (orientation); a workspace created via
 * "Import a script" lands directly in the Script Library; everything else —
 * a freshly created workspace, or opening an existing one — lands in the
 * Action Builder, the app's primary hub.
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
