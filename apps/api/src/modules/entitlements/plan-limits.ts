import { UNLIMITED } from "@starpos-crm/shared";
import type { LimitsSnapshot, UsageSnapshot } from "./entitlements.service";

/**
 * Whether what a tenant already holds exceeds a plan's limits.
 *
 * Moving between plans never deletes anything, so both the expiry downgrade
 * and an agency-set plan need the same answer: is this tenant now over the
 * line? A limit of UNLIMITED (-1) is never exceeded.
 */
export function exceedsPlanLimits(usage: UsageSnapshot, limits: LimitsSnapshot): boolean {
  const over = (used: number, limit: number) => limit !== UNLIMITED && used > limit;
  return (
    over(usage.contacts, limits.maxContacts) ||
    over(usage.channels, limits.maxChannels) ||
    over(usage.automations, limits.maxAutomations) ||
    over(usage.teamSeats, limits.maxTeamSeats)
  );
}
