import { Injectable, Logger } from "@nestjs/common";
import type { ChannelType } from "@starpos-crm/shared";
import { decryptToken } from "../../common/token-encryption";
import { EntitlementsService } from "../entitlements/entitlements.service";
import {
  GRAPH_API_BASE,
  MetaApiError,
  describeMetaError,
  type MetaErrorBody,
} from "../whatsapp/meta-graph.client";

/**
 * The webhook fields a Page has to be subscribed to before Meta will deliver
 * anything to us. Subscribing happens on connect so the operator never has to
 * click "Subscribe" in the App Dashboard by hand.
 */
export const PAGE_SUBSCRIBED_FIELDS = [
  "messages",
  "messaging_postbacks",
  "message_reads",
  "message_reactions",
  "messaging_handovers",
].join(",");

export interface MessengerChannelCredentials {
  tenantId: string;
  type: ChannelType;
  /** Page id for Messenger, Instagram business account id for Instagram DMs. */
  externalId: string | null;
  accessTokenEncrypted: string;
}

export interface MessengerProfile {
  name: string | null;
  username: string | null;
}

/**
 * Facebook Messenger and Instagram DMs share one Send API and one Page access
 * token; only the id the request is addressed to differs. Kept separate from
 * MetaGraphClient because WhatsApp's Cloud API speaks a different message
 * shape (`messaging_product` + `to`) even though it lives on the same host.
 */
@Injectable()
export class MessengerClient {
  private readonly logger = new Logger(MessengerClient.name);

  constructor(private readonly entitlements: EntitlementsService) {}

  /**
   * Meta calls the 24-hour rule the "standard messaging window" here; outside
   * it a send is rejected unless it carries a message tag, which this product
   * does not use.
   */
  async sendTextMessage(
    channel: MessengerChannelCredentials,
    recipientId: string,
    text: string,
  ): Promise<{ messageId: string }> {
    const accountId = requireAccountId(channel);
    const res = (await this.graphFetch(channel, `/${accountId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
        messaging_type: "RESPONSE",
      }),
    })) as { message_id?: string };

    if (!res.message_id) throw new MetaApiError("Meta API response did not include a message id");
    return { messageId: res.message_id };
  }

  /**
   * Best-effort display name for an inbound sender. Meta returns 400 for a
   * person who has not interacted with the Page recently, or when the app
   * lacks the profile permission, so a failure downgrades to "no name" rather
   * than dropping the message.
   */
  async fetchProfile(
    channel: MessengerChannelCredentials,
    userId: string,
  ): Promise<MessengerProfile> {
    const fields = channel.type === "instagram" ? "name,username" : "name";
    try {
      const res = (await this.graphFetch(channel, `/${userId}?fields=${fields}`, { method: "GET" })) as {
        name?: string;
        username?: string;
      };
      return { name: res.name ?? null, username: res.username ?? null };
    } catch (err) {
      this.logger.debug(`No profile for ${userId}: ${err instanceof Error ? err.message : err}`);
      return { name: null, username: null };
    }
  }

  /** Points the Page's message webhooks at this app. Safe to repeat. */
  async subscribePageToApp(channel: MessengerChannelCredentials, pageId: string): Promise<void> {
    await this.graphFetch(channel, `/${pageId}/subscribed_apps`, {
      method: "POST",
      body: JSON.stringify({ subscribed_fields: PAGE_SUBSCRIBED_FIELDS }),
    });
  }

  /**
   * Confirms the token really belongs to the Page id the operator typed in —
   * a mismatch here is the single most common setup mistake, and catching it
   * on save beats silently never receiving a message.
   */
  async getPage(
    channel: MessengerChannelCredentials,
    pageId: string,
  ): Promise<{ id: string; name: string | null }> {
    const res = (await this.graphFetch(channel, `/${pageId}?fields=id,name`, { method: "GET" })) as {
      id?: string;
      name?: string;
    };
    if (!res.id) throw new MetaApiError("Meta did not return this Page — check the Page ID and token");
    return { id: res.id, name: res.name ?? null };
  }

  /** Same check for an Instagram business account, which answers with its username. */
  async getInstagramAccount(
    channel: MessengerChannelCredentials,
    igAccountId: string,
  ): Promise<{ id: string; username: string | null }> {
    const res = (await this.graphFetch(channel, `/${igAccountId}?fields=id,username`, {
      method: "GET",
    })) as { id?: string; username?: string };
    if (!res.id) {
      throw new MetaApiError("Meta did not return this Instagram account — check the account ID and token");
    }
    return { id: res.id, username: res.username ?? null };
  }

  private async graphFetch(
    channel: MessengerChannelCredentials,
    path: string,
    init: RequestInit,
  ): Promise<unknown> {
    // Metered on the same monthly quota as WhatsApp Graph calls — one plan
    // limit covers every Meta API call the tenant makes, whatever the channel.
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
      const err = (body as { error?: MetaErrorBody }).error;
      throw new MetaApiError(
        describeMetaError(err) ?? `Meta API request failed (${res.status})`,
        err?.code,
        err?.error_subcode,
      );
    }
    return body;
  }
}

function requireAccountId(channel: MessengerChannelCredentials): string {
  if (!channel.externalId) {
    throw new MetaApiError(
      channel.type === "instagram"
        ? "This channel has no Instagram account id"
        : "This channel has no Facebook Page id",
    );
  }
  return channel.externalId;
}
