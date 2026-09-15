/**
 * The documented surface of the public REST API, in one list. Each entry
 * mirrors a route on PublicApiController (apps/api) — keep the two in step
 * when adding an endpoint, since this is the only documentation tenants get.
 */

export type HttpMethod = "GET" | "POST" | "PATCH";

export interface Endpoint {
  method: HttpMethod;
  path: string;
  summary: string;
  /** Rendered as a highlighted caveat under the summary. */
  note?: string;
  /** Request body, pretty-printed, for the curl example. Omitted for GETs. */
  body?: unknown;
  /** Example response, pretty-printed. */
  response: unknown;
}

export interface EndpointSection {
  id: string;
  title: string;
  blurb?: string;
  endpoints: Endpoint[];
}

export const ENDPOINT_SECTIONS: EndpointSection[] = [
  {
    id: "authentication",
    title: "Authentication",
    endpoints: [
      {
        method: "GET",
        path: "/me",
        summary: "Verify your API key — returns workspace info, channels, usage and plan limits.",
        response: {
          workspace: { id: "clw1tenant", name: "Acme Retail", slug: "acme-retail", timezone: "Asia/Kolkata", status: "active" },
          plan: { code: "professional", name: "Professional" },
          apiKey: { id: "clw1key", name: "Default key", prefix: "1d4a4cc5", lastUsedAt: "2026-09-15T05:31:12.004Z" },
          channels: [
            { id: "clw1chan", displayPhoneNumber: "+91 98765 43210", phoneNumberId: "109876543210987", status: "active" },
          ],
          usage: { contacts: 1420, channels: 1, automations: 3, teamSeats: 4, apiRequests: 8123 },
          limits: { maxContacts: 5000, maxChannels: 3, maxAutomations: 10, maxTeamSeats: 5, maxApiRequestsPerMonth: 50000 },
        },
      },
    ],
  },
  {
    id: "messages",
    title: "Messages",
    blurb:
      "Open-session vs template: free-form messages (text, media, interactive buttons and lists below) can only be sent inside the 24-hour customer-service window — i.e. after the customer messaged you within the last 24 hours. To message a customer outside that window, use an approved template message.",
    endpoints: [
      {
        method: "POST",
        path: "/messages/send",
        summary: "Send a text message to a customer.",
        note: "Requires an open 24-hour window. Returns 400 with code invalid_request when it has closed.",
        body: { to: "+919876543210", text: "Your order #1425 has shipped 🎉", previewUrl: false },
        response: {
          id: "clw1msg",
          waMessageId: "wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSN0Y…",
          to: "919876543210",
          type: "text",
          status: "sent",
          contactId: "clw1contact",
          channelId: "clw1chan",
          createdAt: "2026-09-15T05:32:04.117Z",
        },
      },
      {
        method: "POST",
        path: "/messages/send-template",
        summary:
          "Send an approved template. The only send that works outside the 24-hour window, so this is how you start a conversation.",
        note: "bodyVariables fill {{1}}, {{2}}… in order. Pass a raw components array instead for full control.",
        body: {
          to: "+919876543210",
          templateName: "order_shipped",
          languageCode: "en_US",
          bodyVariables: ["Priya", "1425"],
          headerMedia: { type: "image", link: "https://cdn.example.com/parcel.jpg" },
        },
        response: {
          id: "clw1msg2",
          waMessageId: "wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQTk…",
          to: "919876543210",
          type: "template",
          status: "sent",
          contactId: "clw1contact",
          channelId: "clw1chan",
          createdAt: "2026-09-15T05:33:41.882Z",
        },
      },
      {
        method: "POST",
        path: "/messages/send-media",
        summary: "Send an image, video, document, audio file or sticker.",
        note:
          "Requires an open 24-hour window. Give either a public https link Meta can fetch, or the mediaId of a file already uploaded to the number. filename applies to documents only; audio and stickers take no caption.",
        body: {
          to: "+919876543210",
          type: "document",
          link: "https://cdn.example.com/invoices/1425.pdf",
          filename: "invoice-1425.pdf",
          caption: "Your invoice",
        },
        response: {
          id: "clw1msg3",
          waMessageId: "wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSMEI…",
          to: "919876543210",
          type: "document",
          status: "sent",
          contactId: "clw1contact",
          channelId: "clw1chan",
          createdAt: "2026-09-15T05:35:09.500Z",
        },
      },
      {
        method: "POST",
        path: "/messages/send-interactive",
        summary: "Send reply buttons (up to three) or a list picker (up to ten sections).",
        note:
          "Requires an open 24-hour window. The id you set on each button or row comes back on your webhook when the customer taps it.",
        body: {
          to: "+919876543210",
          type: "button",
          bodyText: "Your order is ready. How would you like it?",
          footerText: "Acme Retail",
          buttons: [
            { id: "pickup", title: "Store pickup" },
            { id: "delivery", title: "Home delivery" },
          ],
        },
        response: {
          id: "clw1msg4",
          waMessageId: "wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSNzA…",
          to: "919876543210",
          type: "interactive",
          status: "sent",
          contactId: "clw1contact",
          channelId: "clw1chan",
          createdAt: "2026-09-15T05:36:22.041Z",
        },
      },
      {
        method: "GET",
        path: "/messages/{id}",
        summary: "Look up delivery state. Accepts the id we returned or Meta's wamid.",
        response: {
          id: "clw1msg",
          waMessageId: "wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSN0Y…",
          direction: "outbound",
          status: "delivered",
          channelId: "clw1chan",
          campaignId: null,
          contact: { id: "clw1contact", whatsappNumber: "919876543210", name: "Priya" },
          createdAt: "2026-09-15T05:32:04.117Z",
          statusUpdatedAt: "2026-09-15T05:32:07.960Z",
        },
      },
    ],
  },
  {
    id: "contacts",
    title: "Contacts",
    blurb:
      "Contacts are keyed on the phone number, so posting the same number twice updates rather than duplicates. sessionWindowOpen on each contact tells you whether a free-form send will go through right now.",
    endpoints: [
      {
        method: "GET",
        path: "/contacts",
        summary:
          "List contacts, newest id last. Supports limit (max 200), cursor, search, listId and optedIn.",
        note: "Paginate by passing the nextCursor from the previous response back as ?cursor=.",
        response: {
          data: [
            {
              id: "clw1contact",
              whatsappNumber: "919876543210",
              name: "Priya",
              email: "priya@example.com",
              languageCode: "en",
              optedIn: true,
              botEnabled: true,
              source: "api",
              attributes: { tier: "gold" },
              labels: [{ id: "clw1label", name: "VIP", color: "amber" }],
              lastInboundAt: "2026-09-15T04:10:00.000Z",
              sessionWindowOpen: true,
              sessionWindowExpiresAt: "2026-09-16T04:10:00.000Z",
              createdAt: "2026-08-02T09:15:11.000Z",
              updatedAt: "2026-09-15T04:10:00.000Z",
            },
          ],
          nextCursor: "clw1contact",
          hasMore: true,
        },
      },
      {
        method: "GET",
        path: "/contacts/by-number/{number}",
        summary: "Fetch one contact by phone number, when you do not hold our id.",
        response: {
          id: "clw1contact",
          whatsappNumber: "919876543210",
          name: "Priya",
          optedIn: true,
          sessionWindowOpen: true,
          sessionWindowExpiresAt: "2026-09-16T04:10:00.000Z",
        },
      },
      {
        method: "POST",
        path: "/contacts",
        summary: "Create a contact, or update the existing one with that number.",
        note: "created tells you which of the two happened. Counts against your plan's contact limit.",
        body: {
          whatsappNumber: "+919876543210",
          name: "Priya",
          email: "priya@example.com",
          languageCode: "en",
          attributes: { tier: "gold", city: "Chennai" },
        },
        response: {
          id: "clw1contact",
          whatsappNumber: "919876543210",
          name: "Priya",
          attributes: { tier: "gold", city: "Chennai" },
          optedIn: true,
          created: false,
        },
      },
      {
        method: "PATCH",
        path: "/contacts/{id}",
        summary: "Update named fields on a contact. Anything you leave out is untouched.",
        body: { optedIn: false, botEnabled: false },
        response: { id: "clw1contact", whatsappNumber: "919876543210", optedIn: false, botEnabled: false },
      },
      {
        method: "GET",
        path: "/lists",
        summary: "List the contact lists in this workspace, with their sizes.",
        response: [
          { id: "clw1list", name: "Diwali 2026", type: "static", contactCount: 840, createdAt: "2026-09-01T06:00:00.000Z" },
        ],
      },
    ],
  },
  {
    id: "templates",
    title: "Templates & channels",
    endpoints: [
      {
        method: "GET",
        path: "/templates",
        summary: "List approved templates you can send. Pass ?status=all to see pending and rejected ones too.",
        note: "bodyVariableCount is how many entries bodyVariables needs; headerFormat says what headerMedia to supply.",
        response: [
          {
            id: "clw1tpl",
            name: "order_shipped",
            language: "en_US",
            category: "utility",
            status: "approved",
            channelId: "clw1chan",
            bodyText: "Hi {{1}}, your order #{{2}} is on its way.",
            headerFormat: "IMAGE",
            bodyVariableCount: 2,
            updatedAt: "2026-09-10T11:02:00.000Z",
          },
        ],
      },
      {
        method: "GET",
        path: "/channels",
        summary: "List the WhatsApp numbers connected to this workspace.",
        note: "Pass channelId on a send when more than one is active, so we know which number to send from.",
        response: [
          {
            id: "clw1chan",
            displayPhoneNumber: "+91 98765 43210",
            phoneNumberId: "109876543210987",
            wabaId: "203040506070809",
            status: "active",
            messagingTier: "TIER_1K",
            createdAt: "2026-07-14T08:20:00.000Z",
          },
        ],
      },
    ],
  },
];

