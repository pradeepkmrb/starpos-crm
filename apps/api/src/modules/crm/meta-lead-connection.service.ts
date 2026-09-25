import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@digitel/db";
import { PrismaService } from "../../prisma/prisma.service";
import { decryptToken, encryptToken } from "../../common/token-encryption";
import { MetaLeadsClient } from "./meta-leads.client";
import { ConnectMetaLeadsDto, UpdateMetaLeadConnectionDto } from "./dto/meta-lead-connection.dto";

export interface PublicMetaLeadPage {
  pageId: string;
  pageName: string | null;
  subscribed: boolean;
  lastError: string | null;
}

/** The "Connect with Meta" login as the dashboard sees it — no tokens. */
export interface PublicMetaLeadConnection {
  fbUserId: string;
  fbUserName: string | null;
  defaultFieldMapping: Record<string, string>;
  defaultStatus: string;
  lastSyncAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  pages: PublicMetaLeadPage[];
}

export interface DiscoveryOutcome {
  pages: number;
  forms: number;
  newForms: number;
}

/**
 * "Connect with Meta" for lead ads: one Facebook login finds every Page the
 * person manages, subscribes the app to each Page's leadgen webhook and links
 * every lead form on them — replacing the copy-a-Page-token-by-hand flow.
 * The hand-linked flow in MetaLeadFormsService still works alongside it.
 */
@Injectable()
export class MetaLeadConnectionService {
  private readonly logger = new Logger(MetaLeadConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: MetaLeadsClient,
  ) {}

  async get(tenantId: string): Promise<{ connection: PublicMetaLeadConnection | null }> {
    const connection = await this.prisma.metaLeadConnection.findUnique({
      where: { tenantId },
      include: { pages: { orderBy: { pageName: "asc" } } },
    });
    return { connection: connection ? toPublic(connection) : null };
  }

  async connect(tenantId: string, userId: string, dto: ConnectMetaLeadsDto) {
    if (!dto.code && !dto.accessToken) {
      throw new BadRequestException("Meta did not hand back a login code — try connecting again");
    }

    let userToken: string;
    let me: { id: string; name?: string };
    try {
      const shortLived = dto.code ? await this.client.exchangeCode(dto.code) : dto.accessToken!;
      userToken = await this.client.extendUserToken(shortLived);
      me = await this.client.fetchMe(userToken);
    } catch (error) {
      throw new BadRequestException(`Meta rejected the login: ${messageOf(error)}`);
    }

    await this.prisma.metaLeadConnection.upsert({
      where: { tenantId },
      create: {
        tenantId,
        fbUserId: me.id,
        fbUserName: me.name ?? null,
        userTokenEncrypted: encryptToken(userToken),
        connectedByUserId: userId || null,
      },
      update: {
        fbUserId: me.id,
        fbUserName: me.name ?? null,
        userTokenEncrypted: encryptToken(userToken),
        connectedByUserId: userId || null,
        lastError: null,
      },
    });

    const discovered = await this.discover(tenantId);
    return { ...(await this.get(tenantId)), discovered };
  }

  /** Re-reads Pages and forms — picks up Pages granted and forms created since connecting. */
  async refresh(tenantId: string) {
    const discovered = await this.discover(tenantId);
    return { ...(await this.get(tenantId)), discovered };
  }

  async update(tenantId: string, dto: UpdateMetaLeadConnectionDto) {
    const connection = await this.prisma.metaLeadConnection.findUnique({ where: { tenantId } });
    if (!connection) throw new NotFoundException("Meta lead ads are not connected");

    const data: Prisma.MetaLeadConnectionUpdateInput = {};
    if (dto.defaultFieldMapping !== undefined) data.defaultFieldMappingJson = dto.defaultFieldMapping;
    if (dto.defaultStatus !== undefined) data.defaultStatus = dto.defaultStatus;
    await this.prisma.metaLeadConnection.update({ where: { tenantId }, data });
    return this.get(tenantId);
  }

  /**
   * Forgets the login, its Pages, and the forms it linked. Leads already
   * captured stay: their metaFormLinkId is set to null by the schema.
   */
  async disconnect(tenantId: string) {
    const connection = await this.prisma.metaLeadConnection.findUnique({ where: { tenantId } });
    if (!connection) throw new NotFoundException("Meta lead ads are not connected");

    const [{ count }] = await this.prisma.$transaction([
      this.prisma.metaLeadForm.deleteMany({ where: { tenantId, connectionId: connection.id } }),
      this.prisma.metaLeadConnection.delete({ where: { tenantId } }),
    ]);
    return { disconnected: true, formsRemoved: count };
  }

