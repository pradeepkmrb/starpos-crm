import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ChannelsService } from "./channels.service";
import { MetaGraphClient } from "./meta-graph.client";
import { CreateTemplateDto } from "./dto/create-template.dto";

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
}

export function mapMetaStatus(metaStatus: string): "draft" | "pending" | "approved" | "rejected" {
  const normalized = metaStatus.toLowerCase();
  if (normalized === "approved" || normalized === "pending" || normalized === "rejected") {
    return normalized;
  }
  return "pending";
}
