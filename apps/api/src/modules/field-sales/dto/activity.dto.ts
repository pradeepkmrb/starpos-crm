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
import { ACTIVITY_TYPES, SETTABLE_ACTIVITY_STATUSES, type ActivityType } from "@digitel/shared";

type SettableStatus = (typeof SETTABLE_ACTIVITY_STATUSES)[number];

/** Fields shared by create and update; everything is optional on update. */
class ActivityFieldsDto {
  /** in_progress is reserved for visits and only set by check-in. */
  @IsOptional()
  @IsIn(SETTABLE_ACTIVITY_STATUSES as unknown as string[])
  status?: SettableStatus;

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

/** Starting a visit: where the rep is standing, per the phone's GPS. */
export class CheckInDto {
  @IsString()
  @MinLength(1)
  leadId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  accuracyMeters?: number;

  /** A scheduled visit this check-in fulfils, rather than starting a new one. */
  @IsOptional()
  @IsString()
  activityId?: string;

  /** The visit's purpose, e.g. "Sales visit". */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

/** Ending a visit: what came of it, and where the rep was when they left. */
export class CheckOutDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(80)
  outcome?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
