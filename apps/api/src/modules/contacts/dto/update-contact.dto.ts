import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";

/** Every field is optional — the UI patches whichever one the operator edited. */
export class UpdateContactDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  name?: string | null;

  @IsOptional()
  // Empty string clears the field; anything else must be a real address.
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(20)
  languageCode?: string | null;

  @IsOptional()
  @IsBoolean()
  optedIn?: boolean;

  @IsOptional()
  @IsBoolean()
  botEnabled?: boolean;
}
