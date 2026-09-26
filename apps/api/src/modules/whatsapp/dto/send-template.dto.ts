import { IsOptional, IsString, MinLength } from "class-validator";

export class SendTemplateDto {
  @IsString()
  @MinLength(1)
  templateId!: string;

  /**
   * The WhatsApp number to send from. Optional — defaults to the template's
   * own channel. Must share the template's WABA, since that is where it is approved.
   */
  @IsOptional()
  @IsString()
  channelId?: string;
}
