import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class AutomationStepDto {
  @IsIn(["send_text", "send_template"])
  action!: "send_text" | "send_template";

  /** Message body for send_text; template name for send_template. */
  @IsString()
  @MinLength(1)
  value!: string;

  /** Only meaningful for send_template. */
  @IsOptional()
  @IsString()
  languageCode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  delaySeconds?: number;
}

export class CreateAutomationDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  channelId!: string;

  @IsIn(["keyword", "welcome"])
  triggerType!: "keyword" | "welcome";

  /** Required when triggerType is "keyword". */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsIn(["contains", "exact"])
  matchType?: "contains" | "exact";

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AutomationStepDto)
  steps!: AutomationStepDto[];
}
