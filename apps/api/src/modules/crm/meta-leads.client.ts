import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { decryptToken } from "../../common/token-encryption";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { PlatformSettingsService } from "../platform/platform-settings.service";
import { GRAPH_API_BASE, MetaApiError, describeMetaError } from "../whatsapp/meta-graph.client";
import type { MetaLeadRecord } from "./meta-lead-mapping";

/** One question as Meta describes it on a lead form. */
export interface MetaFormQuestion {
  key: string;
  label: string;
  type?: string;
}

export interface MetaFormDetails {
  id: string;
  name?: string;
  pageName?: string;
  questions: MetaFormQuestion[];
}

/** A Facebook Page the connecting person manages, with its Page token. */
export interface MetaPage {
  id: string;
  name: string | null;
  accessToken: string;
}

/** A lead form as listed on a Page. */
export interface MetaPageForm {
  id: string;
  name: string | null;
  /** ACTIVE, ARCHIVED, DELETED, DRAFT. */
  status: string | null;
  questions: MetaFormQuestion[];
}

const LEAD_FIELDS = "id,created_time,ad_id,form_id,field_data";

/**
 * Graph API calls for Meta lead ads. Separate from MetaGraphClient because
 * these authenticate with a Page access token rather than a WABA one, but
 * metered through the same EntitlementsService counter so lead syncing
 * can't sidestep the plan's monthly API quota.
 */
@Injectable()
export class MetaLeadsClient {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /** Fetches one lead by the id Meta sends in the leadgen webhook. */
  async fetchLead(
    tenantId: string,
    encryptedToken: string,
    leadgenId: string,
  ): Promise<MetaLeadRecord> {
    return (await this.graphFetch(
      tenantId,
      encryptedToken,
      `/${encodeURIComponent(leadgenId)}?fields=${LEAD_FIELDS}`,
    )) as MetaLeadRecord;
  }

  /** Pulls the most recent leads on a form — the catch-up path when webhooks were not wired yet. */
  async fetchFormLeads(
    tenantId: string,
    encryptedToken: string,
    formId: string,
    limit = 50,
  ): Promise<MetaLeadRecord[]> {
    const capped = Math.min(Math.max(limit, 1), 100);
    const res = (await this.graphFetch(
      tenantId,
      encryptedToken,
      `/${encodeURIComponent(formId)}/leads?fields=${LEAD_FIELDS}&limit=${capped}`,
    )) as { data?: MetaLeadRecord[] };
    return res.data ?? [];
  }

  /** Reads a form's name and questions so the mapping screen has real choices to offer. */
  async fetchFormDetails(
    tenantId: string,
    encryptedToken: string,
    formId: string,
  ): Promise<MetaFormDetails> {
    const res = (await this.graphFetch(
      tenantId,
      encryptedToken,
      `/${encodeURIComponent(formId)}?fields=id,name,questions,page`,
    )) as {
      id?: string;
      name?: string;
      page?: { name?: string };
      questions?: { key?: string; label?: string; type?: string }[];
    };

    return {
      id: res.id ?? formId,
      name: res.name,
      pageName: res.page?.name,
      questions: toQuestions(res.questions),
    };
  }

