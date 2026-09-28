import { UNLIMITED } from "@starpos-crm/shared";
import { exceedsPlanLimits } from "./plan-limits";
import type { LimitsSnapshot, UsageSnapshot } from "./entitlements.service";

const usage = (over: Partial<UsageSnapshot> = {}): UsageSnapshot => ({
  contacts: 100,
  channels: 1,
  automations: 1,
  teamSeats: 1,
  apiRequests: 0,
  ...over,
});

const free: LimitsSnapshot = {
  maxContacts: 500,
  maxChannels: 1,
  maxAutomations: 1,
  maxTeamSeats: 1,
  maxApiRequestsPerMonth: 1000,
};

const enterprise: LimitsSnapshot = {
  maxContacts: UNLIMITED,
  maxChannels: UNLIMITED,
  maxAutomations: UNLIMITED,
  maxTeamSeats: UNLIMITED,
  maxApiRequestsPerMonth: UNLIMITED,
};

describe("exceedsPlanLimits", () => {
  it("is false when everything fits", () => {
    expect(exceedsPlanLimits(usage(), free)).toBe(false);
  });

  it("is false when usage sits exactly on a limit", () => {
    expect(exceedsPlanLimits(usage({ contacts: 500, channels: 1 }), free)).toBe(false);
  });

  it("is true when any one limit is passed", () => {
    expect(exceedsPlanLimits(usage({ channels: 2 }), free)).toBe(true);
    expect(exceedsPlanLimits(usage({ contacts: 501 }), free)).toBe(true);
    expect(exceedsPlanLimits(usage({ automations: 3 }), free)).toBe(true);
    expect(exceedsPlanLimits(usage({ teamSeats: 4 }), free)).toBe(true);
  });

  it("never flags an unlimited plan", () => {
    expect(exceedsPlanLimits(usage({ contacts: 9_000_000, channels: 40, teamSeats: 99 }), enterprise)).toBe(false);
  });

  // The monthly API meter is a rate, not a stored record, so a plan change
  // can't put a tenant "over" it — only the meter itself rejects requests.
  it("ignores API requests already made this month", () => {
    expect(exceedsPlanLimits(usage({ apiRequests: 999_999 }), free)).toBe(false);
  });
});
