import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { decryptToken, encryptToken } from "../../common/token-encryption";
import { UpdatePlatformSettingsDto } from "./dto/update-platform-settings.dto";

const SINGLETON_ID = "singleton";

@Injectable()
export class PlatformSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Safe to expose to any logged-in user — never includes the secret itself. */
  async getPublicConfig() {
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: SINGLETON_ID } });
    return {
      metaAppId: settings?.metaAppId ?? null,
      embeddedSignupConfigId: settings?.metaEmbeddedSignupConfigId ?? null,
      configured: Boolean(settings?.metaAppId && settings?.metaAppSecretEncrypted && settings?.metaEmbeddedSignupConfigId),
    };
  }

  async getSettings() {
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: SINGLETON_ID } });
    return {
      metaAppId: settings?.metaAppId ?? null,
      embeddedSignupConfigId: settings?.metaEmbeddedSignupConfigId ?? null,
      hasSecret: Boolean(settings?.metaAppSecretEncrypted),
    };
  }

  async updateSettings(dto: UpdatePlatformSettingsDto) {
    await this.prisma.platformSettings.upsert({
      where: { id: SINGLETON_ID },
      update: {
        ...(dto.metaAppId !== undefined ? { metaAppId: dto.metaAppId } : {}),
        ...(dto.metaEmbeddedSignupConfigId !== undefined
          ? { metaEmbeddedSignupConfigId: dto.metaEmbeddedSignupConfigId }
          : {}),
        ...(dto.metaAppSecret ? { metaAppSecretEncrypted: encryptToken(dto.metaAppSecret) } : {}),
      },
      create: {
        id: SINGLETON_ID,
        metaAppId: dto.metaAppId,
        metaEmbeddedSignupConfigId: dto.metaEmbeddedSignupConfigId,
        metaAppSecretEncrypted: dto.metaAppSecret ? encryptToken(dto.metaAppSecret) : undefined,
      },
    });
    return this.getSettings();
  }

  /** Internal use only (MetaOAuthService) — never returned from a controller. */
  async getDecryptedAppSecret(): Promise<string | null> {
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: SINGLETON_ID } });
    return settings?.metaAppSecretEncrypted ? decryptToken(settings.metaAppSecretEncrypted) : null;
  }
}