/** Every non-2xx response uses this envelope, whatever went wrong. */
export const ERROR_ENVELOPE = {
  error: {
    code: "invalid_request",
    message:
      "The 24-hour customer-service window closed at 2026-09-14T04:10:00.000Z. Send an approved template instead.",
    status: 400,
  },
};

export const ERROR_CODES: { code: string; status: string; meaning: string }[] = [
  { code: "unauthorized", status: "401", meaning: "The X-API-Key header was missing, unknown or revoked." },
  { code: "invalid_request", status: "400", meaning: "A field failed validation, or the 24-hour window has closed." },
  { code: "forbidden", status: "403", meaning: "A plan limit was reached — contacts, or monthly API requests." },
  { code: "not_found", status: "404", meaning: "No contact, message or channel with that id in this workspace." },
  { code: "rate_limited", status: "429", meaning: "Too many requests this minute. Retry after the Retry-After header." },
  { code: "whatsapp_error", status: "502", meaning: "Meta rejected the send; metaErrorCode carries their code." },
  { code: "internal_error", status: "500", meaning: "Something failed on our side. Safe to retry." },
];

/** Builds a copy-and-run curl invocation for an endpoint. */
export function curlFor(endpoint: Endpoint, baseUrl: string, apiKey: string): string {
  const url = `${baseUrl}${endpoint.path}`;
  const lines = [`curl -X ${endpoint.method} ${url} \\`, `  -H "X-API-Key: ${apiKey}"`];

  if (endpoint.body !== undefined) {
    lines[lines.length - 1] += ` \\`;
    lines.push(`  -H "Content-Type: application/json" \\`);
    lines.push(`  -d '${JSON.stringify(endpoint.body, null, 2)}'`);
  }
  return lines.join("\n");
}
