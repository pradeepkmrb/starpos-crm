import { Injectable } from "@nestjs/common";
import { decryptToken } from "../../common/token-encryption";
import { EntitlementsService } from "../entitlements/entitlements.service";

export const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION ?? "v21.0";
export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface ChannelCredentials {
  tenantId: string;
  wabaId: string;
  phoneNumberId: string;
  accessTokenEncrypted: string;
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    public code?: number,
    public subcode?: number,
  ) {
    super(message);
  }
}

interface SendMessageResult {
  waMessageId: string;
}

/**
 * Single choke point for every Meta Graph API call. Kept deliberately thin —
 * from Phase 5 onward, API-usage metering (EntitlementsService) hooks in
 * here so quota can't be bypassed by a new call site elsewhere.
 */
@Injectable()
export class MetaGraphClient {
  constructor(private readonly entitlements: EntitlementsService) {}

  async sendTemplateMessage(
    channel: ChannelCredentials,
    to: string,
    templateName: string,
    languageCode: string,
    components?: unknown[],
  ): Promise<SendMessageResult> {
    return this.sendMessage(channel, {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    });
  }

  /** Session (free-form text) message — only deliverable within Meta's 24h customer-service window. */
  async sendTextMessage(channel: ChannelCredentials, to: string, body: string): Promise<SendMessageResult> {
    return this.sendMessage(channel, {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    });
  }

  async listTemplates(channel: ChannelCredentials): Promise<unknown[]> {
    const res = await this.graphFetch(channel, `/${channel.wabaId}/message_templates?limit=50`, {
      method: "GET",
    });
    return (res as { data?: unknown[] }).data ?? [];
  }

  async createTemplate(
    channel: ChannelCredentials,
    params: { name: string; category: string; language: string; components: unknown[] },
  ): Promise<{ id: string; status: string }> {
    const res = (await this.graphFetch(channel, `/${channel.wabaId}/message_templates`, {
      method: "POST",
      body: JSON.stringify({
        name: params.name,
        category: params.category,
        language: params.language,
        components: params.components,
      }),
    })) as { id?: string; status?: string };

    if (!res.id) {
      throw new MetaApiError("Meta API response did not include a template id");
    }
    return { id: res.id, status: res.status ?? "PENDING" };
  }

  /**
   * Edits an existing template in place. Meta only accepts edits to APPROVED
   * or REJECTED templates, and the name and language are immutable — an edit
   * sends the template back through review.
   */
  async updateTemplate(
    channel: ChannelCredentials,
    metaTemplateId: string,
    params: { category?: string; components: unknown[] },
  ): Promise<void> {
    await this.graphFetch(channel, `/${metaTemplateId}`, {
      method: "POST",
      body: JSON.stringify({
        ...(params.category ? { category: params.category } : {}),
        components: params.components,
      }),
    });
  }

  /**
   * Deletes by name. Passing hsm_id alongside removes just that one language;
   * without it Meta deletes every language version sharing the name.
   */
  async deleteTemplate(channel: ChannelCredentials, name: string, metaTemplateId?: string | null): Promise<void> {
    const query = new URLSearchParams({ name });
    if (metaTemplateId) query.set("hsm_id", metaTemplateId);
    await this.graphFetch(channel, `/${channel.wabaId}/message_templates?${query.toString()}`, {
      method: "DELETE",
    });
  }

  private async sendMessage(channel: ChannelCredentials, payload: unknown): Promise<SendMessageResult> {
    const res = (await this.graphFetch(channel, `/${channel.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify(payload),
    })) as { messages?: { id: string }[] };

    const waMessageId = res.messages?.[0]?.id;
    if (!waMessageId) {
      throw new MetaApiError("Meta API response did not include a message id");
    }
    return { waMessageId };
  }

  private async graphFetch(
    channel: ChannelCredentials,
    path: string,
    init: RequestInit,
  ): Promise<unknown> {
    // Metered here — the one place every Graph API call passes through — so
    // a new call site elsewhere can't slip past the plan's monthly quota.
    await this.entitlements.checkAndIncrementApiUsage(channel.tenantId);

    const accessToken = decryptToken(channel.accessTokenEncrypted);
    const res = await fetch(`${GRAPH_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (
        body as {
          error?: {
            message?: string;
            code?: number;
            error_subcode?: number;
            error_user_title?: string;
            error_user_msg?: string;
            error_data?: { details?: string };
          };
        }
      ).error;
      throw new MetaApiError(
        describeMetaError(err) ?? `Meta API request failed (${res.status})`,
        err?.code,
        err?.error_subcode,
      );
    }
    return body;
  }
}

/**
 * `error.message` is often just "Invalid parameter", with the sentence that
 * actually names the offending field tucked into error_data.details or
 * error_user_msg. Prefer whichever of those is present.
 */
export function describeMetaError(err?: {
  message?: string;
  error_user_title?: string;
  error_user_msg?: string;
  error_data?: { details?: string };
}): string | undefined {
  if (!err) return undefined;
  const detail = err.error_data?.details ?? err.error_user_msg ?? err.error_user_title;
  if (!detail) return err.message;
  if (!err.message) return detail;
  // Avoid "Invalid parameter: Invalid parameter" when they agree.
  return detail.includes(err.message) ? detail : `${err.message}: ${detail}`;
}
