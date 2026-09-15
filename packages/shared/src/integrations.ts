/**
 * The integrations catalog: what a tenant can connect, and what each provider
 * needs. Lives in the shared package so the dashboard renders its connect
 * form from the same definition the API validates against — a new provider is
 * one entry here, not a change in two places.
 */

export const INTEGRATION_CATEGORIES = ["payments"] as const;
export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];

export const INTEGRATION_CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  payments: "Payments",
};

export interface IntegrationFieldSpec {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
  required: boolean;
  /**
   * Secret values are write-only: stored encrypted, never sent back, and
   * shown in the dashboard only as a masked tail.
   */
  secret: boolean;
}

export interface IntegrationSpec {
  provider: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  /** Two-letter mark the dashboard draws in place of a logo. */
  initials: string;
  docsUrl: string;
  fields: IntegrationFieldSpec[];
  /**
   * The field whose value prefix says whether these are test or live keys,
   * with the prefix that means "live".
   */
  modeFrom?: { field: string; livePrefix: string; testPrefix: string };
}

export const INTEGRATIONS: IntegrationSpec[] = [
  {
    provider: "razorpay",
    name: "Razorpay",
    category: "payments",
    description: "Take payments from your customers with your own Razorpay account.",
    initials: "RP",
    docsUrl: "https://dashboard.razorpay.com/app/website-app-settings/api-keys",
    modeFrom: { field: "keyId", livePrefix: "rzp_live_", testPrefix: "rzp_test_" },
    fields: [
      {
        key: "keyId",
        label: "Key ID",
        placeholder: "rzp_live_xxxxxxxxxxxx",
        help: "From Razorpay Dashboard → Settings → API Keys.",
        required: true,
        secret: false,
      },
      {
        key: "keySecret",
        label: "Key secret",
        placeholder: "••••••••••••••••",
        help: "Shown once by Razorpay when the key is generated.",
        required: true,
        secret: true,
      },
      {
        key: "webhookSecret",
        label: "Webhook secret",
        help: "Optional. Needed only if you point Razorpay webhooks at this workspace.",
        required: false,
        secret: true,
      },
    ],
  },
  {
    provider: "stripe",
    name: "Stripe",
    category: "payments",
    description: "Take card payments worldwide with your own Stripe account.",
    initials: "ST",
    docsUrl: "https://dashboard.stripe.com/apikeys",
    modeFrom: { field: "secretKey", livePrefix: "sk_live_", testPrefix: "sk_test_" },
    fields: [
      {
        key: "secretKey",
        label: "Secret key",
        placeholder: "sk_live_xxxxxxxxxxxx",
        help: "From Stripe Dashboard → Developers → API keys.",
        required: true,
        secret: true,
      },
      {
        key: "publishableKey",
        label: "Publishable key",
        placeholder: "pk_live_xxxxxxxxxxxx",
        help: "Optional. Only needed for checkout rendered in the browser.",
        required: false,
        secret: false,
      },
      {
        key: "webhookSecret",
        label: "Signing secret",
        help: "Optional. The whsec_… value from your Stripe webhook endpoint.",
        required: false,
        secret: true,
      },
    ],
  },
];

export function findIntegration(provider: string): IntegrationSpec | undefined {
  return INTEGRATIONS.find((integration) => integration.provider === provider);
}

export const INTEGRATION_PROVIDERS: string[] = INTEGRATIONS.map((i) => i.provider);

export type IntegrationStatus = "connected" | "disabled" | "error";
