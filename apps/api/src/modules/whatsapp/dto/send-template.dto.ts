import { IsString, MinLength } from "class-validator";

export class SendTemplateDto {
  @IsString()
  @MinLength(1)
  templateId!: string;
}