  private async graphFetch(tenantId: string, encryptedToken: string, path: string): Promise<unknown> {
    // Metered like every other Graph call this app makes.
    await this.entitlements.checkAndIncrementApiUsage(tenantId);

    const accessToken = decryptToken(encryptedToken);
    const res = await fetch(`${GRAPH_API_BASE}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });

    return parseGraphResponse(res);
  }

  // --- "Connect with Meta": login and discovery ---
  //
  // These run once per connect or refresh rather than per lead, so they are
  // not metered against the plan's API quota: a tenant at their limit should
  // still be able to reconnect.

  /** Trades the JS SDK's login code for a user token. */
  async exchangeCode(code: string): Promise<string> {
    const { appId, appSecret } = await this.requireAppCredentials();
    const body = (await this.graphRaw(
      `/oauth/access_token?client_id=${appId}&client_secret=${encodeURIComponent(appSecret)}` +
        `&code=${encodeURIComponent(code)}`,
    )) as { access_token?: string };
    if (!body.access_token) throw new MetaApiError("Meta did not return an access token for this login");
    return body.access_token;
  }

  /** A short-lived user token becomes a ~60 day one; Page tokens read with it do not expire. */
  async extendUserToken(shortLivedToken: string): Promise<string> {
    const { appId, appSecret } = await this.requireAppCredentials();
    const body = (await this.graphRaw(
      `/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}` +
        `&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`,
    )) as { access_token?: string };
    if (!body.access_token) throw new MetaApiError("Meta did not return a long-lived token");
    return body.access_token;
  }

  async fetchMe(userToken: string): Promise<{ id: string; name?: string }> {
    return (await this.graphRaw("/me?fields=id,name", userToken)) as { id: string; name?: string };
  }

  /** Every Page the person granted, each with its own Page token. */
  async listPages(userToken: string): Promise<MetaPage[]> {
    const rows = await this.graphPaged<{ id: string; name?: string; access_token?: string }>(
      "/me/accounts?fields=id,name,access_token&limit=100",
      userToken,
    );
    return rows
      .filter((row) => row.id && row.access_token)
      .map((row) => ({ id: row.id, name: row.name ?? null, accessToken: row.access_token! }));
  }

  /** Subscribes this app to the Page's leadgen webhook, so its submissions reach /webhooks/meta. */
  async subscribePageToLeadgen(pageId: string, pageToken: string): Promise<void> {
    await this.graphRaw(
      `/${encodeURIComponent(pageId)}/subscribed_apps?subscribed_fields=leadgen`,
      pageToken,
      "POST",
    );
  }

  async listPageForms(pageId: string, pageToken: string): Promise<MetaPageForm[]> {
    const rows = await this.graphPaged<{
      id: string;
      name?: string;
      status?: string;
      questions?: { key?: string; label?: string; type?: string }[];
    }>(`/${encodeURIComponent(pageId)}/leadgen_forms?fields=id,name,status,questions&limit=100`, pageToken);
    return rows.map((row) => ({
      id: row.id,
      name: row.name ?? null,
      status: row.status ?? null,
      questions: toQuestions(row.questions),
    }));
  }

  /** Reads one form with a plain Page token — used when a webhook names a form nobody linked yet. */
  async fetchFormWithPageToken(formId: string, pageToken: string): Promise<MetaPageForm> {
    const row = (await this.graphRaw(
      `/${encodeURIComponent(formId)}?fields=id,name,status,questions`,
      pageToken,
    )) as { id?: string; name?: string; status?: string; questions?: { key?: string; label?: string; type?: string }[] };
    return {
      id: row.id ?? formId,
      name: row.name ?? null,
      status: row.status ?? null,
      questions: toQuestions(row.questions),
    };
  }

  private async requireAppCredentials(): Promise<{ appId: string; appSecret: string }> {
    const [{ metaAppId }, appSecret] = await Promise.all([
      this.platformSettings.getPublicConfig(),
      this.platformSettings.getDecryptedAppSecret(),
    ]);
    if (!metaAppId || !appSecret) {
      throw new ServiceUnavailableException(
        "Meta login is not configured — set the Meta App credentials in the Agency console first",
      );
    }
    return { appId: metaAppId, appSecret };
  }

  /** Follows Graph's cursor paging; capped so a runaway account can't loop forever. */
  private async graphPaged<T>(path: string, token: string, maxPages = 20): Promise<T[]> {
    const rows: T[] = [];
    let next: string | undefined = `${GRAPH_API_BASE}${path}`;
    for (let page = 0; next && page < maxPages; page++) {
      const body = (await this.graphRaw(next, token)) as { data?: T[]; paging?: { next?: string } };
      rows.push(...(body.data ?? []));
      next = body.paging?.next;
    }
    return rows;
  }

  /** An unmetered Graph call with a plain token. `pathOrUrl` may be a full paging URL. */
  private async graphRaw(pathOrUrl: string, token?: string, method: "GET" | "POST" = "GET"): Promise<unknown> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${GRAPH_API_BASE}${pathOrUrl}`;
    const res = await fetch(url, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return parseGraphResponse(res);
  }
}

function toQuestions(raw?: { key?: string; label?: string; type?: string }[]): MetaFormQuestion[] {
  return (raw ?? [])
    .map((question) => ({
      key: question.key ?? "",
      label: question.label ?? question.key ?? "",
      type: question.type,
    }))
    .filter((question) => question.key.length > 0);
}

async function parseGraphResponse(res: Response): Promise<unknown> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (body as { error?: { message?: string; code?: number; error_subcode?: number } }).error;
    throw new MetaApiError(
      describeMetaError(err) ?? `Meta API request failed (${res.status})`,
      err?.code,
      err?.error_subcode,
    );
  }
  return body;
}
