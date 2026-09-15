import { IsObject, IsOptional, IsString, MinLength } from "class-validator";

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  whatsappNumber!: string;

  @IsOptional()
  @IsString()
  name?: string;

  /** Answers to the tenant's custom contact fields, keyed by CustomField.key. */
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}
