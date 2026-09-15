import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { LEAD_STATUSES, type LeadStatus } from "@digitel/shared";

export class UpdateMetaFormDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  fieldMapping?: Record<string, string>;

  @IsOptional()
  @IsIn(LEAD_STATUSES as unknown as string[])
  defaultStatus?: LeadStatus;

  /** Rotating the token replaces the stored one; omitting it keeps it. */
  @IsOptional()
  @IsString()
  @MinLength(10)
  pageAccessToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  formName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  pageName?: string;
}
