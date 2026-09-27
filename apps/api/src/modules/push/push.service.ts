import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Expo accepts at most 100 messages per request. */
const BATCH_SIZE = 100;

export interface PushMessage {
  title: string;
  body: string;
  /** In-app route the phone opens when the notification is tapped, e.g. /lead/abc. */
  url?: string;
}

interface ExpoTicket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

/**
 * Sends push notifications through Expo's push service, which forwards them to
 * FCM (Android) and APNs (iOS) using the credentials stored in the EAS project.
 *
 * Best effort by design: a notification is a nudge, never the record of truth,
 * so a send failure is logged and swallowed rather than failing the request
 * that triggered it.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Registers (or moves) an app install to this user and workspace. */
  async registerDevice(tenantId: string, userId: string, token: string, platform: string) {
    await this.prisma.pushDevice.upsert({
      where: { token },
      create: { tenantId, userId, token, platform },
      update: { tenantId, userId, platform },
    });
    return { registered: true };
  }

  /** Only the device's own user can unregister it — on sign-out. */
  async unregisterDevice(userId: string, token: string) {
    await this.prisma.pushDevice.deleteMany({ where: { token, userId } });
    return { unregistered: true };
  }

  async notifyUsers(tenantId: string, userIds: (string | null | undefined)[], message: PushMessage): Promise<void> {
    const ids = [...new Set(userIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return;
    try {
      const devices = await this.prisma.pushDevice.findMany({
        where: { tenantId, userId: { in: ids } },
        select: { token: true },
      });
      await this.send(devices.map((d) => d.token), message);
    } catch (err) {
      this.logger.warn(`Push to ${ids.length} user(s) failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async send(tokens: string[], message: PushMessage) {
    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          // Only needed if "enhanced push security" is switched on in the Expo project.
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(
          batch.map((to) => ({
            to,
            title: message.title,
            body: message.body,
            sound: "default",
            channelId: "default",
            priority: "high",
            data: message.url ? { url: message.url } : {},
          })),
        ),
      });
      if (!res.ok) {
        this.logger.warn(`Expo push rejected a batch (${res.status}): ${(await res.text()).slice(0, 300)}`);
        continue;
      }
      const tickets = ((await res.json()) as { data?: ExpoTicket[] }).data ?? [];
      await this.pruneDeadTokens(batch, tickets);
    }
  }

  /** An uninstalled app answers DeviceNotRegistered; stop sending to it. */
  private async pruneDeadTokens(batch: string[], tickets: ExpoTicket[]) {
    const dead: string[] = [];
    tickets.forEach((ticket, index) => {
      if (ticket.status !== "error") return;
      if (ticket.details?.error === "DeviceNotRegistered") dead.push(batch[index]);
      else this.logger.warn(`Push not accepted: ${ticket.message ?? ticket.details?.error ?? "unknown error"}`);
    });
    if (dead.length > 0) await this.prisma.pushDevice.deleteMany({ where: { token: { in: dead } } });
  }
}
