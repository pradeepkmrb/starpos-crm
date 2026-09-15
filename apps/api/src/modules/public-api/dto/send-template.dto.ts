import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";
import { MEDIA_MESSAGE_TYPES, type MediaMessageType } from "../../whatsapp/meta-graph.client";

/** A Meta template header can carry one image, video or document. */
export class TemplateHeaderMediaDto {
  @IsIn(MEDIA_MESSAGE_TYPES as unknown as string[])
  type!: MediaMessageType;

  @IsString()
  @MinLength(1)
  link!: string;

  @IsOptional()
  @IsString()
  filename?: string;
}

export class SendTemplateDto {
  @IsString()
  @MinLength(7)
  to!: string;

  @IsString()
  @MinLength(1)
  templateName!: string;

  /** Meta language code, e.g. "en_US" or "en". Defaults to "en_US". */
  @IsOptional()
  @IsString()
  languageCode?: string;

  /** Fills {{1}}, {{2}}… in the template body, in order. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bodyVariables?: string[];

  /** Fills the placeholders of a text header. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  headerVariables?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateHeaderMediaDto)
  headerMedia?: TemplateHeaderMediaDto;

  /** Fills the dynamic suffix of a URL button, one entry per such button. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  buttonUrlVariables?: string[];

  /**
   * Escape hatch: Meta's raw `components` array, passed through untouched.
   * Wins over every convenience field above when present.
   */
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  components?: Record<string, unknown>[];

  @IsOptional()
  @IsString()
  channelId?: string;
}
