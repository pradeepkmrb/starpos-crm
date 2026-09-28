import { BadRequestException } from "@nestjs/common";
import { findIntegration } from "@starpos-crm/shared";
import {
  buildPublicView,
  detectMode,
  maskValue,
  normalizeCredentials,
} from "./integration-credentials";

const razorpay = findIntegration("razorpay")!;
const stripe = findIntegration("stripe")!;

describe("maskValue", () => {
  it("shows only the tail of a long secret", () => {
    expect(maskValue("rzp_secret_abcdefgh1234")).toBe("••••••1234");
  });

  it("masks a short value whole rather than mostly revealing it", () => {
    expect(maskValue("abc123")).toBe("••••••");
    expect(maskValue("")).toBe("");
  });
});

describe("normalizeCredentials", () => {
  it("keeps the fields the provider asks for and drops anything else", () => {
    const result = normalizeCredentials(razorpay, {
      keyId: " rzp_live_abc123 ",
      keySecret: "shhh-secret-value",
      smuggled: "not-a-razorpay-field",
    });
    expect(result).toEqual({ keyId: "rzp_live_abc123", keySecret: "shhh-secret-value" });
  });

  it("rejects a missing required field by its label", () => {
    expect(() => normalizeCredentials(razorpay, { keyId: "rzp_live_abc123" })).toThrow(
      BadRequestException,
    );
    expect(() => normalizeCredentials(razorpay, { keyId: "rzp_live_abc123" })).toThrow(
      /Key secret is required/,
    );
  });

  it("lets one key be rotated without retyping the others", () => {
    const existing = { keyId: "rzp_live_old", keySecret: "old-secret-value", webhookSecret: "hook-secret" };
    const result = normalizeCredentials(razorpay, { keyId: "rzp_live_new", keySecret: "" }, existing);
    expect(result).toEqual({
      keyId: "rzp_live_new",
      keySecret: "old-secret-value",
      webhookSecret: "hook-secret",
    });
  });

  it("treats a blank visible field as a deliberate clear", () => {
    const existing = { secretKey: "sk_live_abcdefgh", publishableKey: "pk_live_abcdefgh" };
    const result = normalizeCredentials(stripe, { secretKey: "", publishableKey: "" }, existing);
    expect(result).toEqual({ secretKey: "sk_live_abcdefgh" });
  });
});

describe("detectMode", () => {
  it("reads test or live off the key prefix", () => {
    expect(detectMode(razorpay, { keyId: "rzp_live_abc" })).toBe("live");
    expect(detectMode(razorpay, { keyId: "rzp_test_abc" })).toBe("test");
    expect(detectMode(stripe, { secretKey: "sk_test_abc" })).toBe("test");
  });

  it("says nothing when the prefix is unfamiliar", () => {
    expect(detectMode(stripe, { secretKey: "rk_live_restricted" })).toBeNull();
  });
});

describe("buildPublicView", () => {
  it("masks secrets and passes visible fields through", () => {
    const view = buildPublicView(stripe, {
      secretKey: "sk_live_abcdefgh5678",
      publishableKey: "pk_live_abcdefgh5678",
    });
    expect(view).toEqual({ secretKey: "••••••5678", publishableKey: "pk_live_abcdefgh5678" });
  });

  it("never leaks a raw secret", () => {
    const view = buildPublicView(razorpay, { keyId: "rzp_live_abc", keySecret: "raw-secret-value" });
    expect(JSON.stringify(view)).not.toContain("raw-secret-value");
  });
});
