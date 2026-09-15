import { Injectable } from "@nestjs/common";
import { decryptToken } from "../../common/token-encryption";
import { EntitlementsService } from "../entitlements/entitlements.service";
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

const LEAD_FIELDS = "id,created_time,ad_id,form_id,field_data";

/**
 * Graph API calls for Meta lead ads. Separate from MetaGraphClient because
 * these authenticate with a Page access token rather than a WABA one, but
 * metered through the same EntitlementsService counter so lead syncing
 * can't sidestep the plan's monthly API quota.
 */
@Injectable()
export class MetaLeadsClient {
  constructor(private readonly entitlements: EntitlementsService) {}

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
      questions: (res.questions ?? [])
        .map((question) => ({
          key: question.key ?? "",
          label: question.label ?? question.key ?? "",
          type: question.type,
        }))
        .filter((question) => question.key.length > 0),
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
}
