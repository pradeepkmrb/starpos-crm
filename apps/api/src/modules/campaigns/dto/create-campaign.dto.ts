import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateCampaignDto {
  @IsString()
  @MinLength(1)
  channelId!: string;

  @IsString()
  @MinLength(1)
  targetListId!: string;

  @IsString()
  @MinLength(1)
  templateName!: string;

  @IsOptional()
  @IsString()
  languageCode?: string;
}
