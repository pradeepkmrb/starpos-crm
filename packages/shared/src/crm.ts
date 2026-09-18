/** Lead pipeline stages, ordered from first touch to closed. */
export const LEAD_STATUSES = [
  "new",
  "contacted",
  "interested",
  "qualified",
  "demo_scheduled",
  "proposal",
  "won",
  "lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  interested: "Interested",
  qualified: "Qualified",
  demo_scheduled: "Demo scheduled",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

/** Stages a deal can't move on from; reaching one stamps Lead.closedAt. */
export const CLOSED_LEAD_STATUSES: readonly LeadStatus[] = ["won", "lost"];

/**
 * Everything a rep does with a lead, on one timeline. A follow-up is simply
 * an activity scheduled for later; completing it records what happened.
 */
export const ACTIVITY_TYPES = ["call", "visit", "demo", "follow_up", "note"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  call: "Call",
  visit: "Visit",
  demo: "Demo",
  follow_up: "Follow-up",
  note: "Note",
};

export const ACTIVITY_STATUSES = ["scheduled", "completed", "cancelled"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/**
 * Suggested results for a call, stored in Activity.outcome. The column stays
 * free text so other activity types can record their own.
 */
export const CALL_OUTCOMES = {
  connected: "Connected",
  no_answer: "No answer",
  busy: "Busy",
  switched_off: "Switched off",
  wrong_number: "Wrong number",
  interested: "Interested",
  not_interested: "Not interested",
  call_back: "Call back",
  demo_required: "Demo required",
  price_discussion: "Price discussion",
  negotiation: "Negotiation",
} as const;
export type CallOutcome = keyof typeof CALL_OUTCOMES;

/** A known outcome's label, or free text made readable ("demo_given" → "demo given"). */
export function outcomeLabel(outcome: string): string {
  return (CALL_OUTCOMES as Record<string, string>)[outcome] ?? outcome.replace(/_/g, " ");
}

/** Fixed lead columns a Meta form question can be mapped onto. */
export const LEAD_STANDARD_TARGETS = ["name", "phone", "email", "company", "notes"] as const;
export type LeadStandardTarget = (typeof LEAD_STANDARD_TARGETS)[number];

export const CUSTOM_TARGET_PREFIX = "custom:";
export const IGNORE_TARGET = "ignore";
