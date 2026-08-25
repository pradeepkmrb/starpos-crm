import { forwardRef, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AutomationsService } from "./automations.service";
import { AutomationsController } from "./automations.controller";
import { AutomationEngineService } from "./automation-engine.service";
import { AutomationStepProcessor } from "./automation-step.processor";
import { AUTOMATION_STEP_QUEUE } from "./automations.constants";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { MessagesModule } from "../messages/messages.module";

/**
 * forwardRef both ways: this module needs WhatsappModule's ChannelsService /
 * MetaGraphClient, while WhatsappModule's webhook processor needs this
 * module's AutomationEngineService to evaluate triggers on inbound messages.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: AUTOMATION_STEP_QUEUE }),
    forwardRef(() => WhatsappModule),
    MessagesModule,
  ],
  controllers: [AutomationsController],
  providers: [AutomationsService, AutomationEngineService, AutomationStepProcessor],
  exports: [AutomationEngineService],
})
export class AutomationsModule {}
