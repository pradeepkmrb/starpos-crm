import { forwardRef, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ChannelsService } from "./channels.service";
import { ChannelsController } from "./channels.controller";
import { TemplatesController } from "./templates.controller";
import { InboxController } from "./inbox.controller";
import { InboxService } from "./inbox.service";
import { LabelsService } from "./labels.service";
import { MetaGraphClient } from "./meta-graph.client";
import { WebhooksController } from "./webhooks.controller";
import { WebhookProcessor } from "./webhook-processor.processor";
import { TemplatesService } from "./templates.service";
import { MetaOAuthService } from "./meta-oauth.service";
import { WEBHOOK_QUEUE } from "./whatsapp.constants";
import { ContactsModule } from "../contacts/contacts.module";
import { MessagesModule } from "../messages/messages.module";
import { AutomationsModule } from "../automations/automations.module";
import { PlatformModule } from "../platform/platform.module";
import { ChannelsModule } from "../channels/channels.module";
import { CrmModule } from "../crm/crm.module";

@Module({
  imports: [
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
    ContactsModule,
    MessagesModule,
    PlatformModule,
    CrmModule,
    forwardRef(() => AutomationsModule),
    forwardRef(() => ChannelsModule),
  ],
  controllers: [ChannelsController, WebhooksController, TemplatesController, InboxController],
  providers: [ChannelsService, MetaGraphClient, MetaOAuthService, WebhookProcessor, TemplatesService, InboxService, LabelsService],
  exports: [ChannelsService, MetaGraphClient, TemplatesService],
})
export class WhatsappModule {}
