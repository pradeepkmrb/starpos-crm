import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { PushService } from "./push.service";
import { reminderTitle, reminderWindow } from "./activity-reminders";
import { ACTIVITY_REMINDERS_QUEUE } from "./push.constants";

/** Every minute: remind reps of scheduled work that is about to start. */
@Processor(ACTIVITY_REMINDERS_QUEUE)
export class ActivityRemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(ActivityRemindersProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {
    super();
  }

  async process() {
    const now = new Date();
    const { from, to } = reminderWindow(now);
    const due = await this.prisma.activity.findMany({
      where: {
        status: "scheduled",
        reminderSentAt: null,
        ownerUserId: { not: null },
        scheduledAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        tenantId: true,
        type: true,
        title: true,
        scheduledAt: true,
        ownerUserId: true,
        lead: { select: { id: true, name: true, company: true } },
      },
      take: 500,
    });

    let sent = 0;
    for (const activity of due) {
      // Claim it first: with several API containers, only one sends.
      const claimed = await this.prisma.activity.updateMany({
        where: { id: activity.id, reminderSentAt: null },
        data: { reminderSentAt: now },
      });
      if (claimed.count === 0) continue;

      const who = activity.lead.company || activity.lead.name;
      await this.push.notifyUsers(activity.tenantId, [activity.ownerUserId], {
        title: reminderTitle(activity.type, activity.scheduledAt!, now),
        body: activity.title ? `${who} · ${activity.title}` : who,
        url: `/lead/${activity.lead.id}`,
      });
      sent += 1;
    }
    if (sent > 0) this.logger.log(`Sent ${sent} activity reminder(s)`);
  }
}
