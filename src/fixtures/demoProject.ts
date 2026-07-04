// Stable, harmless demo project fixture for manual UI testing and screenshots.
// The content is placeholder text only — no game strings or operational values.
// The JSON file is the single source of truth; it is validated on load like any
// other imported project.

import demo from './demo-project.json';

/** The demo project serialized as JSON, ready to pass through importProjectJson. */
export const DEMO_PROJECT_JSON: string = JSON.stringify(demo);
