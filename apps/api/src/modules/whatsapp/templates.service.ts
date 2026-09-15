import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ChannelsService } from "./channels.service";
import { MetaGraphClient } from "./meta-graph.client";
import { CreateTemplateDto } from "./dto/create-template.dto";
import { UpdateTemplateDto } from "./dto/update-template.dto";

/** The subset of Meta's message_template payload we mirror locally. */
interface MetaTemplate {
  id?: string;
  name?: string;
  language?: string;
  category?: string;
  status?: string;
  components?: unknown[];
}

/**
 * Local MessageTemplate rows mirror Meta's real template — created here,
 * submitted to Meta for approval, then kept in sync via the
 * message_template_status_update webhook (see WebhookProcessor).
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelsService: ChannelsService,
    private readonly metaGraphClient: MetaGraphClient,
  ) {}

  async getOrCreateRef(tenantId: string, channelId: string, name: string, languageCode: string) {
    const existing = await this.prisma.messageTemplate.findFirst({
      where: { tenantId, channelId, name, language: languageCode },
    });
    if (existing) return existing;

    return this.prisma.messageTemplate.create({
      data: {
        tenantId,
        channelId,
        name,
        language: languageCode,
        category: "utility",
        status: "approved",
        bodyJson: {},
      },
    });
  }

  listForTenant(tenantId: string) {
    return this.prisma.messageTemplate.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Pulls the templates that already exist on each connected WABA into local
   * rows. Templates created directly in Meta's Business Manager (or before
   * this tenant was onboarded) are otherwise invisible here, and unusable as
   * campaign templates, because the rest of the app reads MessageTemplate.
   */
  async syncFromMeta(tenantId: string): Promise<{ imported: number; updated: number; channels: number }> {
    const channels = await this.prisma.channel.findMany({ where: { tenantId, type: "whatsapp" } });
    let imported = 0;
    let updated = 0;

    for (const channel of channels) {
      const metaTemplates = (await this.metaGraphClient.listTemplates(channel)) as MetaTemplate[];

      for (const metaTemplate of metaTemplates) {
        if (!metaTemplate?.name || !metaTemplate?.language) continue;

        const data = {
          category: (metaTemplate.category ?? "utility").toLowerCase(),
          metaTemplateId: metaTemplate.id ?? null,
          status: mapMetaStatus(metaTemplate.status ?? "PENDING"),
          bodyJson: { components: metaTemplate.components ?? [] } as object,
        };

        // No unique index covers (tenantId, channelId, name, language), so
        // match the existing row the same way getOrCreateRef does.
        const existing = await this.prisma.messageTemplate.findFirst({
          where: {
            tenantId,
            channelId: channel.id,
            name: metaTemplate.name,
            language: metaTemplate.language,
          },
        });

        if (existing) {
          await this.prisma.messageTemplate.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await this.prisma.messageTemplate.create({
            data: {
              tenantId,
              channelId: channel.id,
              name: metaTemplate.name,
              language: metaTemplate.language,
              ...data,
            },
          });
          imported++;
        }
      }
    }

    return { imported, updated, channels: channels.length };
  }

  async createAndSubmit(tenantId: string, dto: CreateTemplateDto) {
    const channel = await this.channelsService.getChannelWithCredentials(tenantId, dto.channelId);

    const bodyComponent = {
      type: "BODY",
      text: dto.bodyText,
      ...(dto.bodyVariableExamples?.length
        ? { example: { body_text: [dto.bodyVariableExamples] } }
        : {}),
    };

    const { id: metaTemplateId, status } = await this.metaGraphClient.createTemplate(channel, {
      name: dto.name,
      category: dto.category,
      language: dto.language,
      components: [bodyComponent],
    });

    return this.prisma.messageTemplate.create({
      data: {
        tenantId,
        channelId: dto.channelId,
        name: dto.name,
        category: dto.category.toLowerCase(),
        language: dto.language,
        metaTemplateId,
        status: mapMetaStatus(status),
        bodyJson: { components: [bodyComponent] },
      },
    });
  }

  async update(tenantId: string, templateId: string, dto: UpdateTemplateDto) {
    const template = await this.getOwnedTemplate(tenantId, templateId);
    if (!template.metaTemplateId) {
      throw new BadRequestException(
        "This template has no Meta id yet — sync from Meta before editing it.",
      );
    }

    const channel = await this.channelsService.getChannelWithCredentials(tenantId, template.channelId);
    const bodyComponent = {
      type: "BODY",
      text: dto.bodyText,
      ...(dto.bodyVariableExamples?.length ? { example: { body_text: [dto.bodyVariableExamples] } } : {}),
    };

    await this.metaGraphClient.updateTemplate(channel, template.metaTemplateId, {
      category: dto.category,
      components: [bodyComponent],
    });

    return this.prisma.messageTemplate.update({
      where: { id: template.id },
      data: {
        ...(dto.category ? { category: dto.category.toLowerCase() } : {}),
        bodyJson: { components: [bodyComponent] },
        // An accepted edit sends the template back through Meta's review.
        status: "pending",
      },
    });
  }

  async remove(tenantId: string, templateId: string) {
    const template = await this.getOwnedTemplate(tenantId, templateId);
    const channel = await this.channelsService.getChannelWithCredentials(tenantId, template.channelId);

    await this.metaGraphClient.deleteTemplate(channel, template.name, template.metaTemplateId);
    await this.prisma.messageTemplate.delete({ where: { id: template.id } });
    return { id: template.id, deleted: true };
  }

  private async getOwnedTemplate(tenantId: string, templateId: string) {
    const template = await this.prisma.messageTemplate.findFirst({
      where: { id: templateId, tenantId },
    });
    if (!template) throw new NotFoundException("Template not found");
    return template;
  }
}

export function mapMetaStatus(metaStatus: string): "draft" | "pending" | "approved" | "rejected" {
  const normalized = metaStatus.toLowerCase();
  if (normalized === "approved" || normalized === "pending" || normalized === "rejected") {
    return normalized;
  }
  return "pending";
}
