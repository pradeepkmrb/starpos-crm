import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { CampaignsService } from "./campaigns.service";
import { CampaignsController } from "./campaigns.controller";
import { CampaignSendProcessor } from "./campaign-send.processor";
import { CAMPAIGN_SEND_QUEUE } from "./campaigns.constants";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { MessagesModule } from "../messages/messages.module";

@Module({
  imports: [BullModule.registerQueue({ name: CAMPAIGN_SEND_QUEUE }), WhatsappModule, MessagesModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignSendProcessor],
})
export class CampaignsModule {}
