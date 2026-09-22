import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { exceedsPlanLimits } from "../entitlements/plan-limits";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./payment-provider.interface";

interface RazorpaySubscriptionEntity {
  id: string;
  status: string;
  current_start?: number;
  current_end?: number;
}

interface RazorpayInvoiceEntity {
  id: string;
  subscription_id?: string;
  amount?: number;
  status?: string;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** Current plan, live usage vs limits, and the plans available to switch to. */
  async getOverview(tenantId: string) {
    const [tenant, plans, usage, limits] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        include: { plan: true, subscription: true },
      }),
      this.prisma.plan.findMany({ orderBy: { priceInPaise: "asc" } }),
      this.entitlements.getUsage(tenantId),
      this.entitlements.getLimits(tenantId),
    ]);

    return {
      currentPlan: tenant.plan,
      subscription: tenant.subscription,
      overLimit: tenant.overLimit,
      billingConfigured: this.provider.isConfigured(),
      usage,
      limits,
      availablePlans: plans,
    };
  }

  async startCheckout(tenantId: string, userId: string, planCode: string) {
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) throw new NotFoundException("Plan not found");
    if (plan.priceInPaise === 0) {
      throw new BadRequestException("The free plan does not require checkout");
    }
    if (!plan.razorpayPlanId) {
      throw new BadRequestException(
        `Plan "${plan.code}" has no razorpayPlanId configured — create it in Razorpay and store its id first`,
      );
    }

    const [tenant, user] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    ]);

    const customerId = await this.provider.getOrCreateCustomer({
      tenantId,
      existingCustomerId: tenant.razorpayCustomerId,
      email: user.email,
      name: tenant.name,
    });
    if (customerId !== tenant.razorpayCustomerId) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { razorpayCustomerId: customerId },
      });
    }

    const result = await this.provider.createSubscription({
      customerId,
      providerPlanId: plan.razorpayPlanId,
    });

    // Recorded as pending; the tenant's plan only changes once Razorpay
    // confirms activation via webhook — never on the client's say-so.
    await this.prisma.subscription.upsert({
      where: { tenantId },
      update: {
        planId: plan.id,
        razorpaySubscriptionId: result.providerSubscriptionId,
        status: "past_due",
      },
      create: {
        tenantId,
        planId: plan.id,
        razorpaySubscriptionId: result.providerSubscriptionId,
        status: "past_due",
      },
    });

    return { planCode: plan.code, ...result };
  }

  // --- webhook lifecycle ---

  async handleSubscriptionActivated(entity: RazorpaySubscriptionEntity) {
    const subscription = await this.findSubscription(entity.id);
    if (!subscription) return;

    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "active",
          currentPeriodStart: toDate(entity.current_start) ?? new Date(),
          currentPeriodEnd: toDate(entity.current_end),
          cancelAtPeriodEnd: false,
        },
      }),
      // The plan switch itself — this is what actually raises the tenant's limits.
      this.prisma.tenant.update({
        where: { id: subscription.tenantId },
        data: { planId: subscription.planId, overLimit: false },
      }),
    ]);
    this.logger.log(`Subscription ${entity.id} activated for tenant ${subscription.tenantId}`);
  }

  async handleSubscriptionCharged(entity: RazorpaySubscriptionEntity, invoice?: RazorpayInvoiceEntity) {
    const subscription = await this.findSubscription(entity.id);
    if (!subscription) return;

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "active",
        currentPeriodStart: toDate(entity.current_start) ?? subscription.currentPeriodStart,
        currentPeriodEnd: toDate(entity.current_end),
      },
    });

    if (invoice?.id) {
      const existing = await this.prisma.invoice.findFirst({
        where: { razorpayInvoiceId: invoice.id },
      });
      if (!existing) {
        await this.prisma.invoice.create({
          data: {
            tenantId: subscription.tenantId,
            subscriptionId: subscription.id,
            razorpayInvoiceId: invoice.id,
            amountPaise: invoice.amount ?? 0,
            status: invoice.status ?? "paid",
            paidAt: new Date(),
          },
        });
      }
    }
  }

  async handleSubscriptionPaymentFailed(entity: RazorpaySubscriptionEntity) {
    const subscription = await this.findSubscription(entity.id);
    if (!subscription) return;
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "past_due" },
    });
    this.logger.warn(`Subscription ${entity.id} payment failed (tenant ${subscription.tenantId})`);
  }

  /**
   * Cancellation does NOT immediately strip access — the tenant keeps the
   * paid plan until the period they already paid for runs out. The
   * downgrade-to-free sweep below is what eventually moves them.
   */
  async handleSubscriptionCancelled(entity: RazorpaySubscriptionEntity) {
    const subscription = await this.findSubscription(entity.id);
    if (!subscription) return;
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "canceled",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: toDate(entity.current_end) ?? subscription.currentPeriodEnd,
      },
    });
    this.logger.log(`Subscription ${entity.id} cancelled (tenant ${subscription.tenantId})`);
  }

  /**
   * Moves tenants whose cancelled/expired paid period has elapsed back to the
   * free plan. Intended to run daily; exposed as a method so it can be driven
   * by a scheduler (or invoked manually) rather than hard-wiring a cron here.
   */
  async downgradeExpiredSubscriptions(now = new Date()) {
    const freePlan = await this.prisma.plan.findUniqueOrThrow({ where: { code: "free" } });
    const expired = await this.prisma.subscription.findMany({
      where: {
        status: { in: ["canceled", "past_due"] },
        currentPeriodEnd: { lt: now },
        tenant: { planId: { not: freePlan.id } },
      },
    });

    for (const subscription of expired) {
      const usage = await this.entitlements.getUsage(subscription.tenantId);
      await this.prisma.tenant.update({
        where: { id: subscription.tenantId },
        data: {
          planId: freePlan.id,
          // Data is never deleted on downgrade — the tenant is just flagged
          // so the UI can prompt them and new creates get blocked until
          // they're back under the free limits.
          overLimit: exceedsPlanLimits(usage, freePlan),
        },
      });
      this.logger.log(`Tenant ${subscription.tenantId} downgraded to free (subscription expired)`);
    }

    return { downgraded: expired.length };
  }

  private findSubscription(providerSubscriptionId: string) {
    return this.prisma.subscription.findFirst({
      where: { razorpaySubscriptionId: providerSubscriptionId },
    });
  }
}

function toDate(epochSeconds?: number): Date | undefined {
  return epochSeconds ? new Date(epochSeconds * 1000) : undefined;
}
