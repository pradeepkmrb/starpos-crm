import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PlatformSettingsService } from "../platform/platform-settings.service";
import { GRAPH_API_BASE, MetaApiError } from "./meta-graph.client";

/**
 * Handles the Meta Embedded Signup OAuth exchange — distinct from
 * MetaGraphClient because these calls authenticate with the *platform's*
 * Meta App credentials, not a per-tenant channel token.
 */
@Injectable()
export class MetaOAuthService {
  constructor(private readonly platformSettings: PlatformSettingsService) {}

  async exchangeCodeForToken(code: string): Promise<string> {
    const { appId, appSecret } = await this.requireAppCredentials();
    const url = `${GRAPH_API_BASE}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`;
    const body = (await this.graphGet(url)) as { access_token?: string };
    if (!body.access_token) throw new MetaApiError("Token exchange did not return an access token");
    return body.access_token;
  }

  /** Exchanges a short-lived user token for a 60-day long-lived token. */
  async getLongLivedToken(shortLivedToken: string): Promise<string> {
    const { appId, appSecret } = await this.requireAppCredentials();
    const url =
      `${GRAPH_API_BASE}/oauth/access_token?grant_type=fb_exchange_token` +
      `&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`;
    const body = (await this.graphGet(url)) as { access_token?: string };
    if (!body.access_token) throw new MetaApiError("Long-lived token exchange did not return an access token");
    return body.access_token;
  }

  async getPhoneNumberDetails(phoneNumberId: string, accessToken: string): Promise<{ displayPhoneNumber: string }> {
    const url = `${GRAPH_API_BASE}/${phoneNumberId}?fields=display_phone_number`;
    const body = (await this.graphGet(url, accessToken)) as { display_phone_number?: string };
    if (!body.display_phone_number) throw new MetaApiError("Could not read the phone number's display number");
    return { displayPhoneNumber: body.display_phone_number };
  }

  /**
   * Attaches the tenant's WABA to the platform's webhook subscription — the
   * step that actually implements "each tenant's WABA added under the Tech
   * Provider". Without this, inbound messages/status webhooks for the newly
   * connected number never arrive at our single platform-wide endpoint.
   */
  async subscribeAppToWaba(wabaId: string, accessToken: string): Promise<void> {
    const url = `${GRAPH_API_BASE}/${wabaId}/subscribed_apps`;
    await this.graphPost(url, accessToken);
  }

  private async requireAppCredentials(): Promise<{ appId: string; appSecret: string }> {
    const [{ metaAppId }, appSecret] = await Promise.all([
      this.platformSettings.getPublicConfig(),
      this.platformSettings.getDecryptedAppSecret(),
    ]);
    if (!metaAppId || !appSecret) {
      throw new ServiceUnavailableException(
        "Embedded Signup is not configured — set the Meta App credentials in Platform Admin settings first",
      );
    }
    return { appId: metaAppId, appSecret };
  }

  private async graphGet(url: string, accessToken?: string): Promise<unknown> {
    const res = await fetch(url, accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {});
    return this.parseGraphResponse(res);
  }

  private async graphPost(url: string, accessToken: string): Promise<unknown> {
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
    return this.parseGraphResponse(res);
  }

  private async parseGraphResponse(res: Response): Promise<unknown> {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (body as { error?: { message?: string; code?: number; error_subcode?: number } }).error;
      throw new MetaApiError(err?.message ?? `Meta API request failed (${res.status})`, err?.code, err?.error_subcode);
    }
    return body;
  }
}
