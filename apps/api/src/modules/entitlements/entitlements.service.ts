import { ForbiddenException, Injectable } from "@nestjs/common";
import { UNLIMITED, type EntitlementKind } from "@digitel/shared";
import { PrismaService } from "../../prisma/prisma.service";

export interface UsageSnapshot {
  contacts: number;
  channels: number;
  automations: number;
  teamSeats: number;
  apiRequests: number;
}

export interface LimitsSnapshot {
  maxContacts: number;
  maxChannels: number;
  maxAutomations: number;
  maxTeamSeats: number;
  maxApiRequestsPerMonth: number;
}

/**
 * Single enforcement point for every plan limit. Phases 1–4 each grew their
 * own inline `count() vs plan.maxX` check; those now delegate here so the
 * limit semantics (and the sentinel for "unlimited") live in one place.
 *
 * Usage counts are computed live via indexed COUNT(*) rather than cached
 * counters — always correct, and cheap at MVP scale. The one exception is
 * the monthly API-request meter, which is a rate rather than a state and so
 * needs its own durable row (TenantApiUsage). The architecture sketch put
 * that counter in Redis with a periodic DB flush; Postgres' atomic upsert
 * gives the same guarantee with one source of truth instead of two, which
 * is the right trade at this scale.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getLimits(tenantId: string): Promise<LimitsSnapshot> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { plan: true },
    });
    return {
      maxContacts: tenant.plan.maxContacts,
      maxChannels: tenant.plan.maxChannels,
      maxAutomations: tenant.plan.maxAutomations,
      maxTeamSeats: tenant.plan.maxTeamSeats,
      maxApiRequestsPerMonth: tenant.plan.maxApiRequestsPerMonth,
    };
  }

  async getUsage(tenantId: string): Promise<UsageSnapshot> {
    const [contacts, channels, automations, teamSeats, apiUsage] = await Promise.all([
      this.prisma.contact.count({ where: { tenantId } }),
      this.prisma.channel.count({ where: { tenantId, status: "active" } }),
      this.prisma.automationWorkflow.count({ where: { tenantId } }),
      this.prisma.tenantMembership.count({ where: { tenantId, status: "active" } }),
      this.prisma.tenantApiUsage.findUnique({
        where: { tenantId_periodMonth: { tenantId, periodMonth: currentPeriodMonth() } },
      }),
    ]);
    return { contacts, channels, automations, teamSeats, apiRequests: apiUsage?.requestCount ?? 0 };
  }

  /**
   * @param additional number of records about to be created (CSV import adds many at once)
   */
  async assertCanAdd(tenantId: string, kind: EntitlementKind, additional = 1): Promise<void> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { plan: true },
    });

    const { limit, current, noun } = await this.resolve(tenantId, tenant.plan, kind);
    if (limit === UNLIMITED) return;

    if (current + additional > limit) {
      const attempted = additional > 1 ? `This would add ${additional} more, on top of ${current} existing. ` : "";
      throw new ForbiddenException(
        `Your ${tenant.plan.name} plan allows up to ${limit} ${noun}. ${attempted}Upgrade to add more.`,
      );
    }
  }

  /**
   * Atomically increments this month's API-request counter and rejects once
   * the plan's monthly quota is exhausted. Called from MetaGraphClient — the
   * single choke point for outbound Graph API calls — so no new call site
   * can bypass metering.
   */
  async checkAndIncrementApiUsage(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { plan: true },
    });
    const limit = tenant.plan.maxApiRequestsPerMonth;
    const periodMonth = currentPeriodMonth();

    const usage = await this.prisma.tenantApiUsage.upsert({
      where: { tenantId_periodMonth: { tenantId, periodMonth } },
      update: { requestCount: { increment: 1 } },
      create: { tenantId, periodMonth, requestCount: 1 },
    });

    if (limit !== UNLIMITED && usage.requestCount > limit) {
      throw new ForbiddenException(
        `Your ${tenant.plan.name} plan allows ${limit} API requests per month and you have used them all. Upgrade for more.`,
      );
    }
  }

  private async resolve(
    tenantId: string,
    plan: LimitsSnapshot,
    kind: EntitlementKind,
  ): Promise<{ limit: number; current: number; noun: string }> {
    switch (kind) {
      case "contacts":
        return {
          limit: plan.maxContacts,
          current: await this.prisma.contact.count({ where: { tenantId } }),
          noun: "contacts",
        };
      case "channels":
        return {
          limit: plan.maxChannels,
          current: await this.prisma.channel.count({ where: { tenantId, status: "active" } }),
          noun: "connected channel(s)",
        };
      case "automations":
        return {
          limit: plan.maxAutomations,
          current: await this.prisma.automationWorkflow.count({ where: { tenantId } }),
          noun: "automation(s)",
        };
      case "teamSeats":
        return {
          limit: plan.maxTeamSeats,
          current: await this.prisma.tenantMembership.count({ where: { tenantId, status: "active" } }),
          noun: "team member(s)",
        };
      case "apiRequests":
        return {
          limit: plan.maxApiRequestsPerMonth,
          current:
            (
              await this.prisma.tenantApiUsage.findUnique({
                where: { tenantId_periodMonth: { tenantId, periodMonth: currentPeriodMonth() } },
              })
            )?.requestCount ?? 0,
          noun: "API requests per month",
        };
    }
  }
}

/** "YYYY-MM" in UTC — the period key for TenantApiUsage; rolls over automatically. */
export function currentPeriodMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
