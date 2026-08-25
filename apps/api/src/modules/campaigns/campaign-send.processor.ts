import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { MetaApiError, MetaGraphClient } from "../whatsapp/meta-graph.client";
import { MessageLogService } from "../messages/message-log.service";
import { CAMPAIGN_SEND_QUEUE } from "./campaigns.constants";

interface SendJobData {
  campaignRecipientId: string;
}

/**
 * One job per recipient. The `limiter` option throttles the whole queue to
 * a conservative rate so a large campaign doesn't blow through Meta's
 * per-number messaging-tier limits — a simpler stand-in for the
 * per-channel Redis token bucket described in the architecture doc;
 * sufficient for MVP scale (single shared queue, not per-tenant/channel).
 */
@Processor(CAMPAIGN_SEND_QUEUE, { limiter: { max: 20, duration: 1000 } })
export class CampaignSendProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignSendProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaGraphClient: MetaGraphClient,
    private readonly messageLogService: MessageLogService,
  ) {
    super();
  }

  async process(job: Job<SendJobData>) {
    const recipient = await this.prisma.campaignRecipient.findUniqueOrThrow({
      where: { id: job.data.campaignRecipientId },
      include: {
        campaign: { include: { channel: true, template: true } },
        contact: true,
      },
    });

    if (["sent", "delivered", "read", "failed"].includes(recipient.status)) {
      return; // already handled (retried job or duplicate enqueue)
    }

    const { campaign, contact } = recipient;
    try {
      const { waMessageId } = await this.metaGraphClient.sendTemplateMessage(
        campaign.channel,
        contact.whatsappNumber,
        campaign.template.name,
        campaign.template.language,
      );

      const messageLog = await this.messageLogService.recordOutbound({
        tenantId: campaign.tenantId,
        channelId: campaign.channelId,
        contactId: contact.id,
        waMessageId,
        campaignId: campaign.id,
        payload: { templateName: campaign.template.name },
      });

      await this.prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: "sent", messageLogId: messageLog.id },
      });
    } catch (err) {
      const message = err instanceof MetaApiError ? err.message : "Unknown send error";
      this.logger.warn(`Campaign ${campaign.id} recipient ${recipient.id} failed: ${message}`);
      await this.prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: "failed", error: message },
      });
    }

    await this.maybeFinalizeCampaign(campaign.id);
  }

  private async maybeFinalizeCampaign(campaignId: string) {
    const [total, terminal, sent] = await Promise.all([
      this.prisma.campaignRecipient.count({ where: { campaignId } }),
      this.prisma.campaignRecipient.count({
        where: { campaignId, status: { in: ["sent", "delivered", "read", "failed"] } },
      }),
      this.prisma.campaignRecipient.count({
        where: { campaignId, status: { in: ["sent", "delivered", "read"] } },
      }),
    ]);
    if (total === 0 || terminal < total) return;

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: sent > 0 ? "completed" : "failed" },
    });
  }
}
