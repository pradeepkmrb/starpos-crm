import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { MetaApiError, MetaGraphClient } from "../whatsapp/meta-graph.client";
import { MessageLogService } from "../messages/message-log.service";
import { AUTOMATION_STEP_QUEUE } from "./automations.constants";

interface StepJobData {
  stepId: string;
  workflowId: string;
  tenantId: string;
  channelId: string;
  contactId: string;
}

interface SendTextConfig {
  body: string;
}

interface SendTemplateConfig {
  templateName: string;
  languageCode: string;
}

@Processor(AUTOMATION_STEP_QUEUE, { limiter: { max: 20, duration: 1000 } })
export class AutomationStepProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationStepProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaGraphClient: MetaGraphClient,
    private readonly messageLogService: MessageLogService,
  ) {
    super();
  }

  async process(job: Job<StepJobData>) {
    const { stepId, workflowId, tenantId, channelId, contactId } = job.data;

    const [step, workflow, channel, contact] = await Promise.all([
      this.prisma.automationStep.findUnique({ where: { id: stepId } }),
      this.prisma.automationWorkflow.findUnique({ where: { id: workflowId } }),
      this.prisma.whatsappChannel.findUnique({ where: { id: channelId } }),
      this.prisma.contact.findUnique({ where: { id: contactId } }),
    ]);

    if (!step || !channel || !contact) {
      this.logger.warn(`Skipping automation step ${stepId}: referenced record no longer exists`);
      return;
    }
    // Deactivating a workflow should stop steps that are still sitting in the
    // queue behind a delay, not just prevent new triggers.
    if (!workflow?.isActive) {
      this.logger.log(`Skipping step ${stepId}: workflow ${workflowId} is inactive`);
      return;
    }
    if (channel.status !== "active") {
      this.logger.warn(`Skipping step ${stepId}: channel ${channelId} is disconnected`);
      return;
    }

    try {
      const { waMessageId } =
        step.action === "send_text"
          ? await this.metaGraphClient.sendTextMessage(
              channel,
              contact.whatsappNumber,
              (step.configJson as unknown as SendTextConfig).body,
            )
          : await this.metaGraphClient.sendTemplateMessage(
              channel,
              contact.whatsappNumber,
              (step.configJson as unknown as SendTemplateConfig).templateName,
              (step.configJson as unknown as SendTemplateConfig).languageCode,
            );

      await this.messageLogService.recordOutbound({
        tenantId,
        channelId,
        contactId,
        waMessageId,
        automationWorkflowId: workflowId,
        payload: { stepId, action: step.action },
      });
    } catch (err) {
      const message = err instanceof MetaApiError ? err.message : "Unknown send error";
      this.logger.warn(`Automation step ${stepId} failed for contact ${contactId}: ${message}`);
      throw err; // let BullMQ retry per the job's backoff policy
    }
  }
}
