import { IsBoolean, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpsertContactDto {
  @IsString()
  @MinLength(7)
  whatsappNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  /** Meta language code, e.g. "en" or "ta". Free text — not a closed set. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  languageCode?: string;

  @IsOptional()
  @IsBoolean()
  optedIn?: boolean;

  /** Arbitrary key/values stored against the contact, replacing any existing set. */
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}

export class UpdateContactApiDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  languageCode?: string;

  @IsOptional()
  @IsBoolean()
  optedIn?: boolean;

  @IsOptional()
  @IsBoolean()
  botEnabled?: boolean;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}
