import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export class InteractiveButtonDto {
  /** Echoed back on the webhook when the recipient taps it. */
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  title!: string;
}

export class InteractiveRowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(24)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(72)
  description?: string;
}

export class InteractiveSectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(24)
  title?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => InteractiveRowDto)
  rows!: InteractiveRowDto[];
}

export class SendInteractiveDto {
  @IsString()
  @MinLength(7)
  to!: string;

  @IsIn(["button", "list"])
  type!: "button" | "list";

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  bodyText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  headerText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  footerText?: string;

  /** Reply buttons. Required for type "button"; Meta allows at most three. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => InteractiveButtonDto)
  buttons?: InteractiveButtonDto[];

  /** The label on the control that opens the list. Type "list" only. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  buttonText?: string;

  /** Required for type "list"; Meta allows at most ten sections. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => InteractiveSectionDto)
  sections?: InteractiveSectionDto[];

  @IsOptional()
  @IsString()
  channelId?: string;
}
