import { Module } from "@nestjs/common";
import { MessageLogService } from "./message-log.service";

@Module({
  providers: [MessageLogService],
  exports: [MessageLogService],
})
export class MessagesModule {}
