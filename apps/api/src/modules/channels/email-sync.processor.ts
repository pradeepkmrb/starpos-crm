import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { EmailSyncService } from "./email-sync.service";
import { EMAIL_SYNC_QUEUE } from "./channels.constants";

/** Drives the repeatable mailbox poll; the work itself lives in EmailSyncService. */
@Processor(EMAIL_SYNC_QUEUE)
export class EmailSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailSyncProcessor.name);

  constructor(private readonly emailSyncService: EmailSyncService) {
    super();
  }

  async process() {
    const results = await this.emailSyncService.syncAllChannels();
    const imported = results.reduce((sum, r) => sum + r.imported, 0);
    if (imported > 0) this.logger.log(`Imported ${imported} email(s) across ${results.length} mailbox(es)`);
  }
}
