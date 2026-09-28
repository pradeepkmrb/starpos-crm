import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { LEAD_STATUSES, type LeadStatus } from "@starpos-crm/shared";

/**
 * What the Facebook JS SDK hands back after "Connect with Meta": a code when
 * the login ran with a Login for Business config, a user token otherwise.
 */
export class ConnectMetaLeadsDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2048)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2048)
  accessToken?: string;
}

export class UpdateMetaLeadConnectionDto {
  /** Meta question name -> lead target; applies to every form beneath its own mapping. */
  @IsOptional()
  @IsObject()
  defaultFieldMapping?: Record<string, string>;

  @IsOptional()
  @IsIn(LEAD_STATUSES as unknown as string[])
  defaultStatus?: LeadStatus;
}
