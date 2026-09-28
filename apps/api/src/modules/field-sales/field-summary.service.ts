import { Injectable } from "@nestjs/common";
import { Prisma } from "@starpos-crm/db";
import { ACTIVITY_TYPES, CLOSED_LEAD_STATUSES, monthKey, type ActivityType } from "@starpos-crm/shared";
import { PrismaService } from "../../prisma/prisma.service";
import type { TenantRequestContext } from "../../common/request-context";
import { ACTIVITY_INCLUDE, ownerFilter } from "./activities.service";

export interface SummaryWindow {
  /** The caller's local midnight today, and midnight tomorrow. */
  dayStart: Date;
  dayEnd: Date;
  /** The caller's local midnight on the 1st of this month. */
  monthStart: Date;
}

/**
 * The rep's home screen: today's to-do list and this month's numbers. Day
 * and month boundaries come from the client, because "today" depends on the
 * rep's time zone and the server runs in UTC.
 */
@Injectable()
export class FieldSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(ctx: TenantRequestContext, window: SummaryWindow, scope: "me" | "team") {
    const tenantId = ctx.tenantId;
    const activityOwner = scope === "me" ? ownerFilter(ctx, "me") : {};
    const leadOwner: Prisma.LeadWhereInput =
      scope === "me" ? (ctx.userId ? { ownerUserId: ctx.userId } : { id: { in: [] } }) : {};
    const inMonth = { gte: window.monthStart };

    // The target is keyed by the workspace's own calendar month. Noon on the
    // client's first-of-month lands inside that month in any time zone.
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
    const month = monthKey(new Date(window.monthStart.getTime() + 12 * 3_600_000), tenant?.timezone || "Asia/Kolkata");
    const targetOwner = scope === "me" ? ctx.userId || "__nobody__" : null;

    const [today, overdue, completedByType, won, openPipeline, activeVisit, target, collected] = await Promise.all([
      this.prisma.activity.findMany({
        where: {
          tenantId,
          ...activityOwner,
          OR: [
            { status: "scheduled", scheduledAt: { gte: window.dayStart, lt: window.dayEnd } },
            { status: "in_progress" },
            { status: "completed", completedAt: { gte: window.dayStart, lt: window.dayEnd }, type: { not: "note" } },
          ],
        },
        orderBy: [{ scheduledAt: "asc" }, { completedAt: "asc" }],
        take: 100,
        include: ACTIVITY_INCLUDE,
      }),
      this.prisma.activity.count({
        where: { tenantId, ...activityOwner, status: "scheduled", scheduledAt: { lt: window.dayStart } },
      }),
      this.prisma.activity.groupBy({
        by: ["type"],
        where: { tenantId, ...activityOwner, status: "completed", completedAt: inMonth },
        _count: { _all: true },
      }),
      this.prisma.lead.aggregate({
        where: { tenantId, ...leadOwner, status: "won", closedAt: inMonth },
        _count: { _all: true },
        _sum: { valuePaise: true },
      }),
      this.prisma.lead.aggregate({
        where: { tenantId, ...leadOwner, status: { notIn: [...CLOSED_LEAD_STATUSES] } },
        _count: { _all: true },
        _sum: { valuePaise: true },
      }),
      // The rep's own open visit, whatever the scope, so the app can resume it.
      ctx.userId
        ? this.prisma.activity.findFirst({
            where: { tenantId, ownerUserId: ctx.userId, status: "in_progress" },
            include: ACTIVITY_INCLUDE,
          })
        : Promise.resolve(null),
      this.prisma.salesTarget.findFirst({ where: { tenantId, month, userId: targetOwner }, select: { amountPaise: true } }),
      this.prisma.payment.aggregate({
        where: {
          tenantId,
          receivedAt: { gte: window.monthStart },
          ...(scope === "me" ? { collectedByUserId: ctx.userId || "__nobody__" } : {}),
        },
        _sum: { amountPaise: true },
      }),
    ]);

    const completedThisMonth = Object.fromEntries(ACTIVITY_TYPES.map((type) => [type, 0])) as Record<
      ActivityType,
      number
    >;
    for (const row of completedByType) completedThisMonth[row.type] = row._count._all;

    return {
      scope,
      /** The "YYYY-MM" the target below belongs to. */
      targetMonth: month,
      /** This month's target for the rep (or the team, in team scope); null when none is set. */
      targetPaise: target?.amountPaise ?? null,
      activeVisit,
      today,
      overdueCount: overdue,
      month: {
        calls: completedThisMonth.call,
        visits: completedThisMonth.visit,
        demos: completedThisMonth.demo,
        closings: won._count._all,
        wonValuePaise: won._sum.valuePaise ?? 0,
        collectedPaise: collected._sum.amountPaise ?? 0,
      },
      openPipeline: { count: openPipeline._count._all, valuePaise: openPipeline._sum.valuePaise ?? 0 },
    };
  }
}
