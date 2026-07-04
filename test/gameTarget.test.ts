import { describe, it, expect } from 'vitest';
import type { GameTarget } from '../src/core/types.js';
import {
  UNKNOWN_TARGET,
  targetLabel,
  isExactTargetMatch,
  isUnknownTarget,
  checkTargetCompatibility,
  compareTargets,
  sortTargets,
} from '../src/core/gameTarget.js';

function target(over: Partial<GameTarget> = {}): GameTarget {
  return { game: 'FireRed', language: 'English', revision: '1.0', ...over };
}

describe('targetLabel', () => {
  it('joins game/language/revision with slashes', () => {
    expect(targetLabel(target())).toBe('FireRed / English / 1.0');
  });

  it('shows "Unknown/Mixed" for the fully-unknown target', () => {
    expect(targetLabel(UNKNOWN_TARGET)).toBe('Unknown/Mixed');
  });

  it('still joins fields plainly when only some are Unknown (not the fully-unknown sentinel)', () => {
    expect(targetLabel(target({ revision: 'Unknown' }))).toBe('FireRed / English / Unknown');
  });
});

describe('isUnknownTarget', () => {
  it('is true only when game, language, and revision are all Unknown', () => {
    expect(isUnknownTarget(UNKNOWN_TARGET)).toBe(true);
    expect(isUnknownTarget({ game: 'Unknown', language: 'Unknown', revision: 'Unknown' })).toBe(true);
  });

  it('is false when only some fields are Unknown', () => {
    expect(isUnknownTarget(target({ revision: 'Unknown' }))).toBe(false);
    expect(isUnknownTarget({ game: 'Unknown', language: 'English', revision: 'Unknown' })).toBe(false);
  });

  it('is false for a fully-known target', () => {
    expect(isUnknownTarget(target())).toBe(false);
  });
});

describe('isExactTargetMatch', () => {
  it('is true when game, language, and revision all match', () => {
    expect(isExactTargetMatch(target(), target())).toBe(true);
  });

  it('is false when any single field differs', () => {
    expect(isExactTargetMatch(target(), target({ game: 'LeafGreen' }))).toBe(false);
    expect(isExactTargetMatch(target(), target({ language: 'Japanese' }))).toBe(false);
    expect(isExactTargetMatch(target(), target({ revision: '1.1' }))).toBe(false);
  });

  it('ignores regionLabel/notes — only game/language/revision are compared', () => {
    expect(isExactTargetMatch(target({ regionLabel: 'PAL' }), target({ regionLabel: 'NTSC' }))).toBe(true);
    expect(isExactTargetMatch(target({ notes: 'a' }), target({ notes: 'b' }))).toBe(true);
  });
});

describe('checkTargetCompatibility (unknown/mixed behavior)', () => {
  it('is "exact" when both targets are fully known and match', () => {
    expect(checkTargetCompatibility(target(), target())).toBe('exact');
  });

  it('is "incompatible" when both targets are fully known and differ', () => {
    expect(checkTargetCompatibility(target(), target({ revision: '1.1' }))).toBe('incompatible');
  });

  it('is "unknown" when the candidate target is Unknown/Mixed, even against a fully-known selected target', () => {
    expect(checkTargetCompatibility(UNKNOWN_TARGET, target())).toBe('unknown');
  });

  it('is "unknown" when the selected target is Unknown/Mixed, even against a fully-known candidate', () => {
    expect(checkTargetCompatibility(target(), UNKNOWN_TARGET)).toBe('unknown');
  });

  it('is "unknown" (never "exact") when both sides are the same Unknown/Mixed target — Unknown never counts as a confident match', () => {
    expect(checkTargetCompatibility(UNKNOWN_TARGET, UNKNOWN_TARGET)).toBe('unknown');
  });
});

describe('compareTargets / sortTargets', () => {
  it('sorts by game, then language, then revision, in the declared enum order', () => {
    const leafGreen = target({ game: 'LeafGreen' });
    const fireRed = target({ game: 'FireRed' });
    expect(sortTargets([leafGreen, fireRed])).toEqual([fireRed, leafGreen]);
  });

  it('sorts Unknown last within each field', () => {
    const known = target({ revision: '1.0' });
    const unknownRevision = target({ revision: 'Unknown' });
    expect(sortTargets([unknownRevision, known])).toEqual([known, unknownRevision]);
  });

  it('is a stable, deterministic comparator usable directly with Array.sort', () => {
    const a = target({ language: 'English' });
    const b = target({ language: 'Japanese' });
    expect(compareTargets(a, b)).toBeLessThan(0);
    expect(compareTargets(b, a)).toBeGreaterThan(0);
    expect(compareTargets(a, a)).toBe(0);
  });
});
