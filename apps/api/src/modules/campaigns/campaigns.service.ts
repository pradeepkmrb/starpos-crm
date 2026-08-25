import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { withTimeout } from "../../common/with-timeout";
import { ChannelsService } from "../whatsapp/channels.service";
import { TemplatesService } from "../whatsapp/templates.service";
import { CreateCampaignDto } from "./dto/create-campaign.dto";
import { CAMPAIGN_SEND_QUEUE } from "./campaigns.constants";

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelsService: ChannelsService,
    private readonly templatesService: TemplatesService,
    @InjectQueue(CAMPAIGN_SEND_QUEUE) private readonly campaignQueue: Queue,
  ) {}

  async launchCampaign(tenantId: string, dto: CreateCampaignDto) {
    const channel = await this.channelsService.getChannelWithCredentials(tenantId, dto.channelId);
    if (channel.status !== "active") {
      throw new BadRequestException("Channel is not active");
    }

    const list = await this.prisma.contactList.findFirst({
      where: { id: dto.targetListId, tenantId },
      include: { members: true },
    });
    if (!list) throw new NotFoundException("Contact list not found");
    if (list.members.length === 0) {
      throw new BadRequestException("Target list has no contacts");
    }

    const languageCode = dto.languageCode ?? "en_US";
    const template = await this.templatesService.getOrCreateRef(
      tenantId,
      channel.id,
      dto.templateName,
      languageCode,
    );

    const campaign = await this.prisma.campaign.create({
      data: {
        tenantId,
        channelId: channel.id,
        templateId: template.id,
        targetListId: list.id,
        status: "sending",
      },
    });

    const recipients = await this.prisma.$transaction(
      list.members.map((member) =>
        this.prisma.campaignRecipient.create({
          data: { campaignId: campaign.id, contactId: member.contactId, status: "queued" },
        }),
      ),
    );

    try {
      await withTimeout(
        this.campaignQueue.addBulk(
          recipients.map((recipient) => ({
            name: "send",
            data: { campaignRecipientId: recipient.id },
            opts: { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
          })),
        ),
        5000,
        "Campaign send queue unavailable",
      );
    } catch (err) {
      // Enqueue failed (e.g. Redis unreachable) — remove the campaign rather
      // than leaving it stuck in "sending" with recipients permanently
      // "queued" and never processed. Cascade delete takes the recipients
      // with it (see schema's onDelete: Cascade on CampaignRecipient).
      await this.prisma.campaign.delete({ where: { id: campaign.id } });
      throw err;
    }

    return this.getCampaign(tenantId, campaign.id);
  }

  async listCampaigns(tenantId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { tenantId },
      include: { channel: { select: { displayPhoneNumber: true } }, targetList: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });

    const stats = await this.prisma.campaignRecipient.groupBy({
      by: ["campaignId", "status"],
      where: { campaign: { tenantId } },
      _count: true,
    });

    return campaigns.map((campaign) => ({
      ...campaign,
      recipientStats: stats
        .filter((s) => s.campaignId === campaign.id)
        .reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
    }));
  }

  async getCampaign(tenantId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      include: {
        channel: { select: { displayPhoneNumber: true } },
        targetList: { select: { name: true } },
        recipients: { include: { contact: { select: { whatsappNumber: true, name: true } } } },
      },
    });
    if (!campaign) throw new NotFoundException("Campaign not found");
    return campaign;
  }
}
