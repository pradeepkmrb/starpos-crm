import { IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

/**
 * Meta's rule for template names. Breaking it returns a bare "Invalid
 * parameter" with no indication of which field was wrong, so it is worth
 * catching here.
 */
export const TEMPLATE_NAME_PATTERN = /^[a-z0-9_]+$/;

export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  channelId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  @Matches(TEMPLATE_NAME_PATTERN, {
    message: "Template name may only contain lowercase letters, numbers and underscores",
  })
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