  private async discover(tenantId: string): Promise<DiscoveryOutcome> {
    const connection = await this.prisma.metaLeadConnection.findUnique({ where: { tenantId } });
    if (!connection) throw new NotFoundException("Meta lead ads are not connected");

    let pages;
    try {
      pages = await this.client.listPages(decryptToken(connection.userTokenEncrypted));
    } catch (error) {
      const message = `Could not list your Facebook Pages: ${messageOf(error)}`;
      await this.prisma.metaLeadConnection.update({ where: { tenantId }, data: { lastError: message } });
      throw new BadRequestException(`${message}. Reconnect with Meta and try again.`);
    }

    const outcome: DiscoveryOutcome = { pages: pages.length, forms: 0, newForms: 0 };
    const problems: string[] = [];

    for (const page of pages) {
      const pageToken = encryptToken(page.accessToken);
      const pageErrors: string[] = [];

      let subscribed = false;
      try {
        await this.client.subscribePageToLeadgen(page.id, page.accessToken);
        subscribed = true;
      } catch (error) {
        pageErrors.push(`webhook subscription failed: ${messageOf(error)}`);
      }

      let forms: Awaited<ReturnType<MetaLeadsClient["listPageForms"]>> = [];
      try {
        forms = await this.client.listPageForms(page.id, page.accessToken);
      } catch (error) {
        pageErrors.push(`could not list lead forms: ${messageOf(error)}`);
      }

      const pageError = pageErrors.length > 0 ? pageErrors.join("; ") : null;
      if (pageError) {
        problems.push(`${page.name ?? page.id}: ${pageError}`);
        this.logger.warn(`Meta lead page ${page.id} for tenant ${tenantId}: ${pageError}`);
      }

      await this.prisma.metaLeadPage.upsert({
        where: { tenantId_pageId: { tenantId, pageId: page.id } },
        create: {
          tenantId,
          connectionId: connection.id,
          pageId: page.id,
          pageName: page.name,
          pageAccessTokenEncrypted: pageToken,
          subscribed,
          lastError: pageError,
        },
        update: {
          connectionId: connection.id,
          pageName: page.name,
          pageAccessTokenEncrypted: pageToken,
          subscribed,
          lastError: pageError,
        },
      });

      for (const form of forms) {
        if (form.status === "DELETED") continue;
        outcome.forms += 1;
        const questions = form.questions as unknown as Prisma.InputJsonValue;
        const existing = await this.prisma.metaLeadForm.findUnique({
          where: { tenantId_formId: { tenantId, formId: form.id } },
          select: { id: true, formName: true },
        });

        if (existing) {
          // A form linked by hand earlier is adopted: fresh token, same mapping.
          await this.prisma.metaLeadForm.update({
            where: { id: existing.id },
            data: {
              pageId: page.id,
              pageName: page.name,
              formName: form.name ?? existing.formName,
              pageAccessTokenEncrypted: pageToken,
              connectionId: connection.id,
              questionsJson: questions,
            },
          });
        } else {
          await this.prisma.metaLeadForm.create({
            data: {
              tenantId,
              connectionId: connection.id,
              pageId: page.id,
              pageName: page.name,
              formId: form.id,
              formName: form.name,
              pageAccessTokenEncrypted: pageToken,
              // Archived forms can't collect anything new; link them paused.
              isActive: form.status !== "ARCHIVED",
              defaultStatus: connection.defaultStatus,
              questionsJson: questions,
            },
          });
          outcome.newForms += 1;
        }
      }
    }

    // Pages the person no longer grants are dropped; their forms stay linked
    // with the last token until it stops working or someone unlinks them.
    await this.prisma.metaLeadPage.deleteMany({
      where: { connectionId: connection.id, pageId: { notIn: pages.map((page) => page.id) } },
    });

    await this.prisma.metaLeadConnection.update({
      where: { tenantId },
      data: {
        lastSyncAt: new Date(),
        lastError: problems.length > 0 ? problems.join("\n") : null,
      },
    });
    return outcome;
  }
}

function toPublic(connection: {
  fbUserId: string;
  fbUserName: string | null;
  defaultFieldMappingJson: Prisma.JsonValue;
  defaultStatus: string;
  lastSyncAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  pages: { pageId: string; pageName: string | null; subscribed: boolean; lastError: string | null }[];
}): PublicMetaLeadConnection {
  const mapping = connection.defaultFieldMappingJson;
  return {
    fbUserId: connection.fbUserId,
    fbUserName: connection.fbUserName,
    defaultFieldMapping:
      mapping !== null && typeof mapping === "object" && !Array.isArray(mapping)
        ? (mapping as Record<string, string>)
        : {},
    defaultStatus: connection.defaultStatus,
    lastSyncAt: connection.lastSyncAt,
    lastError: connection.lastError,
    createdAt: connection.createdAt,
    pages: connection.pages.map((page) => ({
      pageId: page.pageId,
      pageName: page.pageName,
      subscribed: page.subscribed,
      lastError: page.lastError,
    })),
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
