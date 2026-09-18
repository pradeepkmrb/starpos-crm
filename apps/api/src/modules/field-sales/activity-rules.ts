import {
  CLOSED_LEAD_STATUSES,
  LEAD_STATUSES,
  VISIT_CHECK_IN_RADIUS_METERS,
  distanceMeters,
  type LatLng,
  type ActivityStatus,
  type ActivityType,
  type LeadStatus,
} from "@digitel/shared";

/**
 * The new value for Lead.closedAt after a status change: stamped on entering
 * won/lost, cleared on reopening, and `undefined` (leave as is) otherwise —
 * so moving between won and lost keeps the original close date.
 */
export function closedAtForStatusChange(
  previous: LeadStatus,
  next: LeadStatus,
  now = new Date(),
): Date | null | undefined {
  const wasClosed = CLOSED_LEAD_STATUSES.includes(previous);
  const isClosed = CLOSED_LEAD_STATUSES.includes(next);
  if (isClosed && !wasClosed) return now;
  if (!isClosed && wasClosed) return null;
  return undefined;
}

/**
 * The stage an activity implies, so reps don't have to update both: a
 * completed call, visit or demo means the lead has been contacted, and
 * booking a demo means a demo is scheduled. Only ever moves a lead forward,
 * and never touches a closed lead. Returns null when the stage should stay.
 */
export function stageImpliedByActivity(
  current: LeadStatus,
  activity: { type: ActivityType; status: ActivityStatus },
): LeadStatus | null {
  if (CLOSED_LEAD_STATUSES.includes(current)) return null;

  let implied: LeadStatus | null = null;
  if (activity.type === "demo" && activity.status === "scheduled") implied = "demo_scheduled";
  else if (activity.status === "completed" && ["call", "visit", "demo"].includes(activity.type)) {
    implied = "contacted";
  }
  if (!implied) return null;
  return LEAD_STATUSES.indexOf(implied) > LEAD_STATUSES.indexOf(current) ? implied : null;
}

/**
 * completedAt that goes with a status: completing without a time means "just
 * now"; anything other than completed has no completion time.
 */
export function completedAtForStatus(
  status: ActivityStatus,
  completedAt: Date | null | undefined,
  now = new Date(),
): Date | null {
  if (status !== "completed") return null;
  return completedAt ?? now;
}

export type CheckInDecision =
  | { allowed: true; distanceMeters: number | null; pinLead: boolean }
  | { allowed: false; distanceMeters: number };

/**
 * Whether a rep standing at `here` may check in to a visit at a lead. A lead
 * with no location yet can't be checked against, so the first check-in pins
 * it; after that the rep has to be within the radius of that pin.
 */
export function checkInDecision(
  lead: { latitude: number | null; longitude: number | null },
  here: LatLng,
  radiusMeters = VISIT_CHECK_IN_RADIUS_METERS,
): CheckInDecision {
  if (lead.latitude === null || lead.longitude === null) {
    return { allowed: true, distanceMeters: null, pinLead: true };
  }
  const distance = Math.round(distanceMeters({ latitude: lead.latitude, longitude: lead.longitude }, here));
  return distance <= radiusMeters
    ? { allowed: true, distanceMeters: distance, pinLead: false }
    : { allowed: false, distanceMeters: distance };
}
