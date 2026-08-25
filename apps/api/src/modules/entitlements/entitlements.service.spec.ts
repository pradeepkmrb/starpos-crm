import { ForbiddenException } from "@nestjs/common";
import { UNLIMITED } from "@digitel/shared";
import { EntitlementsService, currentPeriodMonth } from "./entitlements.service";
import type { PrismaService } from "../../prisma/prisma.service";

function buildService(overrides: {
  plan?: Partial<Record<string, number | string>>;
  contactCount?: number;
  apiRequestCount?: number;
}) {
  const plan = {
    name: "Professional",
    maxContacts: 5000,
    maxChannels: 3,
    maxAutomations: 10,
    maxTeamSeats: 5,
    maxApiRequestsPerMonth: 50000,
    ...overrides.plan,
  };

  const upsertedRows: { requestCount: number }[] = [];
  let apiCount = overrides.apiRequestCount ?? 0;

  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "t1", plan }) },
    contact: { count: jest.fn().mockResolvedValue(overrides.contactCount ?? 0) },
    whatsappChannel: { count: jest.fn().mockResolvedValue(0) },
    automationWorkflow: { count: jest.fn().mockResolvedValue(0) },
    tenantMembership: { count: jest.fn().mockResolvedValue(0) },
    tenantApiUsage: {
      findUnique: jest.fn().mockResolvedValue({ requestCount: apiCount }),
      upsert: jest.fn().mockImplementation(() => {
        apiCount += 1;
        const row = { requestCount: apiCount };
        upsertedRows.push(row);
        return Promise.resolve(row);
      }),
    },
  } as unknown as PrismaService;

  return { service: new EntitlementsService(prisma), prisma, upsertedRows };
}

describe("EntitlementsService", () => {
  describe("assertCanAdd", () => {
    it("allows adding when under the limit", async () => {
      const { service } = buildService({ plan: { maxContacts: 500 }, contactCount: 499 });
      await expect(service.assertCanAdd("t1", "contacts")).resolves.toBeUndefined();
    });

    it("rejects the record that would exceed the limit", async () => {
      const { service } = buildService({ plan: { maxContacts: 500 }, contactCount: 500 });
      await expect(service.assertCanAdd("t1", "contacts")).rejects.toThrow(ForbiddenException);
    });

    it("rejects a bulk add that would cross the limit even though one would fit", async () => {
      const { service } = buildService({ plan: { maxContacts: 500 }, contactCount: 495 });
      await expect(service.assertCanAdd("t1", "contacts", 10)).rejects.toThrow(ForbiddenException);
    });

    it("allows a bulk add that lands exactly on the limit", async () => {
      const { service } = buildService({ plan: { maxContacts: 500 }, contactCount: 495 });
      await expect(service.assertCanAdd("t1", "contacts", 5)).resolves.toBeUndefined();
    });

    it("never rejects when the limit is unlimited", async () => {
      const { service } = buildService({ plan: { maxContacts: UNLIMITED }, contactCount: 999999 });
      await expect(service.assertCanAdd("t1", "contacts", 10000)).resolves.toBeUndefined();
    });

    it("names the plan and limit in the error so the UI can prompt an upgrade", async () => {
      const { service } = buildService({ plan: { maxContacts: 500 }, contactCount: 500 });
      await expect(service.assertCanAdd("t1", "contacts")).rejects.toThrow(/Professional plan allows up to 500/);
    });
  });

  describe("checkAndIncrementApiUsage", () => {
    it("increments and allows while under quota", async () => {
      const { service, upsertedRows } = buildService({
        plan: { maxApiRequestsPerMonth: 3 },
        apiRequestCount: 0,
      });
      await expect(service.checkAndIncrementApiUsage("t1")).resolves.toBeUndefined();
      expect(upsertedRows).toHaveLength(1);
    });

    it("allows exactly up to the quota, then rejects", async () => {
      const { service } = buildService({ plan: { maxApiRequestsPerMonth: 2 }, apiRequestCount: 0 });
      await expect(service.checkAndIncrementApiUsage("t1")).resolves.toBeUndefined(); // 1st
      await expect(service.checkAndIncrementApiUsage("t1")).resolves.toBeUndefined(); // 2nd
      await expect(service.checkAndIncrementApiUsage("t1")).rejects.toThrow(ForbiddenException); // 3rd
    });

    it("never rejects on an unlimited plan", async () => {
      const { service } = buildService({
        plan: { maxApiRequestsPerMonth: UNLIMITED },
        apiRequestCount: 1_000_000,
      });
      await expect(service.checkAndIncrementApiUsage("t1")).resolves.toBeUndefined();
    });
  });

  describe("currentPeriodMonth", () => {
    it("formats as YYYY-MM with a zero-padded month", () => {
      expect(currentPeriodMonth(new Date(Date.UTC(2026, 0, 15)))).toBe("2026-01");
      expect(currentPeriodMonth(new Date(Date.UTC(2026, 11, 1)))).toBe("2026-12");
    });

    it("rolls over to a new key at the month boundary", () => {
      const lastMoment = currentPeriodMonth(new Date(Date.UTC(2026, 0, 31, 23, 59, 59)));
      const firstMoment = currentPeriodMonth(new Date(Date.UTC(2026, 1, 1, 0, 0, 0)));
      expect(lastMoment).toBe("2026-01");
      expect(firstMoment).toBe("2026-02");
    });
  });
});
