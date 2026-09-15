import { CHANNEL_LABELS, channelHasReplyWindow, describeChannel } from "@digitel/shared";
import { CUSTOMER_SERVICE_WINDOW_MS, windowExpiresAt, windowIsOpen } from "../whatsapp/inbox.service";
import { messagingChannelType } from "../whatsapp/webhook-processor.processor";
import { contactAddress, ensureReplyPrefix } from "./outbound-dispatcher.service";

const NOW = new Date("2026-09-15T12:00:00Z");
const RECENT = new Date(NOW.getTime() - 60 * 60 * 1000); // 1 hour ago
const STALE = new Date(NOW.getTime() - 30 * 60 * 60 * 1000); // 30 hours ago

describe("reply window", () => {
  it("stays open within 24 hours on every Meta channel", () => {
    for (const type of ["whatsapp", "facebook", "instagram"] as const) {
      expect(windowIsOpen(type, RECENT, NOW)).toBe(true);
    }
  });

  it("closes after 24 hours on every Meta channel", () => {
    for (const type of ["whatsapp", "facebook", "instagram"] as const) {
      expect(windowIsOpen(type, STALE, NOW)).toBe(false);
    }
  });

  it("is always open for email, even with no inbound message at all", () => {
    expect(windowIsOpen("email", STALE, NOW)).toBe(true);
    expect(windowIsOpen("email", null, NOW)).toBe(true);
    expect(channelHasReplyWindow("email")).toBe(false);
  });

  it("is closed for a Meta contact who has never written in", () => {
    expect(windowIsOpen("whatsapp", null, NOW)).toBe(false);
  });

  it("expires exactly 24 hours after the last inbound message", () => {
    expect(windowExpiresAt("facebook", RECENT)).toEqual(
      new Date(RECENT.getTime() + CUSTOMER_SERVICE_WINDOW_MS),
    );
  });

  it("reports no expiry for email, so the UI has no countdown to show", () => {
    expect(windowExpiresAt("email", RECENT)).toBeNull();
  });
});

describe("webhook routing", () => {
  it("maps Meta's product names onto channel types", () => {
    expect(messagingChannelType("page")).toBe("facebook");
    expect(messagingChannelType("instagram")).toBe("instagram");
  });

  it("leaves WhatsApp to the changes[] branch", () => {
    expect(messagingChannelType("whatsapp_business_account")).toBeNull();
  });
});

describe("contact addressing", () => {
  /** Only the two fields contactAddress reads; the rest of Contact is irrelevant here. */
  const contact = (externalId: string | null, whatsappNumber: string | null) =>
    ({ externalId, whatsappNumber }) as Parameters<typeof contactAddress>[0];

  it("prefers the channel-native id", () => {
    expect(contactAddress(contact("psid-1", "15551234567"))).toBe("psid-1");
  });

  it("falls back to the number for contacts predating multi-channel", () => {
    expect(contactAddress(contact(null, "15551234567"))).toBe("15551234567");
  });

  it("returns null when there is nowhere to send", () => {
    expect(contactAddress(contact(null, null))).toBeNull();
  });
});

describe("email threading", () => {
  it("adds a Re: prefix so the reply joins the thread", () => {
    expect(ensureReplyPrefix("Order #42")).toBe("Re: Order #42");
  });

  it("does not stack prefixes on a subject that already has one", () => {
    expect(ensureReplyPrefix("Re: Order #42")).toBe("Re: Order #42");
    expect(ensureReplyPrefix("RE: Order #42")).toBe("RE: Order #42");
  });
});

describe("channel naming", () => {
  it("names a WhatsApp channel by its number", () => {
    expect(describeChannel({ type: "whatsapp", displayPhoneNumber: "+1 555 000 1234" })).toBe(
      "+1 555 000 1234",
    );
  });

  it("names a Page by its title and an Instagram account by its handle", () => {
    expect(describeChannel({ type: "facebook", displayName: "Acme Support" })).toBe("Acme Support");
    expect(describeChannel({ type: "instagram", displayName: "@acme" })).toBe("@acme");
  });

  it("falls back to the account id, then to the channel's own name", () => {
    expect(describeChannel({ type: "email", externalId: "support@acme.com" })).toBe("support@acme.com");
    expect(describeChannel({ type: "email" })).toBe(CHANNEL_LABELS.email);
  });
});
