import { IsOptional, IsString, MinLength } from "class-validator";

export class UpdatePlatformSettingsDto {
  @IsOptional()
  @IsString()
  metaAppId?: string;

  /** Only re-encrypted and stored if provided — omit to keep the existing secret. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  metaAppSecret?: string;

  @IsOptional()
  @IsString()
  metaEmbeddedSignupConfigId?: string;

  /** Facebook Login for Business config for lead ads; an empty string clears it. */
  @IsOptional()
  @IsString()
  metaLeadAdsConfigId?: string;
}
