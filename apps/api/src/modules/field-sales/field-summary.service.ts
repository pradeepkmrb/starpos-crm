import { Injectable } from "@nestjs/common";
import { Prisma } from "@digitel/db";
import { ACTIVITY_TYPES, CLOSED_LEAD_STATUSES, type ActivityType } from "@digitel/shared";
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

    const [today, overdue, completedByType, won, openPipeline] = await Promise.all([
      this.prisma.activity.findMany({
        where: {
          tenantId,
          ...activityOwner,
          OR: [
            { status: "scheduled", scheduledAt: { gte: window.dayStart, lt: window.dayEnd } },
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
    ]);

    const completedThisMonth = Object.fromEntries(ACTIVITY_TYPES.map((type) => [type, 0])) as Record<
      ActivityType,
      number
    >;
    for (const row of completedByType) completedThisMonth[row.type] = row._count._all;

    return {
      scope,
      today,
      overdueCount: overdue,
      month: {
        calls: completedThisMonth.call,
        visits: completedThisMonth.visit,
        demos: completedThisMonth.demo,
        closings: won._count._all,
        wonValuePaise: won._sum.valuePaise ?? 0,
      },
      openPipeline: { count: openPipeline._count._all, valuePaise: openPipeline._sum.valuePaise ?? 0 },
    };
  }
}
