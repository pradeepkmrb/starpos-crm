import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { ChannelsService } from "../whatsapp/channels.service";
import { CreateAutomationDto } from "./dto/create-automation.dto";

@Injectable()
export class AutomationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelsService: ChannelsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  listAutomations(tenantId: string) {
    return this.prisma.automationWorkflow.findMany({
      where: { tenantId },
      include: {
        steps: { orderBy: { order: "asc" } },
        channel: { select: { type: true, displayPhoneNumber: true, displayName: true, externalId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createAutomation(tenantId: string, dto: CreateAutomationDto) {
    if (dto.triggerType === "keyword" && (!dto.keywords || dto.keywords.length === 0)) {
      throw new BadRequestException("Keyword triggers require at least one keyword");
    }

    // Verifies the channel belongs to this tenant (throws 404 otherwise).
    const channel = await this.channelsService.getChannelWithCredentials(tenantId, dto.channelId);

    await this.entitlements.assertCanAdd(tenantId, "automations");

    const triggerConfig =
      dto.triggerType === "keyword"
        ? { keywords: dto.keywords!.map((k) => k.trim().toLowerCase()), matchType: dto.matchType ?? "contains" }
        : {};

    return this.prisma.automationWorkflow.create({
      data: {
        tenantId,
        channelId: channel.id,
        name: dto.name,
        triggerType: dto.triggerType,
        triggerConfigJson: triggerConfig,
        steps: {
          create: dto.steps.map((step, index) => ({
            order: index,
            action: step.action,
            configJson:
              step.action === "send_text"
                ? { body: step.value }
                : { templateName: step.value, languageCode: step.languageCode ?? "en_US" },
            delaySeconds: step.delaySeconds ?? 0,
          })),
        },
      },
      include: { steps: { orderBy: { order: "asc" } }, channel: { select: { type: true, displayPhoneNumber: true, displayName: true, externalId: true } } },
    });
  }

  async setActive(tenantId: string, id: string, isActive: boolean) {
    const workflow = await this.prisma.automationWorkflow.findFirst({ where: { id, tenantId } });
    if (!workflow) throw new NotFoundException("Automation not found");
    return this.prisma.automationWorkflow.update({
      where: { id },
      data: { isActive },
      include: { steps: { orderBy: { order: "asc" } }, channel: { select: { type: true, displayPhoneNumber: true, displayName: true, externalId: true } } },
    });
  }

  async deleteAutomation(tenantId: string, id: string) {
    const workflow = await this.prisma.automationWorkflow.findFirst({ where: { id, tenantId } });
    if (!workflow) throw new NotFoundException("Automation not found");
    await this.prisma.automationWorkflow.delete({ where: { id } });
    return { deleted: true };
  }
}
