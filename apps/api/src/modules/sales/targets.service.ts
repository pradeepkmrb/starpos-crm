import { BadRequestException, Injectable } from "@nestjs/common";
import { monthKey, monthRange } from "@starpos-crm/shared";
import { PrismaService } from "../../prisma/prisma.service";
import type { TenantRequestContext } from "../../common/request-context";
import { SetTargetDto } from "./dto/sales.dto";

export interface TargetProgress {
  amountPaise: number | null;
  /** Value of leads won this month. */
  achievedPaise: number;
  closings: number;
  /** Payments received this month. */
  collectedPaise: number;
}

/**
 * Monthly targets: one per rep and one for the team. Progress is the value of
 * leads won that month (by closedAt, in the workspace's time zone), with
 * collections alongside for teams that track cash as well as bookings.
 */
@Injectable()
export class TargetsService {
  constructor(private readonly prisma: PrismaService) {}

  async timeZone(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
    return tenant?.timezone || "Asia/Kolkata";
  }

  async currentMonth(tenantId: string): Promise<string> {
    return monthKey(new Date(), await this.timeZone(tenantId));
  }

  async board(ctx: TenantRequestContext, month: string) {
    const timeZone = await this.timeZone(ctx.tenantId);
    const { start, end } = monthRange(month, timeZone);

    const [targets, members, won, collected] = await Promise.all([
      this.prisma.salesTarget.findMany({ where: { tenantId: ctx.tenantId, month } }),
      this.prisma.tenantMembership.findMany({
        where: { tenantId: ctx.tenantId, status: "active" },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.lead.groupBy({
        by: ["ownerUserId"],
        where: { tenantId: ctx.tenantId, status: "won", closedAt: { gte: start, lt: end } },
        _sum: { valuePaise: true },
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ["collectedByUserId"],
        where: { tenantId: ctx.tenantId, receivedAt: { gte: start, lt: end } },
        _sum: { amountPaise: true },
      }),
    ]);

    const wonBy = new Map(won.map((w) => [w.ownerUserId, w]));
    const collectedBy = new Map(collected.map((c) => [c.collectedByUserId, c._sum.amountPaise ?? 0]));
    const targetFor = (userId: string | null) => targets.find((t) => t.userId === userId)?.amountPaise ?? null;

    const reps = members.map((m) => ({
      user: m.user,
      role: m.role,
      amountPaise: targetFor(m.user.id),
      achievedPaise: wonBy.get(m.user.id)?._sum.valuePaise ?? 0,
      closings: wonBy.get(m.user.id)?._count._all ?? 0,
      collectedPaise: collectedBy.get(m.user.id) ?? 0,
    }));
    // Best performers first — the leaderboard order.
    reps.sort((a, b) => b.achievedPaise - a.achievedPaise || b.collectedPaise - a.collectedPaise);

    const team: TargetProgress = {
      amountPaise: targetFor(null),
      achievedPaise: won.reduce((sum, w) => sum + (w._sum.valuePaise ?? 0), 0),
      closings: won.reduce((sum, w) => sum + w._count._all, 0),
      collectedPaise: collected.reduce((sum, c) => sum + (c._sum.amountPaise ?? 0), 0),
    };
    return { month, timeZone, team, reps };
  }

  /** Sets one target; an amount of 0 removes it. */
  async set(ctx: TenantRequestContext, dto: SetTargetDto) {
    if (dto.userId) {
      const member = await this.prisma.tenantMembership.findFirst({
        where: { tenantId: ctx.tenantId, userId: dto.userId, status: "active" },
        select: { id: true },
      });
      if (!member) throw new BadRequestException("That person isn't a member of this workspace");
    }
    // findFirst rather than the compound unique key: a null userId (the team
    // target) can't be matched through it, because Postgres NULLs are distinct.
    const existing = await this.prisma.salesTarget.findFirst({
      where: { tenantId: ctx.tenantId, month: dto.month, userId: dto.userId },
      select: { id: true },
    });
    if (dto.amountPaise === 0) {
      if (existing) await this.prisma.salesTarget.delete({ where: { id: existing.id } });
      return { month: dto.month, userId: dto.userId, amountPaise: null };
    }
    const saved = existing
      ? await this.prisma.salesTarget.update({ where: { id: existing.id }, data: { amountPaise: dto.amountPaise } })
      : await this.prisma.salesTarget.create({
          data: { tenantId: ctx.tenantId, userId: dto.userId, month: dto.month, amountPaise: dto.amountPaise },
        });
    return { month: saved.month, userId: saved.userId, amountPaise: saved.amountPaise };
  }
}
