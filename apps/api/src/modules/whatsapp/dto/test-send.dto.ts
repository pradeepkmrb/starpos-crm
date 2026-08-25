import { IsOptional, IsString, MinLength } from "class-validator";

export class TestSendDto {
  @IsString()
  @MinLength(1)
  to!: string;

  @IsString()
  @MinLength(1)
  templateName!: string;

  @IsOptional()
  @IsString()
  languageCode?: string;
}
