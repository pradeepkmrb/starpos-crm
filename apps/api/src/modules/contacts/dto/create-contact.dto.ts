import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  whatsappNumber!: string;

  @IsOptional()
  @IsString()
  name?: string;
}
