import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { CUSTOM_FIELD_TYPES, type CustomFieldType } from "@digitel/shared";

export class CreateCustomFieldDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @IsIn(CUSTOM_FIELD_TYPES as unknown as string[])
  type!: CustomFieldType;

  /** Required for dropdown and radio fields; ignored for the others. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  options?: string[];

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  placeholder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  helpText?: string;
}
