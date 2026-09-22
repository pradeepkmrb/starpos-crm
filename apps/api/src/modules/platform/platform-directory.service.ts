import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { exceedsPlanLimits } from "../entitlements/plan-limits";
import { CreateTenantDto } from "./dto/create-tenant.dto";

const TENANT_INCLUDE = {
  plan: true,
  subscription: true,
  memberships: {
    where: { role: "owner" },
    take: 1,
    include: { user: { select: { email: true, name: true } } },
  },
  _count: { select: { memberships: true, channels: true } },
} as const;

const SAFE_CHANNEL_SELECT = {
  id: true,
  type: true,
  wabaId: true,
  phoneNumberId: true,
  displayPhoneNumber: true,
  externalId: true,
  displayName: true,
  status: true,
  messagingTier: true,
  lastSyncedAt: true,
  lastError: true,
  createdAt: true,
} as const;

/** Cross-tenant "directory" reads for the platform-admin backoffice — tenants, their subscriptions, and their channels. */
@Injectable()
export class PlatformDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly entitlements: EntitlementsService,
  ) {}

  listTenants() {
    return this.prisma.tenant.findMany({
      include: TENANT_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  /** The plans an agency can put a customer on, cheapest first. */
  listPlans() {
    return this.prisma.plan.findMany({ orderBy: { priceInPaise: "asc" } });
  }

  /**
   * Moves a customer onto another plan by hand — the agency sells and bills
   * outside the app, so this is the only way an account gets upgraded when
   * Razorpay checkout isn't in play. Nothing is ever deleted: a customer put
   * on a smaller plan keeps their data and is flagged `overLimit`, which
   * blocks new records until they are back under the limits.
   */
  async setTenantPlan(tenantId: string, planCode: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("Customer not found");

    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) throw new NotFoundException(`No plan with code "${planCode}"`);

    const usage = await this.entitlements.getUsage(tenantId);
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { planId: plan.id, overLimit: exceedsPlanLimits(usage, plan) },
      include: TENANT_INCLUDE,
    });
  }

  createTenant(dto: CreateTenantDto) {
    return this.authService.adminCreateTenant(dto);
  }

  listChannels() {
    // Channel is a tenant-scoped model — the scoping middleware
    // (tenant-scoping.middleware.ts) would otherwise silently inject the
    // *calling admin's own* tenantId into an unscoped `where`, defeating the
    // entire point of a cross-tenant directory view. Passing a `where` that
    // already names `tenantId` (matching every non-empty id, i.e. every row)
    // uses the middleware's own explicit-already-present bypass instead.
    return this.prisma.channel.findMany({
      where: { tenantId: { not: "" } },
      select: { ...SAFE_CHANNEL_SELECT, tenant: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }
}
