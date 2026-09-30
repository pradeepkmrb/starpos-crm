import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { dayKey, dayRange } from "@starpos-crm/shared";
import type { Attendance } from "@starpos-crm/db";
import { PrismaService } from "../../prisma/prisma.service";
import type { TenantRequestContext } from "../../common/request-context";
import { ClockDto } from "./dto/clock.dto";

function present(row: Attendance, now: Date) {
  const end = row.clockOutAt ?? now;
  return {
    id: row.id,
    clockInAt: row.clockInAt,
    clockOutAt: row.clockOutAt,
    workedSeconds: Math.max(0, Math.round((end.getTime() - row.clockInAt.getTime()) / 1000)),
  };
}

/**
 * Clock in / clock out for field staff, from the app's Profile screen. A
 * person has at most one open session; clocking in again after clocking out
 * starts a new one, and a day's total adds them up. Days follow the
 * workspace's time zone.
 */
@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private async timeZone(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
    return tenant?.timezone || "Asia/Kolkata";
  }

  private openSession(tenantId: string, userId: string) {
    return this.prisma.attendance.findFirst({
      where: { tenantId, userId, clockOutAt: null },
      orderBy: { clockInAt: "desc" },
    });
  }

  /** Today's sessions for the signed-in person, plus the open one even if it began on an earlier day. */
  async today(ctx: TenantRequestContext) {
    const now = new Date();
    const timeZone = await this.timeZone(ctx.tenantId);
    const day = dayKey(now, timeZone);
    const { start, end } = dayRange(day, timeZone);
    const rows = await this.prisma.attendance.findMany({
      where: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        OR: [{ clockInAt: { gte: start, lt: end } }, { clockOutAt: null }],
      },
      orderBy: { clockInAt: "asc" },
    });
    const sessions = rows.map((r) => present(r, now));
    const open = sessions.find((s) => !s.clockOutAt) ?? null;
    return {
      day,
      timeZone,
      open,
      sessions,
      workedSeconds: sessions.reduce((sum, s) => sum + s.workedSeconds, 0),
    };
  }

  async clockIn(ctx: TenantRequestContext, dto: ClockDto) {
    if (await this.openSession(ctx.tenantId, ctx.userId)) {
      throw new ConflictException("You're already clocked in");
    }
    await this.prisma.attendance.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        clockInLat: dto.latitude ?? null,
        clockInLng: dto.longitude ?? null,
      },
    });
    return this.today(ctx);
  }

  async clockOut(ctx: TenantRequestContext, dto: ClockDto) {
    const open = await this.openSession(ctx.tenantId, ctx.userId);
    if (!open) throw new BadRequestException("You aren't clocked in");
    await this.prisma.attendance.update({
      where: { id: open.id },
      data: { clockOutAt: new Date(), clockOutLat: dto.latitude ?? null, clockOutLng: dto.longitude ?? null },
    });
    return this.today(ctx);
  }

  /**
   * A day's attendance across the team, one row per person who clocked in.
   * An "own" data scope sees only themselves.
   */
  async team(ctx: TenantRequestContext, day?: string) {
    const now = new Date();
    const timeZone = await this.timeZone(ctx.tenantId);
    const key = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : dayKey(now, timeZone);
    const { start, end } = dayRange(key, timeZone);
    const rows = await this.prisma.attendance.findMany({
      where: {
        tenantId: ctx.tenantId,
        clockInAt: { gte: start, lt: end },
        ...(ctx.dataScope === "own" ? { userId: ctx.userId } : {}),
      },
      orderBy: { clockInAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const byUser = new Map<string, { user: { id: string; name: string | null; email: string }; sessions: ReturnType<typeof present>[] }>();
    for (const row of rows) {
      const entry = byUser.get(row.userId) ?? { user: row.user, sessions: [] };
      entry.sessions.push(present(row, now));
      byUser.set(row.userId, entry);
    }
    return {
      day: key,
      timeZone,
      people: [...byUser.values()].map((p) => ({
        ...p,
        firstIn: p.sessions[0]?.clockInAt ?? null,
        lastOut: p.sessions.every((s) => s.clockOutAt) ? p.sessions[p.sessions.length - 1]?.clockOutAt ?? null : null,
        clockedIn: p.sessions.some((s) => !s.clockOutAt),
        workedSeconds: p.sessions.reduce((sum, s) => sum + s.workedSeconds, 0),
      })),
    };
  }
}
