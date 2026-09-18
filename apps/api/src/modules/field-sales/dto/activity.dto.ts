import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { ACTIVITY_STATUSES, ACTIVITY_TYPES, type ActivityStatus, type ActivityType } from "@digitel/shared";

/** Fields shared by create and update; everything is optional on update. */
class ActivityFieldsDto {
  @IsOptional()
  @IsIn(ACTIVITY_STATUSES as unknown as string[])
  status?: ActivityStatus;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(160)
  title?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(80)
  outcome?: string | null;

  /** Omitted on create means "me"; null means unassigned. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  ownerUserId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601()
  scheduledAt?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601()
  completedAt?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60)
  durationSeconds?: number | null;

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
}

export class CreateActivityDto extends ActivityFieldsDto {
  @IsString()
  @MinLength(1)
  leadId!: string;

  @IsIn(ACTIVITY_TYPES as unknown as string[])
  type!: ActivityType;
}

export class UpdateActivityDto extends ActivityFieldsDto {
  @IsOptional()
  @IsIn(ACTIVITY_TYPES as unknown as string[])
  type?: ActivityType;
}
