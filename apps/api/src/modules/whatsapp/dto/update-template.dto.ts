import { IsArray, IsIn, IsOptional, IsString, MinLength } from "class-validator";

/**
 * Meta treats a template's name and language as immutable, so only the body
 * and category can change here — an accepted edit re-enters review.
 */
export class UpdateTemplateDto {
  @IsOptional()
  @IsIn(["MARKETING", "UTILITY", "AUTHENTICATION"])
  category?: "MARKETING" | "UTILITY" | "AUTHENTICATION";

  @IsString()
  @MinLength(1)
  bodyText!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bodyVariableExamples?: string[];
}
