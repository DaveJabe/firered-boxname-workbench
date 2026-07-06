// Manual "generator input bundle" — a single copy/export helper that
// gathers everything a human needs to run their own external E-Sh4rk
// generator by hand: the filled script text, the exit directive name, the
// resolved companion text (if any), and a few identifying/provenance
// fields. Deliberately excludes generated box output: this bundle is INPUT
// prepared BEFORE a generator ever runs, never a record of what one
// produced — see docs/scope.md and docs/attribution.md. Building or copying
// a bundle is always an explicit user action (a button click); nothing here
// runs automatically or invokes a generator.

import type { ExitCompanionResolution, GameTarget } from './types.js';

/** See docs/attribution.md — repeated here so a copied/exported bundle carries the same disclaimer wherever it ends up. */
export const GENERATOR_INPUT_BUNDLE_ATTRIBUTION_NOTE =
  "Prepared by FireRed BoxName Workbench, an independent helper tool. Not affiliated with, endorsed by, or maintained by E-Sh4rk. E-Sh4rk's own scripts and CodeGenerator remain the source of truth — run this input through your own copy of the generator and treat its output as authoritative.";

export interface GeneratorInputBundle {
  generatedAt: string;
  actionKey?: string;
  actionLabel?: string;
  schemaId: string;
  schemaLabel: string;
  scriptId?: string;
  scriptFilename?: string;
  target: GameTarget;
  filledScriptText: string;
  exitName?: string;
  companionFilename?: string;
  companionRawText?: string;
  attributionNote: string;
}

export interface BuildGeneratorInputBundleInput {
  generatedAt: string;
  actionKey?: string;
  actionLabel?: string;
  schemaId: string;
  schemaLabel: string;
  scriptId?: string;
  scriptFilename?: string;
  target: GameTarget;
  filledScriptText: string;
  /** From core/exitCompanion.ts's resolveExitCompanionForScript, if the script has an exit directive. */
  exitResolution?: ExitCompanionResolution;
}

/** Assembles a generator input bundle. Never includes generated box output — see this module's header comment. */
export function buildGeneratorInputBundle(input: BuildGeneratorInputBundleInput): GeneratorInputBundle {
  const bundle: GeneratorInputBundle = {
    generatedAt: input.generatedAt,
    schemaId: input.schemaId,
    schemaLabel: input.schemaLabel,
    target: input.target,
    filledScriptText: input.filledScriptText,
    attributionNote: GENERATOR_INPUT_BUNDLE_ATTRIBUTION_NOTE,
  };
  if (input.actionKey) bundle.actionKey = input.actionKey;
  if (input.actionLabel) bundle.actionLabel = input.actionLabel;
  if (input.scriptId) bundle.scriptId = input.scriptId;
  if (input.scriptFilename) bundle.scriptFilename = input.scriptFilename;
  if (input.exitResolution?.exitName) bundle.exitName = input.exitResolution.exitName;
  if (input.exitResolution?.status === 'resolved') {
    if (input.exitResolution.companionFilename) bundle.companionFilename = input.exitResolution.companionFilename;
    if (input.exitResolution.companionRawText !== undefined) bundle.companionRawText = input.exitResolution.companionRawText;
  }
  return bundle;
}

/** Human-readable plain-text rendering of a bundle, for copy/export/paste elsewhere. */
export function formatGeneratorInputBundleText(bundle: GeneratorInputBundle): string {
  const lines: string[] = [];
  lines.push('=== FireRed BoxName Workbench — Generator Input Bundle ===');
  lines.push(`Generated at: ${bundle.generatedAt}`);
  if (bundle.actionLabel) lines.push(`Action: ${bundle.actionLabel}${bundle.actionKey ? ` (${bundle.actionKey})` : ''}`);
  lines.push(`Schema: ${bundle.schemaLabel} (${bundle.schemaId})`);
  if (bundle.scriptFilename) lines.push(`Script: ${bundle.scriptFilename}`);
  lines.push(`Target: ${bundle.target.game} / ${bundle.target.language} / ${bundle.target.revision}`);
  lines.push('');
  lines.push('--- Filled script text ---');
  lines.push(bundle.filledScriptText);
  if (bundle.exitName) {
    lines.push('');
    lines.push('--- Exit directive ---');
    lines.push(bundle.exitName);
  }
  if (bundle.companionRawText !== undefined) {
    lines.push('');
    lines.push(`--- Exit companion text (from ${bundle.companionFilename ?? 'unknown file'}) ---`);
    lines.push(bundle.companionRawText);
  }
  lines.push('');
  lines.push('--- Attribution ---');
  lines.push(bundle.attributionNote);
  return lines.join('\n');
}
