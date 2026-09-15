import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";

/** Meta's component array, as far as the public template listing cares. */
interface TemplateComponent {
  type?: string;
  format?: string;
  text?: string;
  buttons?: { type?: string; text?: string }[];
}

/**
 * The read-only, non-messaging part of the public API: who am I, what can I
 * send from, and what templates are available to send.
 */
@Injectable()
export class PublicWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** The call an integration makes first, to confirm a key works. */
  async me(tenantId: string, apiKeyId: string) {
    const [tenant, channels, usage, limits, apiKey] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { plan: true } }),
      this.prisma.whatsappChannel.findMany({
        where: { tenantId },
        select: { id: true, displayPhoneNumber: true, phoneNumberId: true, status: true },
        orderBy: { createdAt: "asc" },
      }),
      this.entitlements.getUsage(tenantId),
      this.entitlements.getLimits(tenantId),
      this.prisma.apiKey.findUnique({
        where: { id: apiKeyId },
        select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true },
      }),
    ]);

    return {
      workspace: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        timezone: tenant.timezone,
        status: tenant.status,
      },
      plan: { code: tenant.plan.code, name: tenant.plan.name },
      apiKey,
      channels,
      usage,
      limits,
    };
  }

  listChannels(tenantId: string) {
    return this.prisma.whatsappChannel.findMany({
      where: { tenantId },
      select: {
        id: true,
        displayPhoneNumber: true,
        phoneNumberId: true,
        wabaId: true,
        status: true,
        messagingTier: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Local mirrors of the WABA's templates. Defaults to approved only, since
   * those are the ones a send can actually use; pass status=all to see the
   * rest while debugging an approval.
   */
  async listTemplates(tenantId: string, status?: string) {
    const normalized = status?.toLowerCase();
    const templates = await this.prisma.messageTemplate.findMany({
      where: {
        tenantId,
        ...(normalized && normalized !== "all" ? { status: normalized as never } : {}),
        ...(normalized ? {} : { status: "approved" }),
      },
      orderBy: { name: "asc" },
    });

    return templates.map((template) => {
      const components = ((template.bodyJson as { components?: TemplateComponent[] } | null)?.components ??
        []) as TemplateComponent[];
      const body = components.find((c) => c.type?.toUpperCase() === "BODY");
      const header = components.find((c) => c.type?.toUpperCase() === "HEADER");

      return {
        id: template.id,
        name: template.name,
        language: template.language,
        category: template.category,
        status: template.status,
        channelId: template.channelId,
        bodyText: body?.text ?? null,
        /** TEXT, IMAGE, VIDEO or DOCUMENT — decides what headerMedia a send must supply. */
        headerFormat: header?.format ?? null,
        /** How many {{n}} placeholders the body expects, i.e. the length of bodyVariables. */
        bodyVariableCount: countPlaceholders(body?.text ?? ""),
        updatedAt: template.updatedAt,
      };
    });
  }
}

/** Highest {{n}} in the body, which is what Meta expects to be filled. */
export function countPlaceholders(text: string): number {
  const indexes = [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return indexes.length === 0 ? 0 : Math.max(...indexes);
}
