import { BadRequestException, ConflictException } from "@nestjs/common";
import { FULL_ACCESS } from "@starpos-crm/shared";
import { AttendanceService } from "./attendance.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { TenantRequestContext } from "../../common/request-context";

const ctx: TenantRequestContext = {
  userId: "u1",
  tenantId: "t1",
  role: "agent",
  permissions: FULL_ACCESS,
  dataScope: "own",
};

function build(open: unknown = null, rows: unknown[] = []) {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ timezone: "Asia/Kolkata" }) },
    attendance: {
      findFirst: jest.fn().mockResolvedValue(open),
      findMany: jest.fn().mockResolvedValue(rows),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  return { service: new AttendanceService(prisma as unknown as PrismaService), prisma };
}

describe("AttendanceService", () => {
  it("clocks in with the phone's location", async () => {
    const { service, prisma } = build();
    await service.clockIn(ctx, { latitude: 13.08, longitude: 80.27 });
    expect(prisma.attendance.create).toHaveBeenCalledWith({
      data: { tenantId: "t1", userId: "u1", clockInLat: 13.08, clockInLng: 80.27 },
    });
  });

  it("refuses a second clock-in while one is open", async () => {
    const { service } = build({ id: "a1" });
    await expect(service.clockIn(ctx, {})).rejects.toBeInstanceOf(ConflictException);
  });

  it("closes the open session on clock-out", async () => {
    const { service, prisma } = build({ id: "a1" });
    await service.clockOut(ctx, {});
    expect(prisma.attendance.update.mock.calls[0][0].where).toEqual({ id: "a1" });
    expect(prisma.attendance.update.mock.calls[0][0].data.clockOutAt).toBeInstanceOf(Date);
  });

  it("refuses to clock out when not clocked in", async () => {
    const { service } = build(null);
    await expect(service.clockOut(ctx, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it("totals today's sessions, counting an open one up to now", async () => {
    const hourAgo = new Date(Date.now() - 3600_000);
    const { service } = build(null, [
      { id: "a1", clockInAt: new Date(Date.now() - 5 * 3600_000), clockOutAt: new Date(Date.now() - 3 * 3600_000) },
      { id: "a2", clockInAt: hourAgo, clockOutAt: null },
    ]);
    const today = await service.today(ctx);
    expect(today.open?.id).toBe("a2");
    expect(today.workedSeconds).toBeGreaterThanOrEqual(3 * 3600 - 2);
    expect(today.workedSeconds).toBeLessThanOrEqual(3 * 3600 + 2);
  });

  it("limits the team view to yourself with an own data scope", async () => {
    const { service, prisma } = build();
    await service.team(ctx, "2026-09-30");
    expect(prisma.attendance.findMany.mock.calls[0][0].where.userId).toBe("u1");
    await service.team({ ...ctx, dataScope: "all" }, "2026-09-30");
    expect(prisma.attendance.findMany.mock.calls[1][0].where.userId).toBeUndefined();
  });
});
