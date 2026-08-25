import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import type { CreateSubscriptionResult, PaymentProvider } from "./payment-provider.interface";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";
/** Razorpay bills subscriptions per cycle; 12 monthly cycles ≈ a year before renewal is re-authorized. */
const SUBSCRIPTION_TOTAL_COUNT = 12;

export class BillingNotConfiguredError extends ServiceUnavailableException {
  constructor() {
    super("Billing is not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET");
  }
}

/**
 * Talks to Razorpay's REST API directly (same fetch-based approach as
 * MetaGraphClient) rather than pulling in the SDK for three endpoints.
 */
@Injectable()
export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay";

  isConfigured(): boolean {
    return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  }

  async getOrCreateCustomer(input: {
    tenantId: string;
    existingCustomerId: string | null;
    email: string;
    name: string;
  }): Promise<string> {
    if (input.existingCustomerId) return input.existingCustomerId;

    const customer = (await this.apiFetch("/customers", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        fail_existing: 0, // reuse rather than error if the email is already a customer
        notes: { tenantId: input.tenantId },
      }),
    })) as { id: string };
    return customer.id;
  }

  async createSubscription(input: {
    customerId: string;
    providerPlanId: string;
  }): Promise<CreateSubscriptionResult> {
    const subscription = (await this.apiFetch("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        plan_id: input.providerPlanId,
        customer_id: input.customerId,
        total_count: SUBSCRIPTION_TOTAL_COUNT,
        customer_notify: 1,
      }),
    })) as { id: string; short_url?: string };

    return {
      providerSubscriptionId: subscription.id,
      checkoutPayload: {
        key: process.env.RAZORPAY_KEY_ID,
        subscription_id: subscription.id,
        // Razorpay-hosted page: lets the user pay without us rendering a
        // card form, so no PCI surface on our side at all.
        short_url: subscription.short_url,
      },
    };
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return false;

    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async apiFetch(path: string, init: RequestInit): Promise<unknown> {
    if (!this.isConfigured()) throw new BillingNotConfiguredError();

    const auth = Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`,
    ).toString("base64");

    const res = await fetch(`${RAZORPAY_API_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const description = (body as { error?: { description?: string } }).error?.description;
      throw new ServiceUnavailableException(
        `Razorpay API error: ${description ?? `request failed (${res.status})`}`,
      );
    }
    return body;
  }
}
