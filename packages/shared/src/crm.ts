/** Lead pipeline stages, ordered from first touch to closed. */
export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Fixed lead columns a Meta form question can be mapped onto. */
export const LEAD_STANDARD_TARGETS = ["name", "phone", "email", "company", "notes"] as const;
export type LeadStandardTarget = (typeof LEAD_STANDARD_TARGETS)[number];

export const CUSTOM_TARGET_PREFIX = "custom:";
export const IGNORE_TARGET = "ignore";
