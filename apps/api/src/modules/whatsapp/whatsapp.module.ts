import { forwardRef, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ChannelsService } from "./channels.service";
import { ChannelsController } from "./channels.controller";
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

@Module({
  imports: [
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
    ContactsModule,
    MessagesModule,
    PlatformModule,
    forwardRef(() => AutomationsModule),
  ],
  controllers: [ChannelsController, WebhooksController],
  providers: [ChannelsService, MetaGraphClient, MetaOAuthService, WebhookProcessor, TemplatesService],
  exports: [ChannelsService, MetaGraphClient, TemplatesService],
})
export class WhatsappModule {}
