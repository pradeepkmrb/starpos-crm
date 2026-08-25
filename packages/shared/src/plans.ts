export const UNLIMITED = -1;

export type PlanCode = "free" | "professional" | "enterprise";

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  priceInPaise: number;
  maxChannels: number;
  maxContacts: number;
  maxAutomations: number;
  maxApiRequestsPerMonth: number;
  maxTeamSeats: number;
  aiAutoReply: boolean;
  advancedAnalytics: boolean;
  prioritySupport: boolean;
}

/**
 * Single source of truth for the 3 pricing tiers, mirrored into the `Plan`
 * DB table by packages/db/prisma/seed.ts. Keep this in sync with that seed —
 * the pricing page (apps/web) and entitlement checks (apps/api) both read
 * from here so they can't drift apart.
 */
export const PLAN_DEFINITIONS: Record<PlanCode, PlanDefinition> = {
  free: {
    code: "free",
    name: "Free Forever",
    priceInPaise: 0,
    maxChannels: 1,
    maxContacts: 500,
    maxAutomations: 1,
    maxApiRequestsPerMonth: 1000,
    maxTeamSeats: 1,
    aiAutoReply: false,
    advancedAnalytics: false,
    prioritySupport: false,
  },
  professional: {
    code: "professional",
    name: "Professional",
    priceInPaise: 59900,
    maxChannels: 3,
    maxContacts: 5000,
    maxAutomations: 10,
    maxApiRequestsPerMonth: 50000,
    maxTeamSeats: 5,
    aiAutoReply: true,
    advancedAnalytics: true,
    prioritySupport: false,
  },
  enterprise: {
    code: "enterprise",
    name: "Enterprise",
    priceInPaise: 99900,
    maxChannels: UNLIMITED,
    maxContacts: UNLIMITED,
    maxAutomations: UNLIMITED,
    maxApiRequestsPerMonth: UNLIMITED,
    maxTeamSeats: UNLIMITED,
    aiAutoReply: true,
    advancedAnalytics: true,
    prioritySupport: true,
  },
};

export function isWithinLimit(limit: number, currentCount: number): boolean {
  if (limit === UNLIMITED) return true;
  return currentCount < limit;
}

export function formatPaiseAsInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}
