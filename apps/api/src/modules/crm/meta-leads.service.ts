import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@starpos-crm/db";
import { PrismaService } from "../../prisma/prisma.service";
import { decryptToken } from "../../common/token-encryption";
import { CustomFieldsService } from "../custom-fields/custom-fields.service";
import { MetaLeadsClient } from "./meta-leads.client";
import { normalizeCustomFieldValues } from "../custom-fields/custom-field-values";
import { leadDisplayName, mapMetaLead, type MetaLeadRecord } from "./meta-lead-mapping";

/** The slice of the leadgen webhook payload this service acts on. */
export interface LeadgenNotification {
  leadgenId: string;
  formId?: string;
  pageId?: string;
  adId?: string;
}

export interface IngestOutcome {
  created: number;
  skipped: number;
}

/**
 * Turns a Meta lead ad submission into a Lead row. Reached two ways: the
 * leadgen webhook (near real time) and an operator-triggered sync (catch-up
 * for anything submitted before the webhook was wired). Both funnel through
 * ingestRecord so the mapping rules stay in one place.
 */
@Injectable()
export class MetaLeadsService {
  private readonly logger = new Logger(MetaLeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customFields: CustomFieldsService,
    private readonly client: MetaLeadsClient,
  ) {}

  /**
   * Webhook path. It carries no tenant context, so the form id is the only
   * way back to a tenant — and more than one tenant may have linked the same
   * form, so every active link gets the lead.
   */
  async ingestLeadgen(notification: LeadgenNotification): Promise<IngestOutcome> {
    const { leadgenId, formId, pageId } = notification;
    const links: LinkForIngest[] = await this.prisma.metaLeadForm.findMany({
      where: {
        isActive: true,
        ...(formId ? { formId } : {}),
        ...(formId ? {} : pageId ? { pageId } : {}),
      },
      include: WITH_CONNECTION_MAPPING,
    });
    if (formId && pageId) links.push(...(await this.autoLinkNewForm(formId, pageId)));

    if (links.length === 0) {
      this.logger.warn(`Leadgen ${leadgenId} arrived for form ${formId ?? "?"} with no active link`);
      return { created: 0, skipped: 0 };
    }

    const outcome: IngestOutcome = { created: 0, skipped: 0 };
    for (const link of links) {
      try {
        const record = await this.client.fetchLead(
          link.tenantId,
          link.pageAccessTokenEncrypted,
          leadgenId,
        );
        const result = await this.ingestRecord(link, { ...record, ad_id: record.ad_id ?? notification.adId });
        outcome.created += result.created;
        outcome.skipped += result.skipped;
      } catch (error) {
        // One tenant's expired page token must not stop the others, and the
        // queue's own retry will pick this up again.
        this.logger.error(
          `Failed to ingest leadgen ${leadgenId} for tenant ${link.tenantId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return outcome;
  }

  /** Operator-triggered catch-up: pulls the form's recent leads and stores the new ones. */
  async syncForm(tenantId: string, linkId: string, limit = 50): Promise<IngestOutcome> {
    const link = await this.prisma.metaLeadForm.findFirst({
      where: { id: linkId, tenantId },
      include: WITH_CONNECTION_MAPPING,
    });
    if (!link) return { created: 0, skipped: 0 };

    const records = await this.client.fetchFormLeads(
      tenantId,
      link.pageAccessTokenEncrypted,
      link.formId,
      limit,
    );

    const outcome: IngestOutcome = { created: 0, skipped: 0 };
    // Oldest first, so the newest lead ends up with the newest createdAt.
    for (const record of [...records].reverse()) {
      const result = await this.ingestRecord(link, record);
      outcome.created += result.created;
      outcome.skipped += result.skipped;
    }

    await this.prisma.metaLeadForm.update({
      where: { id: link.id },
      data: { lastSyncAt: new Date() },
    });
    return outcome;
  }

  /**
   * A form created after "Connect with Meta" has no link yet, but its Page
   * does. Every tenant holding that Page through a connection — and without
   * this form linked at all (a paused link is a deliberate choice) — gets it
   * linked here, so its very first lead is not lost.
   */
  private async autoLinkNewForm(formId: string, pageId: string): Promise<LinkForIngest[]> {
    const pages = await this.prisma.metaLeadPage.findMany({
      where: { pageId },
      include: { connection: { select: { defaultStatus: true } } },
    });
    if (pages.length === 0) return [];

    const alreadyLinked = new Set(
      (
        await this.prisma.metaLeadForm.findMany({
          where: { formId, tenantId: { in: pages.map((page) => page.tenantId) } },
          select: { tenantId: true },
        })
      ).map((link) => link.tenantId),
    );

    const created: LinkForIngest[] = [];
    for (const page of pages) {
      if (alreadyLinked.has(page.tenantId)) continue;

      let details: { name: string | null; questions: unknown[] } = { name: null, questions: [] };
      try {
        details = await this.client.fetchFormWithPageToken(formId, decryptToken(page.pageAccessTokenEncrypted));
      } catch (error) {
        // The name is cosmetic; the lead itself still has to come in.
        this.logger.warn(`Could not read new Meta form ${formId}: ${error instanceof Error ? error.message : error}`);
      }

      try {
        created.push(
          await this.prisma.metaLeadForm.create({
            data: {
              tenantId: page.tenantId,
              connectionId: page.connectionId,
              pageId,
              pageName: page.pageName,
              formId,
              formName: details.name,
              pageAccessTokenEncrypted: page.pageAccessTokenEncrypted,
              defaultStatus: page.connection.defaultStatus,
              questionsJson: details.questions as Prisma.InputJsonValue,
            },
            include: WITH_CONNECTION_MAPPING,
          }),
        );
        this.logger.log(`Linked new Meta form ${formId} for tenant ${page.tenantId} from its first lead`);
      } catch (error) {
        // A concurrent webhook for the same form linked it first.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      }
    }
    return created;
  }

  /** Writes one Meta lead, or skips it if this tenant already has it. */
  private async ingestRecord(link: LinkForIngest, record: MetaLeadRecord): Promise<IngestOutcome> {
    if (!record?.id) return { created: 0, skipped: 1 };

    const existing = await this.prisma.lead.findFirst({
      where: { tenantId: link.tenantId, metaLeadId: record.id },
      select: { id: true },
    });
    if (existing) return { created: 0, skipped: 1 };

    const definitions = await this.customFields.listDefinitions(link.tenantId, "lead");
    // The connection's default mapping covers every form; a form's own wins.
    const mapping = {
      ...readMapping(link.connection?.defaultFieldMappingJson ?? null),
      ...readMapping(link.fieldMappingJson),
    };
    const mapped = mapMetaLead(
      record,
      mapping,
      definitions.filter((d) => d.isActive).map((d) => d.key),
    );

    // enforceRequired is off on purpose: a real lead the tenant paid for
    // must never be dropped because an internal field is marked required.
    const customFields = normalizeCustomFieldValues(definitions, mapped.custom, {
      enforceRequired: false,
    });

    try {
      await this.prisma.lead.create({
        data: {
          tenantId: link.tenantId,
          name: leadDisplayName(mapped),
          phone: mapped.phone,
          email: mapped.email,
          company: mapped.company,
          notes: buildNotes(mapped.notes, mapped.unmapped),
          source: "meta_ads",
          status: link.defaultStatus as never,
          customFieldsJson: customFields,
          metaLeadId: record.id,
          metaFormLinkId: link.id,
          metaAdId: record.ad_id ?? null,
          sourcePayloadJson: record as never,
          // Meta's own submission time, so a catch-up sync doesn't relabel
          // week-old leads as arriving today.
          ...(parseCreatedTime(record.created_time)
            ? { createdAt: parseCreatedTime(record.created_time)! }
            : {}),
        },
      });
    } catch (error) {
      // metaLeadId is unique across tenants: if another tenant linked the
      // same form first, the lead is already recorded and this one is a
      // duplicate rather than a failure.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { created: 0, skipped: 1 };
      }
      throw error;
    }

    await this.prisma.metaLeadForm.update({
      where: { id: link.id },
      data: { leadCount: { increment: 1 }, lastLeadAt: new Date() },
    });
    return { created: 1, skipped: 0 };
  }
}

const WITH_CONNECTION_MAPPING = {
  connection: { select: { defaultFieldMappingJson: true } },
} satisfies Prisma.MetaLeadFormInclude;

/** A linked form plus its connection's default mapping, as ingestion needs it. */
type LinkForIngest = {
  id: string;
  tenantId: string;
  formId: string;
  formName: string | null;
  defaultStatus: string;
  fieldMappingJson: Prisma.JsonValue;
  pageAccessTokenEncrypted: string;
  connection: { defaultFieldMappingJson: Prisma.JsonValue } | null;
};

function readMapping(value: Prisma.JsonValue): Record<string, string> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value).filter(([, target]) => typeof target === "string");
  return Object.fromEntries(entries) as Record<string, string>;
}

/** Questions with nowhere to go are still worth showing the salesperson. */
function buildNotes(notes: string | null, unmapped: Record<string, string>): string | null {
  const extras = Object.entries(unmapped).map(([question, value]) => `${question}: ${value}`);
  const parts = [notes, ...extras].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join("\n") : null;
}

function parseCreatedTime(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
