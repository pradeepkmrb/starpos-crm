import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateContactListDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  contactIds?: string[];
}
