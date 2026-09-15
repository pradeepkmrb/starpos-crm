import { BadRequestException, HttpException, Injectable, Logger } from "@nestjs/common";
import { withTimeout } from "../../common/with-timeout";
import type { CredentialMap } from "./integration-credentials";

export interface VerificationResult {
  /** What the provider calls this account, when it will tell us. */
  accountLabel: string | null;
}

const VERIFY_TIMEOUT_MS = 10_000;

/**
 * Checks a tenant's own payment-gateway keys against the provider before they
 * are stored, so a typo surfaces on the Integrations screen rather than on a
 * customer's first payment attempt.
 *
 * Read-only calls on purpose: listing one order, or reading the account. A
 * connection test must never move money.
 */
@Injectable()
export class PaymentGatewayClient {
  private readonly logger = new Logger(PaymentGatewayClient.name);

  async verify(provider: string, credentials: CredentialMap): Promise<VerificationResult> {
    switch (provider) {
      case "razorpay":
        return this.verifyRazorpay(credentials);
      case "stripe":
        return this.verifyStripe(credentials);
      default:
        throw new BadRequestException(`No connection test exists for ${provider}`);
    }
  }

  private async verifyRazorpay(credentials: CredentialMap): Promise<VerificationResult> {
    const { keyId, keySecret } = credentials;
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    // Razorpay has no public "who am I" endpoint, so the cheapest read that
    // proves the keys work is asking for a single order.
    const res = await this.fetchJson("https://api.razorpay.com/v1/orders?count=1", {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!res.ok) {
      throw new BadRequestException(
        `Razorpay rejected these keys: ${readError(res.body) ?? `HTTP ${res.status}`}`,
      );
    }
    // The key id is the only account-identifying thing Razorpay returns here.
    return { accountLabel: keyId ?? null };
  }

  private async verifyStripe(credentials: CredentialMap): Promise<VerificationResult> {
    const res = await this.fetchJson("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${credentials.secretKey}` },
    });

    if (!res.ok) {
      throw new BadRequestException(
        `Stripe rejected this key: ${readError(res.body) ?? `HTTP ${res.status}`}`,
      );
    }

    const account = res.body as {
      id?: string;
      email?: string;
      business_profile?: { name?: string };
      settings?: { dashboard?: { display_name?: string } };
    };
    return {
      accountLabel:
        account.settings?.dashboard?.display_name ??
        account.business_profile?.name ??
        account.email ??
        account.id ??
        null,
    };
  }

  private async fetchJson(
    url: string,
    init: RequestInit,
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    try {
      const res = await withTimeout(
        fetch(url, { ...init, method: "GET" }),
        VERIFY_TIMEOUT_MS,
        "The payment provider did not respond in time",
      );
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, body };
    } catch (error) {
      // A timeout is already a 503 from withTimeout; don't relabel it as the
      // caller's mistake.
      if (error instanceof HttpException) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Connection test to ${url} failed: ${message}`);
      throw new BadRequestException(`Could not reach the payment provider: ${message}`);
    }
  }
}

/** Razorpay and Stripe both nest the human-readable reason under `error`. */
function readError(body: unknown): string | undefined {
  const error = (body as { error?: { description?: string; message?: string } })?.error;
  return error?.description ?? error?.message;
}
