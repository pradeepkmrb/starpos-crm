import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { matchesKeyword, type KeywordTriggerConfig } from "./keyword-matcher";
import { AUTOMATION_STEP_QUEUE } from "./automations.constants";

export interface EvaluateInput {
  tenantId: string;
  channelId: string;
  contactId: string;
  messageText: string;
  isNewContact: boolean;
}

/**
 * Invoked ONLY from the inbound-webhook processing path. Because
 * automation-sent (outbound) messages never re-enter that path, there is no
 * reply-loop risk to guard against here.
 */
@Injectable()
export class AutomationEngineService {
  private readonly logger = new Logger(AutomationEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(AUTOMATION_STEP_QUEUE) private readonly stepQueue: Queue,
  ) {}

  async evaluate(input: EvaluateInput) {
    const workflows = await this.prisma.automationWorkflow.findMany({
      where: {
        tenantId: input.tenantId,
        channelId: input.channelId,
        isActive: true,
        triggerType: input.isNewContact ? { in: ["keyword", "welcome"] } : "keyword",
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });

    for (const workflow of workflows) {
      const shouldFire =
        workflow.triggerType === "welcome"
          ? input.isNewContact
          : matchesKeyword(
              (workflow.triggerConfigJson ?? {}) as KeywordTriggerConfig,
              input.messageText,
            );
      if (!shouldFire) continue;

      await this.enqueueSteps(workflow.id, workflow.steps, input);
    }
  }

  private async enqueueSteps(
    workflowId: string,
    steps: { id: string; delaySeconds: number }[],
    input: EvaluateInput,
  ) {
    // Delays are cumulative: a 2-step workflow with 0s then 30s sends the
    // second message 30s after the first, not 30s after the trigger.
    let cumulativeDelayMs = 0;
    const jobs = steps.map((step) => {
      cumulativeDelayMs += step.delaySeconds * 1000;
      return {
        name: "run-step",
        data: {
          stepId: step.id,
          workflowId,
          tenantId: input.tenantId,
          channelId: input.channelId,
          contactId: input.contactId,
        },
        opts: {
          delay: cumulativeDelayMs,
          attempts: 3,
          backoff: { type: "exponential" as const, delay: 5000 },
        },
      };
    });

    await this.stepQueue.addBulk(jobs);
    this.logger.log(`Automation ${workflowId} fired for contact ${input.contactId}`);
  }
}
