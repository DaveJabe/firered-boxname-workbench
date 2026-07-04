// Pure grouping helpers for validation findings (display organization only).
// These never inspect or alter text; they only bucket existing Finding objects.

import type { Finding, Severity, TargetKind } from './types.js';

export const SEVERITY_ORDER: readonly Severity[] = ['error', 'warning', 'info'];
export const TARGET_ORDER: readonly TargetKind[] = ['metadata', 'checklist', 'note', 'importedBlock'];

export const TARGET_LABELS: Record<TargetKind, string> = {
  metadata: 'Metadata',
  checklist: 'Checklist',
  note: 'Notes',
  importedBlock: 'Imported text',
};

export interface FindingGroup<K extends string> {
  key: K;
  findings: Finding[];
}

/** Group findings by severity, in error → warning → info order, omitting empty buckets. */
export function groupBySeverity(findings: Finding[]): FindingGroup<Severity>[] {
  const buckets: Record<Severity, Finding[]> = { error: [], warning: [], info: [] };
  for (const f of findings) buckets[f.severity].push(f);
  return SEVERITY_ORDER.filter((s) => buckets[s].length > 0).map((s) => ({ key: s, findings: buckets[s] }));
}

/** Group findings by target kind, in a stable order, omitting empty buckets. */
export function groupByTarget(findings: Finding[]): FindingGroup<TargetKind>[] {
  const map = new Map<TargetKind, Finding[]>();
  for (const f of findings) {
    const arr = map.get(f.target.kind) ?? [];
    arr.push(f);
    map.set(f.target.kind, arr);
  }
  return TARGET_ORDER.filter((k) => map.has(k)).map((k) => ({ key: k, findings: map.get(k)! }));
}
