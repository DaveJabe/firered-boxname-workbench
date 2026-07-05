// TYPE-ONLY design contract for a future REAL generator adapter — distinct
// from core/generatorAdapter.ts's MockGeneratorAdapter, which only ever
// returns fixed placeholder text for the built-in mock action templates.
// Nothing in this file is implemented, called, imported by the running
// app, or wired up anywhere — it exists purely to document where a future
// real-generator integration would plug in. See
// docs/generator-adapter-contract.md for the full explanation. Adding real
// generator invocation itself is explicitly out of scope for this branch
// (and every branch before it).

import type { GameTarget } from './types.js';

export interface RealGeneratorAdapterInput {
  /** Text produced by fillScriptFromSchema — handed to a future adapter unmodified. */
  filledScriptText: string;
  target: GameTarget;
  /** The stable action concept (CuratedActionSchema.actionKey), if the schema has one. */
  actionKey?: string;
  schemaId: string;
  schemaLabel: string;
}

export interface RealGeneratorAdapterProvenance {
  invokedAt: string;
  /** Whatever the user's own local generator setup reports about itself — never inferred or guessed by this app. */
  generatorDescription?: string;
  target: GameTarget;
}

export interface RealGeneratorAdapterOutput {
  /** Exactly what the generator printed, unparsed — fed into the existing parseGeneratorOutput() pipeline, same as a manual paste-back. */
  rawGeneratorOutput: string;
  stderr?: string;
  warnings?: readonly string[];
  provenance: RealGeneratorAdapterProvenance;
}

/**
 * NOT IMPLEMENTED ANYWHERE. A future real generator adapter would satisfy
 * this shape: take a RealGeneratorAdapterInput, run the user's own external
 * generator — explicitly, only when the user triggers it, never
 * automatically — and return a RealGeneratorAdapterOutput whose
 * rawGeneratorOutput feeds the existing output parser unchanged. This
 * interface exists only to document the plug-in point; do not implement or
 * wire it up in this branch.
 */
export interface RealGeneratorAdapter {
  run(input: RealGeneratorAdapterInput): Promise<RealGeneratorAdapterOutput>;
}
