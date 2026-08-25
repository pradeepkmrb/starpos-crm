import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class MessageLogService {
  constructor(private readonly prisma: PrismaService) {}

  async recordOutbound(params: {
    tenantId: string;
    channelId: string;
    contactId: string;
    waMessageId: string;
    payload: unknown;
    campaignId?: string;
    automationWorkflowId?: string;
  }) {
    return this.prisma.messageLog.create({
      data: {
        tenantId: params.tenantId,
        channelId: params.channelId,
        contactId: params.contactId,
        direction: "outbound",
        waMessageId: params.waMessageId,
        status: "sent",
        campaignId: params.campaignId,
        automationWorkflowId: params.automationWorkflowId,
        payloadJson: params.payload as never,
      },
    });
  }

  listForChannel(tenantId: string, channelId: string, take = 50) {
    return this.prisma.messageLog.findMany({
      where: { tenantId, channelId },
      include: { contact: { select: { id: true, whatsappNumber: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take,
    });
  }
}
