// Toy/demo curated-schema presets only (script-pack import phase). Kept
// deliberately inert: none of these are wired to match any real script —
// they exist only to prove the "Suggested schema available" UI path works,
// with harmless placeholder content. No real item IDs, move IDs, offsets,
// addresses, opcodes, payload bytes, or generated output.

import type { CuratedSchemaPreset } from '../core/schemaPresets.js';
import { UNKNOWN_TARGET } from '../core/gameTarget.js';

export const SCHEMA_PRESETS: readonly CuratedSchemaPreset[] = [
  {
    id: 'toy-demo-preset',
    label: 'Toy demo preset (matches files named like "toy-example*.txt")',
    matchFilenamePattern: '^toy-example',
    schema: {
      id: 'toy-demo-schema',
      label: 'Toy demo schema',
      description: 'A demo-only preset that shows how schema suggestions work. Not tied to any real script or generator.',
      target: UNKNOWN_TARGET,
      supportedRevisionLabels: [],
      fields: [
        {
          key: 'exampleValue',
          label: 'Example value',
          type: 'text',
          required: false,
          variableName: 'exampleValue',
          helpText: 'Placeholder field from the demo preset — review and edit before relying on it.',
        },
      ],
    },
  },
];
