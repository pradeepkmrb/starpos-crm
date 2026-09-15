import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { encryptToken } from "../../common/token-encryption";
import { CreateChannelDto } from "./dto/create-channel.dto";

const SAFE_CHANNEL_SELECT = {
  id: true,
  type: true,
  wabaId: true,
  phoneNumberId: true,
  displayPhoneNumber: true,
  externalId: true,
  displayName: true,
  status: true,
  messagingTier: true,
  lastSyncedAt: true,
  lastError: true,
  createdAt: true,
} as const;

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * WhatsApp channels only. The other channel types share this table but have
   * their own Connections endpoints; the callers here (broadcasts, templates,
   * test sends) are all WhatsApp-specific.
   */
  listChannels(tenantId: string) {
    return this.prisma.channel.findMany({
      where: { tenantId, type: "whatsapp" },
      select: SAFE_CHANNEL_SELECT,
      orderBy: { createdAt: "asc" },
    });
  }

  async createChannel(tenantId: string, dto: CreateChannelDto) {
    await this.entitlements.assertCanAdd(tenantId, "channels");

    const channel = await this.prisma.channel.create({
      data: {
        tenantId,
        type: "whatsapp",
        wabaId: dto.wabaId,
        phoneNumberId: dto.phoneNumberId,
        // externalId mirrors phoneNumberId so inbound routing can resolve any
        // channel type through the same lookup.
        externalId: dto.phoneNumberId,
        displayPhoneNumber: dto.displayPhoneNumber,
        accessTokenEncrypted: encryptToken(dto.accessToken),
      },
      select: SAFE_CHANNEL_SELECT,
    });
    return channel;
  }

  /** Auto-provisioned via Meta Embedded Signup — same limit check and encryption as manual createChannel. */
  async createChannelFromEmbeddedSignup(
    tenantId: string,
    params: { wabaId: string; phoneNumberId: string; accessToken: string; displayPhoneNumber: string },
  ) {
    await this.entitlements.assertCanAdd(tenantId, "channels");

    return this.prisma.channel.create({
      data: {
        tenantId,
        type: "whatsapp",
        wabaId: params.wabaId,
        phoneNumberId: params.phoneNumberId,
        externalId: params.phoneNumberId,
        displayPhoneNumber: params.displayPhoneNumber,
        accessTokenEncrypted: encryptToken(params.accessToken),
      },
      select: SAFE_CHANNEL_SELECT,
    });
  }

  async disconnectChannel(tenantId: string, channelId: string) {
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, tenantId } });
    if (!channel) throw new NotFoundException("Channel not found");
    return this.prisma.channel.update({
      where: { id: channelId },
      data: { status: "disconnected" },
      select: SAFE_CHANNEL_SELECT,
    });
  }

  /** Includes the encrypted token — for internal use by MetaGraphClient callers only, never returned from a controller. */
  async getChannelWithCredentials(tenantId: string, channelId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, tenantId },
    });
    if (!channel) throw new NotFoundException("Channel not found");
    return channel;
  }

  findByPhoneNumberId(phoneNumberId: string) {
    return this.prisma.channel.findUnique({ where: { phoneNumberId } });
  }
}
