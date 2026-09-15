import { InjectQueue, BullModule } from "@nestjs/bullmq";
import { Logger, Module, OnModuleInit, forwardRef } from "@nestjs/common";
import { Queue } from "bullmq";
import { ChannelConnectionsService } from "./channel-connections.service";
import { ChannelConnectionsController } from "./channel-connections.controller";
import { MessengerClient } from "./messenger.client";
import { EmailClient } from "./email.client";
import { EmailSyncService } from "./email-sync.service";
import { EmailSyncProcessor } from "./email-sync.processor";
import { OutboundDispatcher } from "./outbound-dispatcher.service";
import { EMAIL_SYNC_INTERVAL_MS, EMAIL_SYNC_QUEUE } from "./channels.constants";
import { ContactsModule } from "../contacts/contacts.module";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { AutomationsModule } from "../automations/automations.module";

/**
 * Facebook Messenger, Instagram DMs and email — the channels an operator
 * connects by pasting credentials — plus the dispatcher that lets the rest of
 * the app send on any channel without knowing which.
 *
 * forwardRef both ways with WhatsappModule: the dispatcher needs the WhatsApp
 * Graph client, and the Inbox (which lives over there) needs the dispatcher.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: EMAIL_SYNC_QUEUE }),
    ContactsModule,
    forwardRef(() => WhatsappModule),
    forwardRef(() => AutomationsModule),
  ],
  controllers: [ChannelConnectionsController],
  providers: [
    ChannelConnectionsService,
    MessengerClient,
    EmailClient,
    EmailSyncService,
    EmailSyncProcessor,
    OutboundDispatcher,
  ],
  exports: [ChannelConnectionsService, MessengerClient, EmailClient, EmailSyncService, OutboundDispatcher],
})
export class ChannelsModule implements OnModuleInit {
  private readonly logger = new Logger(ChannelsModule.name);

  constructor(@InjectQueue(EMAIL_SYNC_QUEUE) private readonly emailSyncQueue: Queue) {}

  /**
   * IMAP has no webhook, so mail only arrives if something asks for it. A
   * repeatable job with a fixed key is idempotent across restarts and across
   * however many API and worker containers are running.
   */
  async onModuleInit() {
    try {
      await this.emailSyncQueue.add(
        "sync-all",
        {},
        {
          repeat: { every: EMAIL_SYNC_INTERVAL_MS, key: "email-sync-all" },
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );
    } catch (err) {
      // A missing Redis must not stop the API from booting — WhatsApp,
      // Messenger and Instagram are all webhook-driven and keep working.
      this.logger.warn(
        `Could not schedule the mailbox poll; email will only sync on demand. (${err instanceof Error ? err.message : err})`,
      );
    }
  }
}
