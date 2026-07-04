import type { ChecklistItem, ChecklistState, Project, ReviewSummary } from './types.js';

export type ChecklistFilter = 'all' | ChecklistState;

/** Filter checklist items by state for display. Returns items unchanged (never
 *  edits them); 'all' returns the original list. */
export function filterByState(items: ChecklistItem[], filter: ChecklistFilter): ChecklistItem[] {
  return filter === 'all' ? items.slice() : items.filter((i) => i.state === filter);
}

export function computeReviewSummary(project: Project): ReviewSummary {
  let confirmed = 0;
  let notApplicable = 0;
  let needsFollowUp = 0;
  let requiredOutstanding = 0;

  for (const item of project.checklist) {
    if (item.state === 'confirmed') confirmed += 1;
    else if (item.state === 'not-applicable') notApplicable += 1;
    else if (item.state === 'needs-follow-up') needsFollowUp += 1;
    if (item.required && item.state === 'unchecked') requiredOutstanding += 1;
  }

  return {
    totalItems: project.checklist.length,
    confirmed,
    notApplicable,
    needsFollowUp,
    requiredOutstanding,
  };
}

/** A project is considered review-complete when no required item is outstanding
 *  and nothing is flagged for follow-up. Used to gate the report watermark. */
export function isReviewComplete(project: Project): boolean {
  const s = computeReviewSummary(project);
  return s.requiredOutstanding === 0 && s.needsFollowUp === 0;
}
