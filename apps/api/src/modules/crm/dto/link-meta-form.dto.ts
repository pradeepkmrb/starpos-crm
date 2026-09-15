import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { LEAD_STATUSES, type LeadStatus } from "@digitel/shared";

export class LinkMetaFormDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  pageId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  formId!: string;

  /** A Meta Page access token with leads_retrieval — stored encrypted, never returned. */
  @IsString()
  @MinLength(10)
  pageAccessToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  pageName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  formName?: string;

  /** Meta question name -> "name" | "phone" | "email" | "company" | "notes" | "custom:<key>" | "ignore". */
  @IsOptional()
  @IsObject()
  fieldMapping?: Record<string, string>;

  @IsOptional()
  @IsIn(LEAD_STATUSES as unknown as string[])
  defaultStatus?: LeadStatus;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
