import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { MEDIA_MESSAGE_TYPES, type MediaMessageType } from "../../whatsapp/meta-graph.client";

export class SendMediaDto {
  @IsString()
  @MinLength(7)
  to!: string;

  @IsIn(MEDIA_MESSAGE_TYPES as unknown as string[])
  type!: MediaMessageType;

  /** A publicly reachable https URL Meta will fetch. Supply this or mediaId. */
  @IsOptional()
  @IsString()
  link?: string;

  /** The id of media already uploaded to this phone number. Supply this or link. */
  @IsOptional()
  @IsString()
  mediaId?: string;

  /** Ignored for audio and sticker, which Meta does not caption. */
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  caption?: string;

  /** The filename the recipient sees. Documents only. */
  @IsOptional()
  @IsString()
  @MaxLength(240)
  filename?: string;

  @IsOptional()
  @IsString()
  channelId?: string;
}
