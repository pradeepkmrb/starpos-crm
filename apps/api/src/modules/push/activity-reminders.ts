import { ACTIVITY_TYPE_LABELS, type ActivityType } from "@digitel/shared";

/** How far ahead of a scheduled activity its reminder goes out. */
export const REMINDER_LEAD_MINUTES = 15;
/**
 * Activities up to this long overdue still get a (late) reminder — covers a
 * worker that was down for a few minutes, without paging reps about old work.
 */
export const REMINDER_GRACE_MINUTES = 10;
export const REMINDER_POLL_MS = 60_000;

export function reminderWindow(now: Date) {
  return {
    from: new Date(now.getTime() - REMINDER_GRACE_MINUTES * 60_000),
    to: new Date(now.getTime() + REMINDER_LEAD_MINUTES * 60_000),
  };
}

/** "Visit in 12 min" / "Follow-up now" / "Call was due 4 min ago". */
export function reminderTitle(type: ActivityType, scheduledAt: Date, now: Date): string {
  const label = ACTIVITY_TYPE_LABELS[type];
  const minutes = Math.round((scheduledAt.getTime() - now.getTime()) / 60_000);
  if (minutes >= 1) return `${label} in ${minutes} min`;
  if (minutes <= -1) return `${label} was due ${-minutes} min ago`;
  return `${label} now`;
}
