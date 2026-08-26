import { IsArray, IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  channelId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(["MARKETING", "UTILITY", "AUTHENTICATION"])
  category!: "MARKETING" | "UTILITY" | "AUTHENTICATION";

  @IsString()
  @MinLength(1)
  language!: string;

  @IsString()
  @MinLength(1)
  bodyText!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bodyVariableExamples?: string[];
}
