import { WorkItem, WorkType } from '../api/work';

/**
 * Standard list of status keys considered closed when terminal flags are absent.
 */
const FALLBACK_CLOSED_STATUSES = new Set([
  'completed',
  'delivered',
  'done',
  'won',
  'lost',
  'cancelled',
  'canceled',
  'closed',
  'rejected',
  'approved',
  'published',
]);

/**
 * Evaluates whether a work item or subtask is considered closed/completed.
 * 
 * 1. If the WorkType defines statuses, check if the matching status has isTerminalWon or isTerminalLost.
 * 2. Fall back to checking if the status key/label matches known terminal statuses.
 */
export function isWorkItemClosed(
  item: Partial<WorkItem> | { status?: string } | undefined | null,
  workType?: WorkType | null
): boolean {
  if (!item) return false;
  const rawStatus = String(item.status || '').toLowerCase().trim();
  if (!rawStatus) return false;

  // 1. Check WorkType status definitions if available
  const statusObj = workType?.statuses?.find(
    s => s.key.toLowerCase() === rawStatus || s.label.toLowerCase() === rawStatus
  );

  if (statusObj) {
    if (statusObj.isTerminalWon || statusObj.isTerminalLost) return true;
  }

  // 2. Fallback check against known terminal/closed statuses
  return FALLBACK_CLOSED_STATUSES.has(rawStatus);
}

/**
 * Evaluates whether a work item is open (not closed).
 */
export function isWorkItemOpen(
  item: Partial<WorkItem> | { status?: string } | undefined | null,
  workType?: WorkType | null
): boolean {
  return !isWorkItemClosed(item, workType);
}
