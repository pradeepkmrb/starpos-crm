import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { LEAD_STATUSES, type LeadStatus } from "@digitel/shared";
import { IMAGE_PATH_PATTERN } from "../../media/media.constants";

export class CreateLeadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(160)
  company?: string | null;

  @IsOptional()
  @IsIn(LEAD_STATUSES as unknown as string[])
  status?: LeadStatus;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(80)
  source?: string | null;

  /** Deal value in paise, matching Plan and Invoice. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  valuePaise?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  ownerUserId?: string | null;

  /** Answers to the tenant's custom fields, keyed by LeadCustomField.key. */
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @IsOptional()
  @IsBoolean()
  isHot?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601()
  expectedCloseAt?: string | null;

  /** Storefront photo: a /media/images/:id path from POST /media/images; null removes it. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(IMAGE_PATH_PATTERN, { message: "imageUrl must be an uploaded image" })
  imageUrl?: string | null;
}
