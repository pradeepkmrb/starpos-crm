export interface CreateSubscriptionResult {
  providerSubscriptionId: string;
  /** Handed to the frontend checkout widget; card data never touches our servers. */
  checkoutPayload: Record<string, unknown>;
}

/**
 * Kept as a seam so a second provider (Stripe) can be added later without
 * touching webhook handling or entitlement logic. Only Razorpay is
 * implemented for the MVP.
 */
export interface PaymentProvider {
  readonly name: string;
  isConfigured(): boolean;
  getOrCreateCustomer(input: {
    tenantId: string;
    existingCustomerId: string | null;
    email: string;
    name: string;
  }): Promise<string>;
  createSubscription(input: {
    customerId: string;
    providerPlanId: string;
  }): Promise<CreateSubscriptionResult>;
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
}

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");
