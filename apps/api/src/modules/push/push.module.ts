import { Global, Logger, Module, OnModuleInit } from "@nestjs/common";
import { BullModule, InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PushController } from "./push.controller";
import { PushService } from "./push.service";
import { ActivityRemindersProcessor } from "./activity-reminders.processor";
import { ACTIVITY_REMINDERS_QUEUE } from "./push.constants";
import { REMINDER_POLL_MS } from "./activity-reminders";

/** Global so any feature can nudge a user's phone without an import cycle. */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: ACTIVITY_REMINDERS_QUEUE })],
  controllers: [PushController],
  providers: [PushService, ActivityRemindersProcessor],
  exports: [PushService],
})
export class PushModule implements OnModuleInit {
  private readonly logger = new Logger(PushModule.name);

  constructor(@InjectQueue(ACTIVITY_REMINDERS_QUEUE) private readonly queue: Queue) {}

  /** A fixed repeat key keeps this to one schedule however many containers boot. */
  async onModuleInit() {
    try {
      await this.queue.add(
        "remind",
        {},
        { repeat: { every: REMINDER_POLL_MS, key: "activity-reminders" }, removeOnComplete: true, removeOnFail: 50 },
      );
    } catch (err) {
      this.logger.warn(
        `Could not schedule activity reminders; push reminders are off. (${err instanceof Error ? err.message : err})`,
      );
    }
  }
}
