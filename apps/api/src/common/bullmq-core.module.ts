import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? "redis://localhost:6379",
        // Required by BullMQ for its blocking commands.
        maxRetriesPerRequest: null,
      },
    }),
  ],
  exports: [BullModule],
})
export class BullmqCoreModule {}
