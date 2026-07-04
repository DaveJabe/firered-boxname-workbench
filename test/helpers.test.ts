import { describe, it, expect } from 'vitest';
import type { ChecklistItem, Finding } from '../src/core/types.js';
import { numberLines } from '../src/core/normalize.js';
import { filterByState } from '../src/core/review.js';
import { groupBySeverity, groupByTarget } from '../src/core/findings.js';

describe('numberLines', () => {
  it('numbers lines from 1 and preserves text verbatim', () => {
    const text = 'alpha\n  beta \n\tgamma';
    const out = numberLines(text);
    expect(out.map((l) => l.n)).toEqual([1, 2, 3]);
    expect(out.map((l) => l.text).join('\n')).toBe(text);
  });
  it('treats an empty string as a single empty line', () => {
    expect(numberLines('')).toEqual([{ n: 1, text: '' }]);
  });
  it('counts a trailing newline as an extra empty line', () => {
    expect(numberLines('a\n').map((l) => l.text)).toEqual(['a', '']);
  });
});

function item(stateVal: ChecklistItem['state'], id: string): ChecklistItem {
  return { id, prompt: 'p', category: 'c', state: stateVal, note: '', required: false };
}

describe('filterByState', () => {
  const items = [item('unchecked', 'a'), item('confirmed', 'b'), item('confirmed', 'c'), item('needs-follow-up', 'd')];
  it('returns all when the filter is "all"', () => {
    expect(filterByState(items, 'all')).toHaveLength(4);
  });
  it('filters by a specific state', () => {
    expect(filterByState(items, 'confirmed').map((i) => i.id)).toEqual(['b', 'c']);
  });
  it('does not mutate the input', () => {
    const copy = items.slice();
    filterByState(items, 'confirmed');
    expect(items).toEqual(copy);
  });
});

function finding(severity: Finding['severity'], kind: Finding['target']['kind']): Finding {
  return { id: `${severity}-${kind}`, rule: 'line-length', severity, target: { kind }, message: 'm', acknowledged: false };
}

describe('finding grouping', () => {
  const fs = [finding('info', 'note'), finding('error', 'metadata'), finding('warning', 'checklist'), finding('error', 'checklist')];
  it('groups by severity in error → warning → info order', () => {
    const g = groupBySeverity(fs);
    expect(g.map((x) => x.key)).toEqual(['error', 'warning', 'info']);
    expect(g[0].findings).toHaveLength(2);
  });
  it('omits empty severity buckets', () => {
    expect(groupBySeverity([finding('warning', 'note')]).map((x) => x.key)).toEqual(['warning']);
  });
  it('groups by target in a stable order', () => {
    expect(groupByTarget(fs).map((x) => x.key)).toEqual(['metadata', 'checklist', 'note']);
  });
});
