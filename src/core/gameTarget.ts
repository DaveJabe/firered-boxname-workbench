// Pure helpers for the game-target compatibility model — display, matching,
// and stable sorting only. Types (TargetGame/TargetLanguage/TargetRevision/
// GameTarget) live in core/types.ts, alongside the rest of the data model.
//
// SAFETY CONTRACT: "compatible" here means "the recorded game/language/
// revision metadata matches," nothing more. This module never reads a ROM
// or save file, never invokes a generator, and never verifies anything
// against real game data — it only compares small enum values a human
// typed in. "Unknown" is a first-class, valid value everywhere: existing
// scripts/schemas/packs that predate this model migrate to it.

import type { GameTarget, TargetGame, TargetLanguage, TargetRevision } from './types.js';

export const TARGET_GAMES: readonly TargetGame[] = ['FireRed', 'LeafGreen', 'Unknown'];
export const TARGET_LANGUAGES: readonly TargetLanguage[] = [
  'English',
  'Japanese',
  'Spanish',
  'French',
  'German',
  'Italian',
  'Korean',
  'Unknown',
];
export const TARGET_REVISIONS: readonly TargetRevision[] = ['1.0', '1.1', 'Unknown'];

/** The sentinel "nothing recorded yet" target — existing data migrates to this. */
export const UNKNOWN_TARGET: GameTarget = { game: 'Unknown', language: 'Unknown', revision: 'Unknown' };

/** True when game, language, and revision are all 'Unknown' — nothing meaningful is known about this target. */
export function isUnknownTarget(target: GameTarget): boolean {
  return target.game === 'Unknown' && target.language === 'Unknown' && target.revision === 'Unknown';
}

/** Human-readable label, e.g. "FireRed / English / 1.0", or "Unknown/Mixed" when nothing is known. */
export function targetLabel(target: GameTarget): string {
  if (isUnknownTarget(target)) return 'Unknown/Mixed';
  return `${target.game} / ${target.language} / ${target.revision}`;
}

/** True when game, language, and revision all match exactly. Region/notes are documentation only, never compared. */
export function isExactTargetMatch(a: GameTarget, b: GameTarget): boolean {
  return a.game === b.game && a.language === b.language && a.revision === b.revision;
}

export type TargetCompatibility = 'exact' | 'unknown' | 'incompatible';

/**
 * Compatibility between a candidate target (a script's or schema's own
 * target) and a selected target (e.g. Run Script's target selectors).
 * `unknown` means either side is the fully-unknown/mixed target — treated
 * as "might work, review before relying on it," never a silent match.
 * `incompatible` means both sides are fully known and they differ.
 */
export function checkTargetCompatibility(candidate: GameTarget, selected: GameTarget): TargetCompatibility {
  if (isUnknownTarget(candidate) || isUnknownTarget(selected)) return 'unknown';
  return isExactTargetMatch(candidate, selected) ? 'exact' : 'incompatible';
}

const GAME_ORDER: readonly TargetGame[] = ['FireRed', 'LeafGreen', 'Unknown'];
const LANGUAGE_ORDER: readonly TargetLanguage[] = [...TARGET_LANGUAGES];
const REVISION_ORDER: readonly TargetRevision[] = ['1.0', '1.1', 'Unknown'];

function orderIndex<T>(order: readonly T[], value: T): number {
  const i = order.indexOf(value);
  return i === -1 ? order.length : i;
}

/** Stable comparator: game, then language, then revision, in the declared enum order (Unknown always sorts last). */
export function compareTargets(a: GameTarget, b: GameTarget): number {
  return (
    orderIndex(GAME_ORDER, a.game) - orderIndex(GAME_ORDER, b.game) ||
    orderIndex(LANGUAGE_ORDER, a.language) - orderIndex(LANGUAGE_ORDER, b.language) ||
    orderIndex(REVISION_ORDER, a.revision) - orderIndex(REVISION_ORDER, b.revision)
  );
}

/** Sort targets into a stable, predictable order (game, then language, then revision; Unknown last). */
export function sortTargets(targets: readonly GameTarget[]): GameTarget[] {
  return targets.slice().sort(compareTargets);
}
