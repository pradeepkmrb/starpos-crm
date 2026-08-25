import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Local MessageTemplate rows are currently just a reference/label satisfying
 * Campaign.templateId — actual template content and approval status live in
 * Meta (sent by name, same as the Phase 2 test-send flow). Full local
 * template authoring/sync is a later hardening item, not MVP-blocking.
 */
@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

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
}
