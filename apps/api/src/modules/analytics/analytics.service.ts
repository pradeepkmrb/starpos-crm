import { Injectable } from "@nestjs/common";
import { Prisma } from "@digitel/db";
import { PrismaService } from "../../prisma/prisma.service";

export interface MessageTotals {
  outbound: number;
  delivered: number;
  read: number;
  failed: number;
  inbound: number;
  deliveryRate: number;
  readRate: number;
  failureRate: number;
}

export interface DailyPoint {
  date: string; // "YYYY-MM-DD"
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  inbound: number;
}

export interface ChannelBreakdown {
  channelId: string;
  displayPhoneNumber: string;
  outbound: number;
  delivered: number;
  read: number;
  failed: number;
  inbound: number;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(tenantId: string, days: number, channelId?: string) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [totals, dailySeries, byChannel] = await Promise.all([
      this.getTotals(tenantId, since, channelId),
      this.getDailySeries(tenantId, since, channelId),
      this.getByChannel(tenantId, since),
    ]);
    return { since: since.toISOString(), totals, dailySeries, byChannel };
  }

  private async getTotals(tenantId: string, since: Date, channelId?: string): Promise<MessageTotals> {
    const groups = await this.prisma.messageLog.groupBy({
      by: ["direction", "status"],
      where: { tenantId, createdAt: { gte: since }, ...(channelId ? { channelId } : {}) },
      _count: true,
    });
    return summarizeStatusGroups(groups);
  }

  /** Raw SQL for day-bucketed counts — Prisma's query builder has no date_trunc equivalent. */
  private async getDailySeries(tenantId: string, since: Date, channelId?: string): Promise<DailyPoint[]> {
    const rows = await this.prisma.$queryRaw<
      { day: Date; direction: string; status: string; count: bigint }[]
    >(Prisma.sql`
      SELECT date_trunc('day', "createdAt") AS day, direction, status, count(*)::bigint AS count
      FROM "MessageLog"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${since}
        ${channelId ? Prisma.sql`AND "channelId" = ${channelId}` : Prisma.empty}
      GROUP BY day, direction, status
      ORDER BY day ASC
    `);

    const byDay = new Map<string, DailyPoint>();
    for (const row of rows) {
      const key = row.day.toISOString().slice(0, 10);
      const point = byDay.get(key) ?? { date: key, sent: 0, delivered: 0, read: 0, failed: 0, inbound: 0 };
      applyStatusCount(point, row.direction, row.status, Number(row.count));
      byDay.set(key, point);
    }
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  private async getByChannel(tenantId: string, since: Date): Promise<ChannelBreakdown[]> {
    const [channels, groups] = await Promise.all([
      this.prisma.whatsappChannel.findMany({
        where: { tenantId },
        select: { id: true, displayPhoneNumber: true },
      }),
      this.prisma.messageLog.groupBy({
        by: ["channelId", "direction", "status"],
        where: { tenantId, createdAt: { gte: since } },
        _count: true,
      }),
    ]);

    return channels.map((channel) => {
      const channelGroups = groups.filter((g) => g.channelId === channel.id);
      const totals = summarizeStatusGroups(channelGroups);
      return {
        channelId: channel.id,
        displayPhoneNumber: channel.displayPhoneNumber,
        outbound: totals.outbound,
        delivered: totals.delivered,
        read: totals.read,
        failed: totals.failed,
        inbound: totals.inbound,
      };
    });
  }
}

function summarizeStatusGroups(
  groups: { direction: string; status: string; _count: number }[],
): MessageTotals {
  const point = { sent: 0, delivered: 0, read: 0, failed: 0, inbound: 0 };
  for (const g of groups) applyStatusCount(point, g.direction, g.status, g._count);

  const outbound = point.sent; // `sent` accumulates every outbound row regardless of latest status
  return {
    outbound,
    delivered: point.delivered,
    read: point.read,
    failed: point.failed,
    inbound: point.inbound,
    deliveryRate: outbound > 0 ? point.delivered / outbound : 0,
    readRate: outbound > 0 ? point.read / outbound : 0,
    failureRate: outbound > 0 ? point.failed / outbound : 0,
  };
}

/**
 * MessageLog.status is the message's LATEST state (webhooks update the same
 * row in place, see WebhookProcessor), not a cumulative event log — so
 * "delivered" here means "currently delivered or further along (read)",
 * each outbound row counted exactly once into `sent` plus at most one of
 * delivered/read/failed.
 */
function applyStatusCount(
  point: { sent: number; delivered: number; read: number; failed: number; inbound: number },
  direction: string,
  status: string,
  count: number,
) {
  if (direction === "inbound") {
    point.inbound += count;
    return;
  }
  point.sent += count;
  if (status === "delivered" || status === "read") point.delivered += count;
  if (status === "read") point.read += count;
  if (status === "failed") point.failed += count;
}
